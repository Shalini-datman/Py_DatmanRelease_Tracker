import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { B,FONT,FONT_DISPLAY,PRIORITIES,MODULES,RELEASE_TYPES,STATUSES,GATEWAY_MODULES,APP_MODULES,APPROVER_NAMES,STATUS_COLORS,PRIORITY_COLORS,TYPE_COLORS,TYPE_COLOR,inputStyle,primaryBtn,tdSt,parseDDMMYYYY,daysBetween,leadTimeDays,fmtDate,Chip,StatusBadge,Field,SectionLabel,LogoMark,CalendarPicker,getApprovedNames,isApproved } from "./shared.jsx";
// matchApproverHeader: matches known approver names AND auto-detects unknown ones.
// Returns index into APPROVER_NAMES for known names, or a synthetic entry for new ones.
// For unknown "Firstname's Approval" headers, returns the first name capitalised.
function matchApproverHeader(h){
  const norm=h.toLowerCase().replace(/[^a-z]/g,"");
  const idx=APPROVER_NAMES.findIndex(name=>{
    const n=name.toLowerCase();
    return norm===n
      || norm.startsWith(n)&&norm.includes("approv")
      || norm.includes(n)&&norm.includes("approv");
  });
  return idx;
}
// Extract the approver first-name from any "*'s Approval" header
function extractApproverName(h){
  const m=h.match(/^([A-Za-z]+)['’\s]?s?\s+approval/i);
  return m?m[1]:null;
}
// Given a CSV headers array, return a map of colIndex → approverName (handles unknown names)
function buildApproverColMap(headers){
  const map={};
  headers.forEach((h,i)=>{
    const knownIdx=matchApproverHeader(h);
    if(knownIdx>=0){map[i]=APPROVER_NAMES[knownIdx];return;}
    // Auto-detect unknown approver columns e.g. "Ruhan's Approval"
    const name=extractApproverName(h);
    if(name) map[i]=name.charAt(0).toUpperCase()+name.slice(1).toLowerCase();
  });
  return map;
}
function mapReleaseStatus(val){
  const v=(val||"").toLowerCase().trim();
  if(!v) return "Planning";
  // Released variants
  if(v==="released"||v==="done"||v==="complete"||v==="completed"||v==="live"||v==="deployed"||v==="shipped") return "Released";
  // Rolledback/Cancelled — "Rolledback" is an exact value from the template
  if(v==="rolledback"||v==="rolled back"||v.includes("roll")||v.includes("revert")||v.includes("rollback")) return "Cancelled";
  // Pending → Planning (explicit value from template)
  if(v==="pending"||v==="planned"||v==="not released"||v==="upcoming"||v==="todo"||v==="to do") return "Planning";
  // Delayed
  if(v.includes("delay")||v.includes("postpone")||v==="deferred") return "Delayed";
  // In Progress
  if(v.includes("progress")||v.includes("ongoing")||v.includes("wip")||v==="active"||v==="in-progress") return "In Progress";
  // Direct match against internal STATUSES list
  const direct=STATUSES.find(s=>s.toLowerCase()===v);
  return direct||"Planning";
}
// Map release type from explicit cell value, RN link URL text, priority, or summary keywords.
// Priority order: explicit typeCell > rnLink URL keywords > priority > summary > default
function mapReleaseType(priority, summary, typeCell, rnLink){
  // 1. Explicit type column in CSV
  const tc=(typeCell||"").toLowerCase().trim();
  if(tc){
    if(tc.includes("bug")) return "Bug";
    if(tc.includes("hotfix")||tc==="hotfix") return "Patch";
    if(tc.includes("patch")) return "Patch";
    if(tc.includes("improvement")||tc.includes("enhance")) return "Improvement";
    if(tc.includes("new feature")||tc.includes("feature")) return "New Feature";
    // direct match against RELEASE_TYPES
    const direct=["New Feature","Improvement","Patch","Bug"].find(t=>t.toLowerCase()===tc);
    if(direct) return direct;
  }
  // 2. RN link URL — e.g. ".../patch/...", ".../bug-fix/...", "/hotfix/"
  const url=(rnLink||"").toLowerCase();
  if(url.includes("/patch")||url.includes("patch-")) return "Patch";
  if(url.includes("/hotfix")||url.includes("hotfix")) return "Patch";
  if(url.includes("/bug")||url.includes("bugfix")||url.includes("bug-fix")) return "Bug";
  if(url.includes("/improvement")||url.includes("/enhance")) return "Improvement";
  if(url.includes("/feature")||url.includes("/new-feature")) return "New Feature";
  // 3. Priority field
  const p=(priority||"").trim();
  if(p==="Hotfix") return "Patch";
  // 4. Summary keywords
  const s=(summary||"").toLowerCase();
  if(s.includes("hotfix")||s.includes("hot fix")) return "Patch";
  if(s.includes(" bug ")||s.startsWith("bug ")||s.includes("bug fix")||s.includes("bugfix")) return "Bug";
  if(s.includes("patch")) return "Patch";
  if(s.includes("improvement")||s.includes("enhance")||s.includes("optimis")||s.includes("optimiz")||s.includes("refactor")) return "Improvement";
  if(s.includes("new feature")||s.includes("feature")) return "New Feature";
  return "New Feature"; // safe default
}

// Parse a date that could be YYYY-MM-DD or DD/MM/YYYY
function normaliseDate(val){
  if(!val) return "";
  val=val.trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(val)) return val; // already YYYY-MM-DD
  if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(val)){
    const [d,m,y]=val.split("/");
    return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
  }
  return val; // return as-is; let the app handle it
}

