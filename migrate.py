#!/usr/bin/env python3
"""
One-time Supabase migration. Run ONCE to seed your database.

Setup:
  pip install httpx
  export SUPABASE_URL=https://xxxx.supabase.co
  export SUPABASE_KEY=your-service-role-key

From CSV:
  python3 migrate.py --csv your_releases.csv

From localStorage (copy from browser DevTools Console):
  copy(localStorage.getItem('datman_releases_v4'))
  Save as export.json, then:
  python3 migrate.py --json export.json

Test first:
  python3 migrate.py --csv file.csv --dry-run
"""

import json, csv, io, re, os, sys, time, argparse
from datetime import datetime

try:
    import httpx
except ImportError:
    print("pip install httpx"); sys.exit(1)

SUPABASE_URL = os.environ.get("SUPABASE_URL","").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY","")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Set SUPABASE_URL and SUPABASE_KEY environment variables"); sys.exit(1)

APPROVER_NAMES = ["Sandeep","Nitish","Pradeep","Muz","Sundar","Ruhan","Anand"]
PRIORITIES     = ["P0","P1","P2","P3","P4"]
STATUSES       = ["Planning","In Progress","Released","Delayed","Cancelled"]

def normalise_date(val):
    if not val: return ""
    val = str(val).strip()
    if re.match(r'^\d{4}-\d{2}-\d{2}$', val): return val
    if re.match(r'^\d{1,2}/\d{1,2}/\d{4}$', val):
        d,m,y = val.split("/")
        return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
    return val

def map_status(val):
    v = val.lower().strip()
    if not v: return "Planning"
    if v in ("released","done","live","deployed","complete"): return "Released"
    if any(x in v for x in ("roll","revert")): return "Cancelled"
    if v in ("pending","planned","not released","upcoming"): return "Planning"
    if any(x in v for x in ("delay","postpone")): return "Delayed"
    if any(x in v for x in ("progress","ongoing","wip","active")): return "In Progress"
    return next((s for s in STATUSES if s.lower()==v), "Planning")

def map_type(summary, type_cell, rn_link):
    tc = type_cell.lower().strip()
    if "bug" in tc: return "Bug"
    if "hotfix" in tc or tc=="patch": return "Patch"
    if "improvement" in tc: return "Improvement"
    if "feature" in tc: return "New Feature"
    s = summary.lower()
    if any(x in s for x in ("hotfix","bug fix","bugfix")): return "Bug"
    if "patch" in s: return "Patch"
    if any(x in s for x in ("improvement","enhance","refactor")): return "Improvement"
    return "New Feature"

def match_approver(header):
    h = header.lower()
    for name in APPROVER_NAMES:
        if name.lower() in h and "approv" in h: return name
    m = re.match(r"^([a-z]+)['\s]?s?\s+approval", h)
    return m.group(1).capitalize() if m else None

def parse_csv(text):
    reader = list(csv.reader(io.StringIO(text.strip())))
    if len(reader) < 2: return []
    raw_headers = reader[0]
    headers = [h.lower().strip() for h in raw_headers]
    approver_cols = {i:match_approver(h) for i,h in enumerate(raw_headers) if match_approver(h)}
    print(f"   Approvers found: {list(approver_cols.values())}")

    def get(cells, *keys):
        for k in keys:
            try:
                idx = headers.index(k)
                v = cells[idx].strip() if idx < len(cells) else ""
                if v: return v
            except ValueError: pass
        return ""

    rows = []
    for i, cells in enumerate(reader[1:], 2):
        if not any(c.strip() for c in cells): continue
        summary = get(cells,"task","summary","release name")
        if not summary: continue
        rn_links   = [cells[j].strip() for j,h in enumerate(headers) if re.search(r"rn link",h) and j<len(cells) and cells[j].strip()]
        jira_links = [cells[j].strip() for j,h in enumerate(headers) if re.search(r"jira.*link",h) and j<len(cells) and cells[j].strip()]
        modules_raw = get(cells,"modules")
        modules = [m.strip() for m in re.split(r"[|;,]",modules_raw) if m.strip()] if modules_raw else []
        raw_pri = get(cells,"priority")
        priority = raw_pri if raw_pri in PRIORITIES else "P2"
        status_raw = get(cells,"release status","status","current release status")
        approvals, approval_raw = {}, {}
        for name in APPROVER_NAMES: approvals[name]=False; approval_raw[name]=""
        for col_idx,name in approver_cols.items():
            val = cells[col_idx].strip() if col_idx<len(cells) else ""
            approval_raw[name]=val; approvals[name]=val.lower()=="approved"
        rn_link = rn_links[0] if rn_links else ""
        rows.append({
            "id": int(time.time()*1000)+i,
            # Preserve existing RN from old data (RN-GAT-XXX / RN-APP-XXX).
            # For rows that have no RN yet, leave blank — the API auto-assigns
            # one when status is changed to Released via the UI or edit modal.
            "rn": get(cells,"rn","rn number","release number"),
            "summary": summary,
            "type": map_type(summary, get(cells,"type","release type","patch type"), rn_link),
            "priority": priority,
            "status": map_status(status_raw),
            "release_planned": normalise_date(get(cells,"planned date","planned")),
            "release_actual":  normalise_date(get(cells,"release date","released date","actual date")),
            "goal":    get(cells,"goal"),
            "team":    "Gateway",
            "modules": modules,
            "rn_link": rn_link, "rn_links": rn_links,
            "jira_link": jira_links[0] if jira_links else "", "jira_links": jira_links,
            "approvals": approvals, "approval_raw": approval_raw,
            "dora": {"leadDeveloper":get(cells,"lead developer","developer"),"application":get(cells,"application","app"),"services":get(cells,"services"),"handoverDate":get(cells,"handover date","handover")},
        })
    return rows

