import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";


// Inject Inter font
if(typeof document!=="undefined"&&!document.getElementById("datman-fonts")){
  const l=document.createElement("link");l.id="datman-fonts";l.rel="stylesheet";
  l.href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap";
  document.head.appendChild(l);
}
// Inter for all UI; Liberation Serif / Libre Baskerville only on Form headings & labels
export const FONT="'Inter','DM Sans',sans-serif";
export const FONT_DISPLAY="'Liberation Serif','Libre Baskerville','Georgia',serif";

// ─── Brand Palette ─────────────────────────────────────────────────────────────
export const B = {
  teal:"#0ea5c8", cyan:"#22d3ee", blue:"#1d6fa4", deepBlue:"#0f4c7a",
  lime:"#84cc16", green:"#22c55e",
  bgDark:"#000000", bgCard:"#0d0d0d", bgRow:"#141414", bgPanel:"#1a1a1a",
  border:"#222222", border2:"#2a2a2a",
  textPrimary:"#e0f2fe", textSecondary:"#7db8d4", textMuted:"#4a7a96",
  grad1:"linear-gradient(135deg, #0ea5c8, #1d6fa4)",
};

export const PRIORITIES    = ["P0","P1","P2","P3","P4"];
export const MODULES       = ["Payments","Payouts","General","App","Portal","Web"];
export const RELEASE_TYPES = ["New Feature","Improvement","Patch","Bug"]; // kept separate in form
export const STATUSES      = ["Planning","In Progress","Released","Delayed","Cancelled"];
export const GATEWAY_MODULES = ["General","Payments","Payouts"];
export const APP_MODULES     = ["Portal","Web","App"];
export const APPROVER_NAMES  = ["Sandeep","Nitish","Pradeep","Muz","Sundar","Ruhan","Anand"];

export const STATUS_COLORS   = { Planning:B.teal, "In Progress":B.cyan, Released:B.lime, Delayed:"#f97316", Cancelled:"#9ca3af", Rolledback:"#f97316" };
export const PRIORITY_COLORS = { Hotfix:"#dc2626", P0:"#ff00ff", P1:"#ef4444", P2:"#f97316", P3:B.cyan, P4:B.lime };
export const TYPE_COLORS = {
  "New Feature": "#22c55e",   // green
  "Improvement": "#1d6fa4",   // Datman logo blue
  "Patch":       "#a855f7",   // purple — clearly distinct from red
  "Bug":         "#ef4444",   // red — danger/critical
};
export const TYPE_COLOR  = t => TYPE_COLORS[t] || "#0ea5c8";
// Display: New Feature & Improvement shown separately in table/form, but clubbed in analytics charts
export const TYPE_CLUB   = t => (t==="New Feature"||t==="Improvement")?"Feature/Imp":t;

