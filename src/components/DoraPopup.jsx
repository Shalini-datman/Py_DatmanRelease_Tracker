import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { B,FONT,FONT_DISPLAY,PRIORITIES,MODULES,RELEASE_TYPES,STATUSES,GATEWAY_MODULES,APP_MODULES,APPROVER_NAMES,STATUS_COLORS,PRIORITY_COLORS,TYPE_COLORS,TYPE_COLOR,inputStyle,primaryBtn,tdSt,parseDDMMYYYY,daysBetween,leadTimeDays,fmtDate,Chip,StatusBadge,Field,SectionLabel,LogoMark,CalendarPicker } from "./shared.jsx";
export default function DoraPopup({release,pos,onClose}){
  if(!release)return null;
  const lt=leadTimeDays(release.dora?.handoverDate,release.releaseActual);
  const delay=release.releaseActual&&release.releasePlanned?daysBetween(release.releasePlanned,release.releaseActual):null;
  // Clamp position
  const LEFT=Math.min(pos.x,window.innerWidth-480);
  const TOP=Math.min(pos.y,window.innerHeight-420);
  return(
    <div style={{position:"fixed",left:LEFT,top:TOP,zIndex:500,background:B.bgCard,border:`1px solid ${B.teal}55`,borderRadius:16,padding:"1.25rem 1.4rem",width:440,boxShadow:"0 24px 60px rgba(0,0,0,0.6)",fontFamily:FONT}}
      onClick={e=>e.stopPropagation()}>
      {/* Top accent */}
      <div style={{position:"absolute",top:0,left:0,right:0,height:3,borderRadius:"16px 16px 0 0",background:B.grad1}}/>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:"0.6rem",marginTop:"0.2rem",marginBottom:"1rem"}}>
        <span style={{background:B.blue,borderRadius:6,padding:"0.2rem 0.5rem",fontSize:"0.65rem",fontWeight:800,color:"#fff",letterSpacing:"0.05em"}}>DORA</span>
        <span style={{color:B.cyan,fontWeight:700,fontSize:"0.88rem"}}>{release.rn}</span>
        <StatusBadge s={release.status}/>
        <button onClick={onClose} style={{marginLeft:"auto",background:"transparent",border:`1px solid ${B.border2}`,color:B.textMuted,borderRadius:8,padding:"0.25rem 0.55rem",cursor:"pointer",fontSize:"0.8rem",fontFamily:FONT}}>✕</button>
      </div>
      <div style={{color:B.textPrimary,fontWeight:700,fontSize:"0.92rem",marginBottom:"0.3rem"}}>{release.summary}</div>
      <div style={{color:B.textMuted,fontSize:"0.76rem",marginBottom:"1rem"}}>{release.goal}</div>
      {/* DORA fields grid */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0.6rem",marginBottom:"0.75rem"}}>
        {[
          ["Lead Developer",release.dora?.leadDeveloper,B.cyan],
          ["Application",   release.dora?.application,  B.textPrimary],
          ["Services",      release.dora?.services,      B.textPrimary],
          ["Handover Date", release.dora?.handoverDate,  B.textSecondary],
          ["Original RN",   release.dora?.originalRNLink,B.teal],
          ["Handover Date", release.dora?.handoverDate,  B.lime],
        ].map(([k,v,c])=>(
          <div key={k} style={{background:"#0d0d0d",borderRadius:8,padding:"0.55rem 0.7rem",borderLeft:`3px solid ${c}44`}}>
            <div style={{color:B.textMuted,fontSize:"0.58rem",textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700,marginBottom:"0.2rem"}}>{k}</div>
            <div style={{color:c,fontWeight:600,fontSize:"0.8rem"}}>{v||"—"}</div>
          </div>
        ))}
      </div>
      {/* Lead time & delay highlight row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.6rem"}}>
        <div style={{background:"#0d0d0d",borderRadius:8,padding:"0.55rem 0.7rem",borderLeft:`3px solid ${B.lime}`}}>
          <div style={{color:B.textMuted,fontSize:"0.58rem",textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700,marginBottom:"0.2rem"}}>Lead Time (Handover→Release)</div>
          <div style={{color:B.lime,fontWeight:800,fontSize:"1.2rem",lineHeight:1}}>{lt!==null?`${lt} days`:"Pending"}</div>
          {lt!==null&&<div style={{color:B.textMuted,fontSize:"0.65rem",marginTop:"0.2rem"}}>{release.dora?.handoverDate} → {release.releaseActual}</div>}
        </div>
        <div style={{background:"#0d0d0d",borderRadius:8,padding:"0.55rem 0.7rem",borderLeft:`3px solid ${delay&&delay>0?"#ef4444":B.lime}`}}>
          <div style={{color:B.textMuted,fontSize:"0.58rem",textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700,marginBottom:"0.2rem"}}>Release Delay (Planned Date → Released Date)</div>
          <div style={{color:delay&&delay>0?"#ef4444":B.lime,fontWeight:800,fontSize:"1.2rem",lineHeight:1}}>
            {delay===null?"Pending":delay===0?"On Time":`+${delay} days`}
          </div>
          {delay!==null&&<div style={{color:B.textMuted,fontSize:"0.65rem",marginTop:"0.2rem"}}>{fmtDate(release.releasePlanned)} → {fmtDate(release.releaseActual)||"—"}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Form Field — defined OUTSIDE FormPage so it never remounts on state change ──