// Legacy cols for display
const APPROVER_COLS=["sandeep's approval","nitish's approval","pradeep's approval","muz's approval","sundar's approval","ruhan's approval","anand's approval"];

// Columns that are explicitly ignored
const IGNORED_COLS=new Set([
  "sl no","sl. no","sl no.","current status","impacted areas",
  "fh/internal comms","fh / internal comms"
]);

function parseCSVLine(line){
  const cells=[]; let cur="", inQ=false;
  for(const ch of line){
    if(ch==='"'){inQ=!inQ;}
    else if(ch===","&&!inQ){cells.push(cur.trim().replace(/^"|"$/g,""));cur="";}
    else cur+=ch;
  }
  cells.push(cur.trim().replace(/^"|"$/g,""));
  return cells;
}

function parseCSVData(text, existingKeys){
  const existing=existingKeys||new Set();
  const allLines=text.trim().split(/\r?\n/).filter(l=>l.trim());
  if(allLines.length<2) return {rows:[],errors:["Need a header row and at least one data row"],dupes:[],mappedCols:[]};

  const rawHeaders=parseCSVLine(allLines[0]);
  const headers=rawHeaders.map(h=>h.toLowerCase().trim());

  // Tell the UI which columns were detected
  const mappedCols=headers.map((h,i)=>{
    if(h==="task") return {raw:rawHeaders[i],mapped:"summary",use:true};
    if(h==="goal") return {raw:rawHeaders[i],mapped:"goal",use:true};
    if(h==="priority") return {raw:rawHeaders[i],mapped:"priority",use:true};
    if(h==="release date") return {raw:rawHeaders[i],mapped:"releaseActual",use:true};
    if(h==="rn link"||h.match(/rn link \d+/)) return {raw:rawHeaders[i],mapped:"rnLink",use:true};
    if(h==="type"||h==="release type"||h==="patch type"||h==="rn type") return {raw:rawHeaders[i],mapped:"type",use:true};
    if(h==="release status"||h==="status"||h==="release status "||h.includes("release status")||h==="current release status") return {raw:rawHeaders[i],mapped:"status",use:true};
    if(h==="modules") return {raw:rawHeaders[i],mapped:"modules",use:true};
    if(h==="jira release link"||h.match(/jira.*link.*\d*/)) return {raw:rawHeaders[i],mapped:"jiraLink",use:true};
    const aIdx=matchApproverHeader(h);
    if(aIdx>=0) return {raw:rawHeaders[i],mapped:"approver ("+APPROVER_NAMES[aIdx]+")",use:true};
    const dynName=extractApproverName(h);
    if(dynName) return {raw:rawHeaders[i],mapped:"approver ("+dynName+")",use:true};
    return {raw:rawHeaders[i],mapped:"ignored",use:false};
  });

  const getByIndex=(cells,idx)=>idx>=0?(cells[idx]||"").trim():"";
  const getByHeader=(cells,headerLower)=>{
    const idx=headers.indexOf(headerLower);
    return getByIndex(cells,idx);
  };
  // Build approver column map: colIndex → approverName (handles unknown names too)
  const approverColMap=buildApproverColMap(headers);

  const errors=[], rows=[], dupes=[];
  for(let i=1;i<allLines.length;i++){
    if(!allLines[i].trim()) continue;
    const cells=parseCSVLine(allLines[i]);

    const summary=getByHeader(cells,"task");
    if(!summary){errors.push("Row "+(i+1)+": no Task/summary — skipped");continue;}

    const releaseActual=normaliseDate(getByHeader(cells,"release date"));

    // Deduplicate by Task + Release Date
    const dedupeKey=(summary+"|"+releaseActual).toLowerCase();
    if(existing.has(dedupeKey)){dupes.push({rn:summary.slice(0,30),row:i+1});continue;}

    // Collect ALL rn link columns (rn link, rn link 2, rn link 3 …) as array
    const rnLinksArr=headers
      .map((h,i)=>(h==="rn link"||/rn link ?\d+/.test(h))?(cells[i]||"").trim():null)
      .filter(Boolean);
    const rnLinkRaw=rnLinksArr[0]||"";

    // Approvals: build object {Sandeep:bool, ...} — only true if cell has non-negative non-empty value
    const approvalsObj={};
    const approvalRaw={};
    // Init known approvers
    APPROVER_NAMES.forEach(name=>{ approvalsObj[name]=false; approvalRaw[name]=""; });
    // Process all detected approver columns (known + auto-detected)
    Object.entries(approverColMap).forEach(([colIdx,name])=>{
      const cellVal=(cells[colIdx]||"").trim();
      approvalRaw[name]=cellVal;
      if(!approvalsObj.hasOwnProperty(name)) approvalsObj[name]=false; // add new name dynamically
      if(isApproved(cellVal)) approvalsObj[name]=true;
    });

    const modulesRaw=getByHeader(cells,"modules");
    const modules=modulesRaw?modulesRaw.split(/[|;,]/).map(m=>m.trim()).filter(Boolean):[];

    const rawPriority=getByHeader(cells,"priority");
    const priority=PRIORITIES.includes(rawPriority)?rawPriority:"P2";
    // Try multiple possible status column names
    const statusRaw=
      getByHeader(cells,"release status")||
      getByHeader(cells,"status")||
      getByHeader(cells,"current release status")||
      // also scan any header containing "release status"
      (()=>{const idx=headers.findIndex(h=>h.includes("release status")||h==="status");return idx>=0?(cells[idx]||"").trim():"";})();
    const status=mapReleaseStatus(statusRaw);

    rows.push({
      id:Date.now()+i*17,
      _statusRaw:statusRaw, // debug: raw cell value before mapping
      rn:"RN-IMP-"+String(i).padStart(3,"0"),
      rnLink:rnLinkRaw,
      rnLinks: rnLinksArr.length?rnLinksArr:[rnLinkRaw].filter(Boolean),
      jiraLinks: headers
        .map((h,i)=>/jira.*link/.test(h)?(cells[i]||"").trim():null)
        .filter(Boolean),
      jiraLink:getByHeader(cells,"jira release link")||"",
      summary,
      type:mapReleaseType(priority, summary, getByHeader(cells,"type")||getByHeader(cells,"release type")||getByHeader(cells,"patch type")||getByHeader(cells,"rn type"), rnLinkRaw),
      priority,
      status,
      releasePlanned:"",
      releaseActual,
      approvals:approvalsObj,
      approvalRaw,
      goal:getByHeader(cells,"goal"),
      modules,
      dora:{leadDeveloper:"",application:"",services:"",qa:"NA",originalRNLink:"NA",handoverDate:""}
    });
  }
  return {rows,errors,dupes,mappedCols};
}

