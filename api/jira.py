"""
Jira API Proxy — /api/jira
Forwards requests to Jira REST API v3.
Credentials attached server-side from env vars — zero exposure to browser.

Env vars required (set in Vercel dashboard):
  JIRA_BASE_URL   = https://datman.atlassian.net
  JIRA_EMAIL      = admin@datman.com
  JIRA_API_TOKEN  = your-api-token
"""

import json, os, base64, urllib.request, urllib.error, re
from http.server import BaseHTTPRequestHandler

JIRA_BASE  = os.environ.get("JIRA_BASE_URL", "").rstrip("/")
JIRA_EMAIL = os.environ.get("JIRA_EMAIL", "")
JIRA_TOKEN = os.environ.get("JIRA_API_TOKEN", "")

def _auth_header() -> str:
    creds = base64.b64encode(f"{JIRA_EMAIL}:{JIRA_TOKEN}".encode()).decode()
    return f"Basic {creds}"

def jira_request(method: str, path: str, body=None):
    missing = [k for k, v in [
        ("JIRA_BASE_URL", JIRA_BASE),
        ("JIRA_EMAIL",    JIRA_EMAIL),
        ("JIRA_API_TOKEN",JIRA_TOKEN),
    ] if not v]
    if missing:
        return 500, {"error": f"Missing env vars: {', '.join(missing)}",
                     "missing": missing}

    url  = f"{JIRA_BASE}/{path.lstrip('/')}"
    data = json.dumps(body).encode() if body else None
    req  = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": _auth_header(),
        "Content-Type":  "application/json",
        "Accept":        "application/json",
    })
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


class handler(BaseHTTPRequestHandler):

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length)) if length else {}

    def _jira_path(self) -> str:
        """Extract Jira REST path from our proxy path /api/jira/<path>"""
        from urllib.parse import urlparse
        raw = urlparse(self.path).path
        # Remove /api/jira/ prefix
        return re.sub(r"^/api/jira/?", "", raw)

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_GET(self):
        path = self._jira_path()
        status, data = jira_request("GET", path)
        self._json(status, data)

    def do_POST(self):
        path = self._jira_path()
        body = self._body()
        status, data = jira_request("POST", path, body)
        self._json(status, data)

    def log_message(self, *_): pass