def parse_localstorage(text):
    data = json.loads(text)
    if isinstance(data,str): data = json.loads(data)
    releases = data if isinstance(data,list) else next((v for v in data.values() if isinstance(v,list)),[]) if isinstance(data,dict) else []
    return [{"id":r.get("id"),"rn":r.get("rn",""),"summary":r.get("summary",""),"type":r.get("type","New Feature"),"priority":r.get("priority","P2"),"status":r.get("status","Planning"),"release_planned":r.get("releasePlanned",""),"release_actual":r.get("releaseActual",""),"goal":r.get("goal",""),"team":r.get("team","Gateway"),"modules":r.get("modules",[]),"rn_link":r.get("rnLink",""),"rn_links":r.get("rnLinks",[]),"jira_link":r.get("jiraLink",""),"jira_links":r.get("jiraLinks",[]),"approvals":r.get("approvals",{}),"approval_raw":r.get("approvalRaw",{}),"dora":r.get("dora",{})} for r in releases]

def upsert_batch(rows, batch_size=50):
    hdrs = {"apikey":SUPABASE_KEY,"Authorization":f"Bearer {SUPABASE_KEY}","Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=minimal"}
    ok=0; fail=0; total=len(rows)
    for i in range(0,total,batch_size):
        batch=rows[i:i+batch_size]
        try:
            res=httpx.post(f"{SUPABASE_URL}/rest/v1/releases",headers=hdrs,json=batch,timeout=30)
            if res.status_code in (200,201):
                ok+=len(batch); pct=int(ok/total*100)
                print(f"  [{'█'*(pct//5)}{'░'*(20-pct//5)}] {pct}% {ok}/{total}",end="\r")
            else:
                fail+=len(batch); print(f"\n  ✗ Batch failed ({res.status_code}): {res.text[:200]}")
        except Exception as e:
            fail+=len(batch); print(f"\n  ✗ Error: {e}")
        time.sleep(0.1)
    print(); return ok,fail

def main():
    parser=argparse.ArgumentParser(description="One-time migration to Supabase")
    parser.add_argument("--csv"); parser.add_argument("--json")
    parser.add_argument("--dry-run",action="store_true")
    args=parser.parse_args()
    if not args.csv and not args.json: parser.print_help(); sys.exit(1)

    print(f"\n{'='*50}\n  Datman → Supabase Migration\n  Target: {SUPABASE_URL}\n{'='*50}")

    if args.csv:
        print(f"\n📄 Parsing CSV: {args.csv}")
        with open(args.csv,encoding="utf-8-sig") as f: rows=parse_csv(f.read())
    else:
        print(f"\n📄 Parsing localStorage: {args.json}")
        with open(args.json,encoding="utf-8") as f: rows=parse_localstorage(f.read())

    if not rows: print("❌ No valid rows found"); sys.exit(1)

    statuses={}; types={}
    for r in rows:
        statuses[r["status"]]=statuses.get(r["status"],0)+1
        types[r["type"]]=types.get(r["type"],0)+1

    print(f"\n✅ Parsed {len(rows)} releases")
    print(f"   Status:  {dict(sorted(statuses.items()))}")
    print(f"   Types:   {dict(sorted(types.items()))}")
    print(f"\n   First 3 rows:")
    for r in rows[:3]:
        print(f"   [{r['status']:12s}] {r['rn'] or '(no RN)':15s} {r['summary'][:45]}")

    if args.dry_run:
        print(f"\n✅ Dry run — {len(rows)} rows ready. Remove --dry-run to insert."); return

    print(f"\n⚠️  Insert {len(rows)} releases into Supabase?")
    if input("   Type 'yes' to continue: ").strip().lower() != "yes":
        print("Aborted."); return

    print(f"\n⬆  Inserting...")
    ok,fail=upsert_batch(rows)
    print(f"\n{'='*50}")
    print(f"  {'✅' if not fail else '⚠️'} {ok} inserted, {fail} failed")
    if not fail: print("  You can now delete migrate.py and your CSV file.")
    print(f"{'='*50}\n")

if __name__=="__main__": main()