const CSV_COL_DOCS=[
  ["Task",                "Required",            "→ Summary"],
  ["Goal",                "Optional",            "→ Goal"],
  ["Priority",            "Hotfix|P1..P4",       "→ Priority (defaults P2)"],
  ["Release Date",        "DD/MM/YYYY or YYYY-MM-DD", "→ Actual Release Date"],
  ["RN Link",             "https://…",           "→ RN Link (DORA auto-fetched)"],
  ["Jira Release Link",   "https://jira.…",      "→ Jira Link (shown in hover card)"],
  ["Release Status",      "Released / Not Released / Rolledback", "→ Status"],
  ["Modules",             "Payments, General…",  "→ Modules"],
  ["Sandeep's Approval",  "Any value = approved","→ Approver (name used if non-empty)"],
  ["Nitish's Approval",   "Any value = approved","→ Approver"],
  ["Pradeep's Approval",  "Any value = approved","→ Approver"],
  ["Muz's Approval",      "Any value = approved","→ Approver"],
  ["Sundar's Approval",   "Any value = approved","→ Approver"],
  ["Ruhan's Approval",    "Any value = approved","→ Approver"],
  ["Anand's Approval",    "Any value = approved","→ Approver"],
  ["Sl No / Current Status / Impacted Areas / FH/Internal Comms", "—", "Ignored"],
];

