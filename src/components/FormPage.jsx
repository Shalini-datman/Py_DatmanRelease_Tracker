import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { B,FONT,FONT_DISPLAY,PRIORITIES,MODULES,RELEASE_TYPES,STATUSES,GATEWAY_MODULES,APP_MODULES,APPROVER_NAMES,STATUS_COLORS,PRIORITY_COLORS,TYPE_COLORS,TYPE_COLOR,inputStyle,primaryBtn,tdSt,parseDDMMYYYY,daysBetween,leadTimeDays,fmtDate,Chip,StatusBadge,Field,SectionLabel,LogoMark,CalendarPicker,isApproved } from "./shared.jsx";
function FField({label,error,optional,acc,children}){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:"0.45rem"}}>
      <label style={{color:error?"#f87171":acc||"#0ea5c8",fontSize:"0.72rem",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:FONT_DISPLAY,display:"flex",alignItems:"center",gap:"0.5rem"}}>
        {label}
        {optional&&<span style={{color:"rgba(255,255,255,0.25)",fontWeight:400,textTransform:"none",letterSpacing:0,fontSize:"0.66rem"}}>(optional)</span>}
        {error&&<span style={{color:"#f87171",fontWeight:400,textTransform:"none",letterSpacing:0,fontSize:"0.66rem"}}>— {error}</span>}
      </label>
      {children}
    </div>
  );
}

// ─── FORM PAGE (2 steps) ──────────────────────────────────────────────────────
// fInput defined OUTSIDE component — stable object reference, no remount
const FORM_INPUT_STYLE = {
  background:"rgba(255,255,255,0.05)",
  border:"1px solid rgba(255,255,255,0.12)",
  borderRadius:12, color:"#fff", fontFamily:"'Inter','DM Sans',sans-serif",
  fontSize:"0.9rem", padding:"0.8rem 1rem",
  width:"100%", boxSizing:"border-box", outline:"none",
};

