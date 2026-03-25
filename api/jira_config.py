"""
GET /api/jira_config
Returns the Jira base URL and project key from env vars.
Frontend uses this to pre-populate the config panel — no manual input needed.
"""
import json, os, re
from http.server import BaseHTTPRequestHandler

JIRA_BASE  = os.environ.get("JIRA_BASE_URL", "").rstrip("/")
JIRA_EMAIL = os.environ.get("JIRA_EMAIL", "")

def extract_project_key(base_url: str) -> str:
    """Try to extract a project key hint from the Jira URL — not always possible."""
    return ""

class handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code); self._cors()
        self.send_header("Content-Type", "application/json"); self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self): self.send_response(204); self._cors(); self.end_headers()

    def do_GET(self):
        self._json(200, {
            "base":       JIRA_BASE,
            "email":      JIRA_EMAIL,
            "configured": bool(JIRA_BASE and JIRA_EMAIL and os.environ.get("JIRA_API_TOKEN")),
        })

    def log_message(self, *_): pass
