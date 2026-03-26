"""
Confluence Content API — /api/confluence?pageId=XXXX
Fetches full page content with all body formats tried in sequence.
Runs server-side so auth headers are always correct.
"""
import json, os, base64, urllib.request, urllib.error, re
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

JIRA_BASE  = os.environ.get("JIRA_BASE_URL","").rstrip("/")
JIRA_EMAIL = os.environ.get("JIRA_EMAIL","")
JIRA_TOKEN = os.environ.get("JIRA_API_TOKEN","")

def _headers():
    creds = base64.b64encode(f"{JIRA_EMAIL}:{JIRA_TOKEN}".encode()).decode()
    return {
        "Authorization": f"Basic {creds}",
        "Content-Type":  "application/json",
        "Accept":        "application/json",
    }

def fetch(path):
    url = f"{JIRA_BASE}/{path.lstrip('/')}"
    req = urllib.request.Request(url, headers=_headers())
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:    return e.code, json.loads(e.read() or b"{}")
        except: return e.code, {"error": str(e)}

def get_page_content(page_id):
    """Try every known Confluence API format to get page body HTML."""
    html  = ""
    title = ""
    debug = []

    # 1. v1 dedicated storage endpoint
    status, data = fetch(f"wiki/rest/api/content/{page_id}/body/storage")
    debug.append(f"v1 /body/storage: HTTP {status}, len={len(data.get('value',''))}")
    if status == 200:
        html = data.get("value","")
        if html: return html, title, debug

    # 2. v1 dedicated view endpoint
    status, data = fetch(f"wiki/rest/api/content/{page_id}/body/view")
    debug.append(f"v1 /body/view: HTTP {status}, len={len(data.get('value',''))}")
    if status == 200:
        html = data.get("value","")
        if html: return html, title, debug

    # 3. v1 with expand=body.storage
    status, data = fetch(f"wiki/rest/api/content/{page_id}?expand=body.storage,title")
    debug.append(f"v1 ?expand=body.storage: HTTP {status}")
    if status == 200:
        title = data.get("title","")
        html  = data.get("body",{}).get("storage",{}).get("value","")
        if html: return html, title, debug

    # 4. v1 with expand=body.view
    status, data = fetch(f"wiki/rest/api/content/{page_id}?expand=body.view,title")
    debug.append(f"v1 ?expand=body.view: HTTP {status}")
    if status == 200:
        title = title or data.get("title","")
        html  = data.get("body",{}).get("view",{}).get("value","")
        if html: return html, title, debug

    # 5. v2 with body-format=storage
    status, data = fetch(f"wiki/api/v2/pages/{page_id}?body-format=storage")
    debug.append(f"v2 body-format=storage: HTTP {status}")
    if status == 200:
        title = title or data.get("title","")
        body  = data.get("body",{})
        html  = body.get("storage",{}).get("value","") or body.get("value","")
        if html: return html, title, debug

    # 6. v2 with body-format=atlas_doc_format (Confluence Cloud)
    status, data = fetch(f"wiki/api/v2/pages/{page_id}?body-format=atlas_doc_format")
    debug.append(f"v2 body-format=atlas_doc_format: HTTP {status}")
    if status == 200:
        title = title or data.get("title","")
        body  = data.get("body",{})
        # atlas_doc_format is JSON — convert to text representation
        adf   = body.get("atlas_doc_format",{}).get("value","") or body.get("value","")
        if adf:
            # Extract text from ADF JSON
            try:
                adf_obj = json.loads(adf) if isinstance(adf,str) else adf
                html = extract_adf_text(adf_obj)
            except:
                html = str(adf)
        if html: return html, title, debug

    # Get title at minimum
    if not title:
        status, data = fetch(f"wiki/rest/api/content/{page_id}")
        if status == 200:
            title = data.get("title","")
            debug.append(f"title fetch: {title}")

    return html, title, debug


def extract_adf_text(node):
    """Recursively extract text from Atlassian Document Format (ADF) JSON."""
    if not node: return ""
    result = []
    if isinstance(node, dict):
        node_type = node.get("type","")
        # Extract text nodes
        if node_type == "text":
            result.append(node.get("text",""))
        # Add newlines for block elements
        elif node_type in ("paragraph","heading","tableRow","listItem"):
            result.append("\n")
        # Recurse into content
        for child in node.get("content",[]):
            result.append(extract_adf_text(child))
    elif isinstance(node, list):
        for item in node:
            result.append(extract_adf_text(item))
    return "".join(result)


