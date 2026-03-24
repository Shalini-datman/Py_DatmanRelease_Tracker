"""
CSV Import API — POST /api/import_csv
Accepts raw CSV text in request body.
Parses, validates, maps columns → returns normalised release rows as JSON.
Heavy lifting moved from 200-line JS to clean Python.
"""

import json, csv, io, re
from http.server import BaseHTTPRequestHandler
from datetime import datetime

APPROVER_NAMES = ["Sandeep","Nitish","Pradeep","Muz","Sundar","Ruhan","Anand"]
STATUSES       = ["Planning","In Progress","Released","Delayed","Cancelled"]
PRIORITIES     = ["P0","P1","P2","P3","P4"]
RELEASE_TYPES  = ["New Feature","Improvement","Patch","Bug"]

def normalise_date(val: str) -> str:
    """Convert DD/MM/YYYY or various formats → YYYY-MM-DD."""
    if not val: return ""
    val = val.strip()
    if re.match(r'^\d{4}-\d{2}-\d{2}$', val): return val
    if re.match(r'^\d{1,2}/\d{1,2}/\d{4}$', val):
        d, m, y = val.split("/")
        return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
    return val

def map_status(val: str) -> str:
    v = val.lower().strip()
    if not v: return "Planning"
    if v in ("released","done","complete","completed","live","deployed","shipped"): return "Released"
    if any(x in v for x in ("roll","revert","rollback")): return "Cancelled"
    if v in ("pending","planned","not released","upcoming","todo","to do"): return "Planning"
    if any(x in v for x in ("delay","postpone","deferred")): return "Delayed"
    if any(x in v for x in ("progress","ongoing","wip","active")): return "In Progress"
    direct = next((s for s in STATUSES if s.lower() == v), None)
    return direct or "Planning"

def map_type(priority: str, summary: str, type_cell: str, rn_link: str) -> str:
    tc = type_cell.lower().strip()
    if tc:
        if "bug" in tc: return "Bug"
        if "hotfix" in tc or tc == "patch": return "Patch"
        if "improvement" in tc or "enhance" in tc: return "Improvement"
        if "new feature" in tc or "feature" in tc: return "New Feature"
        direct = next((t for t in RELEASE_TYPES if t.lower() == tc), None)
        if direct: return direct
    url = rn_link.lower()
    for kw, t in [("/patch","Patch"),("/hotfix","Patch"),("/bug","Bug"),
                  ("/improvement","Improvement"),("/feature","New Feature")]:
        if kw in url: return t
    s = summary.lower()
    if any(x in s for x in ("hotfix","hot fix")): return "Patch"
    if any(x in s for x in (" bug ","bug fix","bugfix")): return "Bug"
    if "patch" in s: return "Patch"
    if any(x in s for x in ("improvement","enhance","refactor")): return "Improvement"
    return "New Feature"

def match_approver(header: str) -> str | None:
    """Return approver name if header looks like 'Name's Approval'."""
    h = header.lower()
    for name in APPROVER_NAMES:
        if name.lower() in h and "approv" in h:
            return name
    # Auto-detect unknown approver columns
    m = re.match(r"^([a-z]+)['\s]?s?\s+approval", h)
    if m:
        return m.group(1).capitalize()
    return None

def parse_csv(text: str) -> dict:
    reader = csv.reader(io.StringIO(text.strip()))
    rows_iter = list(reader)
    if len(rows_iter) < 2:
        return {"rows": [], "errors": ["Need header row + at least one data row"], "dupes": []}

    raw_headers = rows_iter[0]
    headers = [h.lower().strip() for h in raw_headers]

    # Build approver column map
    approver_cols = {}  # col_index → name
    for i, h in enumerate(headers):
        name = match_approver(raw_headers[i])
        if name:
            approver_cols[i] = name

    def get(cells, *keys):
        for key in keys:
            try:
                idx = headers.index(key)
                val = cells[idx].strip() if idx < len(cells) else ""
                if val: return val
            except ValueError:
                pass
        return ""

    def get_all_matching(cells, pattern):
        """Get all cells whose header matches a regex."""
        return [cells[i].strip() for i, h in enumerate(headers)
                if re.search(pattern, h) and i < len(cells) and cells[i].strip()]

    errors, rows, dupes = [], [], []
    seen = set()

    for row_num, cells in enumerate(rows_iter[1:], start=2):
        if not any(c.strip() for c in cells):
            continue  # skip blank rows

        summary = get(cells, "task", "summary")
        if not summary:
            errors.append(f"Row {row_num}: no Task/summary — skipped")
            continue

        release_actual  = normalise_date(get(cells, "release date", "actual date"))
        release_planned = normalise_date(get(cells, "planned date", "planned"))

        dedup_key = f"{summary.lower()}|{release_actual}"
        if dedup_key in seen:
            dupes.append({"rn": summary[:30], "row": row_num})
            continue
        seen.add(dedup_key)

        # RN links
        rn_links = get_all_matching(cells, r"^rn link")
        rn_link  = rn_links[0] if rn_links else ""

        # Jira links
        jira_links = get_all_matching(cells, r"jira.*link")
        jira_link  = jira_links[0] if jira_links else ""

        # Priority
        raw_priority = get(cells, "priority")
        priority = raw_priority if raw_priority in PRIORITIES else "P2"

        # Status
        status_raw = get(cells, "release status", "status", "current release status")
        status = map_status(status_raw)

        # Type
        type_cell = get(cells, "type", "release type", "patch type", "rn type")
        rtype = map_type(priority, summary, type_cell, rn_link)

        # Modules
        modules_raw = get(cells, "modules")
        modules = [m.strip() for m in re.split(r"[|;,]", modules_raw) if m.strip()] if modules_raw else []

        # Approvals
        approvals, approval_raw = {}, {}
        for name in APPROVER_NAMES:
            approvals[name]    = False
            approval_raw[name] = ""
        for col_idx, name in approver_cols.items():
            val = cells[col_idx].strip() if col_idx < len(cells) else ""
            approval_raw[name] = val
            approvals[name]    = val.lower() == "approved"

        # DORA
        dora = {
            "leadDeveloper": get(cells, "lead developer", "developer"),
            "application":   get(cells, "application", "app"),
            "services":      get(cells, "services"),
            "handoverDate":  get(cells, "handover date", "handover"),
        }

        rows.append({
            "id":             int(datetime.now().timestamp() * 1000) + row_num,
            "rn":             "",
            "summary":        summary,
            "type":           rtype,
            "priority":       priority,
            "status":         status,
            "releasePlanned": release_planned,
            "releaseActual":  release_actual,
            "goal":           get(cells, "goal"),
            "team":           "Gateway",
            "modules":        modules,
            "rnLink":         rn_link,
            "rnLinks":        rn_links,
            "jiraLink":       jira_link,
            "jiraLinks":      jira_links,
            "approvals":      approvals,
            "approvalRaw":    approval_raw,
            "dora":           dora,
        })

    return {"rows": rows, "errors": errors, "dupes": dupes,
            "mapped_cols": [{"raw": h, "use": True} for h in raw_headers]}


class handler(BaseHTTPRequestHandler):

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw    = self.rfile.read(length).decode("utf-8", errors="replace")
        # Accept either raw CSV text or JSON with a "csv" key
        if raw.strip().startswith("{"):
            body = json.loads(raw)
            csv_text = body.get("csv", "")
        else:
            csv_text = raw
        if not csv_text.strip():
            self._json(400, {"error": "Empty CSV"}); return
        result = parse_csv(csv_text)
        self._json(200, result)

    def log_message(self, *_): pass