export default function FormPage({onSubmit,onCancel,releases=[]}){
  const [sum,setSum]     = useState("");
  const [priority,setPri]= useState("P1");
  const [type,setType]   = useState("New Feature");
  const [planned,setPlan]= useState("");
  const [team,setTeam]   = useState("Gateway");
  const [rnLink,setRnLink]= useState("");
  const [goal,setGoal]   = useState("");
  const [approvals,setApp]= useState({Sandeep:false,Nitish:false,Pradeep:false,Muz:false,Sundar:false,Ruhan:false,Anand:false});
  const [modules,setMods] = useState([]);
  const [doraLead,setDoraLead]   = useState("");
  const [doraApp,setDoraApp]     = useState("");
  const [doraSvc,setDoraSvc]     = useState("");
  const [doraDate,setDoraDate]   = useState("");
  const [step,setStep]   = useState(1);
  const [errors,setErrors]= useState({});

  const toggleMod = m => setMods(ms => ms.includes(m) ? ms.filter(x=>x!==m) : [...ms, m]);
  const toggleApp = n => setApp(a => ({...a, [n]:!a[n]}));

  const v1 = () => {
    const e={};
    if(!sum.trim()) e.sum="Required";
    if(!planned) e.planned="Required";
    setErrors(e);
    return !Object.keys(e).length;
  };

  // Step colours
  const STEP_GRAD  = ["linear-gradient(135deg,#22c55e,#0ea5c8)","linear-gradient(135deg,#0ea5c8,#1d6fa4)"];
  const STEP_ACCENT= ["#22c55e","#0ea5c8"];
  const acc  = STEP_ACCENT[step-1];
  const grad = STEP_GRAD[step-1];

  const handleSubmit = () => {
    if(!modules.length){ setErrors({mods:"Select at least one"}); return; }
    setErrors({});
    onSubmit({
      id:Date.now(), summary:sum, priority, type,
      releasePlanned:planned, releaseActual:"", team, rn:"",
      rnLinks:rnLink?[rnLink]:[], rnLink,
      jiraLinks:[], jiraLink:"",
      goal, approvals, modules, status:"Planning",
      dora:{leadDeveloper:doraLead, application:doraApp, services:doraSvc, handoverDate:doraDate}
    });
  };

  return(
    <div style={{minHeight:"100vh",background:"#050b12",display:"flex",alignItems:"center",justifyContent:"center",padding:"2rem",fontFamily:"'Inter','DM Sans',sans-serif",position:"relative",overflow:"hidden"}}>
      <div style={{position:"fixed",top:"-20%",left:"-10%",width:600,height:600,borderRadius:"50%",background:"radial-gradient(circle,rgba(34,197,94,0.1) 0%,transparent 65%)",pointerEvents:"none",zIndex:0}}/>
      <div style={{position:"fixed",bottom:"-15%",right:"-5%",width:500,height:500,borderRadius:"50%",background:"radial-gradient(circle,rgba(14,165,200,0.1) 0%,transparent 65%)",pointerEvents:"none",zIndex:0}}/>
      <div style={{position:"fixed",top:"35%",right:"15%",width:350,height:350,borderRadius:"50%",background:"radial-gradient(circle,rgba(29,111,164,0.07) 0%,transparent 65%)",pointerEvents:"none",zIndex:0}}/>

      <div style={{width:"100%",maxWidth:700,position:"relative",zIndex:1}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:"1rem",marginBottom:"2.5rem"}}>
          <LogoMark size={44}/>
          <div>
            <div style={{fontFamily:"'Liberation Serif','Libre Baskerville','Georgia',serif",color:"#fff",fontSize:"1.05rem",fontWeight:800,letterSpacing:"0.04em"}}>DATMAN</div>
            <div style={{color:"rgba(255,255,255,0.35)",fontSize:"0.7rem",letterSpacing:"0.14em",textTransform:"uppercase"}}>Release Management</div>
          </div>
          <button onClick={onCancel} style={{marginLeft:"auto",height:38,padding:"0 1.1rem",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.5)",borderRadius:10,cursor:"pointer",fontSize:"0.8rem",fontFamily:FONT,transition:"all 0.15s"}}>← Back</button>
        </div>

        {/* Step indicator */}
        <div style={{display:"flex",alignItems:"center",marginBottom:"2rem"}}>
          {[1,2].map((s,i)=>{
            const done=s<step, active=s===step;
            const sAcc=STEP_ACCENT[s-1], sGrad=STEP_GRAD[s-1];
            return(
              <div key={s} style={{display:"flex",alignItems:"center",flex:i===0?1:"0 0 auto"}}>
                <div style={{display:"flex",alignItems:"center",gap:"0.65rem"}}>
                  <div style={{width:34,height:34,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.75rem",fontWeight:800,fontFamily:"'Liberation Serif','Georgia',serif",background:done||active?sGrad:"rgba(255,255,255,0.05)",color:done||active?"#fff":"rgba(255,255,255,0.25)",border:active?`2px solid ${sAcc}55`:"2px solid transparent",boxShadow:active?`0 0 24px ${sAcc}44`:"none",transition:"all 0.3s"}}>{done?"✓":s}</div>
                  <span style={{fontFamily:"'Liberation Serif','Georgia',serif",fontSize:"0.73rem",fontWeight:700,color:active?sAcc:done?"rgba(255,255,255,0.45)":"rgba(255,255,255,0.2)",letterSpacing:"0.06em",textTransform:"uppercase",whiteSpace:"nowrap"}}>{["Core Details","Goals & Ownership"][s-1]}</span>
                </div>
                {i===0&&<div style={{flex:1,height:2,margin:"0 1.25rem",borderRadius:99,background:step>1?STEP_GRAD[0]:"rgba(255,255,255,0.06)",transition:"all 0.3s"}}/>}
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div style={{background:"linear-gradient(145deg,rgba(255,255,255,0.04) 0%,rgba(255,255,255,0.015) 100%)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:24,padding:"2.25rem",backdropFilter:"blur(12px)",boxShadow:"0 0 60px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.06)",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:0,left:0,right:0,height:3,borderRadius:"24px 24px 0 0",background:grad}}/>

          {/* Title — gradient text matching step accent */}
          <div style={{marginBottom:"1.75rem"}}>
            <h1 style={{fontFamily:"'Liberation Serif','Libre Baskerville','Georgia',serif",background:grad,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",fontSize:"1.9rem",fontWeight:800,margin:0,lineHeight:1.1}}>
              {step===1?"Core Details":"Goals & Ownership"}
            </h1>
            <p style={{color:"rgba(255,255,255,0.3)",marginTop:"0.4rem",fontSize:"0.82rem"}}>Step {step} of 2</p>
          </div>

          {/* ── STEP 1 ── rendered always, hidden when on step 2 so inputs keep focus */}
          <div style={{display:step===1?"flex":"none",flexDirection:"column",gap:"1.5rem"}}>

            <FField acc={acc} label="Summary *" error={errors.sum}>
              <input
                value={sum}
                onChange={e=>setSum(e.target.value)}
                placeholder="Brief description of this release..."
                style={FORM_INPUT_STYLE}
              />
            </FField>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1.25rem"}}>
              <FField acc={acc} label="Release Type">
                <select value={type} onChange={e=>setType(e.target.value)} style={FORM_INPUT_STYLE}>
                  {RELEASE_TYPES.map(t=><option key={t} style={{background:"#0d1117"}}>{t}</option>)}
                </select>
              </FField>
              <FField acc={acc} label="Priority">
                <select value={priority} onChange={e=>setPri(e.target.value)} style={FORM_INPUT_STYLE}>
                  {PRIORITIES.map(p=><option key={p} style={{background:"#0d1117"}}>{p}</option>)}
                </select>
              </FField>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1.25rem"}}>
              <FField acc={acc} label="Planned Date *" error={errors.planned}>
                <input type="date" value={planned} onChange={e=>setPlan(e.target.value)} style={{...FORM_INPUT_STYLE,colorScheme:"dark"}}/>
              </FField>
              <FField acc={acc} label="Team *">
                <div style={{display:"flex",gap:"0.6rem"}}>
                  {[["Gateway",B.teal],["App Team","#22c55e"]].map(([t,tc])=>(
                    <button key={t} type="button" onClick={()=>setTeam(t)}
                      style={{flex:1,padding:"0.7rem",borderRadius:12,border:`1.5px solid ${team===t?tc:tc+"22"}`,background:team===t?`${tc}18`:"rgba(255,255,255,0.03)",color:team===t?tc:"rgba(255,255,255,0.3)",fontWeight:800,fontSize:"0.82rem",cursor:"pointer",fontFamily:"'Liberation Serif','Georgia',serif",letterSpacing:"0.04em",transition:"all 0.2s",boxShadow:team===t?`0 0 18px ${tc}33`:"none"}}>
                      {t}
                    </button>
                  ))}
                </div>
              </FField>
            </div>

            <FField acc={acc} label="RN Link (URL)" optional>
              <input
                value={rnLink}
                onChange={e=>setRnLink(e.target.value)}
                placeholder="https://datman.atlassian.net/wiki/..."
                style={FORM_INPUT_STYLE}
              />
            </FField>

            <button onClick={()=>{if(v1())setStep(2);}}
              style={{width:"100%",padding:"0.9rem",borderRadius:14,border:"none",background:grad,color:"#fff",fontFamily:"'Liberation Serif','Georgia',serif",fontSize:"0.9rem",fontWeight:800,cursor:"pointer",letterSpacing:"0.06em",boxShadow:`0 8px 32px ${acc}44`,transition:"all 0.2s"}}>
              CONTINUE →
            </button>
          </div>

          {/* ── STEP 2 ── */}
          <div style={{display:step===2?"flex":"none",flexDirection:"column",gap:"1.5rem"}}>

            <FField acc={acc} label="Goal" optional>
              <textarea
                value={goal}
                onChange={e=>setGoal(e.target.value)}
                rows={3}
                style={{...FORM_INPUT_STYLE,resize:"vertical"}}
                placeholder="What does this release achieve for the business?"
              />
            </FField>

            <FField acc={acc} label="Approvers">
              <div style={{display:"flex",flexWrap:"wrap",gap:"0.55rem"}}>
                {APPROVER_NAMES.map(n=>(
                  <button key={n} type="button" onClick={()=>toggleApp(n)}
                    style={{padding:"0.45rem 1.1rem",borderRadius:99,fontSize:"0.83rem",fontWeight:700,cursor:"pointer",background:approvals[n]?grad:"rgba(255,255,255,0.04)",color:approvals[n]?"#fff":"rgba(255,255,255,0.35)",border:`1.5px solid ${approvals[n]?acc+"66":acc+"22"}`,boxShadow:approvals[n]?`0 4px 16px ${acc}33`:"none",transition:"all 0.2s"}}>
                    {approvals[n]?"✓ ":""}{n}
                  </button>
                ))}
              </div>
            </FField>

            <FField acc={acc} label="Modules *" error={errors.mods}>
              <div style={{display:"flex",flexWrap:"wrap",gap:"0.55rem"}}>
                {MODULES.map(m=>{
                  const on=modules.includes(m);
                  const mc=GATEWAY_MODULES.includes(m)?B.teal:"#22c55e";
                  return(
                    <button key={m} type="button" onClick={()=>toggleMod(m)}
                      style={{padding:"0.45rem 1.1rem",borderRadius:99,fontSize:"0.83rem",fontWeight:700,cursor:"pointer",background:on?`${mc}22`:"rgba(255,255,255,0.04)",color:on?mc:"rgba(255,255,255,0.35)",border:`1.5px solid ${on?mc:mc+"22"}`,boxShadow:on?`0 4px 16px ${mc}33`:"none",transition:"all 0.2s"}}>
                      {m}
                    </button>
                  );
                })}
              </div>
            </FField>

            {/* DORA section */}
            <div style={{borderTop:"1px solid rgba(255,255,255,0.07)",paddingTop:"1.25rem"}}>
              <div style={{display:"flex",alignItems:"center",gap:"0.65rem",marginBottom:"1.25rem"}}>
                <span style={{background:"linear-gradient(135deg,#0ea5c8,#1d6fa4)",borderRadius:7,padding:"0.2rem 0.55rem",fontSize:"0.68rem",fontWeight:800,color:"#fff",fontFamily:"'Liberation Serif','Georgia',serif",letterSpacing:"0.08em"}}>DORA</span>
                <span style={{color:"rgba(14,165,200,0.75)",fontSize:"0.78rem",fontWeight:600,letterSpacing:"0.04em"}}>DevOps Research & Assessment Matrix</span>
                <span style={{color:"rgba(255,255,255,0.2)",fontSize:"0.66rem"}}>(all optional)</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1.25rem"}}>
                <FField acc={acc} label="Lead Developer" optional>
                  <input value={doraLead} onChange={e=>setDoraLead(e.target.value)} placeholder="e.g. Pradeep" style={FORM_INPUT_STYLE}/>
                </FField>
                <FField acc={acc} label="Application" optional>
                  <input value={doraApp} onChange={e=>setDoraApp(e.target.value)} placeholder="e.g. risk-engine" style={FORM_INPUT_STYLE}/>
                </FField>
                <FField acc={acc} label="Services" optional>
                  <input value={doraSvc} onChange={e=>setDoraSvc(e.target.value)} placeholder="e.g. RISK SERVICE" style={FORM_INPUT_STYLE}/>
                </FField>
                <FField acc={acc} label="Handover Date" optional>
                  <input type="date" value={doraDate} onChange={e=>setDoraDate(e.target.value)} style={{...FORM_INPUT_STYLE,colorScheme:"dark"}}/>
                </FField>
              </div>
              <div style={{color:"rgba(255,255,255,0.2)",fontSize:"0.69rem",marginTop:"0.6rem"}}>
                💡 Lead time = Actual Release date − Handover date. Set actual date in table after releasing.
              </div>
            </div>

            <div style={{display:"flex",gap:"0.75rem"}}>
              <button onClick={()=>setStep(1)}
                style={{padding:"0.9rem 1.5rem",borderRadius:14,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"rgba(255,255,255,0.45)",fontFamily:"'Liberation Serif','Georgia',serif",fontSize:"0.82rem",fontWeight:700,cursor:"pointer",letterSpacing:"0.05em"}}>
                ← BACK
              </button>
              <button onClick={handleSubmit}
                style={{flex:1,padding:"0.9rem",borderRadius:14,border:"none",background:grad,color:"#fff",fontFamily:"'Liberation Serif','Georgia',serif",fontSize:"0.9rem",fontWeight:800,cursor:"pointer",letterSpacing:"0.06em",boxShadow:`0 8px 32px ${acc}44`}}>
                ADD RELEASE ✦
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}


// ─── CSV IMPORT MODAL ─────────────────────────────────────────────────────────
// Maps YOUR exact spreadsheet column headers → internal fields.
// Column order in the sheet doesn't matter — matched by header name.
//
// "sl no"                  → ignored
// "task"                   → summary (required)
// "goal"                   → goal
// "priority"               → priority  (Hotfix|P1|P2|P3|P4)
// "release date"           → releaseActual (YYYY-MM-DD or DD/MM/YYYY)
// "current status"         → ignored
// "impacted areas"         → ignored
// "rn link"                → rnLink
// "type" / "release type"  → type  (Patch|Bug|New Feature|Improvement|Hotfix)
// "release status"         → status  (Released→Released, Not Released→Planning, Rolledback→Cancelled)
// "modules"                → modules (pipe or comma separated)
// "sandeep's approval"     → approver
// "nitish's approval"      → approver
// "pradeep's approval"     → approver
// "muz's approval"         → approver
// "sundar's approval"      → approver
// "fh/internal comms"      → ignored
// "jira release link"      → ignored
// RN is auto-generated from row number if no dedicated RN column exists

// Normalise a cell value that indicates approval was given.
// STRICT allowlist — only explicit positive signals count.
// Anything else (empty, "pending", "not approved", a number, a date, "NA", etc.) = NOT approved.
// isApproved: any non-empty cell that isn't an explicit negative = approved.
// Real spreadsheets use dates, names, "Approved", tick marks, etc. to signal approval.
// APPROVER_NAMES moved to top — see below

// ─── Approver helpers ────────────────────────────────────────────────────────
// isApproved: ONLY "Approved" (case-insensitive) counts — "Yet to Review", "N/A", anything else = not approved