import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { B,FONT,FONT_DISPLAY,PRIORITIES,MODULES,RELEASE_TYPES,STATUSES,GATEWAY_MODULES,APP_MODULES,APPROVER_NAMES,STATUS_COLORS,PRIORITY_COLORS,TYPE_COLORS,TYPE_COLOR,inputStyle,primaryBtn,tdSt,parseDDMMYYYY,daysBetween,leadTimeDays,fmtDate,Chip,StatusBadge,Field,SectionLabel,LogoMark,CalendarPicker } from "./shared.jsx";
import { PaginationBar } from "./TableView.jsx";
function loadReleases(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return SEED_DATA;
    const parsed = JSON.parse(raw);
    if(!parsed||!Array.isArray(parsed)||!parsed.length) return SEED_DATA;
    return parsed;
  }catch(e){
    try{ localStorage.removeItem(STORAGE_KEY); }catch(_){}
    return SEED_DATA;
  }
}
function saveReleases(list){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }catch(e){}
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
// ─── JIRA VERSIONS PAGE ───────────────────────────────────────────────────────
// Architecture:
//  • Jira REST API v3 — POST /rest/api/3/version creates a Jira "Fix Version"
//  • GET /rest/api/3/project/{key}/versions lists all versions
//  • Browser CORS: works on localhost dev server; for production deploy a thin proxy
//    (e.g. Cloudflare Worker / Express /api/jira route) that attaches credentials
//  • Credentials stored in sessionStorage only — cleared on tab close, never on disk
//  • When a release is marked "Released" in TableView → auto-adds to Jira queue

const JIRA_CFG_KEY = "datman_jira_cfg_v2";

function loadJiraCfg() {
  try { return JSON.parse(sessionStorage.getItem(JIRA_CFG_KEY) || "{}"); } catch { return {}; }
}
function saveJiraCfg(cfg) {
  try { sessionStorage.setItem(JIRA_CFG_KEY, JSON.stringify(cfg)); } catch {}
}

