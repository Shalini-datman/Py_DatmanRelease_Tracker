import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { B,FONT,FONT_DISPLAY,PRIORITIES,MODULES,RELEASE_TYPES,STATUSES,GATEWAY_MODULES,APP_MODULES,APPROVER_NAMES,STATUS_COLORS,PRIORITY_COLORS,TYPE_COLORS,TYPE_COLOR,inputStyle,primaryBtn,tdSt,parseDDMMYYYY,daysBetween,leadTimeDays,fmtDate,Chip,StatusBadge,Field,SectionLabel,LogoMark,CalendarPicker } from "./shared.jsx";
export default function AnalyticsPage({releases}){
  const [dateRange,setDateRange]=useState(null); // null = no filter = show all
  const [calOpen,setCalOpen]=useState(false);
  const [handoverHover,setHandoverHover]=useState(null);
  const [handoverPos,setHandoverPos]=useState({x:0,y:0});

  const filtered=useMemo(()=>{
    if(!dateRange) return releases; // no filter = show all
    const f=new Date(dateRange.from),t=new Date(dateRange.to);
    t.setHours(23,59,59); // include the end date fully
    return releases.filter(r=>{
      const d=new Date(r.releaseActual||r.releasePlanned);
      return !isNaN(d)&&d>=f&&d<=t;
    });
  },[releases,dateRange]);

  // Delivered = Released + Cancelled(Rolledback) — reacts to dateRange filter
  const delivered=useMemo(()=>filtered.filter(r=>r.status==="Released"||r.status==="Cancelled"),[filtered]);
  const total    =delivered.length;
  const bugs     =useMemo(()=>delivered.filter(r=>r.type==="Bug").length,[delivered]);
  const patches  =useMemo(()=>delivered.filter(r=>r.type==="Patch").length,[delivered]);
  const featImps =useMemo(()=>delivered.filter(r=>r.type==="New Feature"||r.type==="Improvement").length,[delivered]);
  const released =useMemo(()=>delivered.filter(r=>r.status==="Released").length,[delivered]);
  const rolledBack=useMemo(()=>delivered.filter(r=>r.status==="Cancelled").length,[delivered]);

  // These re-derive whenever filtered/dateRange changes — so team tiles respond to date filter
  const gatewayReleases=useMemo(()=>delivered.filter(r=>r.modules.some(m=>GATEWAY_MODULES.includes(m))),[delivered]);
  const appReleases    =useMemo(()=>delivered.filter(r=>r.modules.some(m=>APP_MODULES.includes(m))),[delivered]);

  const leadTimesAll=useMemo(()=>delivered.map(r=>leadTimeDays(r.dora?.handoverDate,r.releaseActual)).filter(x=>x!==null&&x>=0),[delivered]);
  const avgLT=leadTimesAll.length?(leadTimesAll.reduce((a,b)=>a+b,0)/leadTimesAll.length).toFixed(1):"—";
  const featImpLT=useMemo(()=>delivered.filter(r=>r.type==="New Feature"||r.type==="Improvement").map(r=>leadTimeDays(r.dora?.handoverDate,r.releaseActual)).filter(x=>x!==null&&x>=0),[delivered]);
  const avgFeatImpLT=featImpLT.length?(featImpLT.reduce((a,b)=>a+b,0)/featImpLT.length).toFixed(1):"—";

  // This week's releases (Mon-Sun of range.to)
  const toDate=dateRange?new Date(dateRange.to):new Date();
  const dayOfWeek=toDate.getDay();
  const monday=new Date(toDate);monday.setDate(toDate.getDate()-(dayOfWeek===0?6:dayOfWeek-1));
  const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
  const weekReleases=releases.filter(r=>{const d=new Date(r.releaseActual);return r.releaseActual&&(r.status==="Released"||r.status==="Cancelled")&&d>=monday&&d<=sunday;});

  const handoverGroups=useMemo(()=>{
    const map={};
    filtered.forEach(r=>{const hd=r.dora?.handoverDate||"Unknown";if(!map[hd])map[hd]={date:hd,releases:[],bug:0,patch:0,featImp:0,total:0};map[hd].releases.push(r);if(r.type==="Bug")map[hd].bug++;else if(r.type==="Patch")map[hd].patch++;else map[hd].featImp++;map[hd].total++;});
    return Object.values(map).sort((a,b)=>(parseDDMMYYYY(a.date)||new Date(0))-(parseDDMMYYYY(b.date)||new Date(0)));
  },[filtered]);

  // Build daily chart for date range
  // ── Weekly grouping (always works, no date range needed) ──
  const getWeekKey=dateStr=>{
    if(!dateStr) return null;
    const d=new Date(dateStr);
    if(isNaN(d)) return null;
    const mon=new Date(d);
    mon.setDate(d.getDate()-(d.getDay()===0?6:d.getDay()-1));
    return mon.toISOString().slice(0,10);
  };
  const getWeekLabel=wk=>{
    const d=new Date(wk),sun=new Date(wk);
    sun.setDate(d.getDate()+6);
    const f=x=>x.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
    return f(d)+" – "+f(sun);
  };
  // Robust date normaliser for chart: handles YYYY-MM-DD, DD/MM/YYYY, D/M/YYYY
  const toChartKey=dateStr=>{
    if(!dateStr) return null;
    const s=dateStr.trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // already YYYY-MM-DD
    if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)){
      const [d,m,y]=s.split("/");
      return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
    }
    // Try JS Date parsing as last resort
    const dt=new Date(s);
    if(!isNaN(dt)) return dt.toISOString().slice(0,10);
    return null;
  };

  const weeklyData=useMemo(()=>{
    // Use ALL releases (not just delivered/filtered) so Planning & In Progress show too
    const src=dateRange?filtered:releases;
    const map={};
    src.forEach(r=>{
      const raw=r.releaseActual||r.releasePlanned;
      const key=toChartKey(raw);
      if(!key) return;
      const dt=new Date(key);
      if(isNaN(dt)) return;
      const dow=dt.getDay();
      if(!map[key]) map[key]={week:key,featImp:0,improvement:0,patch:0,bug:0,total:0,releases:[],isWeekend:dow===0||dow===6};
      const t=(r.type||"").trim();
      if(t==="Bug")              map[key].bug++;
      else if(t==="Patch")       map[key].patch++;
      else if(t==="Improvement") map[key].improvement++;
      else                       map[key].featImp++;
      map[key].total++;
      map[key].releases.push(r);
    });
    // Fill weekday gaps (Mon–Fri) between first and last release date
    const keys=Object.keys(map).sort();
    if(!keys.length) return [];
    const first=new Date(keys[0]), last=new Date(keys[keys.length-1]);
    for(let d=new Date(first);d<=last;d.setDate(d.getDate()+1)){
      const dow=d.getDay();
      if(dow===0||dow===6) continue; // skip empty weekends
      const k=d.toISOString().slice(0,10);
      if(!map[k]) map[k]={week:k,featImp:0,improvement:0,patch:0,bug:0,total:0,releases:[],isWeekend:false};
    }
    return Object.values(map).sort((a,b)=>a.week.localeCompare(b.week));
  },[releases,filtered,dateRange]);

  const dailyData=useMemo(()=>{
    if(!dateRange) return [];
    const f=new Date(dateRange.from),t=new Date(dateRange.to);
    const map={};
    for(let d=new Date(f);d<=t;d.setDate(d.getDate()+1)){const k=d.toISOString().slice(0,10);map[k]={date:k,featImp:0,bug:0,patch:0};}
    filtered.forEach(r=>{const k=r.releaseActual||r.releasePlanned;if(map[k]){if(r.type==="Bug")map[k].bug++;else if(r.type==="Patch")map[k].patch++;else map[k].featImp++;}});
    return Object.values(map).map((d,i)=>{const dt=new Date(d.date);return{...d,label:i%3===0?`${dt.toLocaleDateString("en-US",{weekday:"short"})}
${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}`:"",total:d.featImp+d.bug+d.patch};});
  },[filtered,dateRange]);

  const maxBar=Math.max(...dailyData.map(d=>d.total),1);
  const maxWeek=Math.max(...(weeklyData.length?weeklyData.map(w=>w.total):[1]));
  const maxHO=Math.max(...handoverGroups.map(g=>g.total),1);


  const KPI=({label,value,color,sub})=>(
    <div style={{background:B.bgCard,border:`1px solid ${B.border}`,borderRadius:14,padding:"1.1rem 1.3rem",flex:1,minWidth:120,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:color||B.teal,opacity:0.6,borderRadius:"14px 14px 0 0"}}/>
      <div style={{color:B.textMuted,fontSize:"0.66rem",letterSpacing:"0.08em",textTransform:"uppercase",fontWeight:700,marginBottom:"0.4rem"}}>{label}</div>
      <div style={{color:color||B.textPrimary,fontSize:"2rem",fontWeight:800,lineHeight:1,letterSpacing:"-0.04em"}}>{value}</div>
      {sub&&<div style={{color:B.textMuted,fontSize:"0.68rem",marginTop:"0.3rem"}}>{sub}</div>}
    </div>
  );

  // ── Team Tile (fixed uniform label layout) ──
  const TeamTile=({label,relArr,color,modules})=>{
    const b=relArr.filter(r=>r.type==="Bug").length;
    const p=relArr.filter(r=>r.type==="Patch").length;
    const f=relArr.filter(r=>r.type==="New Feature"||r.type==="Improvement").length;
    return(
      <div style={{background:B.bgCard,border:`1px solid ${B.border}`,borderRadius:14,padding:"1.3rem 1.4rem",flex:1,minWidth:220,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:color,borderRadius:"14px 14px 0 0"}}/>
        {/* Label + type badges — same layout for both tiles */}
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:"0.5rem",marginBottom:"0.75rem"}}>
          <div>
            <div style={{color:B.textMuted,fontSize:"0.66rem",letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700,marginBottom:"0.5rem"}}>{label}</div>
            <div style={{color:color,fontSize:"2.4rem",fontWeight:800,lineHeight:1,letterSpacing:"-0.04em"}}>{relArr.length}</div>
          </div>
          {/* Right side: type badges stacked */}
          <div style={{display:"flex",flexDirection:"column",gap:"0.35rem",alignItems:"flex-end",paddingTop:"0.2rem"}}>
            <Chip label={`Feature/Imp: ${f}`} color={B.lime}/>
            <Chip label={`Patch: ${p}`} color="#a855f7"/>
            <Chip label={`Bug: ${b}`} color="#ef4444"/>
          </div>
        </div>
        {/* Module pills */}
        <div style={{display:"flex",flexWrap:"wrap",gap:"0.4rem"}}>
          {modules.map(m=><span key={m} style={{background:color+"18",border:`1px solid ${color}44`,color:color,padding:"0.2rem 0.6rem",borderRadius:99,fontSize:"0.72rem",fontWeight:600}}>{m}</span>)}
        </div>
      </div>
    );
  };

  return(
    <div style={{padding:"1rem 2rem",fontFamily:FONT,overflowY:"auto",height:"calc(100vh - 90px)"}}>
      {/* ── Date Range Picker ── */}
      <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginBottom:"1rem",position:"relative"}}>
        <span style={{color:B.textMuted,fontSize:"0.8rem"}}>Time Range:</span>
        <div style={{position:"relative"}}>
          <button onClick={()=>setCalOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:"0.6rem",background:"#0d0d0d",border:`1px solid ${calOpen?B.teal:B.border2}`,color:B.textPrimary,borderRadius:10,padding:"0.45rem 1rem",cursor:"pointer",fontSize:"0.82rem",fontWeight:600,fontFamily:FONT,transition:"border-color 0.2s"}}>
            <span style={{fontSize:"0.85rem"}}>📅</span>
            <span>{dateRange?dateRange.from:"All time"}</span>{dateRange&&<><span style={{color:B.textMuted}}>→</span><span>{dateRange.to}</span></>}
            <span style={{color:B.textMuted,fontSize:"0.75rem"}}>{calOpen?"▲":"▼"}</span>
          </button>
          {calOpen&&<CalendarPicker value={dateRange||{from:"",to:""}} onChange={r=>{setDateRange(r);}} onClose={()=>setCalOpen(false)}/>}
        </div>
        {/* Quick presets */}
        <div style={{display:"flex",background:"#0d0d0d",borderRadius:10,padding:"0.18rem",border:`1px solid ${B.border2}`}}>
          <button onClick={()=>{setDateRange(null);setCalOpen(false);}} style={{padding:"0.32rem 0.85rem",borderRadius:8,border:"none",cursor:"pointer",background:!dateRange?B.grad1:"transparent",color:!dateRange?"#fff":B.textMuted,fontSize:"0.78rem",fontWeight:700,fontFamily:FONT}}>All</button>
          {[["30d",30],["60d",60],["90d",90]].map(([l,d])=>{
            const t=new Date(),f=new Date(t);f.setDate(f.getDate()-d);
            const fmt=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
            const active=dateRange&&dateRange.from===fmt(f);
            return (
              <button key={l} onClick={()=>{setDateRange({from:fmt(f),to:fmt(t)});setCalOpen(false);}} style={{padding:"0.32rem 0.85rem",borderRadius:8,border:"none",cursor:"pointer",background:active?B.grad1:"transparent",color:active?"#fff":B.textMuted,fontSize:"0.78rem",fontWeight:700,fontFamily:FONT}}>{l}</button>
            );
          })}
        </div>
        <span style={{color:B.textMuted,fontSize:"0.78rem",marginLeft:"auto"}}>{filtered.length} of {releases.length} releases{dateRange?" in range":""}</span>
      </div>

      {/* ── Release Summary ── */}
      <SectionLabel>Release Summary</SectionLabel>
      <div style={{display:"flex",gap:"1rem",marginBottom:"1.5rem",flexWrap:"wrap"}}>
        <KPI label="Total Delivered" value={total} color={B.lime} sub="Released + Rolledback"/>
        <KPI label="Released" value={released} color={B.green} sub="Live"/>
        <KPI label="Rolledback" value={rolledBack} color="#f97316" sub="Cancelled"/>
        <KPI label="Feature / Improvement" value={featImps} color="#22c55e"/>
        <KPI label="Patch" value={patches} color="#a855f7"/>
        <KPI label="Bug" value={bugs} color="#ef4444"/>
      </div>

      {/* ── Lead Time ── */}
      <div style={{marginBottom:"0.75rem",display:"flex",alignItems:"baseline",gap:"0.6rem"}}>
        <span style={{color:B.textPrimary,fontSize:"0.95rem",fontWeight:700}}>Lead Time</span>
        <span style={{color:B.textMuted,fontSize:"0.75rem",fontWeight:400}}>Handover Date to Actual Release</span>
      </div>
      <div style={{display:"flex",gap:"1rem",marginBottom:"1.5rem",flexWrap:"wrap"}}>
        <KPI label="Feature/Imp Lead Time" value={avgFeatImpLT==="—"?avgFeatImpLT:avgFeatImpLT+"d"} color={B.cyan} sub="Avg handover→release"/>
        <KPI label="Overall Avg Lead Time" value={avgLT==="—"?avgLT:avgLT+"d"} color={B.teal} sub="All types"/>
        <KPI label="Max Lead Time" value={leadTimesAll.length?Math.max(...leadTimesAll)+"d":"—"} color="#f97316" sub="Slowest"/>
        <KPI label="Min Lead Time" value={leadTimesAll.length?Math.min(...leadTimesAll)+"d":"—"} color={B.lime} sub="Fastest"/>
      </div>

      {/* ── Team Breakdown ── */}
      <SectionLabel>Team Breakdown</SectionLabel>
      <div style={{display:"flex",gap:"1rem",marginBottom:"1.5rem",flexWrap:"wrap"}}>
        <TeamTile label="Gateway Releases"          relArr={gatewayReleases} color={B.teal} modules={GATEWAY_MODULES}/>
        <TeamTile label="Application Team Releases" relArr={appReleases}     color={B.lime} modules={APP_MODULES}/>
      </div>

      {/* ── Releases at Handover ── */}
      <div style={{background:B.bgCard,border:`1px solid ${B.border}`,borderRadius:16,padding:"1.5rem",marginBottom:"1.5rem",position:"relative"}}>
        <div style={{display:"flex",alignItems:"center",gap:"1rem",marginBottom:"1.25rem"}}>
          <span style={{color:B.textPrimary,fontSize:"0.95rem",fontWeight:700}}>Releases at Handover</span>
          <div style={{marginLeft:"auto",display:"flex",gap:"0.75rem"}}>
            {[["New Feature",TYPE_COLORS["New Feature"]],["Improvement",TYPE_COLORS["Improvement"]],["Patch",TYPE_COLORS["Patch"]],["Bug",TYPE_COLORS["Bug"]]].map(([l,c])=><div key={l} style={{display:"flex",alignItems:"center",gap:"0.35rem"}}><div style={{width:9,height:9,borderRadius:2,background:c}}/><span style={{color:B.textMuted,fontSize:"0.72rem"}}>{l}</span></div>)}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"flex-end",gap:"8px",height:170,paddingBottom:38,overflowX:"auto"}}>
          {handoverGroups.map((g,i)=>{
            const h=g.total?Math.max((g.total/maxHO)*130,6):0;
            return(
              <div key={i} style={{flex:"0 0 auto",minWidth:52,display:"flex",flexDirection:"column",alignItems:"center",cursor:"pointer",position:"relative"}}
                onMouseEnter={e=>{setHandoverHover(g);setHandoverPos({x:e.clientX,y:e.clientY});}}
                onMouseLeave={()=>setHandoverHover(null)}
                onMouseMove={e=>setHandoverPos({x:e.clientX,y:e.clientY})}>
                <div style={{width:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end",height:130,borderRadius:"6px 6px 0 0",overflow:"hidden"}}>
                  {g.featImp>0&&<div style={{height:`${(g.featImp/maxHO)*130}px`,background:TYPE_COLORS["New Feature"],opacity:0.85}}/>}
                  {g.patch>0&&<div style={{height:`${(g.patch/maxHO)*130}px`,background:TYPE_COLORS["Patch"],opacity:0.85}}/>}
                  {g.bug>0&&<div style={{height:`${(g.bug/maxHO)*130}px`,background:TYPE_COLORS["Bug"],opacity:0.85}}/>}
                  {g.total===0&&<div style={{height:2,background:B.border}}/>}
                </div>
                <div style={{position:"absolute",top:130-h-22,left:"50%",transform:"translateX(-50%)",background:B.bgPanel,border:`1px solid ${B.border2}`,borderRadius:6,padding:"0.12rem 0.35rem",fontSize:"0.68rem",fontWeight:800,color:B.textPrimary,whiteSpace:"nowrap"}}>{g.total}</div>
                <div style={{position:"absolute",bottom:0,fontSize:"0.6rem",color:B.textMuted,textAlign:"center",lineHeight:1.3,whiteSpace:"nowrap"}}>{g.date}</div>
              </div>
            );
          })}
        </div>
        {handoverHover&&(
          <div style={{position:"fixed",left:Math.min(handoverPos.x+14,window.innerWidth-260),top:handoverPos.y-14,zIndex:1000,pointerEvents:"none",background:B.bgCard,border:`1px solid ${B.teal}55`,borderRadius:14,padding:"1rem 1.25rem",minWidth:230,boxShadow:"0 16px 48px rgba(0,0,0,0.5)",fontFamily:FONT}}>
            <div style={{position:"absolute",top:0,left:0,right:0,height:3,borderRadius:"14px 14px 0 0",background:B.grad1}}/>
            <div style={{color:B.teal,fontSize:"0.68rem",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:"0.5rem",marginTop:"0.1rem"}}>Handover: {handoverHover.date}</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.75rem"}}>
              <span style={{color:B.textMuted,fontSize:"0.8rem"}}>Total</span><span style={{color:B.textPrimary,fontWeight:800,fontSize:"1.3rem"}}>{handoverHover.total}</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"0.35rem",borderTop:`1px solid ${B.border}`,paddingTop:"0.6rem"}}>
              {[["New Feature",handoverHover.featImp,TYPE_COLORS["New Feature"]],["Patch",handoverHover.patch,TYPE_COLORS["Patch"]],["Bug",handoverHover.bug,TYPE_COLORS["Bug"]]].map(([l,cnt,c])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"0.4rem"}}><div style={{width:8,height:8,borderRadius:2,background:c}}/><span style={{color:B.textSecondary,fontSize:"0.78rem"}}>{l}</span></div>
                  <span style={{color:c,fontWeight:700}}>{cnt}</span>
                </div>
              ))}
            </div>
            <div style={{marginTop:"0.75rem",borderTop:`1px solid ${B.border}`,paddingTop:"0.6rem"}}>
              {handoverHover.releases.map(r=>(
                <div key={r.id} style={{display:"flex",justifyContent:"space-between",gap:"0.5rem",marginBottom:"0.25rem"}}>
                  <span style={{color:B.teal,fontSize:"0.7rem",fontWeight:700,flexShrink:0}}>{r.rn}</span>
                  <span style={{color:B.textSecondary,fontSize:"0.7rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.summary}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Releases Per Week ── */}
      <div style={{background:B.bgCard,border:`1px solid ${B.border}`,borderRadius:16,padding:"1.5rem",marginBottom:"1.5rem"}}>
        <div style={{display:"flex",alignItems:"center",marginBottom:"1.25rem"}}>
          <span style={{color:B.textPrimary,fontSize:"0.95rem",fontWeight:700}}>Releases Per Week</span>
          <span style={{color:B.textMuted,fontSize:"0.75rem",marginLeft:"0.6rem"}}>{filtered.length} releases</span>
        </div>
        {weeklyData.length===0
          ? <div style={{height:160,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:B.textMuted,fontSize:"0.82rem"}}>No data yet — import your CSV to see the chart</span></div>
          : <WeeklyBar weeks={weeklyData} maxBar={maxWeek}/>
        }
      </div>

      {/* ── Module tiles: side by side ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1.5rem",marginBottom:"1.5rem"}}>

        {/* Releases by Module */}
        <div style={{background:B.bgCard,border:`1px solid ${B.border}`,borderRadius:16,padding:"1.5rem"}}>
          <div style={{color:B.textPrimary,fontSize:"0.95rem",fontWeight:700,marginBottom:"1rem"}}>Releases by Module</div>
          <div style={{display:"flex",flexDirection:"column",gap:"0.85rem"}}>
            {MODULES.map(m=>{
              const mRels=filtered.filter(r=>r.modules.includes(m));
              const tot=mRels.length,fi=mRels.filter(r=>r.type==="New Feature"||r.type==="Improvement").length,p=mRels.filter(r=>r.type==="Patch").length,b=mRels.filter(r=>r.type==="Bug").length;
              const isGW=GATEWAY_MODULES.includes(m),mc="#22c55e";
              if(!tot)return null;
              return(
                <div key={m}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.35rem"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
                      <div style={{width:9,height:9,borderRadius:"50%",background:mc,flexShrink:0}}/>
                      <span style={{color:B.textSecondary,fontSize:"0.85rem",fontWeight:700}}>{m}</span>
                      <span style={{color:B.textMuted,fontSize:"0.7rem"}}>{isGW?"Gateway":"App Team"}</span>
                    </div>
                    <span style={{color:B.textPrimary,fontSize:"0.85rem",fontWeight:800}}>{tot}</span>
                  </div>
                  <div style={{height:8,borderRadius:99,background:B.border,overflow:"hidden",display:"flex"}}>
                    <div style={{width:`${(fi/Math.max(tot,1))*100}%`,height:"100%",background:isGW?"linear-gradient(90deg,#22c55e,#0ea5c8)":"linear-gradient(90deg,#22c55e,#84cc16)",transition:"width 0.5s"}}/>
                    <div style={{width:`${(p/Math.max(tot,1))*100}%`,height:"100%",background:TYPE_COLORS["Patch"],transition:"width 0.5s"}}/>
                    <div style={{width:`${(b/Math.max(tot,1))*100}%`,height:"100%",background:"#ef4444",transition:"width 0.5s"}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Lead Time by Module (avg bars) */}
        <div style={{background:B.bgCard,border:`1px solid ${B.border}`,borderRadius:16,padding:"1.5rem"}}>
          <div style={{display:"flex",alignItems:"baseline",gap:"0.6rem",marginBottom:"1rem"}}>
            <span style={{color:B.textPrimary,fontSize:"0.95rem",fontWeight:700}}>Lead Time by Module</span>
            <span style={{color:B.textMuted,fontSize:"0.72rem"}}>avg handover → release</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:"0.85rem"}}>
            {(()=>{
              const modLTs=MODULES.map(m=>{
                const lts=filtered.filter(r=>r.modules.includes(m)&&r.releaseActual&&r.dora?.handoverDate)
                  .map(r=>leadTimeDays(r.dora.handoverDate,r.releaseActual)).filter(x=>x!==null&&x>=0);
                return{m,avg:lts.length?(lts.reduce((a,b)=>a+b,0)/lts.length):null,max:lts.length?Math.max(...lts):null,count:lts.length,isGW:GATEWAY_MODULES.includes(m)};
              }).filter(x=>x.count>0);
              if(!modLTs.length)return <div style={{color:B.textMuted,fontSize:"0.82rem",textAlign:"center",padding:"1.5rem 0"}}>No lead time data in range</div>;
              const maxAvg=Math.max(...modLTs.map(x=>x.avg));
              return modLTs.map(({m,avg,max,count,isGW})=>{
                const mc=isGW?B.teal:B.lime;
                const barCol=avg<=7?B.lime:avg<=14?"#f97316":"#ef4444";
                return(
                  <div key={m}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.35rem"}}>
                      <div style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
                        <div style={{width:9,height:9,borderRadius:"50%",background:mc,flexShrink:0}}/>
                        <span style={{color:B.textSecondary,fontSize:"0.85rem",fontWeight:700}}>{m}</span>
                        <span style={{color:B.textMuted,fontSize:"0.7rem"}}>{isGW?"Gateway":"App Team"}</span>
                        <span style={{color:B.textMuted,fontSize:"0.66rem"}}>({count})</span>
                      </div>
                      <div style={{display:"flex",alignItems:"baseline",gap:"0.4rem"}}>
                        <span style={{color:barCol,fontSize:"0.88rem",fontWeight:800}}>{avg.toFixed(1)}d</span>
                        {max!==null&&<span style={{color:B.textMuted,fontSize:"0.68rem"}}>max {max}d</span>}
                      </div>
                    </div>
                    <div style={{height:8,borderRadius:99,background:B.border,overflow:"hidden"}}>
                      <div style={{width:`${(avg/Math.max(maxAvg,1))*100}%`,height:"100%",background:barCol,transition:"width 0.5s",borderRadius:99}}/>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
          <div style={{display:"flex",gap:"1rem",marginTop:"1rem",paddingTop:"0.75rem",borderTop:`1px solid ${B.border}`}}>
            {[[B.lime,"≤ 7d"],["#f97316","8–14d"],["#ef4444","> 14d"]].map(([c,l])=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:"0.35rem"}}>
                <div style={{width:8,height:8,borderRadius:2,background:c}}/>
                <span style={{color:B.textMuted,fontSize:"0.67rem"}}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Lead Time per Release (full table) ── */}
      {(()=>{
        const ltRows=filtered
          .map(r=>{const lt=leadTimeDays(r.dora?.handoverDate,r.releaseActual);return{...r,lt};})
          .filter(r=>r.lt!==null&&r.lt>=0)
          .sort((a,b)=>b.lt-a.lt);
        const maxLT=ltRows.length?ltRows[0].lt:1;
        if(!ltRows.length)return null;
        return(
          <div style={{background:B.bgCard,border:`1px solid ${B.border}`,borderRadius:16,padding:"1.5rem",marginBottom:"1.5rem"}}>
            <div style={{display:"flex",alignItems:"baseline",gap:"0.75rem",marginBottom:"1.1rem"}}>
              <span style={{color:B.textPrimary,fontSize:"0.95rem",fontWeight:700}}>Lead Time per Release</span>
              <span style={{color:B.textMuted,fontSize:"0.72rem"}}>Handover date → actual release date, sorted slowest first</span>
              <span style={{marginLeft:"auto",background:B.teal+"22",color:B.teal,border:`1px solid ${B.teal}44`,padding:"0.12rem 0.5rem",borderRadius:99,fontSize:"0.68rem",fontWeight:700}}>{ltRows.length} releases</span>
            </div>
            <div style={{overflowX:"auto",borderRadius:12,border:`1px solid ${B.border}`}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontFamily:FONT,fontSize:"0.78rem"}}>
                <thead>
                  <tr style={{background:"#0d0d0d"}}>
                    {["RN","Summary","Modules","Priority","Handover Date","Release Date","Lead Time",""].map(h=>(
                      <th key={h} style={{padding:"0.65rem 0.9rem",color:B.textMuted,fontSize:"0.63rem",letterSpacing:"0.08em",textTransform:"uppercase",textAlign:"left",borderBottom:`1px solid ${B.border2}`,whiteSpace:"nowrap",fontFamily:FONT}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ltRows.map((r,i)=>{
                    const barPct=(r.lt/Math.max(maxLT,1))*100;
                    const ltCol=r.lt<=7?B.lime:r.lt<=14?"#f97316":"#ef4444";
                    const isGW=r.modules?.some(m=>GATEWAY_MODULES.includes(m));
                    return(
                      <tr key={r.id} style={{background:i%2===0?B.bgDark:B.bgCard,transition:"background 0.1s"}}
                        onMouseEnter={e=>e.currentTarget.style.background=B.bgRow}
                        onMouseLeave={e=>e.currentTarget.style.background=i%2===0?B.bgDark:B.bgCard}>
                        <td style={{padding:"0.55rem 0.9rem",borderBottom:`1px solid ${B.border}`,whiteSpace:"nowrap"}}>
                          {r.rnLink
                            ?<a href={r.rnLink} target="_blank" rel="noreferrer" style={{color:B.teal,fontWeight:700,textDecoration:"none",fontSize:"0.72rem"}}>{r.rn} ↗</a>
                            :<span style={{color:B.teal,fontWeight:700,fontSize:"0.72rem"}}>{r.rn}</span>}
                        </td>
                        <td style={{padding:"0.55rem 0.9rem",borderBottom:`1px solid ${B.border}`,color:B.textPrimary,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:500}}>{r.summary}</td>
                        <td style={{padding:"0.55rem 0.9rem",borderBottom:`1px solid ${B.border}`}}>
                          <div style={{display:"flex",alignItems:"center",gap:"0.3rem"}}>
                            <div style={{width:6,height:6,borderRadius:"50%",background:isGW?B.teal:B.lime,flexShrink:0}}/>
                            <span style={{color:isGW?B.teal:B.lime,fontSize:"0.69rem",fontWeight:600}}>{r.modules?.join(", ")||"—"}</span>
                          </div>
                        </td>
                        <td style={{padding:"0.55rem 0.9rem",borderBottom:`1px solid ${B.border}`}}>
                          <Chip label={r.priority||"—"} color={PRIORITY_COLORS[r.priority]||B.textMuted} small/>
                        </td>
                        <td style={{padding:"0.55rem 0.9rem",borderBottom:`1px solid ${B.border}`,color:B.textSecondary,whiteSpace:"nowrap",fontSize:"0.72rem"}}>{r.dora?.handoverDate||"—"}</td>
                        <td style={{padding:"0.55rem 0.9rem",borderBottom:`1px solid ${B.border}`,color:B.textSecondary,whiteSpace:"nowrap",fontSize:"0.72rem"}}>{r.releaseActual||"—"}</td>
                        <td style={{padding:"0.55rem 0.9rem",borderBottom:`1px solid ${B.border}`,minWidth:140}}>
                          <div style={{display:"flex",alignItems:"center",gap:"0.55rem"}}>
                            <div style={{flex:1,height:6,borderRadius:99,background:B.border,overflow:"hidden"}}>
                              <div style={{width:`${barPct}%`,height:"100%",background:ltCol,borderRadius:99,transition:"width 0.4s"}}/>
                            </div>
                            <span style={{color:ltCol,fontWeight:800,fontSize:"0.78rem",minWidth:32,textAlign:"right"}}>{r.lt}d</span>
                          </div>
                        </td>
                        <td style={{padding:"0.55rem 0.9rem",borderBottom:`1px solid ${B.border}`,whiteSpace:"nowrap"}}>
                          <div style={{display:"flex",gap:"0.4rem"}}>
                            {r.jiraLink&&<a href={r.jiraLink} target="_blank" rel="noreferrer" style={{background:"#1a3a6b",color:"#93c5fd",border:"1px solid #2d5799",borderRadius:6,padding:"0.18rem 0.5rem",fontSize:"0.62rem",fontWeight:700,textDecoration:"none",whiteSpace:"nowrap"}}>Jira ↗</a>}
                            {r.rnLink&&<a href={r.rnLink} target="_blank" rel="noreferrer" style={{background:"#0d3320",color:B.lime,border:`1px solid ${B.lime}44`,borderRadius:6,padding:"0.18rem 0.5rem",fontSize:"0.62rem",fontWeight:700,textDecoration:"none",whiteSpace:"nowrap"}}>RN ↗</a>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ── This Week's Releases ── */}
      <div style={{background:B.bgCard,border:`1px solid ${B.border}`,borderRadius:16,padding:"1.5rem",marginBottom:"1.5rem"}}>
        <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem"}}>
          <span style={{color:B.textPrimary,fontSize:"0.95rem",fontWeight:700}}>This Week's Releases</span>
          <span style={{background:B.teal+"22",color:B.teal,border:`1px solid ${B.teal}44`,padding:"0.12rem 0.5rem",borderRadius:99,fontSize:"0.68rem",fontWeight:700}}>{weekReleases.length}</span>
        </div>
        <div style={{color:B.textMuted,fontSize:"0.7rem",marginBottom:"1rem"}}>{monday.toDateString()} — {sunday.toDateString()}</div>
        {weekReleases.length===0&&<div style={{color:B.textMuted,fontSize:"0.82rem",textAlign:"center",padding:"1.5rem 0"}}>No releases this week</div>}
        <div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
          {weekReleases.map(r=>(
            <div key={r.id} style={{display:"flex",alignItems:"center",gap:"0.6rem",background:"#0d0d0d",borderRadius:10,padding:"0.55rem 0.75rem",border:`1px solid ${B.border}`}}>
              {r.rnLink
                ?<a href={r.rnLink} target="_blank" rel="noreferrer" style={{background:B.teal+"22",color:B.teal,border:`1px solid ${B.teal}44`,padding:"0.18rem 0.55rem",borderRadius:99,fontSize:"0.7rem",fontWeight:700,whiteSpace:"nowrap",textDecoration:"none",flexShrink:0}}>{r.rn} ↗</a>
                :<span style={{background:B.teal+"22",color:B.teal,border:`1px solid ${B.teal}44`,padding:"0.18rem 0.55rem",borderRadius:99,fontSize:"0.7rem",fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>{r.rn}</span>}
              <span style={{color:B.textPrimary,fontSize:"0.8rem",fontWeight:600,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.summary}</span>
              <span style={{color:B.textMuted,fontSize:"0.7rem",flexShrink:0,whiteSpace:"nowrap"}}>{fmtDate(r.releaseActual||r.releasePlanned)}</span>
              <Chip label={r.type||"—"} color={TYPE_COLOR(r.type)} small/>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WeeklyBar({weeks,maxBar}){
  const [hov,setHov]=useState(null);
  const yMax=Math.max(Math.ceil(maxBar/1)*1,2);
  const yTicks=Array.from({length:yMax+1},(_,i)=>yMax-i);
  const CH=160,PB=40,PT=14;
  const DAY=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  return(
    <div style={{position:"relative",fontFamily:FONT}}>
      <div style={{display:"flex",gap:0}}>
        {/* Y-axis */}
        <div style={{display:"flex",flexDirection:"column",justifyContent:"space-between",height:CH+PT,paddingBottom:PB,paddingTop:PT,marginRight:6,flexShrink:0,minWidth:18}}>
          {yTicks.map(n=><span key={n} style={{color:B.textMuted,fontSize:"0.6rem",textAlign:"right",lineHeight:1}}>{n}</span>)}
        </div>
        {/* Chart area */}
        <div style={{flex:1,position:"relative",overflowX:"auto",overflowY:"visible"}}>
          {/* Grid lines */}
          <div style={{position:"absolute",top:PT,left:0,right:0,height:CH,pointerEvents:"none",zIndex:0}}>
            {yTicks.map((n,i)=>(
              <div key={n} style={{position:"absolute",left:0,right:0,top:`${(i/yMax)*CH}px`,borderTop:`1px solid ${i===yTicks.length-1?B.border2:B.border}`,opacity:i===yTicks.length-1?0.7:0.35}}/>
            ))}
          </div>
          {/* Bars row */}
          <div style={{display:"flex",alignItems:"flex-end",gap:3,height:CH+PT+PB,paddingBottom:PB,paddingTop:PT,position:"relative",zIndex:1,minWidth:weeks.length*44,overflow:"visible"}}>
            {weeks.map((w,i)=>{
              const dt=new Date(w.week);
              const dayName=DAY[dt.getDay()];
              const isWeekend=w.isWeekend||(dt.getDay()===0||dt.getDay()===6);
              const barH=w.total?(w.total/yMax)*CH:0;
              const feH=(w.featImp/yMax)*CH;
              const impH=(w.improvement/yMax)*CH;
              const paH=(w.patch/yMax)*CH;
              const buH=(w.bug/yMax)*CH;
              const barW=Math.max(38,Math.min(64,Math.floor(860/Math.max(weeks.length,1))-4));
              const dateLabel=dt.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
              // Badge sits 18px above the top of the bar, always visible
              const badgeBottom=PB+barH+2;
              return(
                <div key={i}
                  style={{flex:`0 0 ${barW}px`,display:"flex",flexDirection:"column",alignItems:"center",position:"relative",height:"100%",justifyContent:"flex-end",overflow:"visible"}}
                  onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}>
                  {/* Tooltip — anchored to top of chart area, not bar */}
                  {hov===i&&w.total>0&&(
                    <div style={{position:"absolute",bottom:PB+CH+10,left:"50%",transform:"translateX(-50%)",background:"#0d1f2d",border:`1px solid ${B.teal}55`,borderRadius:10,padding:"0.6rem 0.85rem",zIndex:30,pointerEvents:"none",minWidth:180,boxShadow:"0 12px 40px rgba(0,0,0,0.6)",whiteSpace:"nowrap"}}>
                      <div style={{color:B.teal,fontSize:"0.68rem",fontWeight:700,marginBottom:"0.3rem"}}>{dayName} {dateLabel}</div>
                      {[["Feature","#22c55e",w.featImp],["Improvement","#1d6fa4",w.improvement],["Patch","#a855f7",w.patch],["Bug","#ef4444",w.bug]].filter(([,,n])=>n>0).map(([l,col,n])=>(
                        <div key={l} style={{display:"flex",justifyContent:"space-between",gap:"1rem",marginBottom:"0.15rem"}}>
                          <div style={{display:"flex",alignItems:"center",gap:"0.35rem"}}><div style={{width:7,height:7,borderRadius:2,background:col}}/><span style={{color:B.textSecondary,fontSize:"0.72rem"}}>{l}</span></div>
                          <span style={{color:col,fontWeight:700,fontSize:"0.72rem"}}>{n}</span>
                        </div>
                      ))}
                      <div style={{borderTop:`1px solid ${B.border}`,marginTop:"0.4rem",paddingTop:"0.35rem"}}>
                        {w.releases.slice(0,4).map(r=>(
                          <div key={r.id} style={{display:"flex",gap:"0.4rem",marginBottom:"0.12rem"}}>
                            <span style={{color:B.teal,fontSize:"0.63rem",fontWeight:700,flexShrink:0}}>{r.rn}</span>
                            <span style={{color:B.textMuted,fontSize:"0.63rem",maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.summary}</span>
                          </div>
                        ))}
                        {w.releases.length>4&&<div style={{color:B.textMuted,fontSize:"0.6rem",marginTop:"0.1rem"}}>+{w.releases.length-4} more</div>}
                      </div>
                    </div>
                  )}
                  {/* Count badge — always above the bar, overflow:visible so never clipped */}
                  {w.total>0&&(
                    <div style={{
                      position:"absolute",
                      bottom:badgeBottom,
                      left:"50%",transform:"translateX(-50%)",
                      fontSize:"0.63rem",fontWeight:800,
                      color:B.textPrimary,
                      background:"#0a1824",
                      border:`1px solid ${B.border2}`,
                      borderRadius:4,padding:"1px 5px",
                      whiteSpace:"nowrap",zIndex:10,
                      lineHeight:"1.4"
                    }}>{w.total}</div>
                  )}
                  {/* Stacked bar */}
                  <div style={{width:"72%",display:"flex",flexDirection:"column",justifyContent:"flex-end",height:Math.max(barH,w.total?4:0),borderRadius:"4px 4px 0 0",overflow:"hidden",opacity:hov===i?1:isWeekend?0.65:0.85,transition:"opacity 0.15s",background:w.total===0?"transparent":""}}>
                    {w.bug>0&&<div style={{height:`${buH}px`,background:"#ef4444",flexShrink:0}}/>}
                    {w.patch>0&&<div style={{height:`${paH}px`,background:"#a855f7",flexShrink:0}}/>}
                    {w.improvement>0&&<div style={{height:`${impH}px`,background:"#1d6fa4",flexShrink:0}}/>}
                    {w.featImp>0&&<div style={{height:`${feH}px`,background:"#22c55e",flexShrink:0}}/>}
                  </div>
                  {/* X-axis label */}
                  <div style={{position:"absolute",bottom:0,textAlign:"center",width:barW,lineHeight:1.25}}>
                    <div style={{fontSize:"0.58rem",fontWeight:700,color:isWeekend?B.textMuted+"88":B.textSecondary}}>{dayName}</div>
                    <div style={{fontSize:"0.55rem",color:B.textMuted}}>{dateLabel}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* Legend */}
      <div style={{display:"flex",gap:"1.25rem",marginTop:"0.5rem",paddingLeft:28}}>
        {[["feature","#22c55e"],["improvement","#1d6fa4"],["patch","#a855f7"],["bug","#ef4444"]].map(([l,col])=>(
          <div key={l} style={{display:"flex",alignItems:"center",gap:"0.3rem"}}>
            <div style={{width:12,height:3,background:col,borderRadius:2}}/>
            <span style={{color:B.textMuted,fontSize:"0.65rem"}}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DailyBar({days,maxBar}){
  const [hov,setHov]=useState(null);
  return(<div style={{position:"relative"}}>
    <div style={{display:"flex",alignItems:"flex-end",gap:"3px",height:160,paddingBottom:28,overflowX:"auto"}}>
      {days.map((d,i)=>(
        <div key={i} style={{flex:"0 0 auto",width:22,display:"flex",flexDirection:"column",alignItems:"center",cursor:"pointer",position:"relative"}} onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}>
          {hov===i&&d.total>0&&(<div style={{position:"absolute",bottom:"100%",left:"50%",transform:"translateX(-50%)",background:B.bgPanel,border:`1px solid ${B.border2}`,borderRadius:8,padding:"0.4rem 0.6rem",zIndex:10,pointerEvents:"none",minWidth:100,marginBottom:4}}>
            <div style={{color:B.textPrimary,fontSize:"0.7rem",fontWeight:700,marginBottom:"0.2rem"}}>{d.date}</div>
            {[["Feat/Imp","#22c55e",d.featImp],["Patch","#f97316",d.patch],["Bug","#ef4444",d.bug]].filter(([,,c])=>c>0).map(([l,c,cnt])=><div key={l} style={{display:"flex",justifyContent:"space-between",gap:"0.5rem"}}><span style={{color:B.textMuted,fontSize:"0.68rem"}}>{l}</span><span style={{color:c,fontSize:"0.68rem",fontWeight:700}}>{cnt}</span></div>)}
          </div>)}
          <div style={{width:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end",height:130,borderRadius:"4px 4px 0 0",overflow:"hidden"}}>
            {d.featImp>0&&<div style={{height:`${(d.featImp/maxBar)*130}px`,background:"#22c55e",opacity:hov===i?1:0.8}}/>}
            {d.patch>0&&<div style={{height:`${(d.patch/maxBar)*130}px`,background:"#f97316",opacity:hov===i?1:0.8}}/>}
            {d.bug>0&&<div style={{height:`${(d.bug/maxBar)*130}px`,background:"#ef4444",opacity:hov===i?1:0.8}}/>}
            {d.total===0&&<div style={{height:2,background:B.border}}/>}
          </div>
          {d.label&&<div style={{position:"absolute",bottom:0,left:"50%",transform:"translateX(-50%)",color:B.textMuted,fontSize:"7px",whiteSpace:"pre",textAlign:"center",lineHeight:1.3}}>{d.label}</div>}
        </div>
      ))}
    </div>
  </div>);
}

// ─── STORAGE HELPERS ──────────────────────────────────────────────────────────
const STORAGE_KEY = "datman_releases_v4"; // bumped to clear corrupted data from prev builds
const SEED_DATA = [{
  id: 1, rn: "", summary: "Import your CSV to get started",
  type: "New Feature", priority: "P1", status: "Planning",
  releasePlanned: "", releaseActual: "", team: "Gateway",
  rnLinks: [], rnLink: "", jiraLinks: [], jiraLink: "",
  goal: "", modules: ["Payments"],
  approvals: {}, approvalRaw: {},
  dora: { leadDeveloper: "", application: "", services: "", handoverDate: "" }
}];