export const mkDate = (y,m,d) => `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

export function parseDDMMYYYY(s) {
  if(!s||s==="NA")return null;
  const [d,m,y]=s.split("/");
  return new Date(+y,+m-1,+d);
}
export function daysBetween(a,b){
  const da=new Date(a),db=new Date(b);
  if(isNaN(da)||isNaN(db))return null;
  return Math.round((db-da)/(86400000));
}
export function leadTimeDays(handover,release){
  const h=parseDDMMYYYY(handover);
  const r=release?new Date(release):null;
  if(!h||!r||isNaN(r))return null;
  return Math.max(0,Math.round((r-h)/86400000));
}
// Format date for display: YYYY-MM-DD → DD/MM/YYYY
export function fmtDate(d){
  if(!d||d==="—") return d||"—";
  const s=String(d).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)){
    const [y,m,dd]=s.split("-");
    return `${dd}/${m}/${y}`;
  }
  return s;
}


// ─── Shared UI pieces ─────────────────────────────────────────────────────────
export const inputStyle={width:"100%",background:"#111111",border:`1px solid ${B.border2}`,borderRadius:10,color:B.textPrimary,padding:"0.75rem 1rem",fontSize:"0.9rem",outline:"none",fontFamily:FONT,boxSizing:"border-box"};
export const primaryBtn={width:"100%",padding:"0.875rem",borderRadius:12,border:"none",cursor:"pointer",background:B.grad1,color:"#fff",fontSize:"0.95rem",fontWeight:700,fontFamily:FONT};
export const tdSt={padding:"0.5rem 0.75rem",borderBottom:`1px solid ${B.border}`,verticalAlign:"middle"};

export function Chip({label,color,small}){
  return <span style={{background:color+"22",color,border:`1px solid ${color}44`,padding:small?"0.12rem 0.45rem":"0.2rem 0.55rem",borderRadius:99,fontSize:small?"0.65rem":"0.7rem",fontWeight:700,whiteSpace:"nowrap"}}>{label}</span>;
}
export function StatusBadge({s}){const c=STATUS_COLORS[s]||B.textMuted;return <span style={{background:c+"22",color:c,border:`1px solid ${c}44`,padding:"0.2rem 0.55rem",borderRadius:99,fontSize:"0.7rem",fontWeight:700,display:"inline-flex",alignItems:"center",gap:"0.3rem",whiteSpace:"nowrap"}}><span style={{width:5,height:5,borderRadius:"50%",background:c,flexShrink:0}}/>{s}</span>;}
export function Field({label,error,highlight,children}){return(<div><label style={{display:"block",color:highlight?B.cyan:B.textSecondary,fontSize:"0.72rem",letterSpacing:"0.08em",textTransform:"uppercase",fontWeight:700,marginBottom:"0.5rem"}}>{label}{highlight&&<span style={{color:B.cyan,marginLeft:"0.3rem",fontSize:"0.65rem"}}>● missing</span>}</label>{children}{error&&<span style={{color:"#ef4444",fontSize:"0.75rem",marginTop:"0.25rem",display:"block"}}>{error}</span>}</div>);}
export function SectionLabel({children,sub}){return <div style={{marginBottom:"0.75rem"}}><span style={{color:B.textPrimary,fontSize:"0.95rem",fontWeight:700}}>{children}</span>{sub&&<span style={{color:B.textMuted,fontSize:"0.75rem",fontWeight:400,marginLeft:"0.5rem"}}>{sub}</span>}</div>;}
export function LogoMark({size=32}){
  // Datman logo: segmented concentric arcs in teal/blue/green palette
  const s=size, cx=s/2, cy=s/2;
  const r1=s*0.46, r2=s*0.33, r3=s*0.20, r4=s*0.09;
  const sw1=s*0.09, sw2=s*0.085, sw3=s*0.08, sw4=s*0.08;
  // arc helper: returns SVG arc path for a segment
  const arc=(r,startDeg,endDeg)=>{
    const s2r=d=>(d-90)*Math.PI/180;
    const x1=cx+r*Math.cos(s2r(startDeg)), y1=cy+r*Math.sin(s2r(startDeg));
    const x2=cx+r*Math.cos(s2r(endDeg)),   y2=cy+r*Math.sin(s2r(endDeg));
    const large=endDeg-startDeg>180?1:0;
    return `M${x1},${y1} A${r},${r},0,${large},1,${x2},${y2}`;
  };
  return(
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none">
      {/* Outer ring – teal segments */}
      <path d={arc(r1,0,80)}    stroke="#0ea5c8" strokeWidth={sw1} strokeLinecap="round"/>
      <path d={arc(r1,95,170)}  stroke="#22d3ee" strokeWidth={sw1} strokeLinecap="round"/>
      <path d={arc(r1,185,270)} stroke="#0ea5c8" strokeWidth={sw1} strokeLinecap="round"/>
      <path d={arc(r1,285,355)} stroke="#1d6fa4" strokeWidth={sw1} strokeLinecap="round"/>
      {/* Middle ring – blue/teal */}
      <path d={arc(r2,10,110)}  stroke="#1d6fa4" strokeWidth={sw2} strokeLinecap="round"/>
      <path d={arc(r2,125,210)} stroke="#0ea5c8" strokeWidth={sw2} strokeLinecap="round"/>
      <path d={arc(r2,225,340)} stroke="#22d3ee" strokeWidth={sw2} strokeLinecap="round"/>
      {/* Inner ring – green segments */}
      <path d={arc(r3,20,120)}  stroke="#22c55e" strokeWidth={sw3} strokeLinecap="round"/>
      <path d={arc(r3,140,250)} stroke="#84cc16" strokeWidth={sw3} strokeLinecap="round"/>
      <path d={arc(r3,265,355)} stroke="#22c55e" strokeWidth={sw3} strokeLinecap="round"/>
      {/* Core dot */}
      <circle cx={cx} cy={cy} r={r4} fill="#1d6fa4"/>
      <circle cx={cx} cy={cy} r={r4*0.5} fill="#22d3ee" opacity="0.8"/>
    </svg>
  );
}

// ─── Mini Calendar Picker ─────────────────────────────────────────────────────
export function CalendarPicker({value,onChange,onClose}){
  // value = {from:"YYYY-MM-DD", to:"YYYY-MM-DD"} | null
  const today=new Date("2026-03-25");
  const [viewYear,setViewYear]=useState(today.getFullYear());
  const [viewMonth,setViewMonth]=useState(today.getMonth());
  const [selecting,setSelecting]=useState(null); // first click date
  const [hoverDate,setHoverDate]=useState(null);

  const from=value?.from?new Date(value.from):null;
  const to=value?.to?new Date(value.to):null;

  const daysInMonth=(y,m)=>new Date(y,m+1,0).getDate();
  const firstDay=(y,m)=>new Date(y,m,1).getDay();
  const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const monthNames=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const handleDay=(y,m,d)=>{
    const dateStr=fmt(new Date(y,m,d));
    if(!selecting){
      setSelecting(dateStr);
      onChange({from:dateStr,to:dateStr});
    } else {
      const a=selecting<dateStr?selecting:dateStr;
      const b=selecting<dateStr?dateStr:selecting;
      onChange({from:a,to:b});
      setSelecting(null);
    }
  };

  const dim=daysInMonth(viewYear,viewMonth);
  const fd=firstDay(viewYear,viewMonth);
  const cells=[];
  for(let i=0;i<fd;i++)cells.push(null);
  for(let d=1;d<=dim;d++)cells.push(d);

  const isInRange=(d)=>{
    if(!from||!to||!d)return false;
    const dd=new Date(viewYear,viewMonth,d);
    return dd>=from&&dd<=to;
  };
  const isFrom=d=>d&&from&&fmt(new Date(viewYear,viewMonth,d))===fmt(from);
  const isTo=d=>d&&to&&fmt(new Date(viewYear,viewMonth,d))===fmt(to);

  const QUICK=[["Last 7d",7],["Last 14d",14],["Last 30d",30],["Last 90d",90]];
  const applyQuick=days=>{
    const t=new Date("2026-03-25"),f=new Date(t);f.setDate(f.getDate()-days);
    onChange({from:fmt(f),to:fmt(t)});setSelecting(null);
  };

  return(
    <div style={{background:B.bgCard,border:`1px solid ${B.border2}`,borderRadius:16,padding:"1rem",width:280,boxShadow:"0 20px 60px rgba(0,0,0,0.5)",fontFamily:FONT,position:"absolute",top:"calc(100% + 8px)",left:0,zIndex:200}}>
      {/* Quick ranges */}
      <div style={{display:"flex",gap:"0.3rem",marginBottom:"0.75rem",flexWrap:"wrap"}}>
        {QUICK.map(([l,d])=>(
          <button key={l} onClick={()=>applyQuick(d)} style={{background:"#0d0d0d",border:`1px solid ${B.border2}`,color:B.textSecondary,borderRadius:8,padding:"0.25rem 0.55rem",fontSize:"0.7rem",fontWeight:600,cursor:"pointer",fontFamily:FONT}}>{l}</button>
        ))}
      </div>
      {/* Month nav */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.6rem"}}>
        <button onClick={()=>{let nm=viewMonth-1,ny=viewYear;if(nm<0){nm=11;ny--;}setViewMonth(nm);setViewYear(ny);}} style={{background:"none",border:"none",color:B.textSecondary,cursor:"pointer",fontSize:"1rem",padding:"0 0.4rem"}}>‹</button>
        <span style={{color:B.textPrimary,fontWeight:700,fontSize:"0.85rem"}}>{monthNames[viewMonth]} {viewYear}</span>
        <button onClick={()=>{let nm=viewMonth+1,ny=viewYear;if(nm>11){nm=0;ny++;}setViewMonth(nm);setViewYear(ny);}} style={{background:"none",border:"none",color:B.textSecondary,cursor:"pointer",fontSize:"1rem",padding:"0 0.4rem"}}>›</button>
      </div>
      {/* Day headers */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:"0.3rem"}}>
        {["S","M","T","W","T","F","S"].map((d,i)=><div key={i} style={{textAlign:"center",color:B.textMuted,fontSize:"0.65rem",fontWeight:700,padding:"0.2rem"}}>{d}</div>)}
      </div>
      {/* Cells */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
        {cells.map((d,i)=>{
          if(!d)return <div key={i}/>;
          const inRange=isInRange(d),isF=isFrom(d),isT=isTo(d);
          const isEnd=isF||isT;
          return(
            <div key={i} onClick={()=>handleDay(viewYear,viewMonth,d)}
              onMouseEnter={()=>setHoverDate(fmt(new Date(viewYear,viewMonth,d)))}
              onMouseLeave={()=>setHoverDate(null)}
              style={{textAlign:"center",padding:"0.3rem 0",borderRadius:isEnd?99:4,cursor:"pointer",fontSize:"0.78rem",fontWeight:isEnd?700:400,
                background:isEnd?"#0ea5c8":inRange?"#0ea5c822":"transparent",
                color:isEnd?"#fff":inRange?B.cyan:B.textSecondary,transition:"all 0.1s"}}>
              {d}
            </div>
          );
        })}
      </div>
      {/* Footer */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:"0.75rem",borderTop:`1px solid ${B.border}`,paddingTop:"0.6rem"}}>
        <span style={{color:B.textMuted,fontSize:"0.7rem"}}>{from?`${fmt(from)} → ${fmt(to||from)}`:"No range"}</span>
        <button onClick={onClose} style={{background:B.grad1,border:"none",color:"#fff",borderRadius:8,padding:"0.3rem 0.8rem",fontSize:"0.72rem",fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Apply</button>
      </div>
    </div>
  );
}

// ─── DORA Popup (floating, fixed near click) ──────────────────────────────────