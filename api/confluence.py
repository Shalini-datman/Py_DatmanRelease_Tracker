"""
Confluence Content API — GET /api/confluence?pageId=XXXX
Fetches page body + comments. Parses tickets, approvers (from comments), DORA.
"""
import json, os, base64, urllib.request, urllib.error, re
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

JIRA_BASE  = os.environ.get("JIRA_BASE_URL","").rstrip("/")
JIRA_EMAIL = os.environ.get("JIRA_EMAIL","")
JIRA_TOKEN = os.environ.get("JIRA_API_TOKEN","")
KNOWN_APPROVERS = ["sandeep","nitish","pradeep","muz","sundar","ruhan","anand"]

def _hdrs():
    creds = base64.b64encode(f"{JIRA_EMAIL}:{JIRA_TOKEN}".encode()).decode()
    return {"Authorization":f"Basic {creds}","Content-Type":"application/json","Accept":"application/json"}

def fetch(path):
    url = f"{JIRA_BASE}/{path.lstrip('/')}"
    req = urllib.request.Request(url, headers=_hdrs())
    try:
        with urllib.request.urlopen(req) as res:
            body = res.read()
            return res.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read()
        try:    return e.code, json.loads(body) if body else {}
        except: return e.code, {"error": str(e)}

def clean(s):
    s = re.sub(r'<[^>]+>', ' ', s or "")
    for ent,rep in [('&amp;','&'),('&lt;','<'),('&gt;','>'),('&nbsp;',' '),('&#39;',"'"),('&quot;','"')]:
        s = s.replace(ent, rep)
    return ' '.join(s.split()).strip()

def get_html(page_id):
    debug, title = [], ""
    if not JIRA_BASE:
        return "", "", ["JIRA_BASE_URL env var not set"]

    for i, path in enumerate([
        f"wiki/rest/api/content/{page_id}/body/storage",
        f"wiki/rest/api/content/{page_id}/body/view",
        f"wiki/rest/api/content/{page_id}?expand=body.storage,title",
        f"wiki/rest/api/content/{page_id}?expand=body.view,title",
        f"wiki/api/v2/pages/{page_id}?body-format=storage",
        f"wiki/api/v2/pages/{page_id}?body-format=atlas_doc_format",
    ], 1):
        s, d = fetch(path)
        # Extract html from various response shapes
        html = (d.get("value") or
                d.get("body",{}).get("storage",{}).get("value") or
                d.get("body",{}).get("view",{}).get("value") or
                d.get("body",{}).get("value") or "")
        title = title or d.get("title","")
        debug.append(f"{i}. {path.split('?')[0].split('/')[-1]} → HTTP {s}, len={len(html)}")
        if html:
            if not title:
                _, dm = fetch(f"wiki/rest/api/content/{page_id}")
                title = dm.get("title","")
            return html, title, debug
    # Get title at minimum
    s, d = fetch(f"wiki/rest/api/content/{page_id}")
    if s == 200: title = title or d.get("title","")
    return "", title, debug

def get_comments(page_id):
    if not JIRA_BASE: return [], "comments skipped — JIRA_BASE_URL not set"
    s, d = fetch(f"wiki/rest/api/content/{page_id}/child/comment?expand=body.view,body.storage,history&limit=50")
    if s != 200: return [], f"comments HTTP {s}"
    results = d.get("results",[])
    comments = []
    for r in results:
        body   = r.get("body",{})
        text   = body.get("view",{}).get("value","") or body.get("storage",{}).get("value","")
        author = r.get("history",{}).get("createdBy",{}).get("displayName","").strip()
        if text:
            comments.append({"author":author, "text":clean(text), "raw":text[:500]})
    return comments, f"comments HTTP {s}, {len(results)} found"

