import React, { useState, useEffect, useCallback } from "react";
import { B, FONT, LogoMark, GATEWAY_MODULES, APP_MODULES } from "./components/shared.jsx";
import TableView     from "./components/TableView.jsx";
import NodeGraphView from "./components/NodeGraph.jsx";
import AnalyticsPage from "./components/Analytics.jsx";
import JiraVersionsPage from "./components/JiraPage.jsx";
import FormPage      from "./components/FormPage.jsx";

// ── API fetch helper ──────────────────────────────────────────────────────────
async function apiFetch(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Normalise DB snake_case → camelCase
function norm(r) {
  if (!r) return r;
  return {
    ...r,
    releasePlanned: r.release_planned ?? r.releasePlanned ?? "",
    releaseActual:  r.release_actual  ?? r.releaseActual  ?? "",
    rnLink:         r.rn_link         ?? r.rnLink         ?? "",
    rnLinks:        r.rn_links        ?? r.rnLinks        ?? [],
    jiraLink:       r.jira_link       ?? r.jiraLink       ?? "",
    jiraLinks:      r.jira_links      ?? r.jiraLinks      ?? [],
    approvalRaw:    r.approval_raw    ?? r.approvalRaw    ?? {},
    modules:        r.modules         ?? [],
    approvals:      r.approvals       ?? {},
    dora:           r.dora            ?? {},
  };
}

// localStorage fallback for local dev without Supabase
const LS_KEY = "datman_releases_v4";
function lsLoad() {
  try { const p = JSON.parse(localStorage.getItem(LS_KEY)||"[]"); return Array.isArray(p)?p:[]; }
  catch { return []; }
}
function lsSave(list) { try { localStorage.setItem(LS_KEY,JSON.stringify(list)); } catch {} }

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {

  const [page,        setPage]        = useState("list");
  const [view,        setView]        = useState("table");
  const [team,        setTeam]        = useState("All");
  const [tableView,   setTableView]   = useState("all");
  const [customFrom,  setCustomFrom]  = useState("");
  const [customTo,    setCustomTo]    = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [graphFilter, setGraphFilter] = useState("");
  const [statusFilter,setStatusFilter]= useState("All");
  const [triggerCsv,  setTriggerCsv]  = useState(0);

  const [releases, setReleases] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);
  const [useLS,    setUseLS]    = useState(false);

  // ── Load ─────────────────────────────────────────────────────────────────
  const loadReleases = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("GET", "/api/releases");
      setReleases((Array.isArray(data) ? data : []).map(norm));
      setUseLS(false);
    } catch (e) {
      console.warn("API unavailable, using localStorage:", e.message);
      setReleases(lsLoad());
      setUseLS(true);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadReleases(); }, [loadReleases]);
  useEffect(() => { if (useLS) lsSave(releases); }, [releases, useLS]);

  // ── CREATE ───────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (data) => {
    setReleases(prev => [norm(data), ...prev]); // optimistic
    setStatusFilter("Pending"); setPage("list");
    if (!useLS) {
      try {
        setSaving(true);
        const created = await apiFetch("POST", "/api/releases", data);
        const row = norm(Array.isArray(created) ? created[0] : created);
        setReleases(prev => prev.map(r => r.id === data.id ? row : r));
      } catch (e) {
        setError(`Save failed: ${e.message}`); setUseLS(true);
      } finally { setSaving(false); }
    }
  }, [useLS]);

  // ── EDIT ─────────────────────────────────────────────────────────────────
  const handleEdit = useCallback(async (updated) => {
    if (!updated?.id) return;
    // Optimistic update — UI feels instant
    setReleases(prev => prev.map(x => {
      if (x.id !== updated.id) return x;
      return {
        ...x, ...updated,
        dora:      { ...(x.dora      || {}), ...(updated.dora      || {}) },
        approvals: { ...(x.approvals || {}), ...(updated.approvals || {}) },
        modules:   updated.modules   || x.modules   || [],
        jiraLinks: updated.jiraLinks || x.jiraLinks || [],
        rnLinks:   updated.rnLinks   || x.rnLinks   || [],
      };
    }));
    if (!useLS) {
      try {
        await apiFetch("PUT", `/api/releases?id=${updated.id}`, {
          rn:             updated.rn,
          summary:        updated.summary,
          type:           updated.type,
          priority:       updated.priority,
          status:         updated.status,
          releasePlanned: updated.releasePlanned,
          releaseActual:  updated.releaseActual,
          goal:           updated.goal,
          team:           updated.team,
          modules:        updated.modules,
          rnLink:         updated.rnLink,
          rnLinks:        updated.rnLinks,
          jiraLink:       updated.jiraLink,
          jiraLinks:      updated.jiraLinks,
          approvals:      updated.approvals,
          approvalRaw:    updated.approvalRaw,
          dora:           updated.dora,
        });
      } catch (e) {
        setError(`Sync error: ${e.message} — change kept locally`);
        setUseLS(true);
      }
    }
  }, [useLS]);

  // ── IMPORT ───────────────────────────────────────────────────────────────
  const handleImport = useCallback(async (rows) => {
    if (useLS) { setReleases(rows); return; }
    try {
      setSaving(true); setError(null);
      for (const r of rows) await apiFetch("POST", "/api/releases", r);
      await loadReleases();
    } catch (e) {
      setError(`Import error: ${e.message}`);
    } finally { setSaving(false); }
  }, [useLS, loadReleases]);

  const filtered = releases.filter(r => {
    if (team === "Gateway")  return r.modules?.some(m => GATEWAY_MODULES.includes(m));
    if (team === "App Team") return r.modules?.some(m => APP_MODULES.includes(m));
    return true;
  });

  if (page === "form") return <FormPage onSubmit={handleSubmit} onCancel={() => setPage("list")} releases={releases}/>;

  const relCnt = releases.filter(r => r.status === "Released").length;
  const ipCnt  = releases.filter(r => r.status === "In Progress").length;
  const dlCnt  = releases.filter(r => r.status === "Delayed").length;

  const CTRL = { height:28, background:"#0d0d0d", border:`1px solid ${B.border2}`, borderRadius:7,
    color:B.textSecondary, fontFamily:FONT, fontSize:"0.72rem", fontWeight:700,
    padding:"0 0.6rem", outline:"none", cursor:"pointer", flexShrink:0 };
  const Div = () => <div style={{ width:1, height:18, background:B.border2, flexShrink:0 }}/>;

  return (
    <div style={{ minHeight:"100vh", background:B.bgDark, fontFamily:FONT }}>

      <div style={{ position:"sticky", top:0, zIndex:100, background:B.bgDark+"f8",
                    backdropFilter:"blur(16px)", borderBottom:`1px solid ${B.border}` }}>

        <div style={{ padding:"0 2rem", display:"flex", alignItems:"center", height:52, gap:"0.5rem" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"0.6rem", marginRight:"1.5rem", flexShrink:0 }}>
            <LogoMark size={26}/>
            <div>
              <div style={{ color:B.textPrimary, fontWeight:800, fontSize:"0.95rem", letterSpacing:"-0.02em", lineHeight:1 }}>Datman</div>
              <div style={{ color:B.textMuted, fontSize:"0.55rem", letterSpacing:"0.07em", textTransform:"uppercase" }}>Release Tracker</div>
            </div>
          </div>
          <div style={{ display:"flex", height:"100%", gap:"0.1rem" }}>
            {[["list","Releases"],["analytics","Analytics"],["jira","Jira"]].map(([p,l]) => (
              <button key={p} onClick={() => setPage(p)} style={{
                height:"100%", padding:"0 1.1rem", border:"none", cursor:"pointer",
                background:"transparent", fontFamily:FONT, fontSize:"0.82rem", fontWeight:700,
                color: page===p ? B.cyan : B.textMuted,
                borderBottom: page===p ? `2px solid ${B.cyan}` : "2px solid transparent",
              }}>{l}</button>
            ))}
          </div>
          {page !== "jira" && (
            <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:"1.25rem" }}>
              {loading ? <span style={{ color:B.textMuted, fontSize:"0.72rem" }}>Loading…</span>
                : [["Released",B.lime,relCnt],["In Progress",B.cyan,ipCnt],["Delayed","#f97316",dlCnt]].map(([l,c,n])=>(
                    <div key={l} style={{ textAlign:"center" }}>
                      <div style={{ color:c, fontSize:"1rem", fontWeight:800, lineHeight:1 }}>{n}</div>
                      <div style={{ color:B.textMuted, fontSize:"0.54rem", whiteSpace:"nowrap", marginTop:2 }}>{l}</div>
                    </div>
                  ))}
              {saving && <span style={{ color:B.teal, fontSize:"0.68rem" }}>⏳ Saving…</span>}
              {useLS  && <span title="Using localStorage — check Supabase env vars in Vercel"
                style={{ color:"#f97316", fontSize:"0.68rem", cursor:"help" }}>⚠ Local mode</span>}
            </div>
          )}
        </div>

        {page === "list" && (
          <div style={{ padding:"0 2rem", height:38, display:"flex", alignItems:"center",
                        gap:"0.6rem", borderTop:`1px solid ${B.border2}`,
                        background:"rgba(0,0,0,0.3)", overflowX:"auto" }}>
            <select value={view} onChange={e=>setView(e.target.value)} style={CTRL}>
              <option value="table">⊞ Table</option>
              <option value="graph">⬡ Graph</option>
            </select><Div/>
            <select value={team} onChange={e=>setTeam(e.target.value)} style={CTRL}>
              <option value="All">All Teams</option>
              <option value="Gateway">Gateway</option>
              <option value="App Team">App Team</option>
            </select><Div/>
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={CTRL}>
              <option value="All">All Status</option>
              <option value="Released">Released</option>
              <option value="Rolledback">Rolledback</option>
              <option value="Pending">Pending</option>
            </select>
            {view==="table"&&<>
              <Div/>
              <select value={tableView} onChange={e=>setTableView(e.target.value)} style={CTRL}>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="all">All Time</option>
                <option value="custom">Custom Range</option>
              </select>
              {tableView==="custom"&&<>
                <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={{...CTRL,colorScheme:"dark",color:"#fff"}}/>
                <span style={{color:B.textMuted,fontSize:"0.7rem",flexShrink:0}}>→</span>
                <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} style={{...CTRL,colorScheme:"dark",color:"#fff"}}/>
              </>}
              <Div/>
              <input value={tableFilter} onChange={e=>setTableFilter(e.target.value)} placeholder="Search RN, summary…" style={{...CTRL,width:190,color:"#fff"}}/>
            </>}
            {view==="graph"&&<>
              <Div/>
              <input value={graphFilter} onChange={e=>setGraphFilter(e.target.value)} placeholder="Search by RN or summary…" style={{...CTRL,width:210,color:"#fff",border:`1px solid ${graphFilter?B.teal:B.border2}`}}/>
              {graphFilter&&<button onClick={()=>setGraphFilter("")} style={{...CTRL,width:28,padding:0,color:B.textMuted}}>✕</button>}
            </>}
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:"0.4rem",flexShrink:0}}>
              {view==="table"&&<button onClick={()=>setTriggerCsv(n=>n+1)} style={{height:28,padding:"0 0.75rem",background:"#0d0d0d",border:`1px solid ${B.border2}`,color:B.textSecondary,borderRadius:7,cursor:"pointer",fontSize:"0.72rem",fontWeight:700,fontFamily:FONT,display:"inline-flex",alignItems:"center"}}>↑ CSV</button>}
              <button onClick={()=>setPage("form")} style={{height:28,padding:"0 0.9rem",background:B.grad1,border:"none",color:"#fff",borderRadius:7,cursor:"pointer",fontSize:"0.72rem",fontWeight:800,fontFamily:FONT,display:"inline-flex",alignItems:"center"}}>+ New</button>
            </div>
          </div>
        )}
      </div>

      {error&&(
        <div style={{margin:"0.75rem 2rem 0",background:"#2d0a0a",border:"1px solid #ef444455",borderRadius:10,padding:"0.6rem 1rem",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"1rem"}}>
          <span style={{color:"#fca5a5",fontSize:"0.78rem"}}>⚠ {error}</span>
          <button onClick={()=>setError(null)} style={{background:"transparent",border:"none",color:"#fca5a5",cursor:"pointer",fontSize:"0.85rem"}}>✕</button>
        </div>
      )}

      <div style={{position:"relative",zIndex:1}}>
        {page==="list"&&view==="table"&&(
          <TableView releases={releases} teamFilter={team} onAdd={()=>setPage("form")} onImport={handleImport} onEdit={handleEdit}
            tableView={tableView} setTableView={setTableView} customFrom={customFrom} setCustomFrom={setCustomFrom}
            customTo={customTo} setCustomTo={setCustomTo} filterProp={tableFilter} triggerCsv={triggerCsv} statusFilter={statusFilter} loading={loading}/>
        )}
        {page==="list"&&view==="graph"&&<NodeGraphView releases={filtered} graphFilter={graphFilter}/>}
        {page==="analytics"&&<AnalyticsPage releases={releases}/>}
        {page==="jira"&&<JiraVersionsPage releases={releases} onSyncBack={r=>handleEdit(r)}/>}
      </div>
    </div>
  );
}
