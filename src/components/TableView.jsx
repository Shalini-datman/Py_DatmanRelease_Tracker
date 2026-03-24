import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { B,FONT,FONT_DISPLAY,PRIORITIES,MODULES,RELEASE_TYPES,STATUSES,GATEWAY_MODULES,APP_MODULES,APPROVER_NAMES,STATUS_COLORS,PRIORITY_COLORS,TYPE_COLORS,TYPE_COLOR,inputStyle,primaryBtn,tdSt,parseDDMMYYYY,daysBetween,leadTimeDays,fmtDate,Chip,StatusBadge,Field,SectionLabel,LogoMark,CalendarPicker } from "./shared.jsx";
import DoraPopup from "./DoraPopup.jsx";
import CSVImportModal from "./CsvImport.jsx";
import EditModal from "./EditModal.jsx";
export function PaginationBar({ current, total, onChange, count, label="entries" }) {
  if (total <= 1) return null;
  const btnSt = (disabled, active) => ({
    height: 28, minWidth: 28, padding: "0 0.55rem",
    background: active ? B.grad1 : "#0d0d0d",
    border: `1px solid ${active ? "transparent" : B.border2}`,
    borderRadius: 7, color: active ? "#fff" : disabled ? B.border2 : B.textSecondary,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: "0.72rem", fontFamily: FONT, fontWeight: 700,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
  });
  const pages = Array.from({ length: total }, (_, i) => i + 1)
    .filter(p => p === 1 || p === total || Math.abs(p - current) <= 1)
    .reduce((acc, p, idx, arr) => {
      if (idx > 0 && p - arr[idx - 1] > 1) acc.push("…");
      acc.push(p); return acc;
    }, []);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
      <span style={{ color: B.textMuted, fontSize: "0.7rem" }}>
        {(current-1)*20+1}–{Math.min(current*20, count)} of {count} {label}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
        <button onClick={() => onChange(1)} disabled={current===1} style={btnSt(current===1, false)}>«</button>
        <button onClick={() => onChange(current-1)} disabled={current===1} style={btnSt(current===1, false)}>‹</button>
        {pages.map((p, i) =>
          p === "…"
            ? <span key={`e${i}`} style={{ color: B.textMuted, fontSize: "0.72rem", padding: "0 0.25rem" }}>…</span>
            : <button key={p} onClick={() => onChange(p)} style={btnSt(false, p===current)}>{p}</button>
        )}
        <button onClick={() => onChange(current+1)} disabled={current===total} style={btnSt(current===total, false)}>›</button>
        <button onClick={() => onChange(total)} disabled={current===total} style={btnSt(current===total, false)}>»</button>
      </div>
    </div>
  );
}

