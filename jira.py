"""
Jira API Proxy — /api/jira/*
Forwards all requests to Jira/Confluence REST APIs with server-side credentials.

Env vars (Vercel dashboard):
  JIRA_BASE_URL   = https://datman.atlassian.net
  JIRA_EMAIL      = admin@datman.com
  JIRA_API_TOKEN  = your-api-token
"""

import json, os, base64, urllib.request, urllib.error, re
from http.server import BaseHTTPRequestHandler

JIRA_BASE  = os.environ.get("JIRA_BASE_URL", "").rstrip("/")
JIRA_EMAIL = os.environ.get("JIRA_EMAIL", "")
JIRA_TOKEN = os.environ.get("JIRA_API_TOKEN", "")


def _auth_header():
    creds = base64.b64encode(f"{JIRA_EMAIL}:{JIRA_TOKEN}".encode()).decode()
    return f"Basic {creds}"


def jira_request(method: str, path: str, raw_body: bytes = None):
    missing = [k for k, v in [
        ("JIRA_BASE_URL",  JIRA_BASE),
        ("JIRA_EMAIL",     JIRA_EMAIL),
        ("JIRA_API_TOKEN", JIRA_TOKEN),
    ] if not v]
    if missing:
        return 500, {"error": f"Missing env vars: {', '.join(missing)}", "missing": missing}

    url = f"{JIRA_BASE}/{path.lstrip('/')}"
    req = urllib.request.Request(
        url,
        data=raw_body,
        method=method,
        headers={
            "Authorization": _auth_header(),
            "Content-Type":  "application/json",
            "Accept":        "application/json",
            "X-Atlassian-Token": "no-check",
        },
    )
    try:
        with urllib.request.urlopen(req) as res:
            body = res.read()
            try:    return res.status, json.loads(body) if body else {}
            except: return res.status, {"raw": body.decode("utf-8", "replace")}
    except urllib.error.HTTPError as e:
        body = e.read()
        try:    return e.code, json.loads(body) if body else {}
        except: return e.code, {"error": body.decode("utf-8", "replace")}


class handler(BaseHTTPRequestHandler):

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type,Accept")

    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def _raw_body(self) -> bytes:
        length = self.headers.get("Content-Length")
        if length:
            return self.rfile.read(int(length))
        chunks = []
        while True:
            chunk = self.rfile.read(4096)
            if not chunk: break
            chunks.append(chunk)
        return b"".join(chunks)

    def _jira_path(self) -> str:
        from urllib.parse import urlparse, urlunparse, parse_qs, urlencode
        parsed = urlparse(self.path)
        path   = re.sub(r"^/api/jira/?", "", parsed.path)
        # Preserve query string
        if parsed.query:
            return f"{path}?{parsed.query}"
        return path

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_GET(self):
        status, data = jira_request("GET", self._jira_path())
        self._json(status, data)

    def do_POST(self):
        raw    = self._raw_body()
        status, data = jira_request("POST", self._jira_path(), raw or None)
        self._json(status, data)

    def do_PUT(self):
        raw    = self._raw_body()
        status, data = jira_request("PUT", self._jira_path(), raw or None)
        self._json(status, data)

    def do_PATCH(self):
        raw    = self._raw_body()
        status, data = jira_request("PATCH", self._jira_path(), raw or None)
        self._json(status, data)

    def log_message(self, *_): pass
