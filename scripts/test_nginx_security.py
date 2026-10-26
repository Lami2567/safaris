"""Exercise the production proxy configuration with synthetic upstreams and certificates.
Uses the production Docker image by default; NGINX_TEST_BINARY supports local validation.
"""
import http.client
import http.server
import json
import os
from pathlib import Path
import shutil
import socket
import ssl
import subprocess
import tempfile
import threading
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ProxySecurityTests(unittest.TestCase):
    def test_https_and_client_identity(self):
        class Upstream(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                if self.headers.get('Upgrade', '').lower() == 'websocket':
                    self.send_response(101)
                    self.send_header('Upgrade', 'websocket')
                    self.send_header('Connection', 'Upgrade')
                    self.end_headers()
                    return
                data = json.dumps({'client': self.headers.get('X-Forwarded-For'), 'path': self.path}).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'text/event-stream' if '/stream' in self.path else 'application/json')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *_args):
                pass

        upstream = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
        threading.Thread(target=upstream.serve_forever, daemon=True).start()
        def port():
            with socket.socket() as sock:
                sock.bind(('127.0.0.1', 0))
                return sock.getsockname()[1]
        http_port, https_port = port(), port()
        with tempfile.TemporaryDirectory(prefix='safaris-nginx-test-') as tmp:
            directory = Path(tmp)
            cert = directory / 'fullchain.pem'
            key = directory / 'privkey.pem'
            subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                            '-subj', '/CN=admin.mumwesafarisuganda.com',
                            '-addext', 'subjectAltName=DNS:admin.mumwesafarisuganda.com,DNS:careers.mumwesafarisuganda.com',
                            '-keyout', str(key), '-out', str(cert)], check=True, capture_output=True)
            config = (ROOT / 'nginx/conf.d/default.conf').read_text()
            self.assertNotIn('listen 3001', config)
            for domain in ['admin.mumwesafarisuganda.com', 'careers.mumwesafarisuganda.com']:
                config = config.replace(f'/etc/letsencrypt/live/{domain}/fullchain.pem', str(cert))
                config = config.replace(f'/etc/letsencrypt/live/{domain}/privkey.pem', str(key))
            config = config.replace('listen 80', f'listen {http_port}').replace('listen 443', f'listen {https_port}')
            # Older local Nginx binaries use the equivalent listen directive syntax.
            if os.environ.get('NGINX_TEST_BINARY'):
                config = config.replace('ssl;', 'ssl http2;').replace('ssl default_server;', 'ssl http2 default_server;').replace('    http2 on;\n', '')
            config = config.replace('backend:3000', f'127.0.0.1:{upstream.server_port}')
            config = config.replace('admin:3001', f'127.0.0.1:{upstream.server_port}')
            config = config.replace('host.docker.internal:9000', f'127.0.0.1:{upstream.server_port}')
            realip = (ROOT / 'nginx/conf.d/00-cloudflare-realip.conf').read_text()
            configuration = directory / 'nginx.conf'
            configuration.write_text(f'user root;\nmaster_process off;\nworker_processes 1;\npid {tmp}/nginx.pid;\nerror_log stderr;\nevents {{ worker_connections 128; }}\nhttp {{\nclient_body_temp_path {tmp}/body;\nproxy_temp_path {tmp}/proxy;\nfastcgi_temp_path {tmp}/fastcgi;\nuwsgi_temp_path {tmp}/uwsgi;\nscgi_temp_path {tmp}/scgi;\naccess_log off;\n{realip}\n{config}\n}}\n')
            binary = os.environ.get('NGINX_TEST_BINARY')
            if binary:
                command = [binary, '-p', tmp + '/', '-c', str(configuration), '-g', 'daemon off;']
            else:
                self.assertIsNotNone(shutil.which('docker'), 'Docker or NGINX_TEST_BINARY is required')
                command = ['docker', 'run', '--rm', '--network', 'host', '-v', f'{tmp}:{tmp}',
                           'nginx:1.25-alpine', 'nginx', '-c', str(configuration), '-g', 'daemon off;']
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            context = ssl.create_default_context(cafile=str(cert))
            # Connect locally but verify the expected hostname via wrap_socket server_hostname.
            def tls_request(path, host='admin.mumwesafarisuganda.com', headers=None):
                sock = socket.create_connection(('127.0.0.1', https_port), timeout=5)
                wrapped = context.wrap_socket(sock, server_hostname=host)
                connection = http.client.HTTPConnection('127.0.0.1', https_port, timeout=5)
                connection.sock = wrapped
                connection.request('GET', path, headers={'Host': host, **(headers or {})})
                response = connection.getresponse()
                result = (response.status, dict(response.getheaders()), response.read())
                connection.close()
                return result
            try:
                for _ in range(100):
                    if process.poll() is not None:
                        self.fail(process.stderr.read().decode())
                    try:
                        with socket.create_connection(('127.0.0.1', http_port), timeout=.1):
                            break
                    except OSError:
                        time.sleep(.05)
                for domain in ['admin.mumwesafarisuganda.com', 'careers.mumwesafarisuganda.com']:
                    connection = http.client.HTTPConnection('127.0.0.1', http_port, timeout=5)
                    connection.request('POST', '/api/v1/auth/login?keep=value', body='{}', headers={'Host': domain})
                    response = connection.getresponse()
                    self.assertEqual(response.status, 308)
                    self.assertEqual(response.getheader('Location'), f'https://{domain}/api/v1/auth/login?keep=value')
                    response.read(); connection.close()
                    status, _, _ = tls_request('/api/v1/health', domain)
                    self.assertEqual(status, 200)
                status, _, body = tls_request('/api/v1/health', headers={'X-Forwarded-For': '203.0.113.55', 'CF-Connecting-IP': '203.0.113.66'})
                self.assertEqual(status, 200)
                self.assertEqual(json.loads(body)['client'], '127.0.0.1', 'Untrusted client headers must be discarded')
                status, headers, _ = tls_request('/api/v1/realtime/stream')
                self.assertEqual(status, 200)
                self.assertEqual(headers['Content-Type'], 'text/event-stream')
                status, _, _ = tls_request('/socket.io/?transport=websocket', headers={'Upgrade': 'websocket', 'Connection': 'Upgrade'})
                self.assertEqual(status, 101)
                connection = http.client.HTTPConnection('127.0.0.1', http_port, timeout=5)
                connection.request('GET', '/', headers={'Host': 'untrusted.invalid'})
                with self.assertRaises(http.client.RemoteDisconnected):
                    connection.getresponse()
                connection.close()
            finally:
                process.terminate()
                try:
                    process.communicate(timeout=15)
                except subprocess.TimeoutExpired:
                    process.kill(); process.communicate()
                upstream.shutdown(); upstream.server_close()


if __name__ == '__main__':
    unittest.main()
