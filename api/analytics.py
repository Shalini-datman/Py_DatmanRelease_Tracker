"""
Analytics API — GET /api/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
All chart data pre-calculated server-side. React just renders.
"""
import json, os
from datetime import datetime, timedelta
from collections import defaultdict
from http.server import BaseHTTPRequestHandler
import urllib.request

SUPABASE_URL    = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY    = os.environ.get("SUPABASE_KEY", "")
GATEWAY_MODULES = {"General","Payments","Payouts"}
APP_MODULES     = {"Portal","Web","App"}
MODULES         = ["Payments","Payouts","General","App","Portal","Web"]
APPROVER_NAMES  = ["Sandeep","Nitish","Pradeep","Muz","Sundar","Ruhan","Anand"]

def fetch_releases():
    if not SUPABASE_URL: return []
    url = f"{SUPABASE_URL}/rest/v1/releases?order=release_actual.desc.nullslast&limit=5000"
    req = urllib.request.Request(url, headers={"apikey":SUPABASE_KEY,"Authorization":f"Bearer {SUPABASE_KEY}"})
    try:
        with urllib.request.urlopen(req) as res: return json.loads(res.read())
    except: return []

def parse_date(val):
    if not val: return None
    val = str(val).strip()
    for fmt in ("%Y-%m-%d","%d/%m/%Y","%m/%d/%Y"):
        try: return datetime.strptime(val, fmt)
        except: pass
    try: return datetime.fromisoformat(val[:10])
    except: return None

def lead_time(handover_str, release_str):
    h = parse_date(handover_str)
    r = parse_date(release_str)
    if not h or not r: return None
    return max(0, (r - h).days)

def monday_of(d):
    return d - timedelta(days=d.weekday())

def avg(lst):
    return round(sum(lst)/len(lst), 1) if lst else None

def normalise(r):
    return {**r,
        "releasePlanned": r.get("release_planned") or r.get("releasePlanned") or "",
        "releaseActual":  r.get("release_actual")  or r.get("releaseActual")  or "",
        "rnLink":         r.get("rn_link")          or r.get("rnLink")         or "",
        "rnLinks":        r.get("rn_links")         or r.get("rnLinks")        or [],
        "jiraLink":       r.get("jira_link")        or r.get("jiraLink")       or "",
        "jiraLinks":      r.get("jira_links")       or r.get("jiraLinks")      or [],
        "approvalRaw":    r.get("approval_raw")     or r.get("approvalRaw")    or {},
        "modules":        r.get("modules")          or [],
        "approvals":      r.get("approvals")        or {},
        "dora":           r.get("dora")             or {},
    }

def approved_names(r):
    appr = r.get("approvals") or {}
    return [n for n in list(dict.fromkeys(APPROVER_NAMES+list(appr.keys()))) if appr.get(n) is True]