export default function JiraVersionsPage({ releases, onSyncBack }) {
  // ── Config ──────────────────────────────────────────────────────────────────
  const [cfg, setCfg] = useState(() => loadJiraCfg());
  const [showCfg, setShowCfg] = useState(false);
  const [draftCfg, setDraftCfg] = useState(cfg);
  const configured = !!(cfg.base && cfg.key);

  // Auto-load base URL from Vercel env vars on first mount if not already saved
  useEffect(() => {
    if (cfg.base) return; // already configured
    fetch("/api/jira_config").then(r => r.json()).then(data => {
      if (data.base) {
        const updated = { ...cfg, base: data.base };
        setCfg(updated); setDraftCfg(updated); saveJiraCfg(updated);
      }
    }).catch(() => {});
  }, []);

  const saveCfg = () => { saveJiraCfg(draftCfg); setCfg(draftCfg); setShowCfg(false); };

  // ── Filters ─────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [modFilter, setModFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [showPending, setShowPending] = useState("all"); // "all" only now

  // ── Sync state: { [releaseId]: { status:"idle"|"loading"|"ok"|"err", msg, versionId, link } }
  const [syncState, setSyncState] = useState({});
  const setSync = (id, patch) => setSyncState(s => ({ ...s, [id]: { ...s[id], ...patch } }));

  // ── Filtered releases ────────────────────────────────────────────────────────
  const hasJiraLink = r => !!(r.jiraLink && r.jiraLink.trim() && r.jiraLink !== "Not needed" && r.jiraLink !== "Not needed");

  const rows = useMemo(() => {
    return releases
      // Only entries that still need a Jira link
      .filter(r => !hasJiraLink(r))
      // Only Released entries without a Jira link
      .filter(r => r.status === "Released")
      // Search
      .filter(r => !search || r.summary.toLowerCase().includes(search.toLowerCase()) || (r.rn||"").toLowerCase().includes(search.toLowerCase()))
      // Module filter
      .filter(r => modFilter === "All" || r.modules?.includes(modFilter))
      // Type filter
      .filter(r => typeFilter === "All" || r.type === typeFilter)
      // Status section filter
      .filter(r => {
        if (showPending === "all") return true;
        if (showPending === "released") return r.status === "Released";
        if (showPending === "pending") return r.status !== "Released" && r.status !== "Cancelled";
        return true;
      })
      .sort((a, b) => {
        // Released first, then Pending; within each group sort by date desc
        const aRel = a.status === "Released" ? 0 : 1;
        const bRel = b.status === "Released" ? 0 : 1;
        if (aRel !== bRel) return aRel - bRel;
        const da = a.releaseActual || a.releasePlanned || "";
        const db = b.releaseActual || b.releasePlanned || "";
        return db.localeCompare(da);
      });
  }, [releases, search, modFilter, typeFilter, showPending]);

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const all = releases.filter(r => r.status === "Released");
    const without = all.filter(r => !hasJiraLink(r)).length;
    const withLink = all.length - without;
    return { total: all.length, withLink, without };
  }, [releases]);

  // ── Core: Sync one release to Jira ──────────────────────────────────────────
  // Calls go through /api/jira/* — a Vercel serverless proxy that attaches
  // credentials server-side (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN env vars).
  // This means zero CORS issues and zero credentials sent from the browser.
  const jiraFetch = async (path, options = {}) => {
    const url = `/api/jira/${path.replace(/^\//, "")}`;
    const res = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", "Accept": "application/json", ...(options.headers || {}) },
    });
    // Surface env-var errors clearly
    if (res.status === 500) {
      const err = await res.json().catch(() => ({}));
      if (err.missing) throw new Error(`Vercel env vars not set: ${err.missing.join(", ")}. Add them in Vercel → Settings → Environment Variables.`);
    }
    return res;
  };

  const syncToJira = useCallback(async (r) => {
    if (!cfg.key) {
      setSync(r.id, { status: "err", msg: "Project Key not set — click ⚙ Setup Jira and enter your Jira project key (e.g. DN)" });
      setShowCfg(true);
      return;
    }
    if (!cfg.base) {
      setSync(r.id, { status: "err", msg: "Jira Base URL not set — click ⚙ Setup Jira" });
      setShowCfg(true);
      return;
    }
    setSync(r.id, { status: "loading", msg: "Connecting to Jira…" });
    try {
      // Step 1 — Fetch project to get numeric ID
      setSync(r.id, { status: "loading", msg: "Fetching project info…" });
      const projRes = await jiraFetch(`rest/api/3/project/${cfg.key}`);
      if (!projRes.ok) {
        const txt = await projRes.text();
        throw new Error(`Project not found (${projRes.status}). Check JIRA_BASE_URL and project key.\n${txt}`);
      }
      const proj = await projRes.json();

      // Step 2 — Build version name and dates
      setSync(r.id, { status: "loading", msg: "Preparing version data…" });

      // Team label from modules
      const mods     = r.modules || [];
      const isGW     = mods.some(m => ["Payments","Payouts","General"].includes(m));
      const teamLabel = mods.includes("Portal") ? "Portal"
                      : mods.includes("App")    ? "App"
                      : mods.includes("Web")    ? "Web"
                      : isGW                    ? "Gateway"
                      : mods[0]                 || "Release";

      // Type abbreviation
      const typeAbbr = { "improvement":"Imp","bug":"BF","new feature":"NF","patch":"Patch" }[(r.type||"").toLowerCase()] || "NF";

      // Convert ANY date format → YYYY-MM-DD for Jira
      // Handles: "9 March, 2026" | "1 January, 2026" | "2026-03-09" | "09/03/2026"
      const MONTHS = {january:"01",february:"02",march:"03",april:"04",may:"05",june:"06",
                      july:"07",august:"08",september:"09",october:"10",november:"11",december:"12"};
      const toYMD = (d) => {
        if (!d || typeof d !== "string") return null;
        d = d.trim();
        // YYYY-MM-DD already
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
        // DD/MM/YYYY
        const dmy = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
        // "9 March, 2026" or "9 March 2026"
        const text = d.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/);
        if (text) {
          const mon = MONTHS[text[2].toLowerCase()];
          if (mon) return `${text[3]}-${mon}-${text[1].padStart(2,"0")}`;
        }
        return null;
      };

      // Year for title
      const rawDate     = r.releaseActual || r.releasePlanned || "";
      const ymdDate     = toYMD(rawDate);
      const releaseYear = ymdDate ? ymdDate.slice(0,4) : String(new Date().getFullYear());

      // Version name — NO square brackets (Jira rejects them)
      const rnSuffix = r.rn ? ` - ${r.rn}` : "";
      const vName    = `${releaseYear}_${teamLabel} ${typeAbbr} - ${r.summary}${rnSuffix}`.slice(0, 255);
      const vDesc    = [r.rn, r.goal].filter(Boolean).join(" - ");
      const jiraBase = (cfg.base || "https://datman.atlassian.net").replace(/\/$/, "");

      // Check for existing version
      setSync(r.id, { status: "loading", msg: "Checking for existing version…" });
      const listRes  = await jiraFetch(`rest/api/3/project/${cfg.key}/versions`);
      const existing = listRes.ok ? await listRes.json() : [];
      const found    = (Array.isArray(existing) ? existing : []).find(v => v.name === vName);
      let versionId, jiraLink;

      if (found) {
        versionId = found.id;
        jiraLink  = `${jiraBase}/projects/${cfg.key}/versions/${versionId}/tab/release-report-all-issues`;
        setSync(r.id, { status: "loading", msg: `Version exists (ID ${versionId}), adding related work…` });
      } else {
        // Step 3 — Create Fix Version with clean payload
        setSync(r.id, { status: "loading", msg: "Creating Jira Fix Version…" });

        const startDate   = toYMD(r.releasePlanned);
        const releaseDate = toYMD(r.releaseActual) || toYMD(r.releasePlanned);

        // Minimal payload — only the two required fields first
        // to isolate whether name or dates are the issue
        const projIdInt = parseInt(proj.id, 10);
        if (isNaN(projIdInt)) throw new Error(`Project ID "${proj.id}" is not a number`);

        const payload = {
          name:      vName,
          projectId: projIdInt,
        };
        if (releaseDate) payload.releaseDate = releaseDate;
        if (startDate)   payload.startDate   = startDate;
        if (vDesc)       payload.description = vDesc.slice(0, 255);

        const payloadStr = JSON.stringify(payload);

        const createRes = await jiraFetch(`rest/api/3/version`, {
          method: "POST", body: payloadStr
        });
        const responseText = await createRes.text().catch(() => "");
        if (!createRes.ok) {
          // Full payload + response shown in UI so we can diagnose
          throw new Error(
            `HTTP ${createRes.status}\n\nSENT:\n${payloadStr}\n\nJIRA SAID:\n${responseText}`
          );
        }
        const ver = JSON.parse(responseText);
        versionId = ver.id;
        jiraLink  = `${jiraBase}/projects/${cfg.key}/versions/${versionId}/tab/release-report-all-issues`;
        setSync(r.id, { status: "loading", msg: `Version created — adding RN links…` });
      }

      // Step 4 — Add RN links as "related work" items (Development category)
      // This fills in the "Add related work" section shown in the Jira release page
      const rnLinks = [...new Set([
        ...(r.rnLinks || []),
        ...(r.rnLink ? [r.rnLink] : []),
      ])].filter(Boolean);

      if (rnLinks.length > 0) {
        setSync(r.id, { status: "loading", msg: `Adding ${rnLinks.length} RN link(s) as related work…` });
        for (const [idx, lnk] of rnLinks.entries()) {
          const remotePayload = {
            url:         lnk,
            title:       idx === 0 ? r.summary : `${r.summary} (${idx + 1})`,
            summary:     r.summary,
            relationship: "Development",
            object: {
              url:     lnk,
              title:   idx === 0 ? (r.rn || r.summary) : `${r.rn || r.summary} (${idx + 1})`,
              summary: r.summary,
              icon: {
                url16x16: "https://www.atlassian.com/favicon.ico",
                title:    "Release Note",
              },
              status: {
                resolved: r.status === "Released",
                icon: { url16x16: "", title: r.status, link: "" },
              },
            },
            application: {
              type:    "com.atlassian.confluence",
              name:    "Release Notes",
            },
          };
          // Jira remote version links endpoint
          const remRes = await jiraFetch(
            `rest/api/3/version/${versionId}/remotelink`,
            { method: "POST", body: JSON.stringify(remotePayload) }
          );
          // 200/201 = success, 404 = endpoint may not exist on this Jira tier — not fatal
          if (!remRes.ok && remRes.status !== 404) {
            const txt = await remRes.text().catch(() => "");
            console.warn(`Remote link ${idx + 1} failed (${remRes.status}): ${txt}`);
          }
        }
      }

      const addedLinks = rnLinks.length;
      setSync(r.id, {
        status: "ok",
        msg: `✓ "${vName}" synced${addedLinks ? ` + ${addedLinks} RN link${addedLinks > 1 ? "s" : ""} added` : ""}`,
        link: jiraLink, versionId,
      });

      // Step 5 — Sync Jira link back into release record
      onSyncBack({ ...r, jiraLink, jiraLinks: [jiraLink, ...(r.jiraLinks || []).filter(l => l !== jiraLink)] });

    } catch (err) {
      setSync(r.id, { status: "err", msg: err.message });
    }
  }, [cfg, onSyncBack]);

  // ── Sync ALL pending ─────────────────────────────────────────────────────────
  const syncAll = async () => {
    const pending = rows.filter(r => syncState[r.id]?.status !== "ok");
    for (const r of pending) {
      await syncToJira(r);
      await new Promise(res => setTimeout(res, 400)); // gentle rate-limit
    }
  };

  // ── Shared button helper (consistent height/font across page) ────────────────
  const BTN = (extra={}) => ({
    height: 28, padding: "0 0.75rem", border: "1px solid transparent", borderRadius: 7,
    cursor: "pointer", fontFamily: FONT, fontSize: "0.72rem", fontWeight: 700,
    whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "0.3rem",
    transition: "all 0.15s", ...extra,
  });

  const pendingCount = rows.length; // All shown rows are Released and need sync

  // Pagination
  const JIRA_PAGE_SIZE = 20;
  const [jiraPage, setJiraPage] = useState(1);
  useEffect(() => setJiraPage(1), [modFilter, typeFilter, search]);
  const jiraTotalPages = Math.max(1, Math.ceil(rows.length / JIRA_PAGE_SIZE));
  const jiraPaginated = rows.slice((jiraPage-1)*JIRA_PAGE_SIZE, jiraPage*JIRA_PAGE_SIZE);

  const TH = { padding: "0.5rem 0.75rem", color: B.textMuted, fontSize: "0.62rem", fontWeight: 800,
    letterSpacing: "0.1em", textTransform: "uppercase", textAlign: "left",
    borderBottom: `1px solid ${B.border2}`, whiteSpace: "nowrap", background: "#050505" };
  const TD = { padding: "0.5rem 0.75rem", verticalAlign: "middle", borderBottom: `1px solid ${B.border}` };

  return (
    <div style={{ fontFamily: FONT, minHeight: "100vh" }}>

      {/* ── Sub-bar: filters + actions ── */}
      <div style={{ borderBottom: `1px solid ${B.border}`, background: "rgba(0,0,0,0.3)", padding: "0 2rem", height: 38, display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "nowrap", overflowX: "auto" }}>

        {/* Module dropdown */}
        <select value={modFilter} onChange={e => setModFilter(e.target.value)}
          style={{ height: 28, background: "#0d0d0d", border: `1px solid ${B.border2}`, borderRadius: 7, color: B.textSecondary, fontFamily: FONT, fontSize: "0.72rem", fontWeight: 700, padding: "0 0.6rem", outline: "none", cursor: "pointer", flexShrink: 0 }}>
          <option value="All">All Modules</option>
          {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        {/* Type dropdown */}
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ height: 28, background: "#0d0d0d", border: `1px solid ${B.border2}`, borderRadius: 7, color: B.textSecondary, fontFamily: FONT, fontSize: "0.72rem", fontWeight: 700, padding: "0 0.6rem", outline: "none", cursor: "pointer", flexShrink: 0 }}>
          <option value="All">All Types</option>
          {RELEASE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Status section filter */}


        {/* Search */}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
          style={{ height: 26, background: "#0d0d0d", border: `1px solid ${B.border2}`, borderRadius: 7, color: "#fff", fontFamily: FONT, fontSize: "0.72rem", padding: "0 0.7rem", outline: "none", width: 160, flexShrink: 0 }} />

        {/* Right: count + action buttons */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
          <span style={{ color: B.textMuted, fontSize: "0.68rem" }}>{rows.length} of {stats.total} to sync</span>

          <button onClick={syncAll} disabled={pendingCount === 0}
            style={{ ...BTN({ background: pendingCount > 0 ? "#22c55e" : "#0d0d0d", color: pendingCount > 0 ? "#fff" : B.textMuted, border: `1px solid ${pendingCount > 0 ? "transparent" : B.border2}`, opacity: pendingCount === 0 ? 0.45 : 1, cursor: pendingCount === 0 ? "not-allowed" : "pointer" }) }}>
            ⬆ Sync All ({pendingCount})
          </button>

          <button onClick={() => { setDraftCfg(cfg); setShowCfg(v => !v); }}
            style={{ ...BTN({ background: showCfg ? B.grad1 : "#0d0d0d", color: showCfg ? "#fff" : B.textMuted, border: `1px solid ${showCfg ? "transparent" : B.border2}` }) }}>
            ⚙ {configured ? "Configured" : "Setup Jira"}
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: configured ? "#4ade80" : "#f97316", flexShrink: 0 }} />
          </button>
        </div>
      </div>

      {/* ── Config panel (slides in below sub-bar) ── */}
      {showCfg && (
        <div style={{ margin: "0.75rem 2rem 0", background: "#060f1a", border: `1px solid ${B.teal}44`, borderRadius: 12, padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
            <span style={{ color: B.teal, fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>🔗 Jira Connection</span>
            <button onClick={() => setShowCfg(false)} style={{ background: "none", border: "none", color: B.textMuted, cursor: "pointer", fontSize: "0.9rem" }}>✕</button>
          </div>
          <div style={{ background: "rgba(14,165,200,0.06)", border: "1px solid rgba(14,165,200,0.15)", borderRadius: 9, padding: "0.75rem 1rem", marginBottom: "0.85rem", fontSize: "0.72rem", color: B.textSecondary, lineHeight: 1.75 }}>
            <strong style={{ color: B.textPrimary }}>One-time Vercel setup</strong> — credentials stay server-side:<br/>
            <strong style={{ color: B.teal }}>1.</strong> id.atlassian.com → Security → API Tokens → Create &amp; copy token<br/>
            <strong style={{ color: B.teal }}>2.</strong> Vercel → Project → Settings → Env Vars → add:
            <div style={{ fontFamily: "monospace", fontSize: "0.7rem", margin: "0.25rem 0 0.25rem 0.5rem", display: "flex", flexDirection: "column", gap: 2 }}>
              {[["JIRA_BASE_URL","https://datman.atlassian.net"],["JIRA_EMAIL","admin@datman.com"],["JIRA_API_TOKEN","your-token"]].map(([k,v])=>(
                <div key={k}><span style={{color:B.cyan}}>{k}</span><span style={{color:B.textMuted}}> = </span><span style={{color:"#a3e635"}}>{v}</span></div>
              ))}
            </div>
            <strong style={{ color: B.teal }}>3.</strong> Redeploy → fill the two fields below
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
            {[["Jira Base URL","base","https://datman.atlassian.net"],["Project Key","key","DN"]].map(([label,field,ph])=>(
              <div key={field} style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <label style={{ color: B.teal, fontSize: "0.61rem", fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase" }}>{label}</label>
                <input value={draftCfg[field]||""} placeholder={ph} onChange={e=>setDraftCfg(d=>({...d,[field]:e.target.value}))}
                  style={{ height: 30, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontFamily: FONT, fontSize: "0.78rem", padding: "0 0.75rem", outline: "none" }}/>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.75rem" }}>
            <button onClick={saveCfg} style={{ ...BTN({ background: B.grad1, color: "#fff", border: "none" }) }}>Save</button>
            <button onClick={() => { const d={base:"https://datman.atlassian.net",key:"DN"}; setDraftCfg(d); saveJiraCfg(d); setCfg(d); setShowCfg(false); }}
              style={{ ...BTN({ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }) }}>Reset</button>
            <button onClick={() => setShowCfg(false)}
              style={{ ...BTN({ background: "rgba(255,255,255,0.04)", color: B.textMuted, border: `1px solid ${B.border2}` }) }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div style={{ padding: "1rem 2rem 1.5rem" }}>
        <div style={{ background: B.bgCard, border: `1px solid ${B.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT, minWidth: 860 }}>
              <thead>
                <tr>
                  {[["RN #",90],["Summary","auto"],["Type",90],["Pri",46],["Module",80],["Planned Date",95],["Released Date",95],["Approvers",100],["Jira Link",85],["Action",90]].map(([h,w])=>(
                    <th key={h} style={{ ...TH, width: w }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jiraPaginated.map((r, i) => {
                  const ss = syncState[r.id];
                  const hasJira = !!(r.jiraLink && r.jiraLink.trim() && r.jiraLink !== "Not needed");
                  const approvedNames = Object.entries(r.approvals||{}).filter(([,v])=>v).map(([k])=>k);
                  const jiraHref = ss?.link || r.jiraLink;
                  return (
                    <tr key={r.id} style={{ background: i%2===0 ? "#000" : B.bgCard }}>
                      {/* RN */}
                      <td style={{ ...TD, whiteSpace: "nowrap" }}>
                        {r.rnLink && !["No RN","No RN/change request"].includes(r.rnLink)
                          ? <a href={(r.rnLinks||[])[0]||r.rnLink} target="_blank" rel="noreferrer" style={{ color: B.teal, fontWeight: 800, fontSize: "0.72rem", textDecoration: "none" }}>{r.rn||"—"}</a>
                          : <span style={{ color: B.textMuted, fontSize: "0.72rem", fontWeight: 700 }}>{r.rn||"—"}</span>}
                      </td>
                      {/* Summary */}
                      <td style={{ ...TD, maxWidth: 260 }}>
                        <div style={{ color: B.textPrimary, fontSize: "0.73rem", lineHeight: 1.4, wordBreak: "break-word" }}>{r.summary}</div>
                        {r.goal && <div style={{ color: B.textMuted, fontSize: "0.62rem", marginTop: 1 }}>{r.goal}</div>}
                      </td>
                      {/* Type */}
                      <td style={TD}><span style={{ color: TYPE_COLOR(r.type), fontSize: "0.7rem", fontWeight: 700 }}>{r.type}</span></td>
                      {/* Priority */}
                      <td style={TD}><span style={{ color: PRIORITY_COLORS[r.priority]||B.textMuted, fontSize: "0.7rem", fontWeight: 800 }}>{r.priority}</span></td>
                      {/* Module */}
                      <td style={TD}><span style={{ color: B.textSecondary, fontSize: "0.7rem" }}>{r.modules?.join(", ")||"—"}</span></td>
                      {/* Planned Date */}
                      <td style={{ ...TD, whiteSpace: "nowrap" }}>
                        <span style={{ color: B.textSecondary, fontSize: "0.72rem" }}>{fmtDate(r.releasePlanned)||"—"}</span>
                      </td>
                      {/* Released Date */}
                      <td style={{ ...TD, whiteSpace: "nowrap" }}>
                        <span style={{ color: "#22c55e", fontSize: "0.72rem", fontWeight: 600 }}>{fmtDate(r.releaseActual)||"—"}</span>
                      </td>
                      {/* Approvers */}
                      <td style={TD}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                          {approvedNames.length > 0
                            ? approvedNames.map(n => <span key={n} style={{ background: "#22c55e18", color: "#22c55e", fontSize: "0.58rem", fontWeight: 700, padding: "0.08rem 0.32rem", borderRadius: 4 }}>{n}</span>)
                            : <span style={{ color: B.textMuted, fontSize: "0.68rem" }}>—</span>}
                        </div>
                      </td>
                      {/* Jira Link */}
                      <td style={TD}>
                        {ss?.status === "loading"
                          ? <span style={{ color: B.teal, fontSize: "0.7rem" }}>⏳…</span>
                          : ss?.status === "err"
                          ? <span style={{ color: "#ef4444", fontSize: "0.65rem" }} title={ss.msg}>✗ Error</span>
                          : (jiraHref && jiraHref !== "Not needed")
                          ? <a href={jiraHref} target="_blank" rel="noreferrer"
                              style={{ ...BTN({ background: "#0f2d5288", color: "#60a5fa", border: "1px solid #1e4a8066", height: 24, padding: "0 0.55rem", textDecoration: "none", fontSize: "0.7rem" }) }}>
                              ⎇ Jira ↗
                            </a>
                          : <span style={{ color: B.textMuted, fontSize: "0.7rem" }}>—</span>}
                      </td>
                      {/* Action */}
                      <td style={TD}>
                        <button disabled={ss?.status==="loading"} onClick={() => syncToJira(r)}
                          style={{ ...BTN({
                            height: 24, padding: "0 0.55rem", fontSize: "0.7rem",
                            background: ss?.status==="ok" ? "#22c55e22" : ss?.status==="err" ? "#ef444422" : hasJira ? "rgba(96,165,250,0.1)" : B.grad1,
                            color: ss?.status==="ok" ? "#22c55e" : ss?.status==="err" ? "#ef4444" : hasJira ? "#60a5fa" : "#fff",
                            border: `1px solid ${ss?.status==="ok" ? "#22c55e44" : ss?.status==="err" ? "#ef444444" : hasJira ? "rgba(96,165,250,0.25)" : "transparent"}`,
                            cursor: ss?.status==="loading" ? "wait" : "pointer",
                            opacity: ss?.status==="loading" ? 0.6 : 1,
                          }) }}>
                          {ss?.status==="loading" ? "⏳…" : ss?.status==="ok" ? "✓ Synced" : ss?.status==="err" ? "↺ Retry" : "⬆ Sync"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={10} style={{ padding: "3rem", textAlign: "center", color: B.textMuted, fontSize: "0.8rem" }}>No entries match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <PaginationBar current={jiraPage} total={jiraTotalPages} onChange={setJiraPage} count={rows.length} label="releases" />
    </div>
  );

}

