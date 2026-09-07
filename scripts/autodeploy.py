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
import threading
import time
from datetime import datetime

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
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
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

def run_deployment(trigger: str = "webhook") -> bool:
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

            process = subprocess.Popen(
                ["/bin/bash", DEPLOY_SCRIPT],
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
                state["last_deploy_time"] = datetime.utcnow().isoformat() + "Z"
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
    """Continuously monitors GitHub for new pushes to main every POLL_INTERVAL_SECONDS."""
    log(f"Started GitHub polling thread (interval: {POLL_INTERVAL_SECONDS}s).")
    while True:
        try:
            time.sleep(POLL_INTERVAL_SECONDS)
            if state["is_deploying"]:
                continue

            state["last_poll_time"] = datetime.utcnow().isoformat() + "Z"
            local_sha = get_current_commit()
            remote_sha = get_remote_commit()

            if remote_sha and local_sha and remote_sha != local_sha:
                log(f"🔔 New commit detected on GitHub: {remote_sha[:8]} (local is {local_sha[:8]})")
                run_deployment(trigger=f"git-push-poller (new commit {remote_sha[:8]})")
        except Exception as e:
            log(f"Error in polling loop: {e}")

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
            "last_poll_time": state["last_poll_time"],
            "total_deploys": state["total_deploys"],
            "poll_interval_seconds": POLL_INTERVAL_SECONDS,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(response_data, indent=2).encode("utf-8"))

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else ""

        branch = "main"
        is_push = True

        if body:
            try:
                payload = json.loads(body)
                ref = payload.get("ref", "")
                if ref:
                    branch = ref.replace("refs/heads/", "")
                    if branch != "main":
                        is_push = False
                        log(f"Ignoring push to non-main branch: {branch}")
            except Exception:
                pass

        if is_push:
            triggered = run_deployment(trigger="github-webhook-push")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            resp = {
                "success": True,
                "message": "Deployment triggered successfully" if triggered else "Deployment already running",
                "branch": branch,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }
            self.wfile.write(json.dumps(resp).encode("utf-8"))
        else:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "message": f"Ignored branch {branch}"}).encode("utf-8"))

    def log_message(self, format, *args):
        # Override to suppress default noisy http server stdout logging
        pass

def main():
    state["last_deployed_commit"] = get_current_commit()
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