def compute_analytics(releases, date_from=None, date_to=None):
    f_dt = parse_date(date_from)
    t_dt = parse_date(date_to)
    if t_dt: t_dt = t_dt.replace(hour=23,minute=59,second=59)

    def in_range(r):
        if not f_dt or not t_dt: return True
        d = parse_date(r["releaseActual"] or r["releasePlanned"])
        return d and f_dt <= d <= t_dt

    filtered  = [r for r in releases if in_range(r)]
    delivered = [r for r in filtered if r.get("status") in ("Released","Cancelled")]

    # KPIs
    kpis = {
        "total":    len(delivered),
        "released": sum(1 for r in delivered if r.get("status")=="Released"),
        "rolledBack":sum(1 for r in delivered if r.get("status")=="Cancelled"),
        "bugs":     sum(1 for r in delivered if r.get("type")=="Bug"),
        "patches":  sum(1 for r in delivered if r.get("type")=="Patch"),
        "featImps": sum(1 for r in delivered if r.get("type") in ("New Feature","Improvement")),
    }

    # Lead times
    def get_lt(r): return lead_time(r["dora"].get("handoverDate"), r["releaseActual"])
    all_lts  = [lt for r in delivered if (lt:=get_lt(r)) is not None]
    feat_lts = [lt for r in delivered if r.get("type") in ("New Feature","Improvement") and (lt:=get_lt(r)) is not None]
    lead_kpis = {"avgAll":avg(all_lts),"avgFeatImp":avg(feat_lts),"maxAll":max(all_lts) if all_lts else None,"minAll":min(all_lts) if all_lts else None,"count":len(all_lts)}

    # Teams
    def team_stats(mods):
        rels = [r for r in delivered if any(m in mods for m in (r.get("modules") or []))]
        return {"total":len(rels),"featImp":sum(1 for r in rels if r.get("type") in ("New Feature","Improvement")),"patch":sum(1 for r in rels if r.get("type")=="Patch"),"bug":sum(1 for r in rels if r.get("type")=="Bug")}

    # Handover groups
    ho_map = defaultdict(lambda:{"date":"","total":0,"featImp":0,"patch":0,"bug":0,"releases":[]})
    for r in filtered:
        hd = r["dora"].get("handoverDate") or "Unknown"
        g = ho_map[hd]; g["date"]=hd; g["total"]+=1
        t = r.get("type","")
        if t=="Bug": g["bug"]+=1
        elif t=="Patch": g["patch"]+=1
        else: g["featImp"]+=1
        g["releases"].append({"rn":r.get("rn",""),"summary":(r.get("summary","") or "")[:50]})
    handover_groups = sorted(ho_map.values(), key=lambda x: parse_date(x["date"]) or datetime.min)

    # Weekly/daily bars
    daily_map = defaultdict(lambda:{"date":"","feat":0,"improvement":0,"patch":0,"bug":0,"total":0,"isWeekend":False,"releases":[]})
    src = filtered if (f_dt and t_dt) else releases
    for r in src:
        raw = r["releaseActual"] or r["releasePlanned"]
        d = parse_date(raw)
        if not d: continue
        k = d.strftime("%Y-%m-%d"); g = daily_map[k]; g["date"]=k; g["isWeekend"]=d.weekday()>=5
        t = r.get("type","")
        if t=="Bug": g["bug"]+=1
        elif t=="Patch": g["patch"]+=1
        elif t=="Improvement": g["improvement"]+=1
        else: g["feat"]+=1
        g["total"]+=1
        g["releases"].append({"rn":r.get("rn",""),"summary":(r.get("summary","") or "")[:50]})
    # Fill weekday gaps
    skeys = sorted(daily_map.keys())
    if skeys:
        cur=parse_date(skeys[0]); end=parse_date(skeys[-1])
        while cur<=end:
            k=cur.strftime("%Y-%m-%d")
            if cur.weekday()<5 and k not in daily_map:
                daily_map[k]={"date":k,"feat":0,"improvement":0,"patch":0,"bug":0,"total":0,"isWeekend":False,"releases":[]}
            cur+=timedelta(days=1)
    weekly_data = sorted([{"week":k,**v} for k,v in daily_map.items()], key=lambda x:x["week"])

    # Module counts
    module_counts=[]
    for m in MODULES:
        rels=[r for r in filtered if m in (r.get("modules") or [])]
        if not rels: continue
        module_counts.append({"module":m,"team":"Gateway" if m in GATEWAY_MODULES else "App Team","total":len(rels),"featImp":sum(1 for r in rels if r.get("type") in ("New Feature","Improvement")),"patch":sum(1 for r in rels if r.get("type")=="Patch"),"bug":sum(1 for r in rels if r.get("type")=="Bug")})

    # Lead time by module
    lt_by_module=[]
    for m in MODULES:
        rels=[r for r in filtered if m in (r.get("modules") or [])]
        lts=[lt for r in rels if (lt:=get_lt(r)) is not None]
        if not lts: continue
        lt_by_module.append({"module":m,"team":"Gateway" if m in GATEWAY_MODULES else "App Team","avgLT":avg(lts),"maxLT":max(lts),"minLT":min(lts),"count":len(lts)})

    # LT per release table
    lt_rows=[]
    for r in filtered:
        lt=get_lt(r)
        if lt is None: continue
        lt_rows.append({"id":r.get("id"),"rn":r.get("rn",""),"summary":r.get("summary",""),"type":r.get("type",""),"priority":r.get("priority",""),"modules":r.get("modules",[]),"releasePlanned":r.get("releasePlanned",""),"releaseActual":r.get("releaseActual",""),"rnLink":r.get("rnLink",""),"jiraLink":r.get("jiraLink",""),"handoverDate":r["dora"].get("handoverDate",""),"leadTime":lt})
    lt_rows.sort(key=lambda x:x["leadTime"],reverse=True)

    # This week
    today=datetime.now(); mon_wk=monday_of(today); sun_wk=mon_wk+timedelta(days=6,hours=23,minutes=59)
    this_week=[{"id":r.get("id"),"rn":r.get("rn",""),"summary":r.get("summary",""),"type":r.get("type",""),"priority":r.get("priority",""),"modules":r.get("modules",[]),"releaseActual":r.get("releaseActual",""),"rnLink":r.get("rnLink",""),"approvedBy":approved_names(r)} for r in releases if r.get("status") in ("Released","Cancelled") and (d:=parse_date(r.get("releaseActual",""))) and mon_wk<=d<=sun_wk]

    return {
        "kpis":kpis,"leadTime":lead_kpis,
        "teams":{"gateway":team_stats(GATEWAY_MODULES),"appTeam":team_stats(APP_MODULES)},
        "handoverGroups":handover_groups,"weeklyData":weekly_data,
        "moduleCounts":module_counts,"ltByModule":lt_by_module,"ltRows":lt_rows,
        "thisWeek":this_week,"thisWeekLabel":f"{mon_wk.strftime('%a %d %b %Y')} — {sun_wk.strftime('%a %d %b %Y')}",
        "totalFiltered":len(filtered),"totalAll":len(releases),
    }

EMPTY = {"kpis":{"total":0,"released":0,"rolledBack":0,"bugs":0,"patches":0,"featImps":0},"leadTime":{"avgAll":None,"avgFeatImp":None,"maxAll":None,"minAll":None,"count":0},"teams":{"gateway":{"total":0,"featImp":0,"patch":0,"bug":0},"appTeam":{"total":0,"featImp":0,"patch":0,"bug":0}},"handoverGroups":[],"weeklyData":[],"moduleCounts":[],"ltByModule":[],"ltRows":[],"thisWeek":[],"thisWeekLabel":"","totalFiltered":0,"totalAll":0}

class handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin","*")
        self.send_header("Access-Control-Allow-Methods","GET,OPTIONS")
        self.send_header("Access-Control-Allow-Headers","Content-Type")
    def _json(self,code,payload):
        body=json.dumps(payload,default=str).encode()
        self.send_response(code); self._cors()
        self.send_header("Content-Type","application/json"); self.end_headers(); self.wfile.write(body)
    def do_OPTIONS(self): self.send_response(204); self._cors(); self.end_headers()
    def do_GET(self):
        from urllib.parse import urlparse,parse_qs
        qs=parse_qs(urlparse(self.path).query)
        date_from=qs.get("from",[None])[0]; date_to=qs.get("to",[None])[0]
        releases=[normalise(r) for r in fetch_releases()]
        self._json(200, compute_analytics(releases,date_from,date_to) if releases else EMPTY)
    def log_message(self,*_): pass
