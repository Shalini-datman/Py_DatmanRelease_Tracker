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

  // ── Sync state
  const [syncState, setSyncState] = useState({});
  const setSync = (id, patch) => setSyncState(s => ({ ...s, [id]: { ...s[id], ...patch } }));

  // ── RN Parser state
  const [rnParseResult, setRnParseResult] = useState(null);
  const [rnParsing,     setRnParsing]     = useState(false);
  const [rnParseUrl,    setRnParseUrl]    = useState("");
  const [activeTab,     setActiveTab]     = useState("sync"); // "sync" | "parser"

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

  // ── RN Page Parser ────────────────────────────────────────────────────────────
  const parseRNPage = async (url) => {
    if (!url) return;
    setRnParsing(true); setRnParseResult(null);
    try {
      // Extract page ID from URL
      const pageIdMatch = url.match(/\/pages\/(\d+)/);
      if (!pageIdMatch) throw new Error("Could not extract page ID from URL. Expected format: .../pages/{id}/...");
      const pageId = pageIdMatch[1];

      // Fetch full page content via Confluence API
      const res = await jiraFetch(`wiki/rest/api/content/${pageId}?expand=body.storage,version,space,metadata.labels`);
      if (!res.ok) {
        const txt = await res.text().catch(()=>"");
        throw new Error(`Confluence fetch failed (${res.status}): ${txt.slice(0,200)}`);
      }
      const data = await res.json();
      const html  = data?.body?.storage?.value || "";
      const title = data?.title || "";

      // ── Extract all fields from page ──────────────────────────────────────
      const result = { title, pageId, url, html: html.slice(0, 500), fields: {} };

      // 1. Jira ticket IDs
      // Tickets always start with DN- per project convention
      const tickets = [...new Set((html.match(/\bDN-\d+\b/g) || []))];
      result.fields.jiraTickets = tickets;

      // 2. Release date from title (e.g. "25-03-2026" or "25/03/2026")
      const dateFromTitle = title.match(/(\d{1,2}[-/]\d{2}[-/]\d{4})/);
      result.fields.releaseDateFromTitle = dateFromTitle ? dateFromTitle[1] : null;

      // 3. Parse all table rows — extract key:value pairs
      const tableRows = {};
      const trMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
      for (const tr of trMatches) {
        const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
          .map(m => m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&nbsp;/g," ").trim())
          .filter(Boolean);
        if (cells.length >= 2) {
          const key = cells[0].toLowerCase().replace(/[^a-z0-9]/g, "_");
          tableRows[key] = cells.slice(1).join(" | ");
        }
      }
      result.fields.tableData = tableRows;

      // 4. Approved by — look for approval table rows
      const approvedBy = [];
      const approvalPatterns = [/approv/i, /sign.?off/i, /reviewed.?by/i];
      for (const [k, v] of Object.entries(tableRows)) {
        if (approvalPatterns.some(p => p.test(k)) || approvalPatterns.some(p => p.test(v))) {
          // Extract names from the value — comma or newline separated
          const names = v.split(/[,\n|]+/).map(n => n.trim()).filter(n => n.length > 1 && n.length < 40);
          approvedBy.push(...names);
        }
      }
      // Also look for "Approved by: Name" patterns in plain text
      const approvedMatches = html.matchAll(/approved[^:]*by[^:]*:([^<\n]+)/gi);
      for (const m of approvedMatches) {
        const names = m[1].replace(/<[^>]+>/g,"").split(/[,|]+/).map(n=>n.trim()).filter(Boolean);
        approvedBy.push(...names);
      }
      result.fields.approvedBy = [...new Set(approvedBy)];

      // 5. Lead developer / DORA fields
      const doraKeys = {
        lead_developer: ["lead_dev","developer","lead_developer","author"],
        application:    ["application","app","service_name"],
        services:       ["services","microservices","components"],
        handover_date:  ["handover","handover_date","code_freeze"],
      };
      for (const [field, keys] of Object.entries(doraKeys)) {
        for (const k of keys) {
          const found = Object.entries(tableRows).find(([key]) => key.includes(k));
          if (found) { result.fields[field] = found[1]; break; }
        }
      }

      // 6. Extract all headings
      const headings = [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
        .map(m => m[1].replace(/<[^>]+>/g,"").trim()).filter(Boolean);
      result.fields.headings = headings;

      // 7. External links (test evidence, PRs etc)
      const links = [...new Set(
        [...html.matchAll(/href=["']([^"']+)["']/gi)]
          .map(m => m[1])
          .filter(l => l.startsWith("http") && !l.includes("atlassian.net/browse") && !l.includes("wiki"))
      )].slice(0, 10);
      result.fields.externalLinks = links;

      setRnParseResult({ success: true, ...result });
    } catch (e) {
      setRnParseResult({ success: false, error: e.message });
    } finally {
      setRnParsing(false);
    }
  };

  const syncToJira = useCallback(async (r) => {
    if (!cfg.key || !cfg.base) {
      setSync(r.id, { status: "err", msg: "Jira not configured — click ⚙ Setup Jira" });
      setShowCfg(true); return;
    }

    // ── helpers ────────────────────────────────────────────────────────────────
    const MONTHS = {january:"01",february:"02",march:"03",april:"04",may:"05",june:"06",
                    july:"07",august:"08",september:"09",october:"10",november:"11",december:"12"};
    const toYMD = d => {
      if (!d || typeof d !== "string") return null;
      d = d.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
      const dmy = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
      const txt = d.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/);
      if (txt) { const m = MONTHS[txt[2].toLowerCase()]; if (m) return `${txt[3]}-${m}-${txt[1].padStart(2,"0")}`; }
      return null;
    };

    const jBase = (cfg.base || "").replace(/\/$/, "");
    const log   = msg => setSync(r.id, { status: "loading", msg });
    const results = { related: false, tickets: [], approvers: [], released: false, errors: [] };

    try {
      // ── STEP 1: Get project ─────────────────────────────────────────────────
      log("Fetching project info…");
      const projRes = await jiraFetch(`rest/api/3/project/${cfg.key}`);
      if (!projRes.ok) throw new Error(`Project not found (${projRes.status}). Check project key.`);
      const proj = await projRes.json();
      const projIdInt = parseInt(proj.id, 10);

      // ── Build version name ──────────────────────────────────────────────────
      const mods      = r.modules || [];
      const isGW      = mods.some(m => ["Payments","Payouts","General"].includes(m));
      const teamLabel = mods.includes("Portal") ? "Portal" : mods.includes("App") ? "App"
                      : mods.includes("Web") ? "Web" : isGW ? "Gateway" : mods[0] || "Release";
      const typeAbbr  = {"improvement":"Imp","bug":"BF","new feature":"NF","patch":"Patch"}[(r.type||"").toLowerCase()] || "NF";
      const rawDate   = r.releaseActual || r.releasePlanned || "";
      const releaseYear = (toYMD(rawDate) || String(new Date().getFullYear())).slice(0,4);
      const rnSuffix  = r.rn ? ` - ${r.rn}` : "";
      const vName     = `${releaseYear}_${teamLabel} ${typeAbbr} - ${r.summary}${rnSuffix}`.slice(0, 255);
      const startDate  = toYMD(r.releasePlanned);
      const releaseDate = toYMD(r.releaseActual) || toYMD(r.releasePlanned);

      // ── STEP 2: Find or create Fix Version ─────────────────────────────────
      log("Checking for existing version…");
      const listRes  = await jiraFetch(`rest/api/3/project/${cfg.key}/versions`);
      const existing = listRes.ok ? await listRes.json() : [];
      const found    = (Array.isArray(existing) ? existing : []).find(v => v.name === vName);
      let versionId, jiraLink;

      if (found) {
        versionId = found.id;
        jiraLink  = `${jBase}/projects/${cfg.key}/versions/${versionId}/tab/release-report-all-issues`;
        log(`Version exists (${versionId}), updating fields…`);
        // Update dates if missing
        const updatePayload = {};
        if (startDate)   updatePayload.startDate   = startDate;
        if (releaseDate) updatePayload.releaseDate  = releaseDate;
        if (Object.keys(updatePayload).length) {
          await jiraFetch(`rest/api/3/version/${versionId}`, {
            method: "PUT", body: JSON.stringify(updatePayload)
          });
        }
      } else {
        log("Creating Jira Fix Version…");
        const payload = {
          name:      vName,
          projectId: projIdInt,
          released:  false,   // always start unreleased — never auto-mark
        };
        if (startDate)   payload.startDate   = startDate;
        if (releaseDate) payload.releaseDate  = releaseDate;
        if (r.rn || r.goal) payload.description = [r.rn, r.goal].filter(Boolean).join(" - ").slice(0,255);

        const createRes = await jiraFetch(`rest/api/3/version`, {
          method: "POST", body: JSON.stringify(payload)
        });
        const createTxt = await createRes.text().catch(() => "");
        if (!createRes.ok) throw new Error(`Create version failed (${createRes.status}): ${createTxt}`);
        const ver  = JSON.parse(createTxt);
        versionId  = ver.id;
        jiraLink   = `${jBase}/projects/${cfg.key}/versions/${versionId}/tab/release-report-all-issues`;
      }

      // ── STEP 3: Add Related Work (RN links) ─────────────────────────────────
      const rnLinks = [...new Set([...(r.rnLinks||[]), ...(r.rnLink?[r.rnLink]:[])])].filter(Boolean);
      if (rnLinks.length > 0) {
        log(`Adding ${rnLinks.length} RN link(s) as related work…`);
        for (const [idx, lnk] of rnLinks.entries()) {
          const remRes = await jiraFetch(`rest/api/3/version/${versionId}/remotelink`, {
            method: "POST",
            body: JSON.stringify({
              url:      lnk,
              title:    idx === 0 ? (r.rn || r.summary) : `${r.rn || r.summary} (${idx+1})`,
              summary:  r.summary,
              relationship: "Development",
              object: {
                url:   lnk,
                title: idx === 0 ? (r.rn || r.summary) : `${r.rn || r.summary} (${idx+1})`,
                icon:  { url16x16: "https://www.atlassian.com/favicon.ico", title: "Release Note" },
                status: { resolved: r.status === "Released", icon: { url16x16:"", title: r.status, link:"" } },
              },
              application: { type: "com.atlassian.confluence", name: "Release Notes" },
            })
          });
          if (remRes.ok || remRes.status === 404) results.related = true;
          else results.errors.push(`Related work link ${idx+1}: HTTP ${remRes.status}`);
        }
      }

      // ── STEP 4: Parse RN Confluence page → extract Jira ticket IDs ──────────
      let jiraTickets = [];
      const rnPageUrl = rnLinks[0] || "";
      const pageIdMatch = rnPageUrl.match(/\/pages\/(\d+)/);
      if (pageIdMatch) {
        log("Fetching RN page to extract Jira tickets…");
        try {
          const pageId  = pageIdMatch[1];
          // Confluence REST API — fetch page body in storage format
          const confRes = await jiraFetch(`wiki/rest/api/content/${pageId}?expand=body.storage`);
          if (confRes.ok) {
            const confData = await confRes.json();
            const html     = confData?.body?.storage?.value || "";
            // Extract all Jira ticket IDs from the page content
            // Tickets always start with DN- per project convention
            const allTickets = [...new Set((html.match(/\bDN-\d+\b/g) || []))];
            jiraTickets = allTickets;
            results.tickets = allTickets;
            log(`Found ${allTickets.length} Jira ticket(s) in RN page…`);
          }
        } catch (e) {
          results.errors.push(`RN page parse: ${e.message}`);
        }
      }

      // ── STEP 5: Add tickets as work items (set fixVersion on each issue) ────
      if (jiraTickets.length > 0) {
        log(`Adding ${jiraTickets.length} work item(s) to version…`);
        let added = 0;
        for (const ticketKey of jiraTickets) {
          try {
            // Get current issue fixVersions
            const issRes  = await jiraFetch(`rest/api/3/issue/${ticketKey}?fields=fixVersions`);
            if (!issRes.ok) continue;
            const issData = await issRes.json();
            const existingFV = (issData?.fields?.fixVersions || []).map(v => ({ id: v.id }));
            // Add this version if not already there
            if (!existingFV.find(v => v.id === versionId)) {
              const updateRes = await jiraFetch(`rest/api/3/issue/${ticketKey}`, {
                method: "PUT",
                body: JSON.stringify({
                  update: { fixVersions: [{ add: { id: versionId } }] }
                })
              });
              const updateTxt = await updateRes.text().catch(()=>"");
              console.log(`Ticket ${ticketKey}: ${updateRes.status} ${updateTxt.slice(0,100)}`);
              if (updateRes.ok || updateRes.status === 204) added++;
              else results.errors.push(`Ticket ${ticketKey}: ${updateRes.status} ${updateTxt.slice(0,80)}`);
            } else { added++; }
          } catch {}
        }
        log(`Added ${added}/${jiraTickets.length} work items…`);
      }

      // ── STEP 6: Find and assign approvers ───────────────────────────────────
      const approvedNames = Object.entries(r.approvals || {})
        .filter(([, v]) => v === true)
        .map(([k]) => k);

      if (approvedNames.length > 0) {
        log(`Looking up ${approvedNames.length} approver(s)…`);
        for (const name of approvedNames) {
          try {
            const searchRes  = await jiraFetch(`rest/api/3/user/search?query=${encodeURIComponent(name)}&maxResults=5`);
            if (!searchRes.ok) { results.errors.push(`User search for ${name} failed`); continue; }
            const users      = await searchRes.json();
            const match      = Array.isArray(users) ? users.find(u =>
              (u.displayName || "").toLowerCase().includes(name.toLowerCase()) ||
              (u.emailAddress || "").toLowerCase().includes(name.toLowerCase())
            ) : null;
            if (match) {
              // Add user as reviewer/watcher on the version (Jira uses watchers endpoint)
              await jiraFetch(`rest/api/3/version/${versionId}/watchers`, {
                method: "POST",
                body: JSON.stringify(match.accountId)
              });
              results.approvers.push(name);
            } else {
              results.errors.push(`Approver "${name}" not found in Jira`);
            }
          } catch (e) {
            results.errors.push(`Approver ${name}: ${e.message}`);
          }
        }
      }

      // ── STEP 7: Keep version UNRELEASED always ─────────────────────────────
      // Per requirements: always leave as Unreleased on Jira so team can verify
      // Jira status must be manually changed to Released after review
      results.released = false;

      // ── Build summary message ───────────────────────────────────────────────
      const parts = [];
      if (results.related)          parts.push(`${rnLinks.length} RN link(s)`);
      if (results.tickets.length)   parts.push(`${results.tickets.length} ticket(s)`);
      if (results.approvers.length) parts.push(`${results.approvers.length} approver(s)`);
      parts.push("kept Unreleased");

      const errNote = results.errors.length ? ` (${results.errors.length} warning(s): ${results.errors.slice(0,2).join("; ")})` : "";
      setSync(r.id, {
        status: "ok",
        msg: `✓ ${vName}${parts.length ? " — " + parts.join(", ") : ""}${errNote}`,
        link: jiraLink, versionId,
      });

      // ── Sync link back to release record ───────────────────────────────────
      onSyncBack({ ...r, jiraLink, jiraLinks: [jiraLink, ...(r.jiraLinks||[]).filter(l=>l!==jiraLink)] });

    } catch (err) {
      const msg = err.message || String(err);
      console.error("SYNC ERROR:", msg);
      setSync(r.id, { status: "err", msg });
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

        <div style={{ width: 1, height: 18, background: B.border2, flexShrink: 0 }}/>

        {/* Tab switcher */}
        <div style={{ display: "flex", background: "#0d0d0d", borderRadius: 8, padding: "0.18rem", border: `1px solid ${B.border2}`, flexShrink: 0 }}>
          {[["sync","⬆ Sync"],["parser","🔍 Parse RN"]].map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ height: 22, padding: "0 0.75rem", borderRadius: 6, border: "none", cursor: "pointer",
                       fontFamily: FONT, fontSize: "0.7rem", fontWeight: 700,
                       background: activeTab === tab ? B.grad1 : "transparent",
                       color:      activeTab === tab ? "#fff"  : B.textMuted }}>
              {label}
            </button>
          ))}
        </div>

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

      {/* ── Sync tab ── */}
      {activeTab === "sync" && <>
      {/* ── Debug test panel ── */}
      {showCfg && (
        <div style={{ margin: "0.5rem 2rem 0", background: "#0a0a0a", border: "1px solid #333", borderRadius: 10, padding: "0.75rem 1rem", display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: "#4a7a96", fontSize: "0.7rem", fontWeight: 700 }}>TEST JIRA CONNECTION:</span>
          <button onClick={async () => {
            try {
              const res  = await jiraFetch(`rest/api/3/project/${cfg.key}`);
              const data = await res.json();
              alert(`Project fetch: HTTP ${res.status}\n${JSON.stringify(data, null, 2).slice(0,400)}`);
            } catch(e) { alert("Error: " + e.message); }
          }} style={{ height: 24, padding: "0 0.75rem", background: "#0d3320", border: "1px solid #22c55e44", color: "#22c55e", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: "0.7rem", fontWeight: 700 }}>
            1. Test Project Fetch
          </button>
          <button onClick={async () => {
            try {
              const res  = await jiraFetch(`rest/api/3/project/${cfg.key}`);
              const proj = await res.json();
              const projIdInt = parseInt(proj.id, 10);
              const minimal = { name: `TEST_${Date.now()}`, projectId: projIdInt };
              alert(`About to POST:\n${JSON.stringify(minimal, null, 2)}\n\nprojectId type: ${typeof projIdInt}`);
              const res2 = await jiraFetch(`rest/api/3/version`, { method: "POST", body: JSON.stringify(minimal) });
              const txt  = await res2.text();
              alert(`Version create: HTTP ${res2.status}\n${txt.slice(0,500)}`);
            } catch(e) { alert("Error: " + e.message); }
          }} style={{ height: 24, padding: "0 0.75rem", background: "#0f2d52", border: "1px solid #60a5fa44", color: "#60a5fa", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: "0.7rem", fontWeight: 700 }}>
            2. Test Minimal Version Create
          </button>
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
                          ? <div style={{ color: "#ef4444", fontSize: "0.65rem" }}>
                              <div style={{ fontWeight: 700 }}>✗ Failed</div>
                              <div style={{ color: "#fca5a5", fontSize: "0.6rem", maxWidth: 200, whiteSpace: "pre-wrap", wordBreak: "break-all", marginTop: 2 }}>{ss.msg}</div>
                            </div>
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
      </>}

      {/* ── RN Parser tab ── */}
      {activeTab === "parser" && (
      <div style={{ margin: "0.75rem 2rem 0", background: "#060f1a", border: `1px solid ${B.teal}44`, borderRadius: 12, padding: "1.1rem 1.25rem" }}>
        <div style={{ color: B.teal, fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
          🔍 RN Page Parser — Paste a Confluence RN URL to see what will be extracted
        </div>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <input value={rnParseUrl} onChange={e => setRnParseUrl(e.target.value)}
            placeholder="https://datman.atlassian.net/wiki/spaces/DN/pages/3468001291/..."
            style={{ flex: 1, height: 30, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontFamily: FONT, fontSize: "0.75rem", padding: "0 0.75rem", outline: "none" }}
          />
          <button onClick={() => parseRNPage(rnParseUrl)} disabled={rnParsing || !rnParseUrl}
            style={{ height: 30, padding: "0 1rem", background: B.grad1, border: "none", color: "#fff", borderRadius: 7, cursor: "pointer", fontFamily: FONT, fontSize: "0.72rem", fontWeight: 700, opacity: rnParsing ? 0.6 : 1 }}>
            {rnParsing ? "Parsing…" : "Parse RN"}
          </button>
        </div>
        {rnParseResult && !rnParseResult.success && (
          <div style={{ color: "#ef4444", fontSize: "0.75rem", padding: "0.5rem 0.75rem", background: "#2d0a0a", borderRadius: 8 }}>
            ✗ {rnParseResult.error}
          </div>
        )}
        {rnParseResult?.success && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {/* Title */}
            <div style={{ background: "#0d1f2d", borderRadius: 8, padding: "0.6rem 0.85rem" }}>
              <div style={{ color: B.textMuted, fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.2rem" }}>Page Title</div>
              <div style={{ color: B.textPrimary, fontSize: "0.82rem", fontWeight: 500 }}>{rnParseResult.title}</div>
            </div>
            {/* Jira Tickets */}
            <div style={{ background: "#0d1f2d", borderRadius: 8, padding: "0.6rem 0.85rem" }}>
              <div style={{ color: B.textMuted, fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>
                Jira Tickets Found ({rnParseResult.fields.jiraTickets?.length || 0})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                {(rnParseResult.fields.jiraTickets || []).length === 0
                  ? <span style={{ color: B.textMuted, fontSize: "0.75rem" }}>None found — no DN-XXXX tickets in this page</span>
                  : (rnParseResult.fields.jiraTickets || []).map(t => (
                      <span key={t} style={{ background: "#0f2d52", color: "#60a5fa", border: "1px solid #1e4a8066", padding: "0.15rem 0.55rem", borderRadius: 6, fontSize: "0.72rem", fontWeight: 700 }}>{t}</span>
                    ))}
              </div>
            </div>
            {/* Approved By */}
            <div style={{ background: "#0d1f2d", borderRadius: 8, padding: "0.6rem 0.85rem" }}>
              <div style={{ color: B.textMuted, fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>
                Approved By ({rnParseResult.fields.approvedBy?.length || 0})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                {(rnParseResult.fields.approvedBy || []).length === 0
                  ? <span style={{ color: B.textMuted, fontSize: "0.75rem" }}>None found — check page has an approval table/section</span>
                  : (rnParseResult.fields.approvedBy || []).map(n => (
                      <span key={n} style={{ background: "#22c55e18", color: "#22c55e", border: "1px solid #22c55e44", padding: "0.15rem 0.55rem", borderRadius: 6, fontSize: "0.72rem", fontWeight: 700 }}>{n}</span>
                    ))}
              </div>
            </div>
            {/* Table Data */}
            {Object.keys(rnParseResult.fields.tableData || {}).length > 0 && (
              <div style={{ background: "#0d1f2d", borderRadius: 8, padding: "0.6rem 0.85rem" }}>
                <div style={{ color: B.textMuted, fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
                  Table Data Extracted ({Object.keys(rnParseResult.fields.tableData).length} rows)
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" }}>
                  {Object.entries(rnParseResult.fields.tableData).slice(0, 20).map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ color: B.textMuted, padding: "0.2rem 0.75rem 0.2rem 0", whiteSpace: "nowrap", verticalAlign: "top", width: "35%", fontWeight: 600 }}>{k}</td>
                      <td style={{ color: B.textPrimary, padding: "0.2rem 0", wordBreak: "break-word" }}>{v.slice(0, 200)}</td>
                    </tr>
                  ))}
                </table>
              </div>
            )}
            {/* Headings */}
            {(rnParseResult.fields.headings || []).length > 0 && (
              <div style={{ background: "#0d1f2d", borderRadius: 8, padding: "0.6rem 0.85rem" }}>
                <div style={{ color: B.textMuted, fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>
                  Page Sections / Headings
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                  {(rnParseResult.fields.headings || []).map((h, i) => (
                    <span key={i} style={{ background: B.border, color: B.textSecondary, padding: "0.15rem 0.55rem", borderRadius: 6, fontSize: "0.7rem" }}>{h}</span>
                  ))}
                </div>
              </div>
            )}
            {/* Raw HTML preview */}
            <details style={{ background: "#0d1f2d", borderRadius: 8, padding: "0.6rem 0.85rem" }}>
              <summary style={{ color: B.textMuted, fontSize: "0.68rem", cursor: "pointer", fontWeight: 600 }}>Raw HTML preview (first 500 chars)</summary>
              <pre style={{ color: "#4a7a96", fontSize: "0.6rem", marginTop: "0.5rem", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{rnParseResult.html}</pre>
            </details>
          </div>
        )}
      </div>


      )}

    </div>
  );

}