def parse_page(html, comments, page_title=""):
    result = {}

    # 1. Jira tickets
    result['jiraTickets'] = list(dict.fromkeys(re.findall(r'\bDN-\d+\b', html)))

    # 2. Table data
    SKIP = {'dora matrix table name','field','name','key','platform/product','core functions',
            'applicable? (y/n) | details','value'}
    table_data = {}
    for tr in re.finditer(r'<tr[^>]*>([\s\S]*?)</tr>', html, re.IGNORECASE):
        cells = [clean(m.group(1))
                 for m in re.finditer(r'<t[dh][^>]*>([\s\S]*?)</t[dh]>', tr.group(1), re.IGNORECASE)
                 if clean(m.group(1))]
        if len(cells) >= 2:
            k = cells[0].lower().strip()
            v = " | ".join(cells[1:])
            if k not in SKIP and v.lower() not in ('value','details',''):
                table_data[k] = v
    result['tableData'] = table_data

    # 3. DORA fields
    dora, dora_map = {}, {
        'leadDeveloper': ['lead dev','lead developer','developer','author'],
        'application':   ['application','app name','service name'],
        'services':      ['services','microservice','component','affected','impacted'],
        'handoverDate':  ['handover','code freeze','freeze','handover date'],
        'testedBy':      ['qa','tested by','tester'],
        'type':          ['type(','type '],
    }
    for field, keys in dora_map.items():
        for k,v in table_data.items():
            if any(key in k for key in keys):
                dora[field] = v; break
    result['dora'] = dora

    # 4. Platforms
    result['platforms'] = {k:v for k,v in table_data.items()
                           if ' | ' in v and ('y |' in v.lower() or 'n |' in v.lower())}

    # 5. Tickets by section
    sections, current = {}, None
    SECTION_KW = ['feature','improvement','bug','fix','change','enhancement','patch']
    for m in re.finditer(r'<h[1-6][^>]*>([\s\S]*?)</h[1-6]>|(DN-\d+)', html, re.IGNORECASE):
        if m.group(1):
            h = clean(m.group(1))
            if any(kw in h.lower() for kw in SECTION_KW):
                current = h; sections[current] = []
        elif m.group(2) and current:
            sections[current].append(m.group(2))
    result['ticketsBySection'] = {k:list(dict.fromkeys(v)) for k,v in sections.items() if v}

    # 6. Approvers — primarily from comments
    APPROVAL_KW = ['approved','lgtm','looks good','sign off','signed off','good to go','+1','ok to deploy']
    approvers = []
    for comment in comments:
        author = comment.get('author','').strip()
        text   = comment.get('text','').lower()
        if author and any(kw in text for kw in APPROVAL_KW):
            if author not in approvers: approvers.append(author)
        # "Name: Approved" pattern in comment
        for m in re.finditer(r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[:\-]\s*(?:Approved|LGTM|Yes)',
                             comment.get('raw',''), re.IGNORECASE):
            name = m.group(1).strip()
            if name and name not in approvers: approvers.append(name)
    # Also scan page body
    for m in re.finditer(r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[:\-]\s*(?:Approved|LGTM|Signed\s*[Oo]ff)',
                         html, re.IGNORECASE):
        name = clean(m.group(1))
        if name and name not in approvers: approvers.append(name)
    # Known names near approval keywords in all comments
    all_text = ' '.join(c.get('text','') for c in comments).lower()
    # Escape special regex chars in keywords before joining
    safe_kw = [re.escape(k) for k in APPROVAL_KW]
    for name in KNOWN_APPROVERS:
        full = name.capitalize()
        if full not in approvers:
            pat = rf'\b{re.escape(name)}\b.{{0,50}}(?:{"|".join(safe_kw)})'
            if re.search(pat, all_text, re.IGNORECASE):
                approvers.append(full)

    result['approvedBy']      = approvers
    result['commentsScanned'] = len(comments)
    result['commentSummary']  = [{"author":c["author"],"preview":c["text"][:100]} for c in comments[:10]]

    # 7. Headings
    result['headings'] = list(dict.fromkeys([
        clean(m.group(1)) for m in re.finditer(r'<h[1-6][^>]*>([\s\S]*?)</h[1-6]>', html, re.IGNORECASE)
        if clean(m.group(1))]))

    # 8. Release date
    for pat in [r'(\d{2}[-/]\d{2}[-/]\d{4})', r'(\d{4}-\d{2}-\d{2})']:
        m = re.search(pat, page_title + " " + clean(html[:2000]))
        if m: result['releaseDate'] = m.group(1); break

    return result

class handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin","*")
        self.send_header("Access-Control-Allow-Methods","GET,OPTIONS")
        self.send_header("Access-Control-Allow-Headers","Content-Type")
    def _json(self, code, payload):
        body = json.dumps(payload, default=str).encode()
        self.send_response(code); self._cors()
        self.send_header("Content-Type","application/json"); self.end_headers()
        self.wfile.write(body)
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_GET(self):
        qs      = parse_qs(urlparse(self.path).query)
        page_id = qs.get("pageId",[""])[0]
        if not page_id:   self._json(400,{"error":"pageId required"}); return
        if not JIRA_BASE: self._json(500,{"error":"JIRA_BASE_URL not set"}); return
        html, title, debug = get_html(page_id)
        comments, cdebug   = get_comments(page_id)
        debug.append(cdebug)
        fields = parse_page(html, comments, title) if html else {}
        self._json(200,{
            "pageId":page_id,"title":title,"htmlLen":len(html),
            "htmlPreview":html[:600] if html else "",
            "debug":debug,"comments":[{"author":c["author"],"text":c["text"][:200]} for c in comments[:10]],
            "fields":fields,
        })
    def log_message(self, *_): pass
