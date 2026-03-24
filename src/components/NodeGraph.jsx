import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { B,FONT,FONT_DISPLAY,PRIORITIES,MODULES,RELEASE_TYPES,STATUSES,GATEWAY_MODULES,APP_MODULES,APPROVER_NAMES,STATUS_COLORS,PRIORITY_COLORS,TYPE_COLORS,TYPE_COLOR,inputStyle,primaryBtn,tdSt,parseDDMMYYYY,daysBetween,leadTimeDays,fmtDate,Chip,StatusBadge,Field,SectionLabel,LogoMark,CalendarPicker } from "./shared.jsx";
export default function NodeGraphView({releases, graphFilter=""}){
  const canvasRef=useRef(null);
  const [tooltip,setTooltip]=useState(null);
  const [tooltipPos,setTooltipPos]=useState({x:0,y:0});
  const nodesRef=useRef([]);
  const animRef=useRef(null);
  const dragging=useRef(null);
  const [,fu]=useState(0);
  const hideTimer=useRef(null);
  const overCard=useRef(false);

  const showTooltip=(release,pos)=>{
    if(hideTimer.current){clearTimeout(hideTimer.current);hideTimer.current=null;}
    setTooltip(release);setTooltipPos(pos);
  };
  const scheduleHide=()=>{
    if(overCard.current)return;
    if(hideTimer.current)clearTimeout(hideTimer.current);
    hideTimer.current=setTimeout(()=>{if(!overCard.current)setTooltip(null);},450);
  };

  useEffect(()=>{const el=canvasRef.current?.parentElement;const W=el?.clientWidth||900,H=el?.clientHeight||600,cx=W/2,cy=H/2;
    // When searching: show only matched release + its modules + hub
    const q=(graphFilter||"").toLowerCase().trim();
    const visibleRels=q?releases.filter(r=>(r.rn||"").toLowerCase().includes(q)||(r.summary||"").toLowerCase().includes(q)):releases;
    const ms=[...new Set(visibleRels.flatMap(r=>r.modules))];
    const nodes=[];nodes.push({id:"hub",label:"Releases",type:"hub",x:cx,y:cy,vx:0,vy:0,r:30});ms.forEach((m,i)=>{const a=(i/ms.length)*Math.PI*2;nodes.push({id:`mod_${m}`,label:m,type:"module",x:cx+Math.cos(a)*185,y:cy+Math.sin(a)*185,vx:0,vy:0,r:20});});visibleRels.forEach((r,i)=>{const a=(i/visibleRels.length)*Math.PI*2+0.4,d=300+(i%4)*35;nodes.push({id:`rel_${r.id}`,label:r.rn,type:"release",release:r,x:cx+Math.cos(a)*d,y:cy+Math.sin(a)*d,vx:0,vy:0,r:12+(r.priority==="Hotfix"?7:r.priority==="P1"?4:0)});});nodesRef.current=nodes;fu(n=>n+1);},[releases,graphFilter]);

  const getEdges=()=>{const q=(graphFilter||"").toLowerCase().trim();const visRels=q?releases.filter(r=>(r.rn||"").toLowerCase().includes(q)||(r.summary||"").toLowerCase().includes(q)):releases;const e=[],s=new Set();visRels.forEach(r=>{r.modules.forEach(m=>{const src=nodesRef.current.find(n=>n.id===`rel_${r.id}`),dst=nodesRef.current.find(n=>n.id===`mod_${m}`);if(src&&dst){const k=[src.id,dst.id].sort().join("|");if(!s.has(k)){e.push({src,dst,type:"rel-mod"});s.add(k);}}});});const hub=nodesRef.current.find(n=>n.id==="hub");nodesRef.current.filter(n=>n.type==="module").forEach(m=>{const k=["hub",m.id].sort().join("|");if(!s.has(k)){e.push({src:hub,dst:m,type:"mod-hub"});s.add(k);}});return e;};

  useEffect(()=>{const tick=()=>{const nodes=nodesRef.current;if(!nodes.length){animRef.current=requestAnimationFrame(tick);return;}const edges=getEdges(),W=canvasRef.current?.width||900,H=canvasRef.current?.height||600;for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i],b=nodes[j],dx=a.x-b.x,dy=a.y-b.y,dist=Math.sqrt(dx*dx+dy*dy)||1,min=(a.r+b.r)*3.5;if(dist<min){const f=(min-dist)/dist*0.08;a.vx+=dx*f;a.vy+=dy*f;b.vx-=dx*f;b.vy-=dy*f;}}edges.forEach(({src,dst,type})=>{const dx=dst.x-src.x,dy=dst.y-src.y,dist=Math.sqrt(dx*dx+dy*dy)||1,f=(dist-(type==="mod-hub"?185:155))/dist*0.03;if(src.id!=="hub"){src.vx+=dx*f;src.vy+=dy*f;}if(dst.id!=="hub"){dst.vx-=dx*f;dst.vy-=dy*f;}});nodes.forEach(n=>{if(n.id==="hub")return;n.vx+=(W/2-n.x)*0.002;n.vy+=(H/2-n.y)*0.002;});nodes.forEach(n=>{if(dragging.current===n.id)return;n.vx*=0.85;n.vy*=0.85;n.x+=n.vx;n.y+=n.vy;n.x=Math.max(n.r+10,Math.min(W-n.r-10,n.x));n.y=Math.max(n.r+10,Math.min(H-n.r-10,n.y));});draw();animRef.current=requestAnimationFrame(tick);};animRef.current=requestAnimationFrame(tick);return()=>cancelAnimationFrame(animRef.current);},[releases]);

  const draw=()=>{const canvas=canvasRef.current;if(!canvas)return;const ctx=canvas.getContext("2d");ctx.clearRect(0,0,canvas.width,canvas.height);
    const _term=graphFilter.trim().toLowerCase();
    getEdges().forEach(({src,dst,type})=>{
      let edgeAlpha=1;
      if(_term&&type==="rel-mod"){
        const rel=src.type==="release"?src.release:dst.type==="release"?dst.release:null;
        const matched=rel&&((rel.rn||"").toLowerCase().includes(_term)||(rel.summary||"").toLowerCase().includes(_term));
        edgeAlpha=matched?1:0.05;
      }
      ctx.globalAlpha=edgeAlpha;
      ctx.beginPath();ctx.moveTo(src.x,src.y);ctx.lineTo(dst.x,dst.y);
      ctx.strokeStyle=type==="mod-hub"?"rgba(14,165,200,0.35)":"rgba(34,211,238,0.2)";
      ctx.lineWidth=type==="mod-hub"?1.5:1;ctx.setLineDash(type==="rel-mod"?[4,4]:[]);
      ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
    });nodesRef.current.forEach(n=>{ctx.save();if(n.type==="hub"){[[38,B.teal+"66",6],[28,B.cyan+"55",5],[18,B.lime+"66",4]].forEach(([r,col,lw])=>{ctx.beginPath();ctx.arc(n.x,n.y,r,0,Math.PI*2);ctx.strokeStyle=col;ctx.lineWidth=lw;ctx.stroke();});ctx.beginPath();ctx.arc(n.x,n.y,8,0,Math.PI*2);const g=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,8);g.addColorStop(0,B.cyan);g.addColorStop(1,B.blue);ctx.fillStyle=g;ctx.fill();ctx.fillStyle=B.textSecondary;ctx.font="bold 9px 'DM Sans',sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("HUB",n.x,n.y+42);}else if(n.type==="module"){const isGW=GATEWAY_MODULES.includes(n.label),isApp=APP_MODULES.includes(n.label),rc=isGW?B.teal:isApp?B.lime:B.cyan;ctx.beginPath();ctx.arc(n.x,n.y,n.r+5,0,Math.PI*2);ctx.strokeStyle=rc+"33";ctx.lineWidth=2;ctx.stroke();ctx.beginPath();ctx.arc(n.x,n.y,n.r,0,Math.PI*2);const g=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r);g.addColorStop(0,B.deepBlue);g.addColorStop(1,"#0d0d0d");ctx.fillStyle=g;ctx.strokeStyle=rc;ctx.lineWidth=1.5;ctx.fill();ctx.stroke();ctx.fillStyle=rc;ctx.font="bold 8px 'DM Sans',sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(n.label.slice(0,4),n.x,n.y);ctx.fillStyle=B.textSecondary;ctx.font="bold 9px 'DM Sans',sans-serif";ctx.fillText(n.label,n.x,n.y+n.r+13);}else{
        const term=graphFilter.trim().toLowerCase();
        const matched=!term||(n.release.rn||"").toLowerCase().includes(term)||(n.release.summary||"").toLowerCase().includes(term);
        ctx.globalAlpha=matched?1:0.08;
        const c=TYPE_COLOR(n.release.type);
        ctx.shadowColor=matched?c:"transparent";ctx.shadowBlur=matched?12:0;
        ctx.beginPath();ctx.arc(n.x,n.y,n.r,0,Math.PI*2);
        const g=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r);
        g.addColorStop(0,c+"55");g.addColorStop(1,c+"11");
        ctx.fillStyle=g;ctx.strokeStyle=matched?c:c+"44";ctx.lineWidth=matched?2:1;
        ctx.fill();ctx.stroke();ctx.shadowBlur=0;
        ctx.fillStyle=matched?"#fff":"rgba(255,255,255,0.3)";
        ctx.font="bold 6.5px 'DM Sans',sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.fillText(n.label.slice(0,9),n.x,n.y);
        if(matched){const pc=PRIORITY_COLORS[n.release.priority]||B.textMuted;ctx.beginPath();ctx.arc(n.x+n.r-4,n.y-n.r+4,4,0,Math.PI*2);ctx.fillStyle=pc;ctx.shadowColor=pc;ctx.shadowBlur=6;ctx.fill();ctx.shadowBlur=0;}
        ctx.globalAlpha=1;
      }ctx.restore();});};

  const getNodeAt=(x,y)=>nodesRef.current.find(n=>{const dx=n.x-x,dy=n.y-y;return Math.sqrt(dx*dx+dy*dy)<n.r+6;});

  const handleMouseMove=e=>{
    const rect=canvasRef.current.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
    if(dragging.current){const nd=nodesRef.current.find(n=>n.id===dragging.current);if(nd){nd.x=x;nd.y=y;nd.vx=0;nd.vy=0;}return;}
    const node=getNodeAt(x,y);
    if(node?.type==="release"){showTooltip(node.release,{x:e.clientX,y:e.clientY});}
    else{scheduleHide();}
  };

  return(
    <div style={{position:"relative",width:"100%",height:"calc(100vh - 112px)"}}>
      <canvas ref={canvasRef}
        width={typeof window!=="undefined"?window.innerWidth-40:900}
        height={typeof window!=="undefined"?window.innerHeight-112:600}
        onMouseMove={handleMouseMove}
        onMouseDown={e=>{const r=canvasRef.current.getBoundingClientRect();const n=getNodeAt(e.clientX-r.left,e.clientY-r.top);if(n)dragging.current=n.id;else setTooltip(null);}}
        onMouseUp={()=>{dragging.current=null;}}
        onMouseLeave={()=>{dragging.current=null;scheduleHide();}}
        style={{display:"block",cursor:"crosshair",touchAction:"none"}}/>

      {/* Legend with counts + search result indicator */}
      {(()=>{
        const term=graphFilter.trim().toLowerCase();
        const fi=releases.filter(r=>r.type==="New Feature"||r.type==="Improvement").length;
        const pt=releases.filter(r=>r.type==="Patch").length;
        const bg=releases.filter(r=>r.type==="Bug").length;
        const matchCount=term?releases.filter(r=>(r.rn||"").toLowerCase().includes(term)||(r.summary||"").toLowerCase().includes(term)).length:null;
        return(
          <div style={{position:"absolute",bottom:16,left:16,background:B.bgCard,border:`1px solid ${term?B.teal:B.border}`,borderRadius:12,padding:"0.65rem 0.9rem",fontFamily:"'DM Sans',sans-serif",minWidth:140,transition:"border-color 0.2s"}}>
            {term&&(
              <div style={{marginBottom:"0.45rem",paddingBottom:"0.35rem",borderBottom:`1px solid ${B.border}`}}>
                <span style={{color:matchCount>0?B.teal:"#ef4444",fontSize:"0.65rem",fontWeight:800}}>
                  {matchCount>0?`${matchCount} match${matchCount>1?"es":""}`:"> No matches"}
                </span>
              </div>
            )}
            {[["Feature/Imp",TYPE_COLORS["New Feature"],fi],["Patch",TYPE_COLORS["Patch"],pt],["Bug",TYPE_COLORS["Bug"],bg]].map(([l,col,cnt])=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:"0.4rem",marginBottom:"0.25rem"}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:col,flexShrink:0}}/>
                <span style={{color:B.textSecondary,fontSize:"0.65rem",flex:1}}>{l}</span>
                <span style={{color:col,fontSize:"0.65rem",fontWeight:800,minWidth:20,textAlign:"right"}}>{cnt}</span>
              </div>
            ))}
            <div style={{borderTop:`1px solid ${B.border}`,marginTop:"0.3rem",paddingTop:"0.3rem",color:B.textMuted,fontSize:"0.58rem"}}>Drag · Hover to inspect</div>
          </div>
        );
      })()}

      {/* Hover card */}
      {tooltip&&(()=>{
        const pc=PRIORITY_COLORS[tooltip.priority]||B.textMuted;
        const sc=STATUS_COLORS[tooltip.status]||B.textMuted;
        const isGW=tooltip.modules?.some(m=>GATEWAY_MODULES.includes(m));
        const mc=isGW?B.teal:B.lime;
        const fmtDate=d=>{
          if(!d)return"—";const dt=new Date(d);
          return isNaN(dt)?"—":dt.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});
        };
        const cardW=290;
        const left=tooltipPos.x+14+cardW>window.innerWidth?tooltipPos.x-cardW-10:tooltipPos.x+14;
        const top=Math.min(Math.max(tooltipPos.y-14,8),window.innerHeight-400);
        // Jira: prefer jiraLink field, fall back to dora.originalRNLink if it looks like a URL
        const rawJira=(tooltip.jiraLink&&tooltip.jiraLink.trim())||
                      (tooltip.dora?.originalRNLink&&tooltip.dora.originalRNLink!=="NA"&&tooltip.dora.originalRNLink!=""?tooltip.dora.originalRNLink:null);
        const jiraLink=rawJira&&(rawJira.startsWith("http")||rawJira.startsWith("/"))?rawJira:null;
        const rnLink=(tooltip.rnLink&&tooltip.rnLink.trim())||null;
        return(
          <div
            onMouseEnter={()=>{overCard.current=true;if(hideTimer.current){clearTimeout(hideTimer.current);hideTimer.current=null;}}}
            onMouseLeave={()=>{overCard.current=false;scheduleHide();}}
            style={{
              position:"fixed",left,top,zIndex:1000,pointerEvents:"auto",
              background:"#0d0d0d",
              border:`1px solid ${B.border2}`,borderRadius:14,
              padding:"0.95rem 1.05rem",width:cardW,
              boxShadow:"0 16px 48px rgba(0,0,0,0.78)",
              fontFamily:"'DM Sans',sans-serif"
            }}>
            {/* Accent bar */}
            <div style={{position:"absolute",top:0,left:0,right:0,height:"2px",borderRadius:"14px 14px 0 0",background:`linear-gradient(90deg,${mc},${B.blue}44)`}}/>

            {/* Header */}
            <div style={{display:"flex",alignItems:"center",gap:"0.35rem",marginBottom:"0.7rem",marginTop:"0.05rem"}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:mc,boxShadow:`0 0 5px ${mc}88`,flexShrink:0}}/>
              <span style={{color:mc,fontWeight:700,fontSize:"0.72rem",letterSpacing:"0.04em",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textTransform:"uppercase"}}>
                {tooltip.modules?.join(" · ")||"—"}
              </span>
              <button onClick={()=>{setTooltip(null);overCard.current=false;}}
                style={{background:"transparent",border:"none",color:B.textMuted,cursor:"pointer",
                  fontSize:"0.68rem",padding:"0.1rem 0.2rem",fontFamily:"'DM Sans',sans-serif",
                  borderRadius:4,flexShrink:0,lineHeight:1}}>✕</button>
            </div>

            {/* Data rows */}
            {[
              ["Task",        <span style={{color:B.textPrimary,fontWeight:600,fontSize:"0.72rem",lineHeight:1.4}}>{tooltip.summary}</span>],
              ["Goal",        <span style={{color:B.textSecondary,fontSize:"0.69rem",lineHeight:1.4}}>{tooltip.goal||"—"}</span>],
              ["Priority",    <span style={{background:pc+"1a",color:pc,border:`1px solid ${pc}2e`,padding:"0.08rem 0.42rem",borderRadius:99,fontSize:"0.62rem",fontWeight:700,letterSpacing:"0.04em"}}>{tooltip.priority||"—"}</span>],
              ["Released Date",<span style={{color:B.textPrimary,fontSize:"0.69rem",fontWeight:500}}>{fmtDate(tooltip.releaseActual||tooltip.releasePlanned)}</span>],
              ["Status",      <span style={{display:"inline-flex",alignItems:"center",gap:"0.22rem",background:sc+"1a",color:sc,border:`1px solid ${sc}2e`,padding:"0.08rem 0.45rem",borderRadius:99,fontSize:"0.62rem",fontWeight:700}}>
                                <span style={{width:4,height:4,borderRadius:"50%",background:sc,flexShrink:0,display:"inline-block"}}/>
                                {tooltip.status}
                              </span>],
              ["Modules",     <span style={{color:B.teal,fontSize:"0.69rem",fontWeight:600}}>{tooltip.modules?.join(", ")||"—"}</span>],
              ["Approved By",(()=>{const names=getApprovedNames(tooltip);return names.length
                  ?<span style={{color:B.lime,fontWeight:700,fontSize:"0.69rem"}}>{names.join(", ")}</span>
                  :<span style={{color:B.textMuted,fontSize:"0.65rem"}}>—</span>;})()],
            ].map(([label,val])=>(
              <div key={label} style={{display:"grid",gridTemplateColumns:"82px 1fr",columnGap:"0.5rem",alignItems:"center",marginBottom:"0.3rem",minHeight:"1.5rem"}}>
                <span style={{color:B.textMuted,fontSize:"0.62rem",letterSpacing:"0.02em",whiteSpace:"nowrap",lineHeight:1.4,alignSelf:"start",paddingTop:"0.15rem"}}>{label}</span>
                <span style={{fontSize:"0.69rem",lineHeight:1.4,wordBreak:"break-word",alignSelf:"start",paddingTop:"0.05rem"}}>{val}</span>
              </div>
            ))}

            {/* Divider */}
            <div style={{borderTop:`1px solid ${B.border}`,margin:"0.65rem 0 0.6rem"}}/>

            {/* Buttons */}
            <div style={{display:"flex",gap:"0.45rem"}}>
              {jiraLink
                ?<a href={jiraLink} target="_blank" rel="noreferrer"
                    style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:"0.3rem",
                      background:"#0f2d52",color:"#60a5fa",border:"1px solid #1e4a8044",
                      borderRadius:9,padding:"0.42rem 0.35rem",textDecoration:"none",
                      fontSize:"0.64rem",fontWeight:700,letterSpacing:"0.03em",fontFamily:"'DM Sans',sans-serif"}}>
                    <span style={{fontSize:"0.75rem"}}>⎇</span>Jira Link
                  </a>
                :<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:"0.3rem",
                    background:"#0d0d0d",color:B.textMuted,border:`1px solid ${B.border}`,
                    borderRadius:9,padding:"0.42rem 0.35rem",
                    fontSize:"0.64rem",fontWeight:600,opacity:0.38,cursor:"not-allowed",letterSpacing:"0.03em"}}>
                    <span style={{fontSize:"0.75rem"}}>⎇</span>Jira Link
                  </div>
              }
              {rnLink
                ?<a href={rnLink} target="_blank" rel="noreferrer"
                    style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:"0.3rem",
                      background:"#0a2618",color:B.lime,border:`1px solid ${B.lime}33`,
                      borderRadius:9,padding:"0.42rem 0.35rem",textDecoration:"none",
                      fontSize:"0.64rem",fontWeight:700,letterSpacing:"0.03em",fontFamily:"'DM Sans',sans-serif"}}>
                    <span style={{fontSize:"0.75rem"}}>📄</span>RN Link
                  </a>
                :<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:"0.3rem",
                    background:"#0d0d0d",color:B.textMuted,border:`1px solid ${B.border}`,
                    borderRadius:9,padding:"0.42rem 0.35rem",
                    fontSize:"0.64rem",fontWeight:600,opacity:0.38,cursor:"not-allowed",letterSpacing:"0.03em"}}>
                    <span style={{fontSize:"0.75rem"}}>📄</span>RN Link
                  </div>
              }
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── ANALYTICS PAGE ───────────────────────────────────────────────────────────