def parse_html(html, project_key="DN"):
    """Extract all fields from Confluence HTML/storage markup."""
    result = {}

    # Clean HTML helper
    def clean(s):
        s = re.sub(r'<[^>]+>', ' ', s)
        s = s.replace('&amp;','&').replace('&lt;','<').replace('&gt;','>') \
             .replace('&nbsp;',' ').replace('&#39;',"'").replace('&quot;','"')
        return ' '.join(s.split()).strip()

    # 1. Jira tickets — DN-XXXX pattern, skip DN-MP and DN-RP prefixes
    all_tickets = re.findall(r'\bDN-\d+\b', html)
    # Filter: skip if immediately preceded by context suggesting MP/RP
    tickets = list(dict.fromkeys(all_tickets))  # dedupe preserving order
    result['jiraTickets'] = tickets

    # 2. All table data — key:value pairs
    table_data = {}
    for tr in re.finditer(r'<tr[^>]*>([\s\S]*?)</tr>', html, re.IGNORECASE):
        cells = [clean(m.group(1))
                 for m in re.finditer(r'<t[dh][^>]*>([\s\S]*?)</t[dh]>', tr.group(1), re.IGNORECASE)
                 if clean(m.group(1))]
        if len(cells) >= 2:
            key = cells[0].lower().strip()
            val = " | ".join(cells[1:])
            table_data[key] = val
    result['tableData'] = table_data

    # 3. Approvers — check table rows and inline text
    approvers = []
    approval_keys = ['approv','sign off','sign-off','reviewed by','authoris','qa by','tested by']
    for key, val in table_data.items():
        if any(k in key for k in approval_keys):
            names = [n.strip() for n in re.split(r'[,\n|/]+', val) if 2 < len(n.strip()) < 40]
            approvers.extend(names)
    # Also scan inline patterns
    for m in re.finditer(r'(?:approved|signed off|reviewed)\s+by[:\s]+([^\n<]{2,80})', html, re.IGNORECASE):
        names = [n.strip() for n in re.split(r'[,|/]+', clean(m.group(1))) if n.strip()]
        approvers.extend(names)
    result['approvedBy'] = list(dict.fromkeys(approvers))

    # 4. DORA fields — flexible key matching
    dora = {}
    dora_map = {
        'leadDeveloper': ['lead dev','lead developer','developer','author','developed by','lead engineer'],
        'application':   ['application','app name','service name','system'],
        'services':      ['services','microservice','components','affected service','impacted service'],
        'handoverDate':  ['handover','code freeze','handover date','freeze date','cut off'],
    }
    for field, keys in dora_map.items():
        for key, val in table_data.items():
            if any(k in key for k in keys):
                dora[field] = val; break
    result['dora'] = dora

    # 5. Sections / headings
    headings = [clean(m.group(1))
                for m in re.finditer(r'<h[1-6][^>]*>([\s\S]*?)</h[1-6]>', html, re.IGNORECASE)
                if clean(m.group(1))]
    result['headings'] = headings

    # 6. Feature/Improvement/Bug sections — extract tickets per section
    sections = {}
    current_section = None
    section_pattern = re.compile(
        r'<h[1-6][^>]*>([\s\S]*?)</h[1-6]>|(DN-\d+)', re.IGNORECASE
    )
    for m in section_pattern.finditer(html):
        if m.group(1):  # heading
            heading_text = clean(m.group(1)).lower()
            if any(kw in heading_text for kw in ['feature','improvement','bug','fix','change','enhancement']):
                current_section = clean(m.group(1))
                sections[current_section] = []
        elif m.group(2) and current_section:  # ticket under a section
            sections[current_section].append(m.group(2))
    result['ticketsBySection'] = {k: list(dict.fromkeys(v)) for k,v in sections.items() if v}

    # 7. Release date from content
    date_patterns = [
        r'release\s+date[:\s]+(\d{1,2}[-/]\d{2}[-/]\d{4})',
        r'(\d{2}[-/]\d{2}[-/]\d{4})',
        r'(\d{4}-\d{2}-\d{2})',
    ]
    for pat in date_patterns:
        m = re.search(pat, clean(html), re.IGNORECASE)
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
        if not page_id:
            self._json(400, {"error": "pageId param required"}); return

        if not JIRA_BASE:
            self._json(500, {"error": "JIRA_BASE_URL not set"}); return

        html, title, debug = get_page_content(page_id)
        fields = parse_html(html) if html else {}

        self._json(200, {
            "pageId":   page_id,
            "title":    title,
            "htmlLen":  len(html),
            "htmlPreview": html[:500] if html else "",
            "debug":    debug,
            "fields":   fields,
        })

    def log_message(self, *_): pass