export default function CSVImportModal({onImport, onClose, existingReleases}){
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState(null);
  const [dupes,   setDupes]   = useState([]);
  const [errors,  setErrors]  = useState([]);
  const [mappedCols, setMappedCols] = useState([]);
  const [step,    setStep]    = useState("input");
  const [confirmImport, setConfirmImport] = useState(false);
  const fileRef = useRef(null);

  // Deduplicate by "Task + Release Date" combo since there's no RN column in the source sheet
  const existingKeys = useMemo(
    ()=>new Set((existingReleases||[]).map(r=>(r.summary+"|"+r.releaseActual).toLowerCase())),
    [existingReleases]
  );

  const handleParse = () => {
    if(!csvText.trim()){setErrors(["Paste CSV content or upload a file first"]);return;}
    const {rows,errors:errs,dupes:dps,mappedCols:mc} = parseCSVData(csvText, existingKeys);
    setErrors(errs); setDupes(dps); setMappedCols(mc||[]);
    if(rows.length>0){setPreview(rows);setStep("preview");}
    else setErrors(e=>[...e, dps.length>0?"All rows are duplicates — nothing new to import.":"No valid rows found."]);
  };

  const handleFile = e => {
    const file=e.target.files[0]; if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>setCsvText(ev.target.result);
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const headers=["Task","Goal","Priority","Release Date","Planned Date","Release Status","Modules","Type","RN Link","RN Link 2","RN Link 3","Jira Release Link","Jira Release Link 2","Lead Developer","Application","Services","Handover Date","Sandeep's Approval","Nitish's Approval","Pradeep's Approval","Muz's Approval","Sundar's Approval","Ruhan's Approval","Anand's Approval"];
    const sample1=["1","Risk Rule Engine v3","Reduce fraud by 30%","P1","03/04/2026","In Progress","Payments","https://docs.example.com/rn/100","Released","Payments|General","Approved","Approved","","","Approved","Sent","https://jira.example.com/RN-100"];
    const sample2=["2","Checkout SDK Hotfix","Fix iOS SDK crash","Hotfix","05/04/2026","Done","App","https://docs.example.com/rn/101","Released","Payments|App","Approved","","Approved","Approved","","",""];
    const content=[headers.join(","),sample1.join(","),sample2.join(",")].join("\n");
    const blob=new Blob([content],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download="release_import_template.csv";a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FONT}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:B.bgCard,border:`1px solid ${B.border2}`,borderRadius:20,width:"min(900px,96vw)",maxHeight:"90vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 32px 80px rgba(0,0,0,0.65)"}}>

        {/* ── Header ── */}
        <div style={{position:"relative",padding:"1.2rem 1.6rem",borderBottom:`1px solid ${B.border}`,flexShrink:0}}>
          <div style={{position:"absolute",top:0,left:0,right:0,height:3,borderRadius:"20px 20px 0 0",background:B.grad1}}/>
          <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginTop:"0.15rem"}}>
            <div style={{background:B.blue,borderRadius:8,padding:"0.28rem 0.65rem",fontSize:"0.7rem",fontWeight:800,color:"#fff",letterSpacing:"0.06em"}}>CSV</div>
            <div>
              <div style={{color:B.textPrimary,fontWeight:800,fontSize:"1.05rem"}}>Import Historical Releases</div>
              <div style={{color:B.textMuted,fontSize:"0.72rem",marginTop:"0.1rem"}}>
                Paste or upload your existing spreadsheet export. Column order does not matter — matched by header name.
              </div>
            </div>
            <button onClick={onClose} style={{marginLeft:"auto",background:"transparent",border:`1px solid ${B.border2}`,color:B.textMuted,borderRadius:10,padding:"0.32rem 0.7rem",cursor:"pointer",fontSize:"0.8rem",fontFamily:FONT}}>
              x Close
            </button>
          </div>
        </div>

        <div style={{overflowY:"auto",padding:"1.3rem 1.6rem",flex:1}}>

          {/* ══ INPUT STEP ══ */}
          {step==="input"&&(
            <div style={{display:"flex",flexDirection:"column",gap:"1.1rem"}}>

              {/* Info banner */}
              <div style={{background:"#0d2a1a",border:"1px solid #22c55e44",borderRadius:12,padding:"0.8rem 1rem",display:"flex",gap:"0.6rem",alignItems:"flex-start"}}>
                <span style={{color:"#4ade80",fontWeight:700,fontSize:"0.8rem",flexShrink:0,marginTop:"0.05rem"}}>Note</span>
                <div style={{color:"#86efac",fontSize:"0.76rem",lineHeight:1.7}}>
                  Columns are matched <strong>by name</strong>, not position — export your sheet in any column order.
                  Approval columns: any non-empty value = that person approved; blank = not yet approved.
                  Duplicate check: rows where Task + Release Date already exist are skipped.
                  Type and Planned Date will be blank — set them in the table after import.
                  DORA fields auto-populate from the RN link.
                </div>
              </div>

              {/* Column mapping reference + template side-by-side */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 190px",gap:"0.9rem",alignItems:"start"}}>
                {/* Column reference */}
                <div style={{background:"#0d0d0d",border:`1px solid ${B.border}`,borderRadius:12,padding:"0.85rem 1rem"}}>
                  <div style={{color:B.textMuted,fontSize:"0.62rem",textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:700,marginBottom:"0.55rem"}}>
                    Column Mapping — Your sheet headers
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:"0.2rem"}}>
                    {CSV_COL_DOCS.map(([col,ex,desc])=>(
                      <div key={col} style={{display:"grid",gridTemplateColumns:"180px 160px 1fr",gap:"0.5rem",alignItems:"baseline",padding:"0.15rem 0"}}>
                        <span style={{color:B.teal,fontSize:"0.69rem",fontWeight:700}}>{col}</span>
                        <span style={{color:B.textSecondary,fontSize:"0.67rem",fontStyle:"italic"}}>{ex}</span>
                        <span style={{color:B.textMuted,fontSize:"0.66rem"}}>{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Template card */}
                <div style={{background:"#0d0d0d",border:`1px solid ${B.border2}`,borderRadius:12,padding:"1rem",display:"flex",flexDirection:"column",gap:"0.7rem"}}>
                  <div style={{color:B.textPrimary,fontWeight:700,fontSize:"0.86rem"}}>Template</div>
                  <div style={{color:B.textMuted,fontSize:"0.71rem",lineHeight:1.5,flex:1}}>
                    Download a ready-made CSV with all 17 columns and 2 sample rows matching your exact sheet layout.
                  </div>
                  <button onClick={downloadTemplate} style={{background:B.grad1,border:"none",color:"#fff",borderRadius:10,padding:"0.55rem",cursor:"pointer",fontSize:"0.79rem",fontWeight:700,fontFamily:FONT}}>
                    Download Template
                  </button>
                </div>
              </div>

              {/* File upload */}
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{display:"none"}}/>
              <button onClick={()=>fileRef.current.click()}
                style={{background:"#0d0d0d",border:`2px dashed ${B.border2}`,color:B.textSecondary,borderRadius:12,padding:"0.65rem",cursor:"pointer",fontSize:"0.82rem",fontWeight:600,fontFamily:FONT,width:"100%"}}>
                Upload CSV / TSV File {csvText?"  (loaded)":""}
              </button>

              {/* Paste area */}
              <div>
                <div style={{color:B.textSecondary,fontSize:"0.7rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"0.4rem"}}>Or Paste CSV Content</div>
                <textarea value={csvText} onChange={e=>setCsvText(e.target.value)} rows={7}
                  placeholder={"Task,Goal,Priority,Release Date,Planned Date,Release Status,Modules,Type,RN Link,Jira Release Link,Lead Developer,Application,Services,Handover Date,Sandeep's Approval,Nitish's Approval,Pradeep's Approval,Muz's Approval,Sundar's Approval,Ruhan's Approval,Anand's Approval\nAdyen 3DS Fix,Adyen,P1,12/03/2026,10/03/2026,Released,Payments,New Feature,https://wiki...,https://jira...,Jane,Gateway,adyen-svc,08/03/2026,Approved,Approved,,,,,"}
                  style={{...inputStyle,resize:"vertical",fontFamily:"monospace",fontSize:"0.74rem",lineHeight:1.55}}/>
              </div>

              {errors.length>0&&(
                <div style={{background:"#2d0a0a",border:"1px solid #ef444455",borderRadius:10,padding:"0.65rem 0.9rem"}}>
                  {errors.map((e,i)=>(
                    <div key={i} style={{color:"#fca5a5",fontSize:"0.76rem",marginBottom:"0.12rem"}}>{e}</div>
                  ))}
                </div>
              )}

              <button onClick={handleParse} style={primaryBtn}>Preview Import</button>
            </div>
          )}

          {/* ══ PREVIEW STEP ══ */}
          {step==="preview"&&preview&&(
            <div style={{display:"flex",flexDirection:"column",gap:"0.9rem"}}>

              {/* Summary row */}
              <div style={{display:"flex",alignItems:"center",gap:"0.75rem",flexWrap:"wrap"}}>
                <span style={{background:B.lime+"22",color:B.lime,border:`1px solid ${B.lime}44`,padding:"0.22rem 0.65rem",borderRadius:99,fontSize:"0.78rem",fontWeight:700}}>
                  {preview.length} new release{preview.length!==1?"s":""}
                </span>
                {dupes.length>0&&(
                  <span style={{background:"#f9731622",color:"#f97316",border:"1px solid #f9731644",padding:"0.22rem 0.65rem",borderRadius:99,fontSize:"0.76rem",fontWeight:700}}>
                    {dupes.length} duplicate{dupes.length!==1?"s":""} skipped: {dupes.map(d=>d.rn).join(", ")}
                  </span>
                )}
                {errors.length>0&&(
                  <span style={{color:"#ef4444",fontSize:"0.74rem"}}>{errors.length} row error{errors.length!==1?"s":""}</span>
                )}
                <button onClick={()=>{setStep("input");setPreview(null);setDupes([]);setErrors([]);}}
                  style={{marginLeft:"auto",background:"transparent",border:`1px solid ${B.border2}`,color:B.textSecondary,borderRadius:8,padding:"0.26rem 0.65rem",cursor:"pointer",fontSize:"0.75rem",fontFamily:FONT}}>
                  Edit
                </button>
              </div>

              {/* Column detection summary */}
              {mappedCols.length>0&&(
                <div style={{background:"#0d0d0d",border:`1px solid ${B.border}`,borderRadius:10,padding:"0.7rem 0.9rem"}}>
                  <div style={{color:B.textMuted,fontSize:"0.62rem",textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:700,marginBottom:"0.5rem"}}>Columns Detected</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"0.35rem"}}>
                    {mappedCols.map((c,i)=>(
                      <span key={i} style={{
                        background:c.use?B.teal+"18":"#000000",
                        color:c.use?B.teal:B.textMuted,
                        border:`1px solid ${c.use?B.teal+"44":B.border}`,
                        borderRadius:6,padding:"0.18rem 0.55rem",fontSize:"0.66rem",fontWeight:600,
                        display:"flex",alignItems:"center",gap:"0.3rem"
                      }}>
                        <span>{c.raw}</span>
                        <span style={{opacity:0.6}}>→</span>
                        <span style={{fontStyle:"italic",opacity:0.85}}>{c.mapped}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* Notice */}
              <div style={{background:"#0d1e2f",border:`1px solid ${B.border2}`,borderRadius:10,padding:"0.55rem 0.9rem",color:B.textMuted,fontSize:"0.72rem"}}>
                <strong style={{color:B.textSecondary}}>After import:</strong> Type and Planned Date will be blank — set them in the table. DORA fields populate from RN link.
              </div>
              {/* Approver detection debug panel */}
              <div style={{background:"#0a0a0a",border:`1px solid ${B.teal}33`,borderRadius:10,padding:"0.7rem 1rem"}}>
                <div style={{color:B.teal,fontSize:"0.65rem",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:"0.5rem"}}>
                  Approver columns detected
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:"0.4rem",marginBottom:"0.5rem"}}>
                  {APPROVER_NAMES.map(name=>{
                    const detected=preview.length>0&&preview[0].approvalRaw&&preview[0].approvalRaw[name]!==undefined;
                    const sampleVal=detected?preview[0].approvalRaw[name]:"";
                    return(
                      <div key={name} style={{background:detected?"#0d3320":"#0d0d0d",border:`1px solid ${detected?B.lime+"44":B.border}`,borderRadius:8,padding:"0.25rem 0.6rem",fontSize:"0.65rem"}}>
                        <span style={{color:detected?B.lime:B.textMuted,fontWeight:700}}>{name}</span>
                        {detected&&<span style={{color:B.textMuted,marginLeft:"0.3rem"}}>· "{sampleVal||"(empty)"}"</span>}
                        {!detected&&<span style={{color:"#ef444466",marginLeft:"0.3rem"}}>· not found in CSV</span>}
                      </div>
                    );
                  })}
                </div>
                <div style={{color:B.textMuted,fontSize:"0.62rem"}}>
                  Any non-empty cell = approved. Empty cell = not approved.
                  {!APPROVER_NAMES.some(n=>preview[0]?.approvalRaw?.[n]!==undefined)&&
                    <span style={{color:"#f97316",marginLeft:"0.4rem"}}>⚠ No approver columns matched — check header names match "Name's Approval"</span>}
                </div>
              </div>

              {/* Status detection debug */}
              {(()=>{
                const statusCol=mappedCols.find(mc=>mc.mapped==="status");
                const counts=preview.reduce((acc,r)=>{acc[r.status]=(acc[r.status]||0)+1;return acc;},{});
                return(
                  <div style={{background:"#0a0a0a",border:`1px solid ${B.border2}`,borderRadius:10,padding:"0.6rem 1rem",display:"flex",flexWrap:"wrap",alignItems:"center",gap:"0.75rem"}}>
                    <div style={{color:statusCol?B.lime:"#f97316",fontSize:"0.66rem",fontWeight:700}}>
                      {statusCol?`✓ Status column: "${statusCol.raw}"`:"⚠ No status column detected — all set to Planning"}
                    </div>
                    {Object.entries(counts).map(([s,n])=>(
                      <div key={s} style={{background:s==="Released"?B.lime+"18":B.border,border:`1px solid ${s==="Released"?B.lime+"44":B.border2}`,borderRadius:6,padding:"0.1rem 0.55rem",fontSize:"0.65rem",fontWeight:700,color:s==="Released"?B.lime:B.textMuted}}>
                        {s}: {n}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Preview table */}
              <div style={{overflowX:"auto",borderRadius:12,border:`1px solid ${B.border}`}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.76rem",fontFamily:FONT}}>
                  <thead>
                    <tr>
                      {["RN","Summary","Priority","Status","Release Date","Approvers","Modules","Goal"].map(h=>(
                        <th key={h} style={{padding:"0.55rem 0.75rem",color:B.textMuted,fontSize:"0.62rem",letterSpacing:"0.08em",textTransform:"uppercase",textAlign:"left",borderBottom:`1px solid ${B.border2}`,background:"#0d0d0d",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r,i)=>(
                      <tr key={i} style={{background:i%2===0?B.bgDark:B.bgCard}}>
                        <td style={{padding:"0.48rem 0.75rem",borderBottom:`1px solid ${B.border}`}}>
                          {r.rnLink
                            ? <a href={r.rnLink} target="_blank" rel="noreferrer" style={{color:B.teal,fontWeight:700,textDecoration:"none"}}>{r.rn} ↗</a>
                            : <span style={{color:B.teal,fontWeight:700}}>{r.rn}</span>}
                        </td>
                        <td style={{padding:"0.48rem 0.75rem",borderBottom:`1px solid ${B.border}`,color:B.textPrimary,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.summary}</td>
                        <td style={{padding:"0.48rem 0.75rem",borderBottom:`1px solid ${B.border}`}}><Chip label={r.priority} color={PRIORITY_COLORS[r.priority]||B.textMuted} small/></td>
                        <td style={{padding:"0.48rem 0.75rem",borderBottom:`1px solid ${B.border}`}}>
                          <StatusBadge s={r.status}/>
                          {r._statusRaw&&(
                            <div style={{color:B.textMuted,fontSize:"0.58rem",marginTop:"0.15rem"}}>
                              raw: "{r._statusRaw}"
                            </div>
                          )}
                        </td>
                        <td style={{padding:"0.48rem 0.75rem",borderBottom:`1px solid ${B.border}`,color:r.releaseActual?B.lime:B.textMuted,whiteSpace:"nowrap"}}>{r.releaseActual||"—"}</td>
                        <td style={{padding:"0.48rem 0.75rem",borderBottom:`1px solid ${B.border}`,maxWidth:130}}>
                          {(()=>{const names=getApprovedNames(r);return names.length
                            ?<span style={{color:B.lime,fontWeight:700,fontSize:"0.72rem"}}>{names.join(", ")}</span>
                            :<span style={{color:B.textMuted,fontSize:"0.69rem"}}>—</span>;})()
                          }
                        </td>
                        <td style={{padding:"0.48rem 0.75rem",borderBottom:`1px solid ${B.border}`,color:B.cyan,whiteSpace:"nowrap"}}>{r.modules.join(", ")||"—"}</td>
                        <td style={{padding:"0.48rem 0.75rem",borderBottom:`1px solid ${B.border}`,color:B.textMuted,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.goal||"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!confirmImport ? (
                <button onClick={()=>setConfirmImport(true)} style={{...primaryBtn,background:B.grad1}}>
                  ↑ Replace & Import {preview.length} Release{preview.length!==1?"s":""}
                </button>
              ) : (
                <div style={{background:"#120808",border:"1px solid #f9731655",borderRadius:12,padding:"1rem"}}>
                  <div style={{color:"#f97316",fontWeight:700,fontSize:"0.82rem",marginBottom:"0.4rem"}}>⚠ This will replace ALL existing release data</div>
                  <div style={{color:B.textMuted,fontSize:"0.75rem",marginBottom:"0.9rem"}}>
                    {preview.length} releases from the CSV will replace everything currently saved. This cannot be undone.
                  </div>
                  <div style={{display:"flex",gap:"0.6rem"}}>
                    <button onClick={()=>setConfirmImport(false)} style={{...primaryBtn,background:"transparent",border:`1px solid ${B.border2}`,color:B.textMuted,flex:"0 0 auto",padding:"0.65rem 1.2rem",fontSize:"0.82rem"}}>
                      Cancel
                    </button>
                    <button onClick={()=>{onImport(preview);onClose();}} style={{...primaryBtn,background:"linear-gradient(135deg,#f97316,#dc2626)",flex:1,fontSize:"0.85rem"}}>
                      ✓ Yes, replace & import {preview.length} releases
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ─── EDIT MODAL ───────────────────────────────────────────────────────────────