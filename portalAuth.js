/* ==================================================================
   GUEST PORTAL — create an account / sign in
   Unlimited self-registered guest accounts (hashed passwords). Staff
   continue to sign in from the Admin page.
   ================================================================== */
import * as React from "react";
import * as jsxrt from "react/jsx-runtime";
import * as D from "./db.js";
import * as W from "./workflow.js";
import * as U from "./ui.js";
import { bridge, drillTo } from "./bridge.js";

const g = jsxrt;
const { useState, useEffect } = React;
const line = "mt-2 w-full border-b border-ivory/30 bg-transparent pb-2 text-[16px] text-ivory outline-none focus:border-gold";
const lab = "text-[11px] font-semibold uppercase tracking-[0.22em] text-stone";

export function CustomerAuth() {
  const [mode, setMode] = useState("signin");
  const [f, setF] = useState({ name: "", email: "", phone: "", country: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const up = (k, v) => { setF({ ...f, [k]: v }); setErr(""); };
  const submit = async (e) => {
    e?.preventDefault?.();
    setBusy(true); setErr("");
    try {
      if (mode === "register" && f.password !== f.confirm) throw new Error("The two passwords do not match.");
      const user = mode === "register" ? await D.registerAccount(f) : await D.verifyAccount(f.email, f.password);
      bridge.setSessionUser && bridge.setSessionUser(user);
    } catch (x) { setErr(x.message || String(x)); }
    setBusy(false);
  };
  const Logo = bridge.Logo;
  const Link = bridge.Link;
  const field = (k, label, type = "text", ac) => g.jsxs("label", { className: "block border border-ivory/25 bg-surface p-4", children: [g.jsx("span", { className: lab, children: label }), g.jsx("input", { type, value: f[k], autoComplete: ac, onChange: (e) => up(k, e.target.value), className: line, required: ["email", "password", "name"].includes(k) })] }, k);
  return g.jsx("div", { className: "grain flex min-h-screen items-center justify-center bg-[#0b1412] px-5 py-16", children: g.jsxs("div", { className: "w-full max-w-lg", children: [
      g.jsx(Link, { to: "/", className: "inline-block", children: g.jsx(Logo, {}) }),
      g.jsx("h1", { className: "serif mt-8 text-4xl font-semibold text-ivory", children: mode === "register" ? "Create your guest account" : "Guest portal" }),
      g.jsx("p", { className: "mt-3 text-[14px] leading-relaxed text-stone", children: mode === "register" ? "Follow your vacation requests, quotations, invoices and itineraries in one place. Use the same email you use in the vacation builder." : "Sign in to see your vacation requests, bookings, invoices and itineraries." }),
      g.jsx("div", { className: "mt-6 flex border-b border-ivory/20", children: [["signin", "Sign in"], ["register", "Create account"]].map(([k, l]) => g.jsx("button", { type: "button", onClick: () => { setMode(k); setErr(""); }, className: U.cx("-mb-px border-b-2 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.2em]", mode === k ? "border-gold text-gold-soft" : "border-transparent text-stone hover:text-ivory"), children: l }, k)) }),
      g.jsxs("form", { onSubmit: submit, className: "mt-6 space-y-3", children: [
          mode === "register" && field("name", "Full name", "text", "name"),
          field("email", "Email address", "email", "email"),
          mode === "register" && g.jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [field("phone", "WhatsApp (with country code)", "tel", "tel"), field("country", "Country", "text", "country-name")] }),
          field("password", mode === "register" ? "Password (at least 8 characters)" : "Password", "password", mode === "register" ? "new-password" : "current-password"),
          mode === "register" && field("confirm", "Confirm password", "password", "new-password"),
          err && g.jsx("p", { role: "alert", className: "border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-200", children: err }),
          g.jsx("button", { type: "submit", disabled: busy, className: "w-full border border-gold bg-gold px-6 py-4 text-[12px] font-semibold uppercase tracking-[0.24em] text-deep transition-colors hover:bg-gold-soft disabled:opacity-50", children: busy ? "Please wait…" : mode === "register" ? "Create account" : "Sign in" }),
        ] }),
      g.jsxs("p", { className: "mt-6 text-[12px] text-stone", children: ["Prefer not to register? You can still ", g.jsx(Link, { to: "/builder", className: "text-gold-soft underline", children: "build and submit a vacation" }), " — we reply by email."] }),
    ] }) });
}

/* Backend: open the link from a "New itinerary inquiry" email */
export function ImportInquiry({ user }) {
  U.useDB();
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    const q = (location.hash.split("?")[1] || "");
    const d = new URLSearchParams(q).get("d");
    if (!d) { setState({ error: "This link does not contain an itinerary." }); return; }
    W.decodePayload(d).then((p) => setState({ payload: p })).catch(() => setState({ error: "This link is damaged or incomplete — copy the whole link from the email." }));
  }, []);
  const p = state.payload;
  const existing = p && D.db().inquiries.find((i) => i.id === p.ids?.inquiryId || (p.ids?.tripId && i.tripId === p.ids.tripId));
  const doImport = () => { try { const r = W.importSubmission(p, user); setState({ ...state, done: r }); } catch (e) { setState({ ...state, error: e.message }); } };
  const open = (id) => drillTo("requests", { id, stage: "all" });
  return g.jsx(U.Panel, { title: "Add a website itinerary to the backend", subtitle: "From the link in a “New itinerary inquiry” email", children: g.jsxs("div", { className: "space-y-4 text-[13px]", children: [
      state.loading && g.jsx("p", { className: "text-ivory/60", children: "Reading the itinerary…" }),
      state.error && g.jsx("p", { className: "border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-rose-200", children: state.error }),
      p && g.jsxs("div", { className: "grid gap-2 sm:grid-cols-4", children: [
          ["Inquiry ID", p.ids.inquiryId], ["Trip ID", p.ids.tripId], ["Guest", (p.info?.name || "") + " · " + (p.info?.email || "")],
          ["Travel", D.fmtDate(p.info?.arrival) + " → " + D.fmtDate(p.info?.departure)],
        ].map(([k, v]) => g.jsxs("div", { className: "border border-line px-3 py-2", children: [g.jsx("p", { className: "text-[9px] uppercase tracking-[0.14em] text-ivory/45", children: k }), g.jsx("p", { className: "text-ivory", children: v })] }, k)) }),
      p && g.jsxs("p", { className: "text-ivory/60", children: [(p.sels || []).length, " products · ", (p.custom || []).length, " custom requests · submitted ", p.submittedAt ? D.fmtDateTime(p.submittedAt) : "—"] }),
      p && (state.done?.ok || existing ? g.jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [g.jsx("span", { className: "text-emerald-300", children: state.done?.already || (existing && !state.done) ? "Already in the backend." : "Added to Inquiries — no emails were re-sent to the guest." }), g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => open(existing?.id || state.done.inquiryId), children: "Open the inquiry" })] })
        : g.jsx(U.Btn, { variant: "solid", onClick: doImport, disabled: !D.can(user, "add", "requests") && !D.can(user, "add", "inquiries"), children: "Add to Inquiries" })),
    ] }) });
}
