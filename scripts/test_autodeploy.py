import hashlib
import hmac
import http.client
import json
import os
import tempfile
import threading
import unittest
from unittest.mock import patch
import autodeploy


class WebhookTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"GITHUB_WEBHOOK_SECRET": "test-only-secret"}, clear=True)
        self.env.start()
        self.paths = patch.object(autodeploy, "REPO_DIR", self.temp.name)
        self.paths.start()
        self.logging = patch.object(autodeploy, "log")
        self.logging.start()
        self.deploy = patch.object(autodeploy, "run_deployment", return_value=True)
        self.mock = self.deploy.start()
        autodeploy.state.update(is_deploying=False, last_deployed_commit="", last_deploy_status="none")
        self.server = autodeploy.http.server.ThreadingHTTPServer(("127.0.0.1", 0), autodeploy.WebhookHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.deploy.stop()
        self.logging.stop()
        self.paths.stop()
        self.env.stop()
        self.temp.cleanup()

    def post(self, payload=None, signature=True):
        body = json.dumps(payload or {"repository": "Lami2567/safaris", "ref": "refs/heads/main", "commit": "a" * 40})
        headers = {"Content-Type": "application/json", "X-GitHub-Event": "push"}
        if signature:
            headers["X-Hub-Signature-256"] = "sha256=" + hmac.new(b"test-only-secret", body.encode(), hashlib.sha256).hexdigest()
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        conn.request("POST", "/webhook", body, headers)
        response = conn.getresponse()
        response.read()
        conn.close()
        return response.status

    def test_valid_exact_commit(self):
        self.assertEqual(self.post(), 202)
        self.mock.assert_called_once_with(trigger="authenticated-ci", target_commit="a" * 40)

    def test_missing_signature(self):
        self.assertEqual(self.post(signature=False), 401)
        self.mock.assert_not_called()

    def test_missing_secret(self):
        os.environ.clear()
        self.assertEqual(self.post(), 503)
        self.mock.assert_not_called()

    def test_wrong_repository_or_missing_commit(self):
        self.assertEqual(self.post({"repository": "other/repo", "ref": "refs/heads/main", "commit": "a" * 40}), 400)
        self.assertEqual(self.post({"repository": "Lami2567/safaris", "ref": "refs/heads/main"}), 400)
        self.mock.assert_not_called()

    def test_duplicate_success_does_not_redeploy(self):
        autodeploy.state.update(last_deployed_commit="a" * 40, last_deploy_status="success")
        self.assertEqual(self.post(), 200)
        self.mock.assert_not_called()

    def test_polling_cannot_bypass_ci(self):
        os.environ["ENABLE_POLLING_DEPLOY"] = "true"
        autodeploy.poll_github_worker()
        self.mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
