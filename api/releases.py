"""
Releases API — /api/releases
GET    /api/releases          → list all releases
POST   /api/releases          → create one release
PUT    /api/releases?id=...   → update one release
DELETE /api/releases?id=...   → delete one release

Uses Supabase (PostgreSQL) via REST — set env vars:
  SUPABASE_URL   = https://xxxx.supabase.co
  SUPABASE_KEY   = your-anon-or-service-role-key
"""

import json, os, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
TABLE        = "releases"
def generate_rn(project_key: str, existing_releases: list) -> str:
    """Auto-generate next RN number. project_key = 'GAT' or 'APP'"""
    prefix = f"RN-{project_key}-"
    nums = []
    for r in existing_releases:
        rn = r.get("rn","") or ""
        if rn.startswith(prefix):
            try: nums.append(int(rn.replace(prefix,"").lstrip("0") or "0"))
            except: pass
    next_num = (max(nums) + 1) if nums else 1
    return f"{prefix}{str(next_num).zfill(3)}"

def get_project_key(modules: list) -> str:
    """Determine GAT or APP from modules."""
    gw = {"General","Payments","Payouts"}
    return "GAT" if any(m in gw for m in (modules or [])) else "APP"



def supabase(method: str, path: str, body=None):
    """Thin Supabase REST wrapper — no external deps needed."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=representation",
    }
    data = json.dumps(body).encode() if body else None
    req  = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, json.loads(res.read() or b"[]")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


class handler(BaseHTTPRequestHandler):

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code: int, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length)) if length else {}

    def _param(self, name: str) -> str | None:
        from urllib.parse import urlparse, parse_qs
        qs = parse_qs(urlparse(self.path).query)
        vals = qs.get(name, [])
        return vals[0] if vals else None

    # ── OPTIONS (CORS preflight) ──────────────────────────────────────────────
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    # ── GET all releases ──────────────────────────────────────────────────────
    def do_GET(self):
        if not SUPABASE_URL:
            self._json(500, {"error": "SUPABASE_URL not set"}); return
        status, data = supabase("GET", f"{TABLE}?order=release_actual.desc.nullslast")
        self._json(status, data)

    # ── POST create ───────────────────────────────────────────────────────────
    def do_POST(self):
        if not SUPABASE_URL:
            self._json(500, {"error": "SUPABASE_URL not set"}); return
        body = self._body()
        # Store nested objects as JSONB
        # Auto-assign RN when status=Released and no RN provided
        rn = body.get("rn", "").strip()
        if not rn and body.get("status") == "Released":
            all_res = supabase("GET", f"{TABLE}?select=rn&rn=not.is.null")
            existing = all_res[1] if all_res[0] < 300 else []
            proj_key = get_project_key(body.get("modules", []))
            rn = generate_rn(proj_key, existing)

        row = {
            "id":             body.get("id"),
            "rn":             rn,
            "summary":        body.get("summary", ""),
            "type":           body.get("type", "New Feature"),
            "priority":       body.get("priority", "P2"),
            "status":         body.get("status", "Planning"),
            "release_planned":body.get("releasePlanned", ""),
            "release_actual": body.get("releaseActual", ""),
            "goal":           body.get("goal", ""),
            "team":           body.get("team", "Gateway"),
            "modules":        body.get("modules", []),
            "rn_link":        body.get("rnLink", ""),
            "rn_links":       body.get("rnLinks", []),
            "jira_link":      body.get("jiraLink", ""),
            "jira_links":     body.get("jiraLinks", []),
            "approvals":      body.get("approvals", {}),
            "approval_raw":   body.get("approvalRaw", {}),
            "dora":           body.get("dora", {}),
        }
        status, data = supabase("POST", TABLE, row)
        self._json(status, data)

    # ── PUT update ────────────────────────────────────────────────────────────
    def do_PUT(self):
        if not SUPABASE_URL:
            self._json(500, {"error": "SUPABASE_URL not set"}); return
        rid = self._param("id")
        if not rid:
            self._json(400, {"error": "id param required"}); return
        body = self._body()
        # Auto-assign RN if status changing to Released and no RN yet
        rn = (body.get("rn") or "").strip() or None
        if body.get("status") == "Released" and not rn:
            # Fetch current record to check existing rn
            cur_res = supabase("GET", f"{TABLE}?id=eq.{rid}&select=rn,modules")
            cur = cur_res[1][0] if cur_res[0] < 300 and cur_res[1] else {}
            if not (cur.get("rn") or "").strip():
                all_res = supabase("GET", f"{TABLE}?select=rn&rn=not.is.null")
                existing = all_res[1] if all_res[0] < 300 else []
                modules = body.get("modules") or cur.get("modules") or []
                proj_key = get_project_key(modules)
                rn = generate_rn(proj_key, existing)

        row = {
            "rn":             rn,
            "summary":        body.get("summary"),
            "type":           body.get("type"),
            "priority":       body.get("priority"),
            "status":         body.get("status"),
            "release_planned":body.get("releasePlanned"),
            "release_actual": body.get("releaseActual"),
            "goal":           body.get("goal"),
            "team":           body.get("team"),
            "modules":        body.get("modules"),
            "rn_link":        body.get("rnLink"),
            "rn_links":       body.get("rnLinks"),
            "jira_link":      body.get("jiraLink"),
            "jira_links":     body.get("jiraLinks"),
            "approvals":      body.get("approvals"),
            "approval_raw":   body.get("approvalRaw"),
            "dora":           body.get("dora"),
        }
        # Remove None values — don't overwrite fields not in request
        row = {k: v for k, v in row.items() if v is not None}
        status, data = supabase("PATCH", f"{TABLE}?id=eq.{rid}", row)
        self._json(status, data)

    # ── DELETE ────────────────────────────────────────────────────────────────
    def do_DELETE(self):
        if not SUPABASE_URL:
            self._json(500, {"error": "SUPABASE_URL not set"}); return
        rid = self._param("id")
        if not rid:
            self._json(400, {"error": "id param required"}); return
        status, data = supabase("DELETE", f"{TABLE}?id=eq.{rid}")
        self._json(status, data)

    def log_message(self, *_): pass  # suppress default access log
