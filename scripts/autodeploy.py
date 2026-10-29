#!/usr/bin/env python3
"""
SAFARIS VPS - Automated Continuous Deployment Daemon
===================================================
Provides zero-touch continuous deployment similar to Vercel & Render:
1. Listens for GitHub Webhook POST events at /webhook (instant deployment on git push).
2. Continuously polls GitHub origin/main every 45 seconds (so any git push is automatically
   detected and deployed even if webhooks haven't been manually configured in GitHub settings).
3. Executes scripts/deploy.sh safely with locking to prevent concurrent runs.
4. Exposes /webhook and /status health endpoints for monitoring.
"""

import http.server
import json
import os
import subprocess
import sys
import re
import threading
import time
import hmac
import hashlib
from datetime import datetime, timezone

PORT = 9000
REPO_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DEPLOY_SCRIPT = os.path.join(REPO_DIR, "scripts", "deploy.sh")
LOG_FILE = os.path.join(REPO_DIR, "autodeploy.log")
POLL_INTERVAL_SECONDS = 45

deploy_lock = threading.Lock()
state = {
    "status": "ready",
    "is_deploying": False,
    "last_deployed_commit": "",
    "last_deploy_time": None,
    "last_deploy_status": "none",
    "last_poll_time": None,
    "total_deploys": 0,
    "repo_dir": REPO_DIR,
}

def log(msg: str):
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    line = f"[{timestamp}] [AutoDeploy] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass

def get_current_commit() -> str:
    try:
        res = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
            check=True,
            timeout=10,
        )
        return res.stdout.strip()
    except Exception as e:
        log(f"Error getting local HEAD: {e}")
        return ""

def get_remote_commit() -> str:
    try:
        res = subprocess.run(
            ["git", "ls-remote", "origin", "refs/heads/main"],
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
            check=True,
            timeout=20,
        )
        output = res.stdout.strip()
        if output:
            return output.split()[0]
        return ""
    except Exception as e:
        log(f"Error checking remote origin/main: {e}")
        return ""

def run_deployment(trigger: str = "webhook", target_commit: str = None) -> bool:
    if not deploy_lock.acquire(blocking=False):
        log(f"Deployment already in progress. Skipping duplicate trigger ({trigger}).")
        return False

    def _execute():
        global state
        state["is_deploying"] = True
        state["status"] = f"deploying (trigger: {trigger})"
        start_time = time.time()
        log(f"==================================================")
        log(f"🚀 Starting automated deployment (Trigger: {trigger})")
        log(f"==================================================")

        try:
            # Ensure deploy.sh is executable
            os.chmod(DEPLOY_SCRIPT, 0o755)

            env = os.environ.copy()
            env["CI"] = "true"

            cmd = ["/bin/bash", DEPLOY_SCRIPT]
            if target_commit:
                cmd.append(target_commit)
            process = subprocess.Popen(
                cmd,
                cwd=REPO_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                env=env,
            )

            for line in process.stdout:
                line_str = line.rstrip()
                if line_str:
                    print(f"  [deploy] {line_str}", flush=True)

            process.wait()
            duration = round(time.time() - start_time, 2)

            if process.returncode == 0:
                current = get_current_commit()
                state["last_deployed_commit"] = current
                state["last_deploy_time"] = datetime.now(timezone.utc).isoformat() + "Z"
                state["last_deploy_status"] = "success"
                state["total_deploys"] += 1
                state["status"] = "ready"
                log(f"🎉 Deployment completed successfully in {duration}s! (HEAD: {current[:8]})")
            else:
                state["last_deploy_status"] = f"failed (code {process.returncode})"
                state["status"] = "ready (last deploy failed)"
                log(f"❌ Deployment failed with exit code {process.returncode} in {duration}s.")
        except Exception as e:
            log(f"❌ Deployment exception: {e}")
            state["last_deploy_status"] = f"error: {e}"
            state["status"] = "ready (error)"
        finally:
            state["is_deploying"] = False
            deploy_lock.release()

    t = threading.Thread(target=_execute, daemon=True)
    t.start()
    return True

def poll_github_worker():
    # Deploy only CI-authenticated, exact-SHA webhook releases.
    return

class WebhookHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        current_head = get_current_commit()
        response_data = {
            "service": "safaris-autodeploy",
            "status": state["status"],
            "is_deploying": state["is_deploying"],
            "current_commit": current_head,
            "last_deployed_commit": state["last_deployed_commit"] or current_head,
            "last_deploy_time": state["last_deploy_time"],
            "last_deploy_status": state["last_deploy_status"],
            "target_commit": state.get("target_commit"),
            "last_poll_time": state["last_poll_time"],
            "total_deploys": state["total_deploys"],
            "poll_interval_seconds": POLL_INTERVAL_SECONDS,
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        }
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(response_data, indent=2).encode("utf-8"))

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > 1024 * 1024:
            self.send_response(413)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Payload too large (max 1MB)"}).encode("utf-8"))
            return

        body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else ""

        # 1. Enforce mandatory HMAC Signature verification with fail-closed protection
        webhook_secret = os.environ.get("GITHUB_WEBHOOK_SECRET", "").strip()
        if not webhook_secret:
            for env_file in [os.path.join(REPO_DIR, ".env.production"), os.path.join(REPO_DIR, ".env")]:
                if os.path.exists(env_file):
                    try:
                        with open(env_file, "r", encoding="utf-8") as f:
                            for line in f:
                                line = line.strip()
                                if line.startswith("GITHUB_WEBHOOK_SECRET="):
                                    webhook_secret = line.split("=", 1)[1].strip().strip('"').strip("'")
                                    break
                    except Exception:
                        pass
                if webhook_secret:
                    break

        signature_header = self.headers.get("X-Hub-Signature-256", "")

        if not webhook_secret:
            log("Rejected webhook: GITHUB_WEBHOOK_SECRET is not configured on server. Deployment webhook disabled.")
            self.send_response(503)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Deployment webhook disabled: GITHUB_WEBHOOK_SECRET not configured on server"}).encode("utf-8"))
            return

        if not signature_header:
            log("Rejected webhook: missing X-Hub-Signature-256 header.")
            self.send_response(401)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Missing signature header"}).encode("utf-8"))
            return

        expected_sig = "sha256=" + hmac.new(
            webhook_secret.encode("utf-8"),
            body.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(signature_header, expected_sig):
            log("Rejected webhook: HMAC signature mismatch.")
            self.send_response(401)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Invalid signature"}).encode("utf-8"))
            return

        # 2. Enforce GitHub event check
        event_type = self.headers.get("X-GitHub-Event", "push")
        if event_type != "push" and event_type != "ping":
            log(f"Ignoring non-push event: {event_type}")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"message": f"Ignored event {event_type}"}).encode("utf-8"))
            return

        if event_type == "ping":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"message": "pong"}).encode("utf-8"))
            return

        try:
            payload = json.loads(body)
            target_commit = payload.get("commit")
            if payload.get("repository") != "Lami2567/safaris" or payload.get("ref") != "refs/heads/main" or not isinstance(target_commit, str) or not re.fullmatch(r"[0-9a-f]{40}", target_commit):
                raise ValueError("Invalid repository, branch or commit")
        except (ValueError, TypeError, AttributeError):
            self.send_response(400)
            self.end_headers()
            return
        if state.get("last_deployed_commit") == target_commit and state.get("last_deploy_status") == "success":
            self.send_response(200)
            self.end_headers()
            return
        if state["is_deploying"]:
            self.send_response(409)
            self.end_headers()
            return
        state["target_commit"] = target_commit
        triggered = run_deployment(trigger="authenticated-ci", target_commit=target_commit)
        self.send_response(202 if triggered else 409)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"accepted": triggered, "commit": target_commit}).encode())

    def log_message(self, format, *args):
        # Override to suppress default noisy http server stdout logging
        pass

def main():
    state["last_deployed_commit"] = get_current_commit()
    state["last_deploy_status"] = "success"
    log(f"==================================================")
    log(f"🚀 SAFARIS Continuous Deployment Daemon Started")
    log(f"📂 Repo: {REPO_DIR}")
    log(f"🔗 Current Commit: {state['last_deployed_commit'][:8]}")
    log(f"🌐 Webhook Server listening on 0.0.0.0:{PORT}")
    log(f"==================================================")

    # Start background polling thread
    poller = threading.Thread(target=poll_github_worker, daemon=True)
    poller.start()

    # Start HTTP Webhook server
    server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), WebhookHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("Daemon shutting down.")
        sys.exit(0)

if __name__ == "__main__":
    main()
