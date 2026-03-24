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

