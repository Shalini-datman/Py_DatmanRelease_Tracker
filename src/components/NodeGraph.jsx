import React, { useState, useRef, useEffect, useMemo } from "react";
import { B, FONT, GATEWAY_MODULES, APP_MODULES, STATUS_COLORS, PRIORITY_COLORS, TYPE_COLOR, fmtDate } from "./shared.jsx";

export default function NodeGraphView({ releases, graphFilter = "" }) {
  const canvasRef    = useRef(null);
  const [tooltip,    setTooltip]    = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const nodesRef     = useRef([]);
  const animRef      = useRef(null);
  const dragging     = useRef(null);
  const [, fu]       = useState(0);
  const hideTimer    = useRef(null);
  const overCard     = useRef(false);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [teamF,   setTeamF]   = useState("All");
  const [statusF, setStatusF] = useState("All");

  const CTRL = {
    height: 26, background: "#0d0d0d", border: `1px solid ${B.border2}`,
    borderRadius: 6, color: B.textSecondary, fontFamily: FONT,
    fontSize: "0.72rem", fontWeight: 700, padding: "0 0.6rem",
    outline: "none", cursor: "pointer", flexShrink: 0,
  };

  // Apply filters
  const filtered = useMemo(() => releases.filter(r => {
    const mods = r.modules || [];
    if (teamF === "Gateway")  return mods.some(m => GATEWAY_MODULES.includes(m));
    if (teamF === "App Team") return mods.some(m => APP_MODULES.includes(m));
    return true;
  }).filter(r => {
    if (statusF === "All")        return true;
    if (statusF === "Released")   return r.status === "Released";
    if (statusF === "Rolledback") return r.status === "Cancelled";
    if (statusF === "Pending")    return r.status !== "Released" && r.status !== "Cancelled";
    return true;
  }), [releases, teamF, statusF]);

  // Full RN label — show complete RN-GAT-067 / RN-APP-055, fallback to summary
  const nodeLabel = r => (r.rn && r.rn.trim()) ? r.rn.trim() : (r.summary || "").slice(0, 12);

  const showTooltip = (release, pos) => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    setTooltip(release); setTooltipPos(pos);
  };
  const scheduleHide = () => {
    if (overCard.current) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (!overCard.current) setTooltip(null); }, 450);
  };

  // ── Build nodes ───────────────────────────────────────────────────────────
  useEffect(() => {
    const el  = canvasRef.current?.parentElement;
    const W   = el?.clientWidth  || 900;
    const H   = (el?.clientHeight || 640) - 44;
    const cx  = W / 2, cy = H / 2;
    const q   = (graphFilter || "").toLowerCase().trim();
    const vis = q
      ? filtered.filter(r => (r.rn || "").toLowerCase().includes(q) || (r.summary || "").toLowerCase().includes(q))
      : filtered;
    const ms  = [...new Set(vis.flatMap(r => r.modules || []))];
    const nodes = [];
    nodes.push({ id: "hub", label: "Releases", type: "hub", x: cx, y: cy, vx: 0, vy: 0, r: 30 });
    ms.forEach((m, i) => {
      const a = (i / ms.length) * Math.PI * 2;
      nodes.push({ id: `mod_${m}`, label: m, type: "module", x: cx + Math.cos(a) * 185, y: cy + Math.sin(a) * 185, vx: 0, vy: 0, r: 20 });
    });
    vis.forEach((r, i) => {
      const a = (i / vis.length) * Math.PI * 2 + 0.4;
      const d = 300 + (i % 4) * 35;
      nodes.push({
        id: `rel_${r.id}`, label: nodeLabel(r), type: "release", release: r,
        x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, vx: 0, vy: 0,
        r: 14 + (r.priority === "P0" ? 7 : r.priority === "P1" ? 4 : 0),
      });
    });
    nodesRef.current = nodes; fu(n => n + 1);
  }, [filtered, graphFilter]);

  const getEdges = () => {
    const q   = (graphFilter || "").toLowerCase().trim();
    const vis = q ? filtered.filter(r => (r.rn || "").toLowerCase().includes(q) || (r.summary || "").toLowerCase().includes(q)) : filtered;
    const e = [], s = new Set();
    vis.forEach(r => {
      (r.modules || []).forEach(m => {
        const src = nodesRef.current.find(n => n.id === `rel_${r.id}`);
        const dst = nodesRef.current.find(n => n.id === `mod_${m}`);
        if (src && dst) { const k = [src.id, dst.id].sort().join("|"); if (!s.has(k)) { e.push({ src, dst, type: "rel-mod" }); s.add(k); } }
      });
    });
    const hub = nodesRef.current.find(n => n.id === "hub");
    nodesRef.current.filter(n => n.type === "module").forEach(m => {
      const k = ["hub", m.id].sort().join("|");
      if (!s.has(k)) { e.push({ src: hub, dst: m, type: "mod-hub" }); s.add(k); }
    });
    return e;
  };

  // ── Physics ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const nodes = nodesRef.current;
      if (!nodes.length) { animRef.current = requestAnimationFrame(tick); return; }
      const edges = getEdges();
      const W = canvasRef.current?.width || 900, H = canvasRef.current?.height || 600;
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const min = (a.r + b.r) * 3.5;
          if (dist < min) { const f = (min - dist) / dist * 0.08; a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f; }
        }
      edges.forEach(({ src, dst, type }) => {
        const dx = dst.x - src.x, dy = dst.y - src.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (dist - (type === "mod-hub" ? 185 : 155)) / dist * 0.03;
        if (src.id !== "hub") { src.vx += dx * f; src.vy += dy * f; }
        if (dst.id !== "hub") { dst.vx -= dx * f; dst.vy -= dy * f; }
      });
      nodes.forEach(n => { if (n.id === "hub") return; n.vx += (W / 2 - n.x) * 0.002; n.vy += (H / 2 - n.y) * 0.002; });
      nodes.forEach(n => {
        if (dragging.current === n.id) return;
        n.vx *= 0.85; n.vy *= 0.85; n.x += n.vx; n.y += n.vy;
        n.x = Math.max(n.r + 10, Math.min(W - n.r - 10, n.x));
        n.y = Math.max(n.r + 10, Math.min(H - n.r - 10, n.y));
      });
      draw(); animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [filtered]);

  // ── Draw ──────────────────────────────────────────────────────────────────
  const draw = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const term = graphFilter.trim().toLowerCase();

    // Edges
    getEdges().forEach(({ src, dst, type }) => {
      let alpha = 1;
      if (term && type === "rel-mod") {
        const rel = src.type === "release" ? src.release : dst.type === "release" ? dst.release : null;
        const matched = rel && ((rel.rn || "").toLowerCase().includes(term) || (rel.summary || "").toLowerCase().includes(term));
        alpha = matched ? 1 : 0.05;
      }
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.moveTo(src.x, src.y); ctx.lineTo(dst.x, dst.y);
      ctx.strokeStyle = type === "mod-hub" ? "rgba(14,165,200,0.35)" : "rgba(34,211,238,0.2)";
      ctx.lineWidth = type === "mod-hub" ? 1.5 : 1; ctx.setLineDash(type === "rel-mod" ? [4, 4] : []);
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    });

    // Nodes
    nodesRef.current.forEach(n => {
      ctx.save();
      if (n.type === "hub") {
        [[38, B.teal + "66", 6], [28, B.cyan + "55", 5], [18, B.lime + "66", 4]].forEach(([r, col, lw]) => {
          ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
        });
        ctx.beginPath(); ctx.arc(n.x, n.y, 8, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 8);
        g.addColorStop(0, B.cyan); g.addColorStop(1, B.blue);
        ctx.fillStyle = g; ctx.fill();
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 8px 'Inter',sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("HUB", n.x, n.y + 44);

      } else if (n.type === "module") {
        const isGW  = GATEWAY_MODULES.includes(n.label);
        const isApp = APP_MODULES.includes(n.label);
        const rc    = isGW ? B.teal : isApp ? B.lime : B.cyan;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 5, 0, Math.PI * 2); ctx.strokeStyle = rc + "33"; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
        g.addColorStop(0, B.deepBlue); g.addColorStop(1, "#0d0d0d");
        ctx.fillStyle = g; ctx.strokeStyle = rc; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
        ctx.fillStyle = rc; ctx.font = "bold 8px 'Inter',sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(n.label.slice(0, 4), n.x, n.y);
        ctx.fillStyle = "#aaaaaa"; ctx.font = "bold 9px 'Inter',sans-serif";
        ctx.fillText(n.label, n.x, n.y + n.r + 13);

      } else {
        // Release node
        const matched = !term || (n.release.rn || "").toLowerCase().includes(term) || (n.release.summary || "").toLowerCase().includes(term);
        ctx.globalAlpha = matched ? 1 : 0.08;
        const c = TYPE_COLOR(n.release.type);
        ctx.shadowColor = matched ? c : "transparent"; ctx.shadowBlur = matched ? 12 : 0;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
        g.addColorStop(0, c + "55"); g.addColorStop(1, c + "11");
        ctx.fillStyle = g; ctx.strokeStyle = matched ? c : c + "44"; ctx.lineWidth = matched ? 2 : 1;
        ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;

        // Full RN label inside node — small enough to fit
        ctx.fillStyle = matched ? "#ffffff" : "rgba(255,255,255,0.3)";
        const lbl = n.label;
        // Split RN-GAT-067 into two lines for readability inside node
        const parts = lbl.match(/^(RN-[A-Z]+-)(\\d+)$/) || lbl.match(/^(RN-[A-Z]{2,3}-)(.+)$/);
        if (parts) {
          ctx.font = "bold 5.5px 'Inter',sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(parts[1].replace(/-$/, ""), n.x, n.y - 4);
          ctx.font = "bold 6.5px 'Inter',sans-serif";
          ctx.fillText(parts[2], n.x, n.y + 5);
        } else {
          ctx.font = "bold 6px 'Inter',sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(lbl.slice(0, 10), n.x, n.y);
        }

        // Priority dot
        if (matched) {
          const pc = PRIORITY_COLORS[n.release.priority] || B.textMuted;
          ctx.beginPath(); ctx.arc(n.x + n.r - 4, n.y - n.r + 4, 4, 0, Math.PI * 2);
          ctx.fillStyle = pc; ctx.shadowColor = pc; ctx.shadowBlur = 6; ctx.fill(); ctx.shadowBlur = 0;
        }

        // Status ring
        const sc = STATUS_COLORS[n.release.status] || B.textMuted;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = sc + "66"; ctx.lineWidth = 1.5; ctx.stroke();

        ctx.globalAlpha = 1;
      }
      ctx.restore();
    });
  };

  const getNodeAt = (x, y) => nodesRef.current.find(n => {
    const dx = n.x - x, dy = n.y - y; return Math.sqrt(dx * dx + dy * dy) < n.r + 6;
  });

  const handleMouseMove = e => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (dragging.current) {
      const nd = nodesRef.current.find(n => n.id === dragging.current);
      if (nd) { nd.x = x; nd.y = y; nd.vx = 0; nd.vy = 0; } return;
    }
    const node = getNodeAt(x, y);
    if (node?.type === "release") showTooltip(node.release, { x: e.clientX, y: e.clientY });
    else scheduleHide();
  };

  const gwCount  = filtered.filter(r => (r.modules || []).some(m => GATEWAY_MODULES.includes(m))).length;
  const appCount = filtered.filter(r => (r.modules || []).some(m => APP_MODULES.includes(m))).length;
  const term     = graphFilter.trim().toLowerCase();
  const matchCount = term ? filtered.filter(r => (r.rn || "").toLowerCase().includes(term) || (r.summary || "").toLowerCase().includes(term)).length : null;

  return (
    <div style={{ position: "relative", width: "100%", height: "calc(100vh - 90px)", display: "flex", flexDirection: "column" }}>

      {/* ── Filter bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.4rem 1.2rem",
                    background: "rgba(0,0,0,0.6)", borderBottom: `1px solid ${B.border}`, flexShrink: 0 }}>

        <select value={teamF} onChange={e => setTeamF(e.target.value)} style={CTRL}>
          <option value="All">All Teams</option>
          <option value="Gateway">Gateway</option>
          <option value="App Team">App Team</option>
        </select>

        <div style={{ width: 1, height: 16, background: B.border2 }}/>

        <select value={statusF} onChange={e => setStatusF(e.target.value)} style={CTRL}>
          <option value="All">All Status</option>
          <option value="Released">Released</option>
          <option value="Rolledback">Rolledback</option>
          <option value="Pending">Pending</option>
          <option value="In Progress">In Progress</option>
          <option value="Planning">Planning</option>
          <option value="Delayed">Delayed</option>
        </select>

        <div style={{ width: 1, height: 16, background: B.border2 }}/>

        {/* Team counters */}
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <span style={{ color: B.teal, fontSize: "0.72rem", fontWeight: 700 }}>
            Gateway: {gwCount}
          </span>
          <span style={{ color: B.lime, fontSize: "0.72rem", fontWeight: 700 }}>
            App Team: {appCount}
          </span>
          <span style={{ color: B.textMuted, fontSize: "0.72rem" }}>
            Total: {filtered.length}
          </span>
        </div>

        {matchCount !== null && (
          <span style={{ color: matchCount > 0 ? B.teal : "#ef4444", fontSize: "0.72rem", fontWeight: 700, marginLeft: "auto" }}>
            {matchCount > 0 ? `${matchCount} match${matchCount > 1 ? "es" : ""}` : "No matches"}
          </span>
        )}

        {/* Legend */}
        <div style={{ marginLeft: matchCount !== null ? "0.75rem" : "auto", display: "flex", gap: "0.85rem", alignItems: "center" }}>
          {[["Feature/Imp", "#22c55e"], ["Patch", "#a855f7"], ["Bug", "#ef4444"]].map(([l, c]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }}/>
              <span style={{ color: B.textMuted, fontSize: "0.68rem" }}>{l}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: B.teal }}/>
            <span style={{ color: B.textMuted, fontSize: "0.68rem" }}>Gateway</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: B.lime }}/>
            <span style={{ color: B.textMuted, fontSize: "0.68rem" }}>App Team</span>
          </div>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div style={{ flex: 1, position: "relative" }}>
        <canvas ref={canvasRef}
          width={typeof window !== "undefined" ? window.innerWidth - 40 : 900}
          height={typeof window !== "undefined" ? window.innerHeight - 134 : 560}
          onMouseMove={handleMouseMove}
          onMouseDown={e => {
            const r = canvasRef.current.getBoundingClientRect();
            const n = getNodeAt(e.clientX - r.left, e.clientY - r.top);
            if (n) dragging.current = n.id; else setTooltip(null);
          }}
          onMouseUp={() => { dragging.current = null; }}
          onMouseLeave={() => { dragging.current = null; scheduleHide(); }}
          style={{ display: "block", cursor: "crosshair", touchAction: "none" }}
        />

        {/* Hover tooltip card */}
        {tooltip && (() => {
          const pc  = PRIORITY_COLORS[tooltip.priority] || B.textMuted;
          const sc  = STATUS_COLORS[tooltip.status] || B.textMuted;
          const isGW = (tooltip.modules || []).some(m => GATEWAY_MODULES.includes(m));
          const mc  = isGW ? B.teal : B.lime;
          const teamLabel = isGW ? "Gateway" : "App Team";
          const cardW = 300;
          const left = tooltipPos.x + 14 + cardW > window.innerWidth ? tooltipPos.x - cardW - 10 : tooltipPos.x + 14;
          const top  = Math.min(Math.max(tooltipPos.y - 14, 8), window.innerHeight - 420);
          const jiraLink = (tooltip.jiraLink && tooltip.jiraLink.trim()) || (tooltip.jiraLinks || [])[0] || "";
          const rnLink   = (tooltip.rnLink && tooltip.rnLink.trim()) || (tooltip.rnLinks || [])[0] || "";
          return (
            <div style={{ position: "fixed", left, top, zIndex: 50, width: cardW,
                          background: "#0a1624", border: `1px solid ${B.teal}55`,
                          borderRadius: 14, padding: "1rem 1.1rem",
                          boxShadow: `0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px ${B.teal}22`,
                          fontFamily: FONT, pointerEvents: "auto" }}
              onMouseEnter={() => { overCard.current = true; if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } }}
              onMouseLeave={() => { overCard.current = false; scheduleHide(); }}>

              {/* RN + team */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.6rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {rnLink
                    ? <a href={rnLink} target="_blank" rel="noreferrer"
                        style={{ color: B.teal, fontWeight: 800, fontSize: "0.95rem", textDecoration: "none" }}
                        onClick={e => e.stopPropagation()}>
                        {tooltip.rn || "No RN"} ↗
                      </a>
                    : <span style={{ color: B.teal, fontWeight: 800, fontSize: "0.95rem" }}>{tooltip.rn || "No RN"}</span>
                  }
                </div>
                <span style={{ background: mc + "22", color: mc, border: `1px solid ${mc}44`,
                                padding: "0.15rem 0.55rem", borderRadius: 99, fontSize: "0.65rem", fontWeight: 700 }}>
                  {teamLabel}
                </span>
              </div>

              {/* Summary */}
              <div style={{ color: "#e0f2fe", fontSize: "0.8rem", fontWeight: 500,
                             lineHeight: 1.4, marginBottom: "0.75rem" }}>{tooltip.summary}</div>

              {/* Status + Priority */}
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.65rem", flexWrap: "wrap" }}>
                <span style={{ background: sc + "22", color: sc, border: `1px solid ${sc}44`,
                                padding: "0.18rem 0.55rem", borderRadius: 99, fontSize: "0.68rem", fontWeight: 700 }}>
                  {tooltip.status}
                </span>
                <span style={{ background: pc + "22", color: pc, border: `1px solid ${pc}44`,
                                padding: "0.18rem 0.55rem", borderRadius: 99, fontSize: "0.68rem", fontWeight: 700 }}>
                  {tooltip.priority}
                </span>
                <span style={{ background: B.border, color: B.textSecondary,
                                padding: "0.18rem 0.55rem", borderRadius: 99, fontSize: "0.68rem" }}>
                  {tooltip.type}
                </span>
              </div>

              {/* Modules */}
              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "0.65rem" }}>
                {(tooltip.modules || []).map(m => (
                  <span key={m} style={{ background: GATEWAY_MODULES.includes(m) ? B.teal + "22" : B.lime + "22",
                                          color: GATEWAY_MODULES.includes(m) ? B.teal : B.lime,
                                          border: `1px solid ${GATEWAY_MODULES.includes(m) ? B.teal : B.lime}44`,
                                          padding: "0.15rem 0.5rem", borderRadius: 99, fontSize: "0.65rem", fontWeight: 600 }}>{m}</span>
                ))}
              </div>

              {/* Dates */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", marginBottom: "0.65rem" }}>
                {[["Planned", tooltip.releasePlanned], ["Released", tooltip.releaseActual]].map(([l, d]) => (
                  <div key={l} style={{ background: "#0d0d0d", borderRadius: 8, padding: "0.4rem 0.6rem" }}>
                    <div style={{ color: B.textMuted, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: ".08em" }}>{l}</div>
                    <div style={{ color: d ? B.textPrimary : B.textMuted, fontWeight: 600, fontSize: "0.75rem", marginTop: 2 }}>
                      {d ? fmtDate(d) : "—"}
                    </div>
                  </div>
                ))}
              </div>

              {/* Jira link */}
              {jiraLink && (
                <a href={jiraLink} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem",
                            background: "#0f2d52", color: "#60a5fa", border: "1px solid #1e4a8066",
                            borderRadius: 8, padding: "0.3rem 0.7rem", fontSize: "0.7rem",
                            fontWeight: 700, textDecoration: "none" }}>
                  ⎇ Jira ↗
                </a>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
