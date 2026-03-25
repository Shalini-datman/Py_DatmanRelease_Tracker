import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { B,FONT,FONT_DISPLAY,PRIORITIES,MODULES,RELEASE_TYPES,STATUSES,GATEWAY_MODULES,APP_MODULES,APPROVER_NAMES,STATUS_COLORS,PRIORITY_COLORS,TYPE_COLORS,TYPE_COLOR,inputStyle,primaryBtn,tdSt,parseDDMMYYYY,daysBetween,leadTimeDays,fmtDate,Chip,StatusBadge,Field,SectionLabel,LogoMark,CalendarPicker } from "./shared.jsx";
export default function EditModal({release, onSave, onClose}){
  const [form, setForm] = useState({
    ...release,
    modules: release.modules||[],
    dora: {...(release.dora||{leadDeveloper:"",application:"",services:"",qa:"Done",originalRNLink:"NA",handoverDate:""})},
    approvals: {...(release.approvals||{Sandeep:false,Nitish:false,Pradeep:false,Muz:false,Sundar:false})},
  });
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const setDora=(k,v)=>setForm(f=>({...f,dora:{...f.dora,[k]:v}}));
  const toggle=m=>set("modules",form.modules.includes(m)?form.modules.filter(x=>x!==m):[...form.modules,m]);
  const empty=v=>!v||v===""||v==="NA"||(Array.isArray(v)&&!v.length);

  // Track which key fields are filled vs missing
  const checks = {
    "Summary":        !empty(form.summary),
    "Release Type":   !empty(form.type),
    "Planned Date":   !empty(form.releasePlanned),
    "Goal":           !empty(form.goal),
    "Modules":        !empty(form.modules),
    "Lead Developer": !empty(form.dora?.leadDeveloper),
    "Handover Date":  !empty(form.dora?.handoverDate),
  };
  const total = Object.keys(checks).length;
  const filled = Object.values(checks).filter(Boolean).length;
  const pct = Math.round((filled/total)*100);
  const allGood = filled===total;

  const SectionHead = ({label,sub})=>(
    <div style={{display:"flex",alignItems:"baseline",gap:"0.5rem",margin:"1.25rem 0 0.75rem"}}>
      <div style={{color:B.textSecondary,fontSize:"0.68rem",fontWeight:800,letterSpacing:"0.12em",textTransform:"uppercase"}}>{label}</div>
      {sub&&<div style={{color:B.textMuted,fontSize:"0.65rem"}}>{sub}</div>}
      <div style={{flex:1,height:1,background:B.border,marginLeft:"0.5rem"}}/>
    </div>
  );

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(5,14,22,0.9)",backdropFilter:"blur(10px)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem",fontFamily:FONT}} onClick={onClose}>
      <div style={{background:B.bgCard,border:`1px solid ${B.border2}`,borderRadius:20,width:"100%",maxWidth:740,maxHeight:"90vh",overflowY:"auto",padding:"1.5rem",position:"relative",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>

        {/* ── Header ── */}
        <div style={{display:"flex",alignItems:"flex-start",gap:"1rem",marginBottom:"1.25rem"}}>
          <div style={{flex:1}}>
            <div style={{color:B.teal,fontSize:"0.65rem",letterSpacing:"0.15em",textTransform:"uppercase",fontWeight:700,marginBottom:"0.2rem"}}>Edit Release</div>
            <div style={{color:B.textPrimary,fontWeight:800,fontSize:"1.3rem",letterSpacing:"-0.02em"}}>{form.rn||"—"} <span style={{color:B.textMuted,fontWeight:400,fontSize:"0.9rem"}}>{form.summary?.slice(0,40)}</span></div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:`1px solid ${B.border2}`,color:B.textMuted,borderRadius:8,padding:"0.4rem 0.9rem",cursor:"pointer",fontSize:"0.8rem",fontFamily:FONT,flexShrink:0}}>✕</button>
        </div>

        {/* ── Completion bar ── */}
        <div style={{background:"#0a0a0a",border:`1px solid ${allGood?B.lime+"44":B.teal+"44"}`,borderRadius:12,padding:"0.75rem 1rem",marginBottom:"1.25rem"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.45rem"}}>
            <span style={{color:allGood?B.lime:B.teal,fontSize:"0.72rem",fontWeight:700}}>
              {allGood?"✓ All key fields complete":`${filled} / ${total} key fields filled`}
            </span>
            <span style={{color:B.textMuted,fontSize:"0.68rem"}}>{pct}%</span>
          </div>
          <div style={{height:5,borderRadius:99,background:B.border,overflow:"hidden"}}>
            <div style={{height:"100%",width:pct+"%",borderRadius:99,background:allGood?B.lime:B.grad1,transition:"width 0.3s"}}/>
          </div>
          {!allGood&&(
            <div style={{display:"flex",flexWrap:"wrap",gap:"0.3rem",marginTop:"0.6rem"}}>
              {Object.entries(checks).filter(([,v])=>!v).map(([k])=>(
                <span key={k} style={{background:"#111111",border:`1px solid ${B.teal}44`,borderRadius:6,padding:"0.1rem 0.45rem",fontSize:"0.63rem",color:B.teal,fontWeight:600}}>● {k}</span>
              ))}
            </div>
          )}
        </div>

        {/* ── Core Details ── */}
        <SectionHead label="Core Details"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
          <Field label="Summary" highlight={empty(form.summary)}>
            <input value={form.summary||""} onChange={e=>set("summary",e.target.value)} style={{...inputStyle,borderColor:empty(form.summary)?B.teal+"88":B.border2}} placeholder="Brief description..."/>
          </Field>
          <Field label="RN">
            <input value={form.rn||""} onChange={e=>set("rn",e.target.value)} style={inputStyle}/>
          </Field>
          <Field label="Release Type" highlight={empty(form.type)}>
            <select value={form.type||""} onChange={e=>set("type",e.target.value)} style={{...inputStyle,borderColor:empty(form.type)?B.teal+"88":B.border2}}>
              <option value="">— select —</option>
              {RELEASE_TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select value={form.priority||"P2"} onChange={e=>set("priority",e.target.value)} style={inputStyle}>
              {PRIORITIES.map(p=><option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status||"Planning"} onChange={e=>set("status",e.target.value)} style={inputStyle}>
              {STATUSES.map(s=><option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="RN Links (up to 5)">
            <div style={{display:"flex",flexDirection:"column",gap:"0.35rem"}}>
              {Array.from({length:5}).map((_,li)=>{
                const links=form.rnLinks&&form.rnLinks.length?form.rnLinks:[form.rnLink||"","","","",""];
                const val=links[li]||"";
                const setLink=v=>{const arr=[...links];arr[li]=v;while(arr.length<5)arr.push("");set("rnLinks",arr.filter((_,idx)=>idx<5));if(li===0)set("rnLink",v);};
                return val||li===0?(
                  <div key={li} style={{display:"flex",alignItems:"center",gap:"0.4rem"}}>
                    <span style={{color:B.textMuted,fontSize:"0.65rem",fontWeight:700,flexShrink:0,width:14}}>{li+1}</span>
                    <input value={val} onChange={e=>setLink(e.target.value)} placeholder={li===0?"Primary RN link...":"Additional RN link..."} style={{...inputStyle,flex:1}}/>
                  </div>
                ):null;
              })}
              <button type="button" onClick={()=>{
                const links=(form.rnLinks&&form.rnLinks.length)?[...form.rnLinks]:([form.rnLink||""]);
                if(links.filter(Boolean).length<5) set("rnLinks",[...links,""]);
              }} style={{alignSelf:"flex-start",background:"transparent",border:`1px dashed ${B.border2}`,color:B.textMuted,borderRadius:7,padding:"0.18rem 0.7rem",cursor:"pointer",fontSize:"0.68rem",fontFamily:FONT}}>+ Add link</button>
            </div>
          </Field>
          <Field label="Planned Date" highlight={empty(form.releasePlanned)}>
            <input type="date" value={form.releasePlanned||""} onChange={e=>set("releasePlanned",e.target.value)} style={{...inputStyle,borderColor:empty(form.releasePlanned)?B.teal+"88":B.border2}}/>
          </Field>
          <Field label="Released Date">
            <input type="date" value={form.releaseActual||""} onChange={e=>set("releaseActual",e.target.value)} style={inputStyle}/>
          </Field>
        </div>

        <SectionHead label="Details"/>
        <Field label="Goal" highlight={empty(form.goal)}>
          <textarea value={form.goal||""} onChange={e=>set("goal",e.target.value)} rows={2} style={{...inputStyle,resize:"vertical",borderColor:empty(form.goal)?B.teal+"88":B.border2}} placeholder="What does this release achieve?"/>
        </Field>
        <div style={{marginTop:"1rem"}}>
          <Field label="Jira Links (up to 5)">
            <div style={{display:"flex",flexDirection:"column",gap:"0.35rem"}}>
              {Array.from({length:5}).map((_,li)=>{
                const links=form.jiraLinks&&form.jiraLinks.length?form.jiraLinks:[form.jiraLink||"","","","",""];
                const val=links[li]||"";
                const setLink=v=>{const arr=[...links];arr[li]=v;while(arr.length<5)arr.push("");set("jiraLinks",arr.filter((_,idx)=>idx<5));if(li===0)set("jiraLink",v);};
                return val||li===0?(
                  <div key={li} style={{display:"flex",alignItems:"center",gap:"0.4rem"}}>
                    <span style={{color:B.textMuted,fontSize:"0.65rem",fontWeight:700,flexShrink:0,width:14}}>{li+1}</span>
                    <input value={val} onChange={e=>setLink(e.target.value)} placeholder={li===0?"Primary Jira link...":"Additional Jira link..."} style={{...inputStyle,flex:1}}/>
                  </div>
                ):null;
              })}
              <button type="button" onClick={()=>{
                const links=(form.jiraLinks&&form.jiraLinks.length)?[...form.jiraLinks]:([form.jiraLink||""]);
                if(links.filter(Boolean).length<5) set("jiraLinks",[...links,""]);
              }} style={{alignSelf:"flex-start",background:"transparent",border:`1px dashed ${B.border2}`,color:B.textMuted,borderRadius:7,padding:"0.18rem 0.7rem",cursor:"pointer",fontSize:"0.68rem",fontFamily:FONT}}>+ Add link</button>
            </div>
          </Field>
        </div>

        <SectionHead label="Modules" highlight={empty(form.modules)}/>
        <div style={{display:"flex",flexWrap:"wrap",gap:"0.5rem",marginBottom:"0.25rem"}}>
          {MODULES.map(m=>{const on=form.modules.includes(m);return(
            <button key={m} type="button" onClick={()=>toggle(m)} style={{padding:"0.38rem 1rem",borderRadius:99,fontSize:"0.82rem",fontWeight:600,cursor:"pointer",transition:"all 0.15s",background:on?B.grad1:"#0d0d0d",color:on?"#fff":B.textMuted,border:`1px solid ${on?"transparent":empty(form.modules)?B.teal+"55":B.border2}`,fontFamily:FONT}}>
              {on&&"✓ "}{m}
            </button>
          );})}
        </div>
        {empty(form.modules)&&<div style={{color:B.teal,fontSize:"0.68rem",marginTop:"0.3rem",opacity:0.8}}>Select at least one module</div>}

        <SectionHead label="Approvals" sub="Toggle who has approved this release"/>
        <div style={{display:"flex",flexWrap:"wrap",gap:"0.5rem"}}>
          {APPROVER_NAMES.map(n=>{const on=form.approvals?.[n]===true;return(
            <button key={n} type="button" onClick={()=>set("approvals",{...form.approvals,[n]:!on})}
              style={{padding:"0.38rem 1rem",borderRadius:99,fontSize:"0.82rem",fontWeight:700,cursor:"pointer",transition:"all 0.15s",background:on?"linear-gradient(135deg,#22c55e,#16a34a)":"#0d0d0d",color:on?"#fff":B.textMuted,border:`1px solid ${on?"transparent":B.border2}`,fontFamily:FONT}}>
              {on?"✓ ":""}{n}
            </button>
          );})}
        </div>

        {/* ── DORA ── */}
        <SectionHead label="DORA Matrix" sub="deployment metrics"/>
        <div style={{background:"#080808",border:`1px solid ${B.border}`,borderRadius:12,padding:"1.25rem"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
            <Field label="Lead Developer" highlight={empty(form.dora?.leadDeveloper)}>
              <input value={form.dora?.leadDeveloper||""} onChange={e=>setDora("leadDeveloper",e.target.value)} style={{...inputStyle,borderColor:empty(form.dora?.leadDeveloper)?B.teal+"88":B.border2}}/>
            </Field>
            <Field label="Application">
              <input value={form.dora?.application||""} onChange={e=>setDora("application",e.target.value)} style={inputStyle}/>
            </Field>
            <Field label="Services">
              <input value={form.dora?.services||""} onChange={e=>setDora("services",e.target.value)} style={inputStyle}/>
            </Field>
            <Field label="Handover Date" highlight={empty(form.dora?.handoverDate)}>
              <input type="date"
                value={(()=>{
                  const v=form.dora?.handoverDate||"";
                  // Convert DD/MM/YYYY → YYYY-MM-DD for the date input
                  if(/^\d{2}\/\d{2}\/\d{4}$/.test(v)){const[d,m,y]=v.split("/");return`${y}-${m}-${d}`;}
                  return v;
                })()}
                onChange={e=>{
                  const v=e.target.value; // YYYY-MM-DD from browser
                  if(/^\d{4}-\d{2}-\d{2}$/.test(v)){
                    const[y,m,d]=v.split("-");
                    setDora("handoverDate",`${d}/${m}/${y}`); // store as DD/MM/YYYY
                  } else { setDora("handoverDate",v); }
                }}
                style={{...inputStyle,colorScheme:"dark",borderColor:empty(form.dora?.handoverDate)?B.teal+"88":B.border2}}/>
            </Field>
          </div>
          {form.dora?.handoverDate&&form.releaseActual&&(()=>{
            const lt=leadTimeDays(form.dora.handoverDate,form.releaseActual);
            return lt!==null&&(
              <div style={{marginTop:"0.75rem",display:"flex",alignItems:"center",gap:"0.75rem",background:"#111111",borderRadius:8,padding:"0.5rem 0.9rem"}}>
                <span style={{color:B.textMuted,fontSize:"0.75rem"}}>Lead Time:</span>
                <span style={{color:B.lime,fontWeight:800,fontSize:"1rem"}}>{lt} days</span>
              </div>
            );
          })()}
        </div>

        {/* ── Actions — sticky bottom ── */}
        <div style={{display:"flex",gap:"0.75rem",marginTop:"1.5rem",paddingTop:"1rem",borderTop:`1px solid ${B.border2}`,position:"sticky",bottom:0,background:B.bgCard,zIndex:10}}>
          <button onClick={onClose}
            style={{height:42,flex:1,background:"transparent",color:B.textMuted,border:`1px solid ${B.border2}`,borderRadius:10,cursor:"pointer",fontSize:"0.82rem",fontWeight:700,fontFamily:FONT}}>
            Cancel
          </button>
          <button onClick={()=>onSave(form)}
            style={{height:42,flex:1,background:allGood?`linear-gradient(135deg,${B.lime},#16a34a)`:B.grad1,border:"none",borderRadius:10,cursor:"pointer",fontSize:"0.82rem",fontWeight:800,color:"#fff",fontFamily:FONT}}>
            {allGood?"✓ Save Changes":"Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── REUSABLE PAGINATION BAR ─────────────────────────────────────────────────