// ─── TABLE VIEW ───────────────────────────────────────────────────────────────
export default function TableView({releases,onAdd,onImport,onEdit,teamFilter,tableView,setTableView,customFrom,setCustomFrom,customTo,setCustomTo,filterProp="",triggerCsv=0,statusFilter="All"}){
  const [sort,setSort]=useState({key:"releaseActual",dir:-1});
  const filter = filterProp; // controlled from sub-bar
  const [doraPopup,setDoraPopup]=useState(null);
  const [csvModal,setCsvModal]=useState(false);
  useEffect(()=>{ if(triggerCsv>0) setCsvModal(true); },[triggerCsv]);
  const [editRelease,setEditRelease]=useState(null);
  // tableView/customFrom/customTo lifted to App — received as props

  // Date window helpers
  const now=new Date();
  const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const getWindow=()=>{
    if(tableView==="week"){
      const mon=new Date(now);
      mon.setDate(now.getDate()-(now.getDay()===0?6:now.getDay()-1));
      mon.setHours(0,0,0,0);
      const sun=new Date(mon);sun.setDate(mon.getDate()+6);sun.setHours(23,59,59);
      return{from:mon,to:sun,label:`Week of ${mon.toLocaleDateString("en-GB",{day:"numeric",month:"short"})}`};
    }
    if(tableView==="month"){
      const from=new Date(now.getFullYear(),now.getMonth(),1);
      const to=new Date(now);to.setHours(23,59,59);
      return{from,to,label:`${now.toLocaleDateString("en-GB",{month:"long",year:"numeric"})}`};
    }
    if(tableView==="custom"&&customFrom&&customTo){
      const from=new Date(customFrom);from.setHours(0,0,0,0);
      const to=new Date(customTo);to.setHours(23,59,59,999);
      const fmt2=d=>d.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
      return{from,to,label:`${fmt2(from)} – ${fmt2(to)}`};
    }
    if(tableView==="custom"&&customFrom&&!customTo){
      const from=new Date(customFrom);from.setHours(0,0,0,0);
      const to=new Date(now);to.setHours(23,59,59,999);
      const fmt2=d=>d.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
      return{from,to,label:`${fmt2(from)} – today`};
    }
    return null; // all / custom with no dates yet
  };
  const win=getWindow();

  const teamFiltered=releases.filter(r=>{
    if(!teamFilter||teamFilter==="All") return true;
    if(teamFilter==="Gateway") return r.modules?.some(m=>GATEWAY_MODULES.includes(m));
    if(teamFilter==="App Team") return r.modules?.some(m=>APP_MODULES.includes(m));
    return true;
  });

  const windowFiltered=win?teamFiltered.filter(r=>{
    const d=new Date(r.releaseActual||r.releasePlanned);
    return !isNaN(d)&&d>=win.from&&d<=win.to;
  }):teamFiltered;

  const DATE_KEYS=new Set(["releaseActual","releasePlanned","dora.handoverDate"]);
  const getVal=(r,k)=>{
    if(k==="releaseActual"||k==="releasePlanned"){
      const raw=r[k]||"";
      // normalise DD/MM/YYYY → YYYY-MM-DD for correct lexicographic sort
      if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)){
        const [d,m,y]=raw.split("/");
        return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
      }
      return raw; // already YYYY-MM-DD or empty
    }
    return r[k]||"";
  };
  const STATUS_ORDER={"Released":0,"In Progress":1,"Delayed":2,"Planning":3,"Cancelled":4};
  const searchFiltered=[...windowFiltered]
    .filter(r=>(r.summary||"").toLowerCase().includes(filter.toLowerCase())||(r.rn||"").toLowerCase().includes(filter.toLowerCase()));

  // Status filter
  const statusFiltered = statusFilter==="All" ? searchFiltered
    : statusFilter==="Released"   ? searchFiltered.filter(r=>r.status==="Released")
    : statusFilter==="Rolledback" ? searchFiltered.filter(r=>r.status==="Cancelled")
    : searchFiltered.filter(r=>r.status!=="Released"&&r.status!=="Cancelled"); // Pending — excludes Rolledback/Cancelled

  // Split into Released/active and Planning/pending
  const releasedRows=statusFiltered
    .filter(r=>r.status==="Released"||r.status==="Cancelled")
    .sort((a,b)=>{
      // Primary: date descending
      const da=getVal(a,"releaseActual")||getVal(a,"releasePlanned");
      const db=getVal(b,"releaseActual")||getVal(b,"releasePlanned");
      if(da!==db) return da>db?-1:1;
      // Secondary: RN number
      const ra=parseInt((a.rn||"").replace(/\D/g,""))||0;
      const rb=parseInt((b.rn||"").replace(/\D/g,""))||0;
      return rb-ra;
    });
  const pendingRows=statusFiltered
    .filter(r=>r.status!=="Released"&&r.status!=="Cancelled")
    .sort((a,b)=>{
      const sa=STATUS_ORDER[a.status]??3, sb=STATUS_ORDER[b.status]??3;
      if(sa!==sb) return sa-sb;
      const da=getVal(a,"releasePlanned")||getVal(a,"releaseActual");
      const db=getVal(b,"releasePlanned")||getVal(b,"releaseActual");
      // Ascending by planned date (soonest first)
      if(da!==db) return da<db?-1:1;
      return 0;
    });
  // For column-click sort, apply on top of the above groups
  const applyColSort=(rows)=>{
    if(!sort.key) return rows;
    return [...rows].sort((a,b)=>{
      const va=getVal(a,sort.key), vb=getVal(b,sort.key);
      if(!va&&!vb) return 0; if(!va) return 1; if(!vb) return -1;
      return va<vb?-sort.dir:va>vb?sort.dir:0;
    });
  };
  const sorted=[...applyColSort(releasedRows),...applyColSort(pendingRows)];
  const releasedCount=releasedRows.length;
  const pendingCount=pendingRows.length;

  // Pagination — 20 per page
  const PAGE_SIZE=20;
  const [currentPage,setCurrentPage]=useState(1);
  // Reset to page 1 when filter/sort/window changes
  useEffect(()=>setCurrentPage(1),[filter,tableView,customFrom,customTo,statusFilter]);
  const totalPages=Math.max(1,Math.ceil(sorted.length/PAGE_SIZE));
  const paginated=sorted.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
  // Section break index adjusted for current page slice
  const pageStart=(currentPage-1)*PAGE_SIZE;

  const Th=({k,l})=><th onClick={()=>setSort(s=>({key:k,dir:s.key===k?-s.dir:1}))} style={{padding:"0.55rem 0.75rem",color:B.textMuted,fontSize:"0.62rem",fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase",textAlign:"left",cursor:"pointer",whiteSpace:"nowrap",borderBottom:`1px solid ${B.border2}`,userSelect:"none",background:"#050505",fontFamily:FONT}}>{l}{sort.key===k?(sort.dir===1?" ↑":" ↓"):""}</th>;

  return(
    <div style={{padding:"1rem 2rem",position:"relative"}} onClick={()=>doraPopup&&setDoraPopup(null)}>
      {csvModal && <CSVImportModal onImport={onImport} onClose={()=>setCsvModal(false)} existingReleases={releases}/>}
      {editRelease && <EditModal release={editRelease} onClose={()=>setEditRelease(null)} onSave={updated=>{onEdit(updated);setEditRelease(null);}}/>}

      <div style={{overflowX:"auto",borderRadius:12,border:`1px solid ${B.border}`}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontFamily:FONT}}>
          <thead><tr>
            <Th k="rn" l="RN"/>
            <Th k="summary" l="Summary"/>
            <Th k="type" l="Type"/>
            <Th k="priority" l="Priority"/>
            <Th k="status" l="Status"/>
            <Th k="releasePlanned" l="Planned Date"/>
            <Th k="releaseActual" l="Released Date"/>
            <th style={{padding:"0.55rem 0.75rem",color:"#f97316",fontSize:"0.62rem",fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase",textAlign:"left",borderBottom:`1px solid ${B.border2}`,background:"#050505",whiteSpace:"nowrap"}}>Delay</th>
            <Th k="approvers" l="Approvers"/>
            <th style={{padding:"0.55rem 0.75rem",color:"#60a5fa",fontSize:"0.62rem",fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase",textAlign:"left",borderBottom:`1px solid ${B.border2}`,background:"#050505",whiteSpace:"nowrap"}}>Jira Link</th>
            <th style={{padding:"0.55rem 0.75rem",color:B.cyan,fontSize:"0.62rem",fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase",textAlign:"left",borderBottom:`1px solid ${B.border2}`,background:"#050505"}}>DORA</th>
            <th style={{padding:"0.55rem 0.75rem",color:B.textMuted,fontSize:"0.62rem",fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase",textAlign:"left",borderBottom:`1px solid ${B.border2}`,background:"#050505"}}>Edit</th>
          </tr></thead>
          <tbody>

            {paginated.map((r,i)=>{ try{
              const delay=r.releaseActual&&r.releasePlanned?daysBetween(r.releasePlanned,r.releaseActual):null;
              const delayColor=delay===null?B.textMuted:delay===0?B.lime:delay>0?"#ef4444":B.cyan;
              const delayLabel=delay===null?"—":delay===0?"On Time":delay>0?`+${delay}d`:`${delay}d early`;
              const isSectionBreak=(i+pageStart)===releasedCount&&pendingCount>0;
              return(<>
              {isSectionBreak&&(
                <tr key="divider">
                  <td colSpan={12} style={{padding:"0.6rem 1rem",background:"#0a1824",borderTop:`2px solid ${B.border2}`,borderBottom:`1px solid ${B.border2}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:"0.75rem"}}>
                      <span style={{color:B.textMuted,fontSize:"0.66rem",fontWeight:800,letterSpacing:"0.12em",textTransform:"uppercase"}}>⏳ Pending / Planning</span>
                      <span style={{background:B.teal+"22",color:B.teal,borderRadius:99,padding:"0.1rem 0.55rem",fontSize:"0.65rem",fontWeight:700}}>{pendingCount}</span>
                    </div>
                  </td>
                </tr>
              )}
                <tr key={r.id} style={{background:i%2===0?B.bgDark:B.bgCard,transition:"background 0.12s"}} onMouseEnter={e=>e.currentTarget.style.background=B.bgRow} onMouseLeave={e=>e.currentTarget.style.background=i%2===0?B.bgDark:B.bgCard}>
                  <td style={{...tdSt,whiteSpace:"nowrap",verticalAlign:"top"}}>
                    {(()=>{
                      const links=[...(r.rnLinks||[]),...(r.rnLink&&!r.rnLinks?.includes(r.rnLink)?[r.rnLink]:[])].filter(Boolean).slice(0,5);
                      return links.length
                        ?<div style={{display:"flex",flexDirection:"column",gap:"0.2rem"}}>
                          {links.map((lk,li)=>(
                            <a key={li} href={lk} target="_blank" rel="noreferrer"
                              style={{color:B.teal,fontWeight:700,fontSize:"0.78rem",textDecoration:"none",display:"inline-flex",alignItems:"center",gap:"0.25rem"}}
                              onClick={e=>e.stopPropagation()}>
                              {li===0?r.rn:`↳ RN ${li+1}`}<span style={{fontSize:"0.58rem",opacity:0.65}}>↗</span>
                            </a>
                          ))}
                        </div>
                        :<span style={{color:B.teal,fontWeight:700,fontSize:"0.8rem"}}>{r.rn}</span>;
                    })()}
                  </td>
                  <td style={{...tdSt,color:B.textPrimary,fontWeight:500,fontSize:"0.73rem",maxWidth:240,minWidth:160}}>
                    <span style={{display:"block",whiteSpace:"normal",wordBreak:"break-word",lineHeight:1.4}}>{r.summary}</span>
                  </td>
                  <td style={tdSt} onClick={e=>e.stopPropagation()}>
                    <select
                      value={r.type||""}
                      onChange={e=>{onEdit&&onEdit({...r,type:e.target.value});}}
                      style={{background:"#0d0d0d",border:`1px solid ${B.border2}`,color:TYPE_COLOR(r.type||"New Feature"),borderRadius:7,padding:"0.22rem 0.5rem",fontSize:"0.72rem",fontWeight:700,fontFamily:FONT,cursor:"pointer",outline:"none",appearance:"none",WebkitAppearance:"none",minWidth:100}}
                    >
                      <option value="">— type —</option>
                      {RELEASE_TYPES.map(t=><option key={t} value={t} style={{color:TYPE_COLOR(t),background:"#000000"}}>{t}</option>)}
                    </select>
                  </td>
                  <td style={tdSt} onClick={e=>e.stopPropagation()}>
                    {(()=>{
                      const col=PRIORITY_COLORS[r.priority]||B.textMuted;
                      return(
                        <select value={r.priority||""} onChange={e=>{onEdit&&onEdit({...r,priority:e.target.value});}}
                          style={{background:col+"22",border:`1px solid ${col}55`,color:col,borderRadius:7,padding:"0.18rem 0.3rem",fontSize:"0.69rem",fontWeight:700,fontFamily:FONT,cursor:"pointer",outline:"none",appearance:"none",WebkitAppearance:"none",width:44,textAlign:"center"}}>
                          {PRIORITIES.map(p=><option key={p} value={p} style={{background:"#0d0d0d",color:PRIORITY_COLORS[p]||B.textMuted}}>{p}</option>)}
                        </select>
                      );
                    })()}
                  </td>
                  <td style={tdSt} onClick={e=>e.stopPropagation()}>
                    {(()=>{
                      const STATUS_OPTS=[["Released",B.lime],["Planning",B.teal],["In Progress",B.cyan],["Delayed","#ef4444"],["Rolledback","#f97316"],["Cancelled","#9ca3af"]];
                      const col=STATUS_COLORS[r.status]||B.textMuted;
                      return(
                        <select value={(r.status==="Cancelled"?"Rolledback":(r.status||"Planning"))} onChange={e=>{
                          const newStatus=e.target.value;
                          // Map Rolledback display value to internal Cancelled
                          const internalStatus=newStatus==="Rolledback"?"Cancelled":newStatus;
                          let updated={...r,status:internalStatus};
                          // Auto-assign RN when status changes to Released and no RN yet
                          if(newStatus==="Released"&&(!r.rn||r.rn==="")&&releases){
                            const isGateway=r.modules?.some(m=>GATEWAY_MODULES.includes(m));
                            const prefix=isGateway?"RN-GAT-":"RN-APP-";
                            const existing=releases
                              .map(x=>x.rn||"")
                              .filter(rn=>rn.startsWith(prefix))
                              .map(rn=>parseInt(rn.replace(prefix,""))||0);
                            const max=existing.length?existing.reduce((a,b)=>a>b?a:b,0):0;
                            updated.rn=prefix+String(max+1).padStart(3,"0");
                          }
                          try{ onEdit&&onEdit(updated); }catch(err){ console.error("Edit failed",err); }
                        }}
                          style={{background:col+"18",border:`1px solid ${col}44`,color:col,borderRadius:7,padding:"0.22rem 0.5rem",fontSize:"0.72rem",fontWeight:700,fontFamily:FONT,cursor:"pointer",outline:"none",appearance:"none",WebkitAppearance:"none",minWidth:96}}>
                          {STATUS_OPTS.map(([s])=><option key={s} value={s} style={{background:"#0d0d0d",color:STATUS_COLORS[s]||B.textMuted}}>{s}</option>)}
                        </select>
                      );
                    })()}
                  </td>
                  <td style={{...tdSt,color:B.textSecondary,fontSize:"0.73rem",whiteSpace:"nowrap"}}>{fmtDate(r.releasePlanned)}</td>
                  <td style={{...tdSt,color:r.releaseActual?B.lime:B.textMuted,fontSize:"0.73rem",whiteSpace:"nowrap"}}>{fmtDate(r.releaseActual)||"—"}</td>
                  <td style={tdSt}><span style={{color:delayColor,fontWeight:700,fontSize:"0.82rem"}}>{delayLabel}</span></td>
                  <td style={{...tdSt,maxWidth:160}}>
                    {(()=>{const names=getApprovedNames(r);return names.length
                      ?<span style={{color:B.lime,fontWeight:700,fontSize:"0.79rem"}}>{names.join(", ")}</span>
                      :<span style={{color:B.textMuted,fontSize:"0.72rem"}}>—</span>;})()
                    }
                  </td>
                  <td style={{...tdSt,verticalAlign:"middle"}}>
                    {(()=>{
                      const jLinks=[...(r.jiraLinks||[]),...(r.jiraLink&&!r.jiraLinks?.includes(r.jiraLink)?[r.jiraLink]:[])].filter(l=>l&&l.trim()).slice(0,5);
                      return jLinks.length
                        ?<div style={{display:"flex",flexDirection:"row",flexWrap:"wrap",gap:"0.25rem",alignItems:"center"}}>
                          {jLinks.map((lk,li)=>(
                            <a key={li} href={lk} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
                              style={{display:"inline-flex",alignItems:"center",gap:"0.25rem",background:"#0f2d52",color:"#60a5fa",border:"1px solid #1e4a8066",borderRadius:7,padding:"0.2rem 0.55rem",textDecoration:"none",fontSize:"0.67rem",fontWeight:700,whiteSpace:"nowrap"}}>
                              {li===0?"⎇ Jira ↗":`⎇ ${li+1} ↗`}
                            </a>
                          ))}
                        </div>
                        :<span style={{color:B.textMuted,fontSize:"0.69rem",opacity:0.4}}>—</span>;
                    })()}
                  </td>
                  <td style={tdSt}>
                    <button onClick={e=>{e.stopPropagation();setDoraPopup(p=>p?.release?.id===r.id?null:{release:r,pos:{x:Math.min(e.clientX,window.innerWidth-450),y:Math.min(e.clientY,window.innerHeight-430)}});}}
                      style={{background:doraPopup?.release?.id===r.id?B.grad1:"#0d0d0d",border:`1px solid ${B.border2}`,color:doraPopup?.release?.id===r.id?"#fff":B.cyan,borderRadius:8,padding:"0.28rem 0.7rem",cursor:"pointer",fontSize:"0.7rem",fontWeight:700,fontFamily:FONT,whiteSpace:"nowrap"}}>
                      {doraPopup?.release?.id===r.id?"▲ Close":"▼ DORA"}
                    </button>
                  </td>
                  <td style={tdSt}>
                    <button onClick={e=>{e.stopPropagation();setEditRelease(r);}} title="Edit"
                      style={{background:"#0d0d0d",border:`1px solid ${B.teal}55`,color:B.teal,borderRadius:8,padding:"0.28rem 0.55rem",cursor:"pointer",fontSize:"0.85rem",lineHeight:1,fontFamily:FONT,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      ✎
                    </button>
                  </td>
                </tr>
              </>); }catch(e){ return <tr key={i}><td colSpan={12} style={{color:"#ef4444",fontSize:"0.7rem",padding:"0.5rem 1rem"}}>Row error</td></tr>; }
            })}
          </tbody>
        </table>
      </div>
      {/* DORA popup floats near button */}
      {doraPopup&&<DoraPopup release={doraPopup.release} pos={doraPopup.pos} onClose={()=>setDoraPopup(null)}/>}
      <PaginationBar current={currentPage} total={totalPages} onChange={setCurrentPage} count={sorted.length} label="releases" />
    </div>
  );
}


// ─── NODE GRAPH ───────────────────────────────────────────────────────────────