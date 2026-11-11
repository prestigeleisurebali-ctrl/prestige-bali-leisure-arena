/* ==================================================================
   CUSTOMER VACATION BUILDER   Home → Marketplace → Vacation builder
   Multi-destination, multi-day planning in the site's existing design.

   1 · Your details        guests, dates, total days / nights, PAX
   2 · Destinations         Seminyak 3 · Ubud 3 · Nusa Dua 3 … each with
                            its own accommodation, dates kept in sync
   3 · Day-by-day builder   every day: destination, check-in/out,
                            transfers, and unlimited products added from
                            the Add Product window (any category)
   4 · Vacation overview    everything, editable, then submit

   Products come live from Product Master (selling prices only),
   availability from the inventory service; submission creates the
   Customer → Request → Trip → Destinations → Days → Products → PAX
   record in the backend.
   ================================================================== */
import * as React from "react";
import * as jsxrt from "react/jsx-runtime";
import * as D from "./db.js";
import * as I from "./inventory.js";
import * as W from "./workflow.js";
import { bridge } from "./bridge.js";

const g = jsxrt;
const { useState, useEffect, useMemo } = React;
const cx = (...a) => a.filter(Boolean).join(" ");
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ------------------------------ store ----------------------------- */
const KEY = "pbl-vacation-v2";
const blank = () => ({
  step: 0,
  info: { name: "", email: "", phone: "", country: "", arrival: D.addDays(D.today(), 30), departure: D.addDays(D.today(), 39), adults: 2, children: 0, infants: 0, requests: "" },
  legs: [], sels: [], custom: [], titles: {}, imported: [], submitted: null,
  draft: { tripId: null, savedAt: null, hash: null },
  lastSubmitted: null,
});
/* arrival moves the whole itinerary: every product keeps its day number */
export function shiftTrip(s, newArrival) {
  const delta = D.daysBetween(s.info.arrival, newArrival);
  if (!delta) return { info: { ...s.info, arrival: newArrival } };
  const sh = (d) => (d ? D.addDays(d, delta) : d);
  return {
    info: { ...s.info, arrival: newArrival, departure: sh(s.info.departure) },
    sels: s.sels.map((x) => (x.kind === "stay" ? { ...x, from: sh(x.from), to: sh(x.to) } : { ...x, date: sh(x.date) })),
    custom: s.custom.map((c) => ({ ...c, date: sh(c.date) })),
    titles: Object.fromEntries(Object.entries(s.titles || {}).map(([k, v]) => [sh(k), v])),
  };
}
export const hashOf = (s) => JSON.stringify([s.info, s.sels, s.custom, s.titles]);
/* keeps stays linked to a destination on that destination's dates */
function normalize(st) {
  /* an itinerary that was already submitted never reopens: start blank */
  if (st && st.submitted) return normalize({ ...blank(), lastSubmitted: { ...st.submitted } });
  const s = { ...st, legs: [] };
  s.sels = (s.sels || []).map((x) => (x.kind === "stay" && x.legId ? { ...x, legId: "" } : x));
  if (!s.draft) s.draft = { tripId: null, savedAt: null, hash: null };
  if (!Array.isArray(s.open)) s.open = [0];
  const dep = s.info.departure;
  s.sels = s.sels.map((x) => (x.kind === "stay" && x.from < dep && x.to > dep ? { ...x, to: dep } : x));
  return s;
}
let store = (() => { try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); return normalize(s && s.info ? { ...blank(), ...s } : blank()); } catch { return normalize(blank()); } })();
const subs = new Set();
function setStore(next) { store = normalize(next); try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} subs.forEach((f) => f()); }
export function useVacation() {
  const [, f] = useState(0);
  useEffect(() => { const h = () => f((n) => n + 1); subs.add(h); return () => subs.delete(h); }, []);
  return [store, (patch) => setStore(typeof patch === "function" ? patch(store) : { ...store, ...patch })];
}
export function useVacationCount() { const [s] = useVacation(); return s.submitted ? 0 : s.sels.length; }
export const resetVacationDraft = (next) => setStore(next ? { ...blank(), ...next } : blank());

/* ---------------------------- catalogue --------------------------- */
const visible = (p) => p.status === "live" && p.published !== false && (Number(p.sellingRate) > 0 || p.priceOnRequest) && p.verification !== "pending";
const onRequest = (p) => !!p?.priceOnRequest && !(Number(p.sellingRate) > 0);
const rateText = (p) => (onRequest(p) ? "Price on request" : D.money(p.sellingRate));
const priceText = (sel) => (onRequest(D.productOf(sel.slug)) ? "On request" : D.money(W.selPrice(sel)));
const isAirport = (p) => p.subcategory === "Airport Transfer" || /airport|fast-track|ngurah rai|\bdps\b/i.test(p.name);
const nm = (p) => (p.name + " " + (p.subcategory || "")).toLowerCase();
const CORE = (p) => ["accommodation", "transportation", "activities", "adventure", "attractions", "tours", "wellness", "dining", "yacht", "watersports", "family", "yacht-luxury", "events", "culture", "premium", "classes", "wellness-spa", "retreat-hosting", "healing", "retreat-packages", "beauty"].includes(p.categoryId);
/* Add Product menu — managed in CMS → Vacation builder.
   A category matches Product Master products by category, then optional
   sub-category / keyword filters. "Catch-all" collects whatever no other
   visible category shows, so no product is ever unreachable. */
export const DEFAULT_CATS = [
  { id: "accommodation", label: "Accommodation", icon: "⌂", categoryIds: ["accommodation"] },
  { id: "airport", label: "Airport Transfers", icon: "✈", categoryIds: ["transportation", "concierge"], subcategories: ["Airport Transfer"], keywords: "airport, fast-track, ngurah rai, dps" },
  { id: "transport", label: "Private Transportation", icon: "➤", categoryIds: ["transportation"], excludeSubcategories: ["Airport Transfer"], excludeKeywords: "airport, fast-track, ngurah rai, dps" },
  { id: "tours", label: "Tours & Attractions", icon: "◍", categoryIds: ["tours", "attractions"] },
  { id: "activities", label: "Activities & Experiences", icon: "✦", categoryIds: ["activities"] },
  { id: "adventure", label: "Adventures", icon: "▲", categoryIds: ["adventure"] },
  { id: "water", label: "Water Sports", icon: "≈", categoryIds: ["watersports"] },
  { id: "wellness", label: "Wellness & Spa", icon: "❀", categoryIds: ["wellness"] },
  { id: "dining", label: "Restaurants & Dining", icon: "♨", categoryIds: ["dining"], excludeSubcategories: ["Beach Club"] },
  { id: "beach", label: "Beach Clubs", icon: "☀", categoryIds: ["dining"], subcategories: ["Beach Club"] },
  { id: "yacht", label: "Yacht & Boat", icon: "⚓", categoryIds: ["yacht", "yacht-luxury"] },
  { id: "family", label: "Family & Entertainment", icon: "👨‍👩‍👧", categoryIds: ["family"] },
  { id: "events", label: "Celebrations & Events", icon: "✧", categoryIds: ["events", "concierge"] },
  { id: "culture", label: "Culture & Sightseeing", icon: "❂", categoryIds: ["culture", "tours", "attractions"] },
  { id: "premium", label: "Helicopter & Premium", icon: "🚁", categoryIds: ["premium"] },
  { id: "classes", label: "Classes & Workshops", icon: "✎", categoryIds: ["classes"] },
  { id: "retreats", label: "Wellness Retreats & Venues", icon: "❀", categoryIds: ["retreat-hosting", "retreat-packages", "wellness-spa"] },
  { id: "healing", label: "Healing & Holistic", icon: "☯", categoryIds: ["healing"] },
  { id: "beauty", label: "Beauty & Grooming", icon: "💇", categoryIds: ["beauty"] },

  { id: "other", label: "Other services", icon: "✧", catchAll: true },
];
const words = (v) => (Array.isArray(v) ? v : String(v || "").split(/[,|\n]/)).map((x) => x.trim().toLowerCase()).filter(Boolean);
export function compileCats(rules) {
  const list = rules.filter((r) => r.visible !== false).map((r) => {
    const cats = r.categoryIds || [], subs = r.subcategories || [], kws = words(r.keywords), xs = r.excludeSubcategories || [], xk = words(r.excludeKeywords);
    const base = (p) => {
      if (cats.length && !cats.includes(p.categoryId)) return false;
      const name = (p.name || "").toLowerCase();
      if ((subs.length || kws.length) && !(subs.includes(p.subcategory) || kws.some((k) => name.includes(k)))) return false;
      if (xs.includes(p.subcategory) || xk.some((k) => name.includes(k))) return false;
      return true;
    };
    return { ...r, base };
  });
  const normal = list.filter((c) => !c.catchAll);
  return list.map((c) => ({ ...c, match: c.catchAll ? (p) => !normal.some((n) => n.base(p)) : c.base }));
}
let catCache = { src: null, list: null };
export function pickerCats() {
  const rules = (D.db().cms.builder || {}).categories;
  const src = Array.isArray(rules) && rules.length ? rules : DEFAULT_CATS;
  if (catCache.src !== src) catCache = { src, list: compileCats(src) };
  return catCache.list;
}
export const PICKER_CATS = compileCats(DEFAULT_CATS);
export const SERVICE_CATS = PICKER_CATS.filter((c) => c.id !== "accommodation");
const catLabel = (p) => (pickerCats().find((c) => c.match(p)) || {}).label || D.db().categories.find((c) => c.id === p.categoryId)?.name || "";
const unitText = (p) => ({ night: "per room · per night", guest: "per person", person: "per person", class: "per person", ticket: "per person", activity: "per person", dive: "per diver", charter: "per charter", transfer: "per vehicle", vehicle: "per vehicle", package: "per package", day: "per day", "half-day": "per half day", session: "per session", event: "per event", service: "per service" }[p?.unit] || "per " + (p?.unit || "item"));
const img = (p) => p?.images?.[0]?.url || p?.img || "";
const gallery = (p) => (p?.images || []).map((x) => x.url).filter(Boolean);
const destOptions = () => [...new Set([...D.db().destinations.filter((d) => d.status !== "draft").map((d) => d.name), ...D.db().products.filter((p) => visible(p) && p.categoryId === "accommodation").map((p) => p.destination)])].filter(Boolean).sort();
const inDest = (p, dest) => !dest || dest === "all" || (p.destination || "").toLowerCase().includes(dest.toLowerCase()) || (p.location || "").toLowerCase().includes(dest.toLowerCase()) || /all regions|island-wide/i.test(p.destination + " " + (p.location || ""));

/* --------------------------- primitives --------------------------- */
const lab = "text-[11px] font-semibold uppercase tracking-[0.22em] text-stone";
const line = "mt-2 w-full border-b border-ivory/30 bg-transparent pb-2 text-[16px] text-ivory outline-none [color-scheme:dark] focus:border-gold";
const box = "w-full border border-ivory/25 bg-transparent px-3 py-2.5 text-[13px] text-ivory outline-none [color-scheme:dark] focus:border-gold";
const Btn = (props) => g.jsx(bridge.Button || "button", props);
const Zoom = ({ src, alt, gal, className, children }) => (bridge.Zoom ? g.jsx(bridge.Zoom, { src, alt, gallery: gal, className, children }) : g.jsx("div", { className, children }));
const tone = (t) => (t === "green" ? "text-emerald-300" : t === "amber" ? "text-gold-soft" : t === "red" ? "text-rose-300" : "text-stone");
const Avail = ({ sel }) => { const a = W.selAvailability(sel); return g.jsxs("span", { className: cx("inline-flex items-center gap-1.5 text-[12px] font-medium", tone(a.tone)), children: [g.jsx("span", { className: "h-1.5 w-1.5 rounded-full bg-current" }), a.text] }); };
const Field = ({ label, children, className }) => g.jsxs("label", { className: cx("block border border-ivory/25 bg-surface p-5", className), children: [g.jsx("span", { className: lab, children: label }), children] });
const Stepper = ({ value, onChange, min = 0, max = 30, small }) => g.jsxs("div", { className: "flex items-center gap-3", children: [
    g.jsx("button", { type: "button", onClick: () => onChange(Math.max(min, value - 1)), className: cx("grid place-items-center border border-ivory/30 text-ivory hover:border-gold", small ? "h-7 w-7" : "h-9 w-9"), children: "−" }),
    g.jsx("span", { className: cx("serif min-w-[2ch] text-center font-semibold text-ivory", small ? "text-xl" : "text-3xl"), children: value }),
    g.jsx("button", { type: "button", onClick: () => onChange(Math.min(max, value + 1)), className: cx("grid place-items-center border border-ivory/30 text-ivory hover:border-gold", small ? "h-7 w-7" : "h-9 w-9"), children: "+" }),
  ] });
const StepHead = ({ n, title, sub }) => g.jsxs("div", { children: [
    g.jsxs("p", { className: "text-[11px] uppercase tracking-[0.3em] text-gold", children: ["Step ", n + 1, " of ", STEPS.length] }),
    g.jsx("h2", { className: "serif mt-2 text-4xl font-semibold text-ivory md:text-5xl", children: title }),
    sub && g.jsx("p", { className: "mt-2 text-[15px] text-stone", children: sub }),
  ] });
export const BUILDER_TEXTS = {
  pageTitle: "Create your private vacation",
  pageIntro: "Tell us who is travelling, then build every day of your holiday — where you sleep, how you travel and as many experiences as you like. Save it, review it, and send it to our team.",
  pageIntroStrong: "Live availability, an estimated price as you go, and a formal quotation before any payment.",
  step1: "Guest details", step1Sub: "Who & when", step1Intro: "Who is travelling, when, and how to reach you. Your total days and PAX carry through the whole itinerary.",
  step2: "Day-by-day builder", step2Sub: "Every day, your way", step2Intro: "Build your holiday one day at a time. Add as many products as you like to each day, change or remove any of them, and move freely between days. Nothing is lost.",
  step3: "Review & submit", step3Sub: "Check & send", step3Intro: "Your complete itinerary in one view. Go back and edit anything — your selections are kept.",
  addProduct: "+ Add product", addAnother: "+ Add another product",
  save: "Save itinerary", submit: "Submit itinerary",
  groupAccommodation: "Accommodation", groupTransport: "Airport pickup & transportation", groupExp: "Tours, activities & experiences", groupDining: "Restaurants & dining", groupWellness: "Wellness & spa", groupOther: "Other services",
  taxLabel: "Tax & service charge",
  estimateNote: "Selling prices only. Subject to availability and confirmation by Prestige Bali Leisure.",
  consent: "I understand this is a booking inquiry, not a confirmed reservation. Prestige Bali Leisure will check availability and send my booking confirmation and invoice; my booking is confirmed only once the deposit is received.",
  submittedTitle: "Itinerary submitted · Inquiry ID",
  customRequests: "on",
};
export const T = (k) => { const v = ((D.db().cms.builder || {}).texts || {})[k]; return v === undefined || v === null || v === "" ? BUILDER_TEXTS[k] : v; };
const steps = () => [["✎", T("step1"), T("step1Sub")], ["▦", T("step2"), T("step2Sub")], ["✓", T("step3"), T("step3Sub")]];
const STEPS = { get length() { return 3; } };
const Nav = ({ api, back, next, label }) => g.jsxs("div", { className: "mt-10 flex flex-wrap gap-4", children: [
    back !== undefined && g.jsx(Btn, { onClick: () => api.go(back), variant: "outline", children: "← Back" }),
    next !== undefined && g.jsx(Btn, { onClick: () => api.go(next), children: label || "Continue" }),
  ] });

/* ----------------------------- selections ------------------------- */
function newSel(slug, info, legs, o = {}) {
  const p = D.productOf(slug);
  if (!p) return null;
  const inv = I.getInventory(slug);
  const pax = Math.max(1, W.totalPax(info));
  const cap = W.capNum(p) || (Number(p.maxPax) || null);
  const base = { id: uid("S"), slug, poolId: o.poolId || inv?.pools[0]?.id, note: "", order: Date.now() };
  if (p.categoryId === "accommodation" || I.isNightly(p)) {
    const from = o.date && o.date >= info.arrival && o.date < info.departure ? o.date : info.arrival;
    const next = (o.others || []).filter((x) => x.kind === "stay" && x.from > from).map((x) => x.from).sort()[0];
    const to = o.to && o.to > from && o.to <= info.departure ? o.to : next && next < info.departure ? next : info.departure > from ? info.departure : D.addDays(from, 1);
    const gpr = cap ? Math.min(cap, pax) : pax;
    return { ...base, kind: "stay", legId: "", from, to, rooms: Math.max(1, Number(o.qty) || Math.ceil(pax / gpr)), guestsPerRoom: gpr };
  }
  const date = o.date && o.date >= info.arrival && o.date <= info.departure ? o.date : o.day ? D.addDays(info.arrival, Math.max(0, o.day - 1)) : info.arrival;
  const pool = inv?.pools.find((x) => x.id === base.poolId);
  const adults = o.qty && W.isPerPerson(p) ? Math.min(Number(o.qty), Number(info.adults) || 1) : Number(info.adults) || 1;
  const children = o.qty && W.isPerPerson(p) ? Math.max(0, Number(o.qty) - adults) : Number(info.children) || 0;
  return { ...base, kind: "service", date, adults, children, qty: W.isPerPerson(p) ? 1 : Math.max(1, cap ? Math.ceil(pax / cap) : Number(o.qty) || 1), time: pool?.time || "", duration: p.duration || "" };
}

/* ============================== PAGE ============================== */
export function SiteVacationBuilder({ initialAdd }) {
  const [s, set] = useVacation();
  useDBTick();
  const auth = bridge.useAuth ? bridge.useAuth() : {};
  const cart = bridge.useCart ? bridge.useCart() : { items: [] };
  const [picker, setPicker] = useState(() => {
    const p = initialAdd && D.productOf(initialAdd);
    return p ? { date: store.info.arrival, cat: p.categoryId === "accommodation" ? "accommodation" : (pickerCats().find((c) => c.match(p)) || {}).id, open: initialAdd } : null;
  });
  const [edit, setEdit] = useState(null);
  const info = s.info;
  const est = W.estimate(s.sels);
  const nights = Math.max(0, D.daysBetween(info.arrival, info.departure));

  useEffect(() => {
    const u = auth?.user;
    if (!u || u.role !== "customer" || info.email) return;
    const c = D.db().customers.find((x) => (x.email || "").toLowerCase() === u.email.toLowerCase());
    set({ info: { ...info, name: c?.name || u.name, email: u.email, phone: c?.phone || "", country: c?.country || "" } });
  }, [auth?.user?.email]);
  /* products added from product pages arrive through the site cart */
  useEffect(() => {
    const fresh = (cart.items || []).filter((it) => !s.imported.includes(it.id));
    if (!fresh.length) return;
    const add = fresh.map((it) => newSel(it.slug, s.info, s.legs, { date: it.date, to: it.to, qty: it.qty, poolId: it.poolId, day: it.day })).filter(Boolean);
    set({ sels: [...s.sels, ...add], imported: [...s.imported, ...fresh.map((x) => x.id)], submitted: null });
    fresh.forEach((it) => cart.remove && cart.remove(it.id));
  }, [cart.items?.length]);
  useEffect(() => {
    if (!initialAdd || !D.productOf(initialAdd)) return;
    const p = D.productOf(initialAdd);
    set({ step: 1 });
  }, [initialAdd]);

  const go = (step) => { set({ step }); typeof window !== "undefined" && window.scrollTo && window.scrollTo({ top: 0, behavior: "smooth" }); };
  const upsert = (sel, replaceId) => {
    const exists = s.sels.some((x) => x.id === (replaceId || sel.id));
    set({ sels: exists ? s.sels.map((x) => (x.id === (replaceId || sel.id) ? sel : x)) : [...s.sels, sel], submitted: null });
  };
  const [confirmDel, setConfirmDel] = useState(null);
  const remove = (id) => setConfirmDel(s.sels.find((x) => x.id === id) || null);
  const replace = (sel) => { const p = D.productOf(sel.slug); setPicker({ date: sel.kind === "stay" ? sel.from : sel.date, cat: sel.kind === "stay" ? "accommodation" : (pickerCats().find((c) => c.match(p)) || {}).id, replace: sel }); };
  const [saveErrors, setSaveErrors] = useState([]);
  const dirty = !s.draft?.tripId || s.draft.hash !== hashOf(s);
  /* SAVE ITINERARY — keeps everything under a Trip ID; never submits */
  const save = (thenStep = 2) => {
    const r = W.saveDraft({ info: s.info, sels: s.sels, custom: s.custom, titles: s.titles }, s.draft?.tripId);
    if (!r.ok) { setSaveErrors(r.errors); return false; }
    setSaveErrors([]);
    set({ draft: { tripId: r.tripId, savedAt: r.savedAt, hash: hashOf(s) } });
    if (thenStep !== null) go(thenStep);
    return true;
  };
  const api = { s, set, go, remove, replace, upsert, setPicker, setEdit, est, nights, save, saveErrors, dirty };


  return g.jsxs(Shell, { api, children: [
      s.lastSubmitted && g.jsx(SubmittedBanner, { api }),
      s.step === 0 && g.jsx(StepInfo, { api }),
      s.step === 1 && g.jsx(StepDays, { api }),
      s.step >= 2 && g.jsx(StepOverview, { api, user: auth?.user }),
      picker && g.jsx(Picker, { api, ...picker, onClose: () => setPicker(null) }),
      edit && g.jsx(EditModal, { api, sel: edit, onClose: () => setEdit(null) }),
      confirmDel && g.jsx(ConfirmRemove, { sel: confirmDel, info, onKeep: () => setConfirmDel(null), onRemove: () => { set({ sels: store.sels.filter((x) => x.id !== confirmDel.id) }); setConfirmDel(null); } }),
    ] });
}
function ConfirmRemove({ sel, info, onKeep, onRemove }) {
  const p = D.productOf(sel.slug);
  const dayN = D.daysBetween(info.arrival, sel.kind === "stay" ? sel.from : sel.date) + 1;
  return g.jsx("div", { className: "fixed inset-0 z-[90] grid place-items-center bg-ink/90 p-4 backdrop-blur-sm", onClick: onKeep, children: g.jsxs("div", { role: "alertdialog", "aria-modal": "true", onClick: (e) => e.stopPropagation(), className: "w-full max-w-md border-2 border-ivory bg-surface p-7", children: [
      g.jsx("p", { className: "text-[11px] uppercase tracking-[0.3em] text-gold", children: "Remove product" }),
      g.jsxs("p", { className: "serif mt-2 text-2xl font-semibold text-ivory", children: ["Remove ", p?.name || "this product", " from Day ", dayN, "?"] }),
      g.jsx("p", { className: "mt-3 text-[14px] leading-relaxed text-stone", children: "It will be taken off your itinerary and your estimate updates immediately. All your other selections stay exactly as they are." }),
      g.jsxs("div", { className: "mt-6 grid grid-cols-2 gap-3", children: [g.jsx(Btn, { onClick: onKeep, variant: "outline", className: "w-full", children: "Keep it" }), g.jsx(Btn, { onClick: onRemove, variant: "gold", className: "w-full", children: "Yes, remove" })] }),
    ] }) });
}
function useDBTick() { const [, f] = useState(0); useEffect(() => D.subscribe(() => f((n) => n + 1)), []); }

/* ============================== SHELL ============================= */
function Shell({ api, children }) {
  const { s, go, est, nights } = api;
  const Link = bridge.Link;
  const w = W.destinationsFromStays(s.info, s.sels);
  return g.jsxs("div", { className: "mx-auto max-w-[1360px] px-5 pb-24 pt-32 md:px-8 md:pt-36", children: [
      g.jsxs("nav", { "aria-label": "Breadcrumb", className: "mb-6 flex flex-wrap items-center gap-2 text-[12px] uppercase tracking-[0.18em] text-stone", children: [
          g.jsx(Link, { to: "/", className: "link-sweep", children: "Home" }), g.jsx("span", { className: "text-ivory/30", children: "/" }),
          g.jsx(Link, { to: "/marketplace", className: "link-sweep", children: "Marketplace" }), g.jsx("span", { className: "text-ivory/30", children: "/" }),
          g.jsx("span", { className: "text-ivory", children: "Vacation builder" }),
        ] }),
      g.jsxs("div", { className: "flex flex-wrap items-end justify-between gap-6", children: [
          g.jsxs("div", { children: [
              g.jsx("h1", { className: "serif font-semibold text-ivory", style: { fontSize: "clamp(2.4rem, 5vw, 4rem)", lineHeight: 1 }, children: T("pageTitle") }),
              g.jsxs("p", { className: "mt-4 max-w-2xl text-[15px] leading-relaxed text-stone", children: [T("pageIntro"), " ", g.jsx("span", { className: "text-ivory", children: T("pageIntroStrong") })] }),
            ] }),
          g.jsxs("div", { className: "border-2 border-ivory bg-cream/70 px-5 py-4 text-[12px] uppercase tracking-[0.2em] text-ivory", children: [nights + 1, " days · ", nights, " nights · ", W.totalPax(s.info), " pax"] }),
        ] }),
      g.jsxs("div", { className: "mt-14 grid gap-12 xl:grid-cols-[240px_1fr_320px] xl:gap-10", children: [
          g.jsx("aside", { children: g.jsx("div", { className: "flex gap-1 overflow-x-auto xl:sticky xl:top-28 xl:block", children: steps().map(([icon, name, sub], i) => g.jsxs("button", {
              onClick: () => go(i),
              className: cx("group flex shrink-0 items-center gap-4 border-l-2 px-4 py-3 text-left transition-colors duration-200 xl:w-full", i === s.step ? "border-gold bg-cream/70" : "border-ivory/10 hover:border-gold/50 hover:bg-cream/40"),
              children: [g.jsx("span", { className: cx("w-5 text-center text-lg", i === s.step ? "text-gold" : "text-stone/70"), children: icon }), g.jsxs("span", { children: [g.jsxs("span", { className: cx("block text-[13px] font-semibold", i === s.step ? "text-ivory" : "text-stone"), children: [i + 1, ". ", name] }), g.jsx("span", { className: "hidden text-[10px] uppercase tracking-[0.16em] text-stone/70 xl:block", children: sub })] })],
            }, name)) }) }),
          g.jsx("main", { className: "min-w-0", children }),
          g.jsx("aside", { className: "xl:sticky xl:top-28 xl:self-start", children: g.jsxs("div", { className: "border-2 border-ivory bg-ink text-ivory", children: [
              g.jsxs("div", { className: "border-b border-ivory/20 px-6 py-5", children: [g.jsx("p", { className: lab, children: "Your vacation" }), g.jsx("p", { className: "serif mt-1 text-2xl font-semibold", children: s.info.name ? s.info.name.split(" ")[0] + "'s Bali" : "Your Bali" }), g.jsxs("p", { className: "mt-1 text-[12px] text-stone", children: [D.fmtDate(s.info.arrival), " – ", D.fmtDate(s.info.departure), " · ", W.totalPax(s.info), " pax", Number(s.info.infants) ? " + " + s.info.infants + " infant" + (s.info.infants > 1 ? "s" : "") : ""] })] }),
              g.jsx("div", { className: "space-y-1.5 border-b border-ivory/20 px-6 py-4 text-[13px]", children: w.length ? w.map((l, i) => g.jsxs("button", { onClick: () => go(1), className: "flex w-full justify-between text-left text-stone hover:text-ivory", children: [g.jsxs("span", { children: [i + 1, ". ", l.destination] }), g.jsxs("span", { className: "text-ivory", children: [l.nights, " night", l.nights === 1 ? "" : "s"] })] }, l.id)) : g.jsx("p", { className: "text-stone", children: "Choose accommodation within your days" }) }),
              g.jsx("div", { className: "border-b border-ivory/20 px-6 py-3 text-[12px]", children: s.draft?.tripId ? g.jsxs("p", { className: api.dirty ? "text-gold-soft" : "text-emerald-300", children: ["Trip ", s.draft.tripId, api.dirty ? " · unsaved changes" : " · saved " + new Date(s.draft.savedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })] }) : g.jsx("p", { className: "text-stone", children: "Not saved yet" }) }),
              g.jsx(Breakdown, { api }),
              g.jsxs("div", { className: "border-t border-ivory/20 px-6 py-5", children: [
                  g.jsxs("div", { className: "flex items-baseline justify-between", children: [g.jsx("span", { className: lab, children: "Estimated total" }), g.jsx("span", { className: "serif text-3xl font-semibold text-gold-soft", children: D.money(est.total) })] }),
                  g.jsx("p", { className: "mt-1 text-[11px] leading-relaxed text-stone", children: T("estimateNote") }),
                  g.jsxs("div", { className: "mt-4 grid gap-2", children: [g.jsx(Btn, { onClick: () => api.save(2), variant: "gold", className: "w-full", children: T("save") }), g.jsx(Btn, { onClick: () => go(2), variant: "outline", className: "w-full", children: "Review & submit" })] }),
                ] }),
            ] }) }),
        ] }),
    ] });
}

function Breakdown({ api }) {
  const { s, est } = api;
  const [open, setOpen] = useState(false);
  const stays = s.sels.filter((x) => x.kind === "stay");
  const nightsBooked = stays.reduce((t, x) => t + Math.max(0, D.daysBetween(x.from, x.to)), 0);
  const items = [...s.sels].sort((a, b) => (a.from || a.date || "").localeCompare(b.from || b.date || ""));
  const row = (k, v, strong) => g.jsxs("div", { className: "flex justify-between gap-3 py-0.5", children: [g.jsx("span", { children: k }), g.jsx("span", { className: cx("tabular-nums", strong ? "text-ivory" : "text-ivory/80"), children: v })] }, k);
  return g.jsxs("div", { className: "space-y-1 border-b border-ivory/20 px-6 py-4 text-[13px] text-stone", children: [
      row("Accommodation nights", nightsBooked + " of " + Math.max(0, D.daysBetween(s.info.arrival, s.info.departure))),
      row("Selected products", s.sels.length),
      est.onRequest > 0 && row("Priced on request", est.onRequest + " item" + (est.onRequest === 1 ? "" : "s")),
      g.jsx("button", { onClick: () => setOpen(!open), className: "pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-soft hover:text-ivory", children: open ? "Hide price breakdown ▴" : "Show price breakdown ▾" }),
      open && g.jsx("div", { className: "max-h-64 space-y-1 overflow-y-auto pr-1 text-[12px]", children: items.length ? items.map((x) => { const p = D.productOf(x.slug); return g.jsxs("div", { className: "flex justify-between gap-3", children: [g.jsxs("span", { className: "truncate", children: ["D", D.daysBetween(s.info.arrival, x.from || x.date) + 1, " · ", p?.name] }), g.jsx("span", { className: "tabular-nums text-ivory/80", children: priceText(x) })] }, x.id); }) : g.jsx("p", { children: "Nothing selected yet." }) }),
      g.jsxs("div", { className: "mt-2 border-t border-ivory/15 pt-2", children: [row("Subtotal", D.money(est.subtotal)), row(T("taxLabel") + " " + est.taxRate + "%", D.money(est.tax))] }),
    ] });
}

/* ============================ CALENDARS =========================== */
/* Month calendars in the site's style. RangeCalendar: click check-in,
   then check-out. DateCalendar: one date. Both respect min/max and can
   show availability or day numbers for each date. */
const monthKey = (d) => d.slice(0, 7);
const addMonths = (ym, n) => { const [y, m] = ym.split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1 + n, 1)); return dt.toISOString().slice(0, 7); };
const monthDays = (ym) => { const [y, m] = ym.split("-").map(Number); const first = new Date(Date.UTC(y, m - 1, 1)); const lead = (first.getUTCDay() + 6) % 7; const n = new Date(Date.UTC(y, m, 0)).getUTCDate(); return { lead, dates: Array.from({ length: n }, (_, i) => ym + "-" + String(i + 1).padStart(2, "0")) }; };
const monthLabel = (ym) => new Date(ym + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const TONE_DOT = { green: "bg-emerald-400", amber: "bg-gold", red: "bg-rose-400", neutral: "bg-ivory/30" };
function MonthGrid({ ym, cell }) {
  const { lead, dates } = monthDays(ym);
  return g.jsxs("div", { children: [
      g.jsx("p", { className: "mb-3 text-center text-[12px] font-semibold uppercase tracking-[0.2em] text-ivory", children: monthLabel(ym) }),
      g.jsxs("div", { className: "grid grid-cols-7 gap-1", children: [
          ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((w) => g.jsx("span", { className: "pb-1 text-center text-[10px] uppercase tracking-[0.12em] text-stone", children: w }, w)),
          Array.from({ length: lead }, (_, i) => g.jsx("span", {}, "x" + i)),
          dates.map((d) => cell(d)),
        ] }),
    ] });
}
function CalendarFrame({ start, months, children, canPrev, onPrev, onNext, footer }) {
  return g.jsxs("div", { className: "border border-ivory/25 bg-ink/40 p-4", children: [
      g.jsxs("div", { className: "mb-2 flex items-center justify-between", children: [
          g.jsx("button", { type: "button", onClick: onPrev, disabled: !canPrev, "aria-label": "Previous month", className: "grid h-8 w-8 place-items-center border border-ivory/25 text-ivory hover:border-gold disabled:opacity-30", children: "‹" }),
          g.jsx("span", { className: "text-[10px] uppercase tracking-[0.2em] text-stone", children: "Calendar" }),
          g.jsx("button", { type: "button", onClick: onNext, "aria-label": "Next month", className: "grid h-8 w-8 place-items-center border border-ivory/25 text-ivory hover:border-gold", children: "›" }),
        ] }),
      g.jsx("div", { className: cx("grid gap-6", months > 1 ? "sm:grid-cols-2" : ""), children: Array.from({ length: months }, (_, i) => children(addMonths(start, i))) }),
      footer,
    ] });
}
export function RangeCalendar({ from, to, onChange, min, max, months = 2, dayInfo, startLabel = "check-in", endLabel = "check-out" }) {
  const [view, setView] = useState(monthKey(from || min || D.today()));
  const [pending, setPending] = useState(null);
  const [hover, setHover] = useState(null);
  const out = (d, asEnd) => (min && (asEnd ? d <= min : d < min)) || (max && (asEnd ? d > max : d >= max));
  const a = pending || from, b = pending ? (hover && hover > pending ? hover : null) : to;
  const click = (d) => {
    if (!pending) { if (out(d, false)) return; setPending(d); return; }
    if (d <= pending) { if (!out(d, false)) setPending(d); return; }
    if (out(d, true)) return;
    onChange(pending, d); setPending(null); setHover(null);
  };
  const cell = (d) => {
    const disabled = pending ? d <= pending ? out(d, false) : out(d, true) : out(d, false);
    const isA = d === a, isB = d === b, inR = a && b && d > a && d < b;
    const info = dayInfo ? dayInfo(d) : null;
    return g.jsxs("button", {
      type: "button", disabled, onClick: () => click(d), onMouseEnter: () => pending && setHover(d),
      "aria-label": new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + (isA ? ", " + startLabel : isB ? ", " + endLabel : "") + (info?.label ? ", " + info.label : ""),
      title: info?.label || "",
      className: cx("relative flex h-10 flex-col items-center justify-center text-[13px] transition-colors", disabled ? "cursor-not-allowed text-ivory/20" : "text-ivory hover:border hover:border-gold", (isA || isB) && "bg-gold font-semibold text-deep", inR && "bg-gold/15", d === D.today() && !isA && !isB && "ring-1 ring-inset ring-ivory/30"),
      children: [Number(d.slice(-2)), info?.tone && !disabled && g.jsx("span", { className: cx("absolute bottom-1 h-1 w-1 rounded-full", isA || isB ? "bg-deep" : TONE_DOT[info.tone]) })],
    }, d);
  };
  const nights = from && to ? D.daysBetween(from, to) : 0;
  return g.jsx(CalendarFrame, { start: view, months, canPrev: !min || view > monthKey(min), onPrev: () => setView(addMonths(view, -1)), onNext: () => setView(addMonths(view, 1)),
    footer: g.jsx("p", { className: "mt-3 text-center text-[12px] text-stone", children: pending ? "Now choose your " + endLabel + " date" : from && to ? D.fmtDate(from) + " → " + D.fmtDate(to) + " · " + nights + " night" + (nights === 1 ? "" : "s") : "Choose your " + startLabel + " date" }),
    children: (ym) => g.jsx(MonthGrid, { ym, cell }, ym) });
}
export function DateCalendar({ value, onChange, min, max, months = 1, dayInfo }) {
  const [view, setView] = useState(monthKey(value || min || D.today()));
  const cell = (d) => {
    const disabled = (min && d < min) || (max && d > max);
    const info = dayInfo ? dayInfo(d) : null;
    return g.jsxs("button", {
      type: "button", disabled, onClick: () => onChange(d),
      "aria-label": new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) + (info?.label ? ", " + info.label : ""), title: info?.label || "",
      className: cx("relative flex h-11 flex-col items-center justify-center text-[13px] leading-none transition-colors", disabled ? "cursor-not-allowed text-ivory/20" : "text-ivory hover:border hover:border-gold", d === value && "bg-gold font-semibold text-deep", !disabled && d !== value && info?.inTrip && "bg-gold/10"),
      children: [Number(d.slice(-2)), info?.sub && !disabled && g.jsx("span", { className: cx("mt-0.5 text-[8px] uppercase tracking-wide", d === value ? "text-deep" : "text-stone"), children: info.sub }), info?.tone && !disabled && g.jsx("span", { className: cx("absolute right-1 top-1 h-1 w-1 rounded-full", d === value ? "bg-deep" : TONE_DOT[info.tone]) })],
    }, d);
  };
  return g.jsx(CalendarFrame, { start: view, months, canPrev: !min || view > monthKey(min), onPrev: () => setView(addMonths(view, -1)), onNext: () => setView(addMonths(view, 1)), children: (ym) => g.jsx(MonthGrid, { ym, cell }, ym) });
}
/* availability for one product on one date, for calendar dots */
const availInfo = (slug, poolId, units) => (d, night) => {
  const rs = night ? I.rangeStat(slug, d, D.addDays(d, 1), poolId, units) : I.rangeStat(slug, d, null, poolId, units);
  const l = I.customerLabel(slug, rs, units);
  return { tone: l.tone === "neutral" ? null : l.tone, label: l.text };
};

function TravelDates({ api }) {
  const { s, set } = api;
  const f = s.info;
  const nights = Math.max(0, D.daysBetween(f.arrival, f.departure));
  const apply = (from, to) => { const sh = shiftTrip(s, from); set({ ...sh, info: { ...(sh.info || f), arrival: from, departure: to } }); };
  return g.jsxs("div", { className: "border border-ivory/25 bg-surface p-5 sm:col-span-2", children: [
      g.jsxs("div", { className: "flex flex-wrap items-end justify-between gap-4", children: [
          g.jsxs("div", { children: [g.jsx("span", { className: lab, children: "Travel dates — check-in to check-out" }), g.jsxs("p", { className: "serif mt-2 text-2xl font-semibold text-ivory", children: [D.fmtDate(f.arrival), " → ", D.fmtDate(f.departure), g.jsxs("span", { className: "ml-3 text-[13px] font-normal text-stone", children: [nights + 1, " days · ", nights, " nights"] })] })] }),
          g.jsxs("div", { className: "flex flex-wrap gap-3", children: [
              g.jsxs("label", { children: [g.jsx("span", { className: lab, children: "Arrival" }), g.jsx("input", { type: "date", min: D.today(), value: f.arrival, onChange: (e) => { const v = e.target.value; if (v) set(shiftTrip(s, v)); }, className: cx(box, "mt-1") })] }),
              g.jsxs("label", { children: [g.jsx("span", { className: lab, children: "Departure" }), g.jsx("input", { type: "date", min: D.addDays(f.arrival, 1), value: f.departure, onChange: (e) => e.target.value && set({ info: { ...f, departure: e.target.value } }), className: cx(box, "mt-1") })] }),
            ] }),
        ] }),
      g.jsx("div", { className: "mt-4", children: g.jsx(RangeCalendar, { from: f.arrival, to: f.departure, min: D.today(), months: 2, startLabel: "arrival", endLabel: "departure", onChange: apply }, f.arrival + f.departure) }),
      s.sels.length > 0 && g.jsx("p", { className: "mt-3 text-[11px] text-stone", children: "Changing arrival moves your whole itinerary — every product keeps its day. A shorter trip trims your last stay." }),
    ] });
}

/* ========================== STEP 1: DETAILS ======================= */
function StepInfo({ api }) {
  const { s, set } = api;
  const f = s.info;
  const up = (k, v) => set({ info: { ...f, [k]: v } });
  const nights = Math.max(0, D.daysBetween(f.arrival, f.departure));
  const counter = (k, label, min) => g.jsx(Field, { label, children: g.jsx("div", { className: "mt-3", children: g.jsx(Stepper, { value: Number(f[k]) || 0, min, max: 40, onChange: (v) => up(k, v) }) }) });
  return g.jsxs("div", { children: [
      g.jsx(StepHead, { n: 0, title: T("step1"), sub: T("step1Intro") }),
      g.jsx(Resume, { api }),
      g.jsxs("div", { className: "mt-9 grid gap-4 sm:grid-cols-2", children: [
          g.jsx(Field, { label: "Full name", children: g.jsx("input", { value: f.name, onChange: (e) => up("name", e.target.value), autoComplete: "name", className: line }) }),
          g.jsx(Field, { label: "Email address", children: g.jsx("input", { type: "email", value: f.email, onChange: (e) => up("email", e.target.value), autoComplete: "email", className: line }) }),
          g.jsx(Field, { label: "WhatsApp / contact number (with country code)", children: g.jsx("input", { type: "tel", value: f.phone, placeholder: "+44 7700 900123", onChange: (e) => up("phone", e.target.value), autoComplete: "tel", className: line }) }),
          g.jsx(Field, { label: "Country", children: g.jsx("input", { value: f.country, onChange: (e) => up("country", e.target.value), autoComplete: "country-name", className: line }) }),
          g.jsx(TravelDates, { api }),
        ] }),
      g.jsxs("div", { className: "mt-4 grid gap-4 sm:grid-cols-3", children: [counter("adults", "Adults", 1), counter("children", "Children (2–12)", 0), counter("infants", "Infants (under 2)", 0)] }),
      g.jsxs("div", { className: "mt-4 grid gap-4 sm:grid-cols-2", children: [
          g.jsxs("div", { className: "flex flex-wrap items-end justify-between gap-3 border-2 border-ivory bg-cream/70 p-5", children: [g.jsxs("div", { children: [g.jsx("p", { className: lab, children: "Total vacation duration" }), g.jsxs("p", { className: "serif mt-2 text-3xl font-semibold text-ivory", children: [nights + 1, " days / ", nights, " nights"] })] }), g.jsx(Stepper, { small: true, value: nights, min: 1, max: 45, onChange: (v) => up("departure", D.addDays(f.arrival, v)) })] }),
          g.jsxs("div", { className: "border-2 border-ivory bg-cream/70 p-5", children: [g.jsx("p", { className: lab, children: "Total travellers (PAX)" }), g.jsxs("p", { className: "serif mt-2 text-3xl font-semibold text-ivory", children: [W.totalPax(f), Number(f.infants) ? g.jsxs("span", { className: "text-xl text-stone", children: [" + ", f.infants, " infant", f.infants > 1 ? "s" : ""] }) : null] })] }),
        ] }),
      g.jsx(Field, { label: "Special requests", className: "mt-4", children: g.jsx("textarea", { rows: 4, value: f.requests, onChange: (e) => up("requests", e.target.value), placeholder: "Celebrations, dietary needs, mobility, pace, anything we should know…", className: cx(line, "resize-y") }) }),
      g.jsx(Nav, { api, next: 1, label: "Start building your days" }),
    ] });
}

function Resume({ api }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ trip: "", email: "" });
  const [err, setErr] = useState("");
  return g.jsx("div", { className: "mt-6", children: open ? g.jsxs("div", { className: "flex flex-wrap items-end gap-3 border border-ivory/25 bg-surface p-5", children: [
      g.jsxs("label", { className: "min-w-[160px] flex-1", children: [g.jsx("span", { className: lab, children: "Trip ID" }), g.jsx("input", { value: f.trip, onChange: (e) => setF({ ...f, trip: e.target.value }), placeholder: "TRP-00001", className: line })] }),
      g.jsxs("label", { className: "min-w-[220px] flex-1", children: [g.jsx("span", { className: lab, children: "Email used to save" }), g.jsx("input", { type: "email", value: f.email, onChange: (e) => setF({ ...f, email: e.target.value }), className: line })] }),
      g.jsx(Btn, { onClick: () => { const r = W.loadDraft(f.trip, f.email); if (!r.ok) return setErr(r.error); api.set({ ...r.state, draft: { tripId: r.tripId, savedAt: r.savedAt, hash: hashOf(r.state) }, step: 1, submitted: null }); }, children: "Resume itinerary" }),
      err && g.jsx("p", { className: "w-full text-[13px] text-rose-300", children: err }),
    ] }) : g.jsx("button", { onClick: () => setOpen(true), className: "text-[12px] uppercase tracking-[0.18em] text-gold-soft hover:text-ivory", children: "Have a saved itinerary? Resume it with your Trip ID →" }) });
}

const actBtn = "border border-ivory/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/85 transition-colors hover:border-ivory hover:text-ivory";
const ItemActions = ({ api, sel }) => g.jsxs("div", { className: "flex flex-wrap justify-end gap-1.5", children: [
    g.jsx("button", { onClick: () => api.setEdit({ ...sel, _view: true }), className: "px-1.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone hover:text-ivory", children: "Details" }),
    g.jsx("button", { onClick: () => api.setEdit(sel), className: actBtn, title: "Change date, time, PAX, quantity or requests", children: "Edit" }),
    g.jsx("button", { onClick: () => api.replace(sel), className: actBtn, title: "Choose a different product instead", children: "Change" }),
    g.jsx("button", { onClick: () => api.remove(sel.id), className: "border border-rose-400/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-300 hover:border-rose-300", children: "Remove" }),
  ] });
const itemsOn = (s, d) => s.sels.filter((x) => x.kind !== "stay" && x.date === d).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const DAY_GROUPS = [
  { id: "transport", get label() { return T("groupTransport"); }, test: (p) => p?.categoryId === "transportation" || (p && isAirport(p)) },
  { id: "exp", get label() { return T("groupExp"); }, test: (p) => ["activities", "adventure", "attractions", "tours", "watersports", "yacht", "yacht-luxury", "family", "events", "culture", "premium", "classes", "retreat-hosting", "retreat-packages", "healing", "beauty", "wellness-spa"].includes(p?.categoryId) },
  { id: "dining", get label() { return T("groupDining"); }, test: (p) => p?.categoryId === "dining" },
  { id: "wellness", get label() { return T("groupWellness"); }, test: (p) => p?.categoryId === "wellness" },
  { id: "other", get label() { return T("groupOther"); }, test: () => true },
];
const longDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }).toUpperCase();
const weekday = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long" });
const shortDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const scrollToDay = (i) => setTimeout(() => typeof document !== "undefined" && document.getElementById?.("day-" + i)?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 60);

function StepDays({ api }) {
  const { s, set, setPicker } = api;
  const meta = W.dayMeta(s.info, [], s.sels);
  const days = meta.map((m) => m.date);
  const [draft, setDraft] = useState({});
  const stays = s.sels.filter((x) => x.kind === "stay");
  const unscheduled = s.sels.filter((x) => (x.kind === "stay" ? x.from >= s.info.departure || x.to <= s.info.arrival : !days.includes(x.date)));
  const open = new Set((s.open || [0]).filter((i) => i < meta.length));
  const setOpen = (arr) => set({ open: [...new Set(arr)] });
  const toggle = (i) => setOpen(open.has(i) ? [...open].filter((x) => x !== i) : [...open, i]);
  const focus = (i) => { setOpen([i]); scrollToDay(i); };
  const setSel = (id, patch) => set({ sels: s.sels.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const move = (d, id, dir, groupId) => { const list = itemsOn(s, d).filter((x) => groupOf(D.productOf(x.slug)) === groupId); const i = list.findIndex((x) => x.id === id); const j = i + dir; if (j < 0 || j >= list.length) return; const a = list[i], b = list[j]; set({ sels: s.sels.map((x) => (x.id === a.id ? { ...x, order: b.order } : x.id === b.id ? { ...x, order: a.order } : x)) }); };
  const addCustom = (d) => { if (!draft[d]?.trim()) return; set({ custom: [...s.custom, { id: uid("C"), date: d, text: draft[d].trim(), time: "" }] }); setDraft({ ...draft, [d]: "" }); };
  const countOf = (d) => itemsOn(s, d).length + stays.filter((x) => x.from === d).length + s.custom.filter((c) => c.date === d).length;
  const emptyDays = meta.filter((m) => countOf(m.date) === 0);
  const [showCal, setShowCal] = useState(false);
  return g.jsxs("div", { children: [
      g.jsx(StepHead, { n: 1, title: T("step2"), sub: T("step2Intro") }),

      g.jsxs("div", { className: "sticky top-[76px] z-10 mt-8 border border-ivory/25 bg-ink/95 p-4 backdrop-blur", children: [
          g.jsxs("div", { className: "mb-3 flex flex-wrap items-center justify-between gap-2", children: [
              g.jsxs("p", { className: "text-[12px] text-stone", children: [g.jsx("span", { className: "text-ivory", children: meta.length - emptyDays.length }), " of ", meta.length, " days planned", emptyDays.length ? g.jsxs("span", { className: "text-gold-soft", children: [" · ", emptyDays.length, " still empty"] }) : g.jsx("span", { className: "text-emerald-300", children: " · every day has a plan" })] }),
              g.jsxs("div", { className: "flex gap-3 text-[10px] font-semibold uppercase tracking-[0.18em]", children: [g.jsx("button", { onClick: () => setShowCal(!showCal), className: showCal ? "text-gold-soft" : "text-stone hover:text-ivory", children: showCal ? "Hide calendar" : "Calendar view" }), g.jsx("button", { onClick: () => setOpen(meta.map((m) => m.index)), className: "text-stone hover:text-ivory", children: "Expand all" }), g.jsx("button", { onClick: () => setOpen([]), className: "text-stone hover:text-ivory", children: "Collapse all" })] }),
            ] }),
          showCal && g.jsx("div", { className: "mb-3", children: g.jsx(DateCalendar, { value: meta[[...open][0] ?? 0]?.date, min: s.info.arrival, max: s.info.departure, months: monthKey(s.info.arrival) === monthKey(s.info.departure) ? 1 : 2, onChange: (x) => { const m = meta.find((y) => y.date === x); if (m) { focus(m.index); setShowCal(false); } }, dayInfo: (x) => { const n = countOf(x); return { inTrip: true, sub: n ? n + " sel." : "empty", tone: n ? "green" : "amber", label: "Day " + (D.daysBetween(s.info.arrival, x) + 1) + (n ? " · " + n + " selected" : " · nothing planned yet") }; } }) }),
          g.jsx("div", { className: "flex gap-1.5 overflow-x-auto pb-1", children: meta.map((m) => { const n = countOf(m.date); return g.jsxs("button", {
              onClick: () => focus(m.index), title: weekday(m.date) + " " + longDate(m.date) + (m.destination ? " · " + m.destination : ""),
              className: cx("shrink-0 border px-3 py-2 text-left transition-colors", open.has(m.index) ? "border-gold bg-gold/15" : n ? "border-ivory/30 hover:border-ivory" : "border-dashed border-gold/50 hover:border-gold"),
              children: [
                g.jsxs("span", { className: "block text-[11px] font-semibold uppercase tracking-[0.14em] text-ivory", children: ["Day ", m.index + 1] }),
                g.jsx("span", { className: "block text-[10px] text-stone", children: shortDate(m.date) }),
                g.jsx("span", { className: cx("mt-1 block text-[10px] font-semibold", n ? "text-emerald-300" : "text-gold-soft"), children: n ? n + " selected" : "empty" }),
              ],
            }, m.date); }) }),
        ] }),

      unscheduled.length > 0 && g.jsxs("div", { className: "mt-6 border border-gold bg-gold/10 p-5", children: [
          g.jsx("p", { className: lab, children: "Outside your travel dates — choose a day or remove" }),
          unscheduled.map((x) => g.jsxs("div", { className: "mt-2 flex flex-wrap items-center justify-between gap-2 text-[13px] text-ivory", children: [D.productOf(x.slug)?.name, g.jsxs("span", { className: "flex flex-wrap items-center gap-2", children: [x.kind !== "stay" ? g.jsx("select", { value: "", onChange: (e) => setSel(x.id, { date: e.target.value }), className: cx(box, "w-auto"), children: [g.jsx("option", { value: "", children: "Move to day…" }, "none"), ...meta.map((m) => g.jsx("option", { value: m.date, children: "Day " + (m.index + 1) + " · " + shortDate(m.date) }, m.date))] }) : g.jsx("button", { onClick: () => api.setEdit(x), className: actBtn, children: "Edit dates" }), g.jsx("button", { onClick: () => api.remove(x.id), className: "text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-300", children: "Remove" })] })] }, x.id)),
        ] }),

      g.jsx("div", { className: "mt-6 space-y-4", children: meta.map((m) => {
          const d = m.date, i = m.index, isOpen = open.has(i);
          const list = itemsOn(s, d);
          const inn = stays.filter((x) => x.from === d), out = stays.filter((x) => x.to === d);
          const tonight = stays.filter((x) => d >= x.from && d < x.to);
          const custom = s.custom.filter((c) => c.date === d);
          const n = countOf(d);
          const dayTotal = list.reduce((t, x) => t + W.selPrice(x), 0) + inn.reduce((t, x) => t + W.selPrice(x), 0);
          const prevDest = meta[i - 1]?.destination || "";
          const hasTransport = list.some((x) => D.productOf(x.slug)?.categoryId === "transportation" || isAirport(D.productOf(x.slug)));
          const groups = DAY_GROUPS.map((gr) => ({ ...gr, items: list.filter((x) => groupOf(D.productOf(x.slug)) === gr.id) })).filter((gr) => gr.items.length);
          return g.jsxs("section", { id: "day-" + i, className: cx("scroll-mt-48 border bg-surface", isOpen ? "border-ivory/60" : n ? "border-ivory/25" : "border-dashed border-gold/40"), children: [
              g.jsxs("button", { onClick: () => toggle(i), "aria-expanded": isOpen, className: "flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 text-left", children: [
                  g.jsxs("span", { className: "serif text-xl font-semibold text-ivory md:text-2xl", children: ["Day ", i + 1, " — ", longDate(d)] }),
                  g.jsx("span", { className: "text-[11px] uppercase tracking-[0.18em] text-stone", children: weekday(d) }),
                  (m.transfer || m.destination) && g.jsx("span", { className: "border border-gold/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-soft", children: m.transfer ? m.transfer.from + " → " + m.transfer.to : m.destination }),
                  g.jsxs("span", { className: "ml-auto flex items-center gap-3", children: [
                      dayTotal > 0 && g.jsx("span", { className: "text-[12px] tabular-nums text-gold-soft", children: D.money(dayTotal) }),
                      g.jsx("span", { className: cx("px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", n ? "bg-emerald-500/15 text-emerald-300" : "bg-gold/15 text-gold-soft"), children: n ? n + " selected" : "No selections yet" }),
                      g.jsx("span", { className: "text-stone", children: isOpen ? "▾" : "▸" }),
                    ] }),
                  tonight.length > 0 && g.jsxs("span", { className: "w-full text-[12px] text-stone", children: ["⌂ ", inn.length ? "Check-in · " : "Staying at ", tonight.map((x) => D.productOf(x.slug)?.name).join(", ")] }),
                  !isOpen && n > 0 && g.jsx("span", { className: "w-full truncate text-[12px] text-ivory/70", children: [...inn.map((x) => D.productOf(x.slug)?.name), ...list.map((x) => (x.time ? x.time + " " : "") + D.productOf(x.slug)?.name), ...custom.map((c) => c.text)].join(" · ") }),
                ] }),
              isOpen && g.jsxs("div", { className: "space-y-4 border-t border-ivory/15 px-5 py-5", children: [
                  g.jsx("input", { value: s.titles[d] ?? m.title, onChange: (e) => set({ titles: { ...s.titles, [d]: e.target.value } }), placeholder: "Name this day — e.g. Ubud adventure", "aria-label": "Day title", className: "w-full border-b border-ivory/20 bg-transparent pb-1 serif text-lg text-ivory outline-none placeholder:text-stone/50 focus:border-gold" }),
                  g.jsxs(DaySection, { label: T("groupAccommodation"), children: [
                      out.map((x) => g.jsx(Fixed, { icon: "↗", text: "Hotel check-out · " + D.productOf(x.slug)?.name }, "o" + x.id)),
                      inn.map((x) => g.jsx(StayRow, { api, sel: x }, "i" + x.id)),
                      !inn.length && tonight.length > 0 && g.jsx(Fixed, { icon: "☾", text: "Staying at " + tonight.map((x) => D.productOf(x.slug)?.name).join(", "), muted: true }),
                      !m.last && !tonight.length && g.jsx(Suggest, { text: "No accommodation selected for tonight", onAdd: () => setPicker({ date: d, cat: "accommodation", dest: prevDest || "all" }) }),
                      m.last && !out.length && g.jsx("p", { className: "text-[12px] text-stone", children: "Departure day — no overnight stay needed." }),
                    ] }),
                  g.jsxs(DaySection, { label: T("groupTransport"), hide: !m.transfer && !(i === 0 || m.last) && !groups.some((gr) => gr.id === "transport"), children: [
                      m.transfer && g.jsx(TransferRow, { api, m, has: hasTransport }),
                      i === 0 && !hasTransport && g.jsx(Suggest, { text: "Airport pickup on arrival", onAdd: () => setPicker({ date: d, cat: "airport", dest: "all" }) }),
                      m.last && !hasTransport && g.jsx(Suggest, { text: "Airport transfer for your departure", onAdd: () => setPicker({ date: d, cat: "airport", dest: "all" }) }),
                      ...(groups.find((gr) => gr.id === "transport")?.items || []).map((x, k, arr) => g.jsx(DayItem, { api, sel: x, meta, first: k === 0, last: k === arr.length - 1, onMove: (dir) => move(d, x.id, dir, "transport"), onSet: (patch) => setSel(x.id, patch) }, x.id)),
                    ] }),
                  groups.filter((gr) => gr.id !== "transport").map((gr) => g.jsx(DaySection, { label: gr.label, children: gr.items.map((x, k) => g.jsx(DayItem, { api, sel: x, meta, first: k === 0, last: k === gr.items.length - 1, onMove: (dir) => move(d, x.id, dir, gr.id), onSet: (patch) => setSel(x.id, patch) }, x.id)) }, gr.id)),
                  custom.length > 0 && g.jsx(DaySection, { label: "Custom requests", children: custom.map((c) => g.jsxs("div", { className: "flex flex-wrap items-center gap-2 border border-dashed border-ivory/25 px-3 py-2.5", children: [
                      g.jsx("input", { type: "time", value: c.time || "", onChange: (e) => set({ custom: s.custom.map((y) => (y.id === c.id ? { ...y, time: e.target.value } : y)) }), "aria-label": "Time", className: "w-[84px] border-b border-ivory/20 bg-transparent text-[13px] text-ivory outline-none [color-scheme:dark]" }),
                      g.jsx("span", { className: "flex-1 text-[13px] italic text-ivory/85", children: c.text }),
                      g.jsx("button", { onClick: () => set({ custom: s.custom.filter((y) => y.id !== c.id) }), className: "text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-300", children: "Remove" }),
                    ] }, c.id)) }),
                  g.jsxs("div", { className: "flex flex-wrap items-center gap-3 border-t border-ivory/10 pt-4", children: [
                      g.jsx(Btn, { onClick: () => setPicker({ date: d, dest: m.destination || prevDest || "all" }), variant: "gold", className: "px-5 py-3", children: list.length || inn.length ? T("addAnother") : T("addProduct") }),
                      T("customRequests") !== "off" && g.jsx("input", { value: draft[d] || "", onChange: (e) => setDraft({ ...draft, [d]: e.target.value }), onKeyDown: (e) => e.key === "Enter" && addCustom(d), placeholder: "Or a custom request — e.g. sunrise photographer", className: "min-w-[200px] flex-1 border-b border-ivory/20 bg-transparent pb-1 text-[13px] text-ivory outline-none placeholder:text-stone/50 focus:border-gold" }),
                      T("customRequests") !== "off" && g.jsx("button", { disabled: !draft[d]?.trim(), onClick: () => addCustom(d), className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-soft disabled:opacity-30", children: "Add request" }),
                    ] }),
                  g.jsxs("div", { className: "flex flex-wrap justify-between gap-3", children: [
                      i > 0 ? g.jsx(Btn, { onClick: () => focus(i - 1), variant: "outline", children: "← Previous day · Day " + i }) : g.jsx("span", {}),
                      !m.last ? g.jsx(Btn, { onClick: () => focus(i + 1), children: "Next day · Day " + (i + 2) + " →" }) : g.jsx(Btn, { onClick: () => api.save(2), variant: "gold", children: "Save itinerary & review" }),
                    ] }),
                ] }),
            ] }, d);
        }) }),
      g.jsx(SaveBar, { api }),
    ] });
}
const groupOf = (p) => DAY_GROUPS.find((gr) => gr.test(p)).id;
const DaySection = ({ label, children, hide }) => (hide ? null : g.jsxs("div", { children: [g.jsx("p", { className: cx(lab, "mb-2"), children: label }), g.jsx("div", { className: "space-y-2", children })] }));
function StayRow({ api, sel }) {
  const p = D.productOf(sel.slug);
  const inv = I.getInventory(sel.slug);
  const pool = inv?.pools.find((x) => x.id === sel.poolId);
  if (!p) return null;
  return g.jsxs("div", { className: "grid items-center gap-3 border-l-2 border-gold bg-cream/40 px-3 py-3 sm:grid-cols-[1fr_auto]", children: [
      g.jsxs("div", { className: "min-w-0", children: [
          g.jsxs("p", { className: "text-[14px] font-medium text-ivory", children: [g.jsx("span", { className: "mr-2 text-gold", children: "⌂" }), "Check-in · ", p.name] }),
          g.jsx("p", { className: "text-[11px] text-stone", children: [p.destination, pool && inv.pools.length > 1 ? pool.name : null, sel.rooms + " " + (sel.rooms === 1 ? inv.unitLabel : inv.unitPlural), sel.guestsPerRoom ? sel.guestsPerRoom + " per " + inv.unitLabel : null, D.daysBetween(sel.from, sel.to) + " nights · check-out " + shortDate(sel.to)].filter(Boolean).join(" · ") }),
          g.jsxs("div", { className: "mt-1 flex flex-wrap items-center gap-3", children: [g.jsx(Avail, { sel }), g.jsx("span", { className: "text-[12px] tabular-nums text-gold-soft", children: priceText(sel) })] }),
        ] }),
      g.jsx(ItemActions, { api, sel }),
    ] });
}
function SaveBar({ api }) {
  const { s, dirty, save, saveErrors, go } = api;
  return g.jsxs("div", { className: "sticky bottom-4 z-20 mt-10 border-2 border-gold bg-ink/95 p-5 backdrop-blur", children: [
      g.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-4", children: [
          g.jsxs("div", { children: [g.jsxs("p", { className: "serif text-xl font-semibold text-ivory", children: [s.sels.length, " products · ", D.money(api.est.total), g.jsx("span", { className: "text-[12px] font-normal text-stone", children: " estimated" })] }), g.jsx("p", { className: "text-[12px] text-stone", children: s.draft?.tripId ? (dirty ? "Trip " + s.draft.tripId + " — you have unsaved changes" : "Saved as Trip " + s.draft.tripId) : "Save to keep your itinerary — saving does not submit or book anything." })] }),
          g.jsxs("div", { className: "flex flex-wrap gap-3", children: [g.jsx(Btn, { onClick: () => go(0), variant: "outline", children: "← Guest details" }), g.jsx(Btn, { onClick: () => save(2), variant: "gold", className: "sm:min-w-[220px]", children: T("save") })] }),
        ] }),
      saveErrors.length > 0 && g.jsx("ul", { className: "mt-3 space-y-1 text-[13px] text-rose-300", children: saveErrors.map((e, i) => g.jsxs("li", { children: ["· ", e] }, i)) }),
    ] });
}
const Fixed = ({ icon, text, sub, muted, onClick }) => g.jsxs("div", { onClick, className: cx("flex items-center gap-3 px-3 py-2 text-[13px]", muted ? "text-stone" : "border-l-2 border-gold bg-cream/40 text-ivory", onClick && "cursor-pointer"), children: [g.jsx("span", { className: "text-gold", children: icon }), g.jsx("span", { children: text }), sub && g.jsx("span", { className: "text-[11px] text-stone", children: sub })] });
const Suggest = ({ text, onAdd }) => g.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 border border-dashed border-gold/40 px-3 py-2 text-[12px] text-stone", children: [g.jsxs("span", { children: ["◌ ", text] }), g.jsx("button", { onClick: onAdd, className: "text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-soft hover:text-ivory", children: "Add" })] });
const TransferRow = ({ api, m, has }) => g.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 border-l-2 border-gold bg-cream/40 px-3 py-2 text-[13px] text-ivory", children: [g.jsxs("span", { children: [g.jsx("span", { className: "mr-3 text-gold", children: "➤" }), "Transfer ", m.transfer.from, " → ", m.transfer.to] }), !has && g.jsx("button", { onClick: () => api.setPicker({ date: m.date, cat: "transport", dest: "all" }), className: "text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-soft hover:text-ivory", children: "Add private transfer" })] });
function DayItem({ api, sel, meta, first, last, onMove, onSet }) {
  const p = D.productOf(sel.slug);
  if (!p) return g.jsxs("div", { className: "flex justify-between border border-rose-400/40 px-3 py-2 text-[12px] text-rose-300", children: ["This product is no longer offered", g.jsx("button", { onClick: () => api.remove(sel.id), children: "Remove" })] });
  const inv = I.getInventory(sel.slug);
  const pool = inv?.pools.find((x) => x.id === sel.poolId);
  const n = W.paxOf(sel);
  return g.jsxs("div", { className: "grid items-center gap-3 border border-ivory/15 bg-ink/30 px-3 py-3 md:grid-cols-[72px_56px_1fr_auto]", children: [
      g.jsx("input", { type: "time", value: sel.time || "", onChange: (e) => onSet({ time: e.target.value }), "aria-label": "Preferred time", className: "border-b border-ivory/20 bg-transparent text-[13px] text-ivory outline-none [color-scheme:dark]" }),
      g.jsx("div", { className: "hidden aspect-square overflow-hidden bg-ink md:block", children: img(p) && g.jsx("img", { src: img(p), alt: "", className: "h-full w-full object-cover" }) }),
      g.jsxs("div", { className: "min-w-0", children: [
          g.jsx("p", { className: "text-[14px] font-medium text-ivory", children: p.name }),
          g.jsx("p", { className: "text-[11px] text-stone", children: [catLabel(p), pool && inv.pools.length > 1 ? pool.name : null, sel.duration || p.duration, n + " pax" + (Number(sel.children) ? " (" + (sel.adults || 0) + " adults · " + sel.children + " children)" : ""), !W.isPerPerson(p) ? sel.qty + " × " + (inv?.unitLabel || "unit") : null].filter(Boolean).join(" · ") }),
          sel.note && g.jsxs("p", { className: "text-[11px] italic text-stone", children: ["“", sel.note, "”"] }),
          g.jsxs("div", { className: "mt-1 flex flex-wrap items-center gap-3", children: [g.jsx(Avail, { sel }), g.jsx("span", { className: "text-[12px] tabular-nums text-gold-soft", children: priceText(sel) })] }),
        ] }),
      g.jsxs("div", { className: "flex flex-col items-end gap-2", children: [
          g.jsx(ItemActions, { api, sel }),
          g.jsxs("div", { className: "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone", children: [
              g.jsx("button", { onClick: () => onMove(-1), disabled: first, className: "px-1 hover:text-ivory disabled:opacity-30", "aria-label": "Earlier in the day", children: "↑" }),
              g.jsx("button", { onClick: () => onMove(1), disabled: last, className: "px-1 hover:text-ivory disabled:opacity-30", "aria-label": "Later in the day", children: "↓" }),
              g.jsx("label", { className: "ml-1", children: "Move to" }),
              g.jsx("select", { value: sel.date, onChange: (e) => onSet({ date: e.target.value, order: Date.now() }), "aria-label": "Move to day", className: "border border-ivory/20 bg-transparent px-1.5 py-1 text-[10px] text-ivory [color-scheme:dark]", children: meta.map((x) => g.jsx("option", { value: x.date, children: "Day " + (x.index + 1) + " · " + shortDate(x.date) }, x.date)) }),
            ] }),
        ] }),
    ] });
}

/* ===================== PRODUCT SELECTION WINDOW =================== */
function Picker({ api, date, legId, dest: destIn, cat: catIn, replace: replaceSel, open, onClose }) {
  const { s } = api;
  const meta = W.dayMeta(s.info, [], s.sels);
  const m = meta.find((x) => x.date === date) || meta[0];
  const [cat, setCat] = useState(catIn || "all");
  const [q, setQ] = useState("");
  const [dest, setDest] = useState(destIn ?? (m?.destination || "all"));
  const [active, setActive] = useState(open || null);
  const [limit, setLimit] = useState(18);
  const [added, setAdded] = useState(0);
  const all = D.db().products;
  const base = useMemo(() => all.filter((p) => visible(p) && (cat === "all" || pickerCats().find((c) => c.id === cat)?.match(p)) && (!q || (p.name + " " + p.destination + " " + (p.location || "") + " " + catLabel(p)).toLowerCase().includes(q.toLowerCase()))), [all.length, cat, q, D.getVersion()]);
  const scoped = base.filter((p) => inDest(p, dest));
  const fellBack = dest !== "all" && scoped.length === 0 && base.length > 0;
  const list = fellBack ? base : scoped;
  const dests = [...new Set(base.map((p) => p.destination))].filter(Boolean).sort();
  const close = () => onClose();
  const onSaved = (sel, keepOpen) => {
    api.upsert(sel, replaceSel?.id);
    if (keepOpen && !replaceSel) { setActive(null); setAdded((n) => n + 1); } else close();
  };
  return g.jsx("div", { className: "fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-ink/90 p-3 backdrop-blur-sm md:p-8", onClick: close, children: g.jsxs("div", { onClick: (e) => e.stopPropagation(), className: "my-2 w-full max-w-6xl border-2 border-ivory bg-surface", children: [
      g.jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3 border-b border-ivory/20 px-6 py-5", children: [
          g.jsxs("div", { children: [g.jsx("p", { className: "text-[11px] uppercase tracking-[0.3em] text-gold", children: replaceSel ? "Replace " + (D.productOf(replaceSel.slug)?.name || "selection") : "Add to Day " + ((m?.index ?? 0) + 1) }), g.jsxs("h3", { className: "serif mt-1 text-3xl font-semibold text-ivory", children: [D.fmtDate(date), m?.destination ? " · " + (m.transfer ? m.transfer.from + " → " + m.transfer.to : m.destination) : ""] }), added > 0 && g.jsxs("p", { className: "mt-1 text-[12px] text-emerald-300", children: [added, " added to this day — keep choosing or close"] })] }),
          g.jsx("button", { onClick: close, "aria-label": "Close", className: "text-3xl leading-none text-stone hover:text-ivory", children: "×" }),
        ] }),
      active ? g.jsx(Configure, { api, slug: active, date, legId, existing: null, replaceSel, onBack: () => setActive(null), onSave: onSaved }) : g.jsxs("div", { className: "p-6", children: [
          g.jsxs("div", { className: "flex flex-wrap gap-2", children: [
              g.jsx("button", { onClick: () => { setCat("all"); setLimit(18); }, className: cx("border px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.16em]", cat === "all" ? "border-ivory bg-ink text-ivory" : "border-ivory/25 text-stone hover:border-ivory hover:text-ivory"), children: "All" }),
              pickerCats().map((c) => g.jsxs("button", { onClick: () => { setCat(c.id); setLimit(18); }, className: cx("border px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors", cat === c.id ? "border-ivory bg-ink text-ivory" : "border-ivory/25 text-stone hover:border-ivory hover:text-ivory"), children: [g.jsx("span", { className: "mr-1.5 text-gold", children: c.icon }), c.label] }, c.id)),
            ] }),
          g.jsxs("div", { className: "mt-4 grid gap-3 sm:grid-cols-[1fr_240px]", children: [
              g.jsx("input", { value: q, onChange: (e) => { setQ(e.target.value); setLimit(18); }, placeholder: "Search by product name, category or destination…", className: box, autoFocus: true }),
              g.jsxs("select", { value: dest, onChange: (e) => { setDest(e.target.value); setLimit(18); }, className: box, children: [g.jsx("option", { value: "all", children: "All destinations" }), ...[...new Set([...(m?.destination ? [m.destination] : []), ...dests])].map((d) => g.jsx("option", { value: d, children: d }, d))] }),
            ] }),
          g.jsx("p", { className: "mt-3 text-[11px] uppercase tracking-[0.2em] text-stone", children: fellBack ? `Nothing tagged ${dest} in this category — showing all destinations (${list.length})` : list.length + " products · availability for " + D.fmtDate(date) }),
          g.jsx("div", { className: "mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3", children: list.slice(0, limit).map((p) => {
              const probe = newSel(p.slug, s.info, s.legs, { date, others: s.sels });
              const a = probe ? W.selAvailability(probe) : { text: "", tone: "" };
              return g.jsxs("article", { className: "flex flex-col border border-ivory/25 bg-ink/30 hover:border-ivory/60", children: [
                  g.jsx(Zoom, { src: img(p), alt: p.name, gal: gallery(p), className: "aspect-[16/10] overflow-hidden bg-ink", children: img(p) ? g.jsx("img", { src: img(p), alt: p.name, loading: "lazy", className: "h-full w-full object-cover" }) : g.jsx("div", { className: "grid h-full place-items-center text-[12px] text-stone", children: "Photo coming soon" }) }),
                  g.jsxs("div", { className: "flex flex-1 flex-col p-4", children: [
                      g.jsxs("p", { className: "text-[10px] uppercase tracking-[0.2em] text-stone", children: [catLabel(p), " · ", p.destination] }),
                      g.jsx("h4", { className: "serif mt-1 text-lg font-semibold leading-snug text-ivory", children: p.name }),
                      g.jsx("p", { className: "mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-stone", children: p.description }),
                      g.jsxs("div", { className: "mt-2 flex flex-wrap items-baseline justify-between gap-2", children: [g.jsxs("p", { className: "text-ivory", children: [g.jsx("span", { className: "serif text-lg font-semibold", children: rateText(p) }), g.jsxs("span", { className: "text-[10px] text-stone", children: [" ", unitText(p)] })] }), g.jsx("span", { className: cx("text-[11px] font-medium", tone(a.tone)), children: a.text })] }),
                      g.jsxs("div", { className: "mt-auto grid grid-cols-2 gap-2 pt-3", children: [
                          g.jsx(Btn, { onClick: () => setActive(p.slug), variant: "outline", className: "w-full px-2 py-2.5", children: "View details" }),
                          g.jsx(Btn, { onClick: () => setActive(p.slug), variant: "gold", className: "w-full px-2 py-2.5", children: replaceSel ? "Choose" : "Select product" }),
                        ] }),
                    ] }),
                ] }, p.slug);
            }) }),
          list.length > limit && g.jsx("div", { className: "mt-6 text-center", children: g.jsx(Btn, { onClick: () => setLimit(limit + 18), variant: "outline", children: "Show more (" + (list.length - limit) + ")" }) }),
          !list.length && g.jsx("p", { className: "mt-6 border border-ivory/25 p-8 text-center text-[14px] text-stone", children: "Nothing matches — try another category, or add a custom request to this day." }),
        ] }),
    ] }) });
}

/* ================= DETAILS + CONFIGURATION (shared) ================ */
function Configure({ api, slug, date, legId, existing, replaceSel, onBack, onSave, viewOnly }) {
  const { s } = api;
  const info = s.info;
  const p = D.productOf(slug);
  const inv = I.getInventory(slug);
  const [d, setD] = useState(() => {
    if (existing) return { ...existing };
    const o = replaceSel ? (replaceSel.kind === "stay" ? { date: replaceSel.from, to: replaceSel.to } : { date: replaceSel.date }) : { date, others: s.sels };
    const fresh = newSel(slug, info, s.legs, o);
    if (fresh && replaceSel) { fresh.id = replaceSel.id; fresh.order = replaceSel.order; if (fresh.kind !== "stay" && replaceSel.kind !== "stay") { fresh.adults = replaceSel.adults ?? fresh.adults; fresh.children = replaceSel.children ?? fresh.children; fresh.time = replaceSel.time || fresh.time; } }
    return fresh;
  });
  if (!p || !d) return null;
  const stay = d.kind === "stay";
  const days = W.dayMeta(info, [], s.sels);
  const pools = inv?.pools || [];
  const pax = W.totalPax(info);
  const cap = W.capNum(p);
  const n = W.paxOf(d);
  const a = W.selAvailability(d);
  const legW = W.legWindows(info, s.legs);
  const okDates = stay ? d.from >= info.arrival && d.to <= info.departure && d.to > d.from : d.date >= info.arrival && d.date <= info.departure;
  const overlap = stay ? s.sels.find((x) => x.kind === "stay" && x.id !== d.id && x.slug !== d.slug && d.from < x.to && x.from < d.to) : null;
  const problems = [
    !okDates && (stay ? "Choose nights within your trip (" + D.fmtDate(info.arrival) + " – " + D.fmtDate(info.departure) + ")." : "Choose a day within your trip."),
    overlap && "These nights overlap your stay at " + D.productOf(overlap.slug)?.name + ". Choose different nights, or add more rooms at the same property.",
    !stay && n > pax && "More participants than the " + pax + " travellers on this vacation.",
    !stay && !W.isPerPerson(p) && cap && n > cap * (Number(d.qty) || 1) && `${n} passengers need ${Math.ceil(n / cap)} × ${inv?.unitLabel || "vehicle"} (${cap} each).`,
    stay && cap && Number(d.guestsPerRoom) > cap && `Maximum ${cap} guests per ${inv?.unitLabel || "room"}.`,
    !a.bookable && a.text !== "On request" && a.text,
  ].filter(Boolean);
  const canSave = !viewOnly && !problems.length;
  const list = (title, items) => (items?.length ? g.jsxs("div", { children: [g.jsx("p", { className: cx(lab, "mb-1.5"), children: title }), g.jsx("ul", { className: "space-y-0.5 text-[13px] text-ivory/85", children: items.map((x, i) => g.jsxs("li", { children: ["· ", x] }, i)) })] }) : null);
  const gal = gallery(p);
  const typeLabel = I.typeFor(p.categoryId).poolLabel;
  const nights = stay ? Math.max(0, D.daysBetween(d.from, d.to)) : 0;
  return g.jsxs("div", { className: "grid gap-6 p-6 lg:grid-cols-[1.15fr_1fr]", children: [
      g.jsxs("div", { className: "space-y-5", children: [
          g.jsxs("div", { children: [g.jsxs("p", { className: "text-[10px] uppercase tracking-[0.22em] text-stone", children: [catLabel(p), " · ", p.destination, p.location ? " · " + p.location : ""] }), g.jsx("h3", { className: "serif mt-1 text-3xl font-semibold text-ivory", children: p.name })] }),
          g.jsx(Zoom, { src: img(p), alt: p.name, gal, className: "aspect-[16/10] overflow-hidden bg-ink", children: img(p) ? g.jsx("img", { src: img(p), alt: p.name, className: "h-full w-full object-cover" }) : null }),
          gal.length > 1 && g.jsx("div", { className: "grid grid-cols-4 gap-2", children: gal.slice(1, 5).map((u) => g.jsx(Zoom, { src: u, alt: p.name, gal, className: "aspect-square overflow-hidden bg-ink", children: g.jsx("img", { src: u, alt: "", className: "h-full w-full object-cover" }) }, u)) }),
          g.jsx("p", { className: "text-[14px] leading-relaxed text-ivory/85", children: p.description }),
          g.jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [list("Facilities & amenities", p.facilities), list("Included", p.inclusions), list("Not included", p.exclusions), list(stay ? "Room types" : typeLabel + "s & packages", pools.length > 1 || pools[0]?.detail ? pools.map((x) => x.name + (x.time ? " · " + x.time : "") + (x.detail ? " · " + x.detail : "") + (x.maxPerBooking ? " · max " + x.maxPerBooking : "")) : null)] }),
          g.jsx("dl", { className: "grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2", children: [["Location", p.location || p.destination], ["Duration", p.duration], ["Hours", p.operatingHours], ["Capacity", p.capacity], ["Cancellation", p.cancellationPolicy]].filter(([, v]) => v).map(([k, v]) => g.jsxs("div", { children: [g.jsx("dt", { className: lab, children: k }), g.jsx("dd", { className: "mt-0.5 text-ivory/85", children: v })] }, k)) }),
        ] }),
      g.jsxs("div", { className: "space-y-4", children: [
          g.jsxs("div", { className: "border-2 border-ivory bg-cream/70 p-5", children: [g.jsx("p", { className: lab, children: "Price" }), g.jsxs("p", { className: "serif mt-1 text-3xl font-semibold text-ivory", children: [rateText(p), g.jsxs("span", { className: "text-[13px] font-normal text-stone", children: [" ", unitText(p)] })] }), g.jsx("p", { className: "mt-1 text-[11px] text-stone", children: "Before tax. Child rates and final prices are confirmed in your quotation." })] }),
          !viewOnly && g.jsxs("div", { className: "space-y-3 border border-ivory/25 p-5", children: [
              stay ? g.jsxs(React.Fragment, { children: [
                  g.jsxs("div", { children: [g.jsx("span", { className: lab, children: "Check-in → check-out" }), g.jsx("div", { className: "mt-2", children: g.jsx(RangeCalendar, { from: d.from, to: d.to, min: info.arrival, max: info.departure, months: 1, dayInfo: (x) => (x < info.departure ? availInfo(slug, d.poolId, Number(d.rooms) || 1)(x, true) : null), onChange: (f2, t2) => setD({ ...d, from: f2, to: t2 }) }, d.poolId) })] }),
                  g.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [
                      g.jsxs("p", { className: "text-[12px] text-ivory/85", children: ["Day ", (days.find((x) => x.date === d.from)?.index ?? 0) + 1, " check-in ", D.fmtDate(d.from), " · Day ", (days.find((x) => x.date === d.to)?.index ?? 0) + 1, " check-out ", D.fmtDate(d.to)] }),
                      g.jsxs("div", { className: "flex items-center gap-2", children: [g.jsx("span", { className: lab, children: "Nights" }), g.jsx(Stepper, { small: true, value: Math.max(1, D.daysBetween(d.from, d.to)), min: 1, max: Math.max(1, D.daysBetween(d.from, info.departure)), onChange: (v) => setD({ ...d, to: D.addDays(d.from, v) }) })] }),
                    ] }),
                  pools.length > 1 && g.jsxs("label", { className: "block", children: [g.jsx("span", { className: lab, children: "Room category" }), g.jsx("select", { value: d.poolId, onChange: (e) => setD({ ...d, poolId: e.target.value }), className: box, children: pools.map((x) => { const t = I.rangeStat(slug, d.from, d.to, x.id, 1); return g.jsx("option", { value: x.id, disabled: t.status === "soldout" || t.status === "unavailable", children: x.name + (x.detail ? " · " + x.detail : "") + (t.status === "soldout" ? " — sold out" : "") }, x.id); }) })] }),
                  g.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
                      g.jsxs("div", { children: [g.jsx("span", { className: lab, children: "Number of " + (inv?.unitPlural || "rooms") }), g.jsx("div", { className: "mt-2", children: g.jsx(Stepper, { small: true, value: Number(d.rooms) || 1, min: 1, max: 20, onChange: (v) => setD({ ...d, rooms: v }) }) })] }),
                      g.jsxs("div", { children: [g.jsx("span", { className: lab, children: "Guests per " + (inv?.unitLabel || "room") }), g.jsx("div", { className: "mt-2", children: g.jsx(Stepper, { small: true, value: Number(d.guestsPerRoom) || 1, min: 1, max: 20, onChange: (v) => setD({ ...d, guestsPerRoom: v }) }) })] }),
                    ] }),
                  g.jsxs("p", { className: "text-[11px] text-stone", children: [nights, " night", nights === 1 ? "" : "s", " · sleeps ", (Number(d.rooms) || 1) * (Number(d.guestsPerRoom) || 1), " of ", pax, " travellers", cap ? " · up to " + cap + " per " + (inv?.unitLabel || "room") : ""] }),
                ] }) : g.jsxs(React.Fragment, { children: [
                  g.jsxs("div", { children: [g.jsxs("span", { className: lab, children: ["Date · Day ", (days.find((x) => x.date === d.date)?.index ?? 0) + 1, " · ", D.fmtDate(d.date)] }), g.jsx("div", { className: "mt-2", children: g.jsx(DateCalendar, { value: d.date, min: info.arrival, max: info.departure, onChange: (x) => setD({ ...d, date: x }), dayInfo: (x) => { const av = availInfo(slug, d.poolId, W.unitsOf(d, p))(x, false); return { ...av, inTrip: true, sub: "D" + (D.daysBetween(info.arrival, x) + 1) }; } }, d.poolId) })] }),
                  g.jsxs("label", { className: "block", children: [g.jsx("span", { className: lab, children: "Preferred time" }), g.jsx("input", { type: "time", value: d.time || "", onChange: (e) => setD({ ...d, time: e.target.value }), className: box })] }),
                  g.jsxs("label", { className: "block", children: [g.jsx("span", { className: lab, children: "Duration" }), g.jsx("input", { value: d.duration || "", onChange: (e) => setD({ ...d, duration: e.target.value }), placeholder: p.duration || "e.g. 3 hours", className: box })] }),
                  pools.length > 1 && g.jsxs("label", { className: "block", children: [g.jsx("span", { className: lab, children: p.categoryId === "transportation" ? "Vehicle type" : typeLabel + " / package" }), g.jsx("select", { value: d.poolId, onChange: (e) => { const pl = pools.find((x) => x.id === e.target.value); setD({ ...d, poolId: e.target.value, time: pl?.time || d.time }); }, className: box, children: pools.map((x) => { const t = I.rangeStat(slug, d.date, null, x.id, 1); return g.jsx("option", { value: x.id, disabled: t.status === "soldout" || t.status === "unavailable", children: x.name + (x.time ? " · " + x.time : "") + (x.detail ? " · " + x.detail : "") + (t.status === "soldout" ? " — sold out" : "") }, x.id); }) })] }),
                  g.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
                      g.jsxs("div", { children: [g.jsx("span", { className: lab, children: "Adults" }), g.jsx("div", { className: "mt-2", children: g.jsx(Stepper, { small: true, value: Number(d.adults) || 0, min: 0, max: 40, onChange: (v) => setD({ ...d, adults: v }) }) })] }),
                      g.jsxs("div", { children: [g.jsx("span", { className: lab, children: "Children" }), g.jsx("div", { className: "mt-2", children: g.jsx(Stepper, { small: true, value: Number(d.children) || 0, min: 0, max: 40, onChange: (v) => setD({ ...d, children: v }) }) })] }),
                    ] }),
                  !W.isPerPerson(p) && g.jsxs("div", { children: [g.jsx("span", { className: lab, children: "Quantity (" + (inv?.unitPlural || "units") + ")" }), g.jsx("div", { className: "mt-2", children: g.jsx(Stepper, { small: true, value: Number(d.qty) || 1, min: 1, max: 20, onChange: (v) => setD({ ...d, qty: v }) }) })] }),
                  g.jsxs("p", { className: "text-[11px] text-stone", children: ["Total participants ", g.jsx("span", { className: "text-ivory", children: n }), " of ", pax, " travellers", cap && !W.isPerPerson(p) ? " · " + cap + " passengers per " + (inv?.unitLabel || "vehicle") : "", W.isPerPerson(p) ? " · priced per person" : " · priced " + unitText(p)] }),
                ] }),
              g.jsxs("label", { className: "block", children: [g.jsx("span", { className: lab, children: "Special requests for this item" }), g.jsx("input", { value: d.note || "", onChange: (e) => setD({ ...d, note: e.target.value }), placeholder: stay ? "Bed set-up, celebrations, connecting rooms…" : "Pickup point, dietary needs, package preference…", className: box })] }),
              g.jsxs("p", { className: cx("flex items-center gap-2 text-[13px] font-medium", tone(a.tone)), children: [g.jsx("span", { className: "h-2 w-2 rounded-full bg-current" }), a.text] }),
              a.text === "On request" && g.jsx("p", { className: "text-[11px] text-stone", children: "Our desk confirms availability with the supplier before your quotation." }),
              problems.length > 0 && g.jsx("ul", { className: "space-y-1 border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200", children: problems.map((x, i) => g.jsxs("li", { children: ["· ", x] }, i)) }),
              g.jsxs("div", { className: "flex items-baseline justify-between border-t border-ivory/15 pt-3", children: [g.jsx("span", { className: lab, children: "Estimated" }), g.jsxs("span", { className: "serif text-2xl font-semibold text-gold-soft", children: [priceText(d), g.jsx("span", { className: "text-[11px] font-normal text-stone", children: stay ? " " + nights + " nights × " + d.rooms : W.isPerPerson(p) ? " " + n + " × " + rateText(p) : " " + d.qty + " × " + rateText(p) })] })] }),
            ] }),
          g.jsxs("div", { className: "grid gap-2", children: [
              !viewOnly && g.jsx(Btn, { onClick: () => onSave({ ...d }, false), variant: "gold", className: "w-full", disabled: !canSave, children: existing ? "Save changes" : replaceSel ? "Replace selection" : stay ? "Add accommodation to Day " + ((days.find((x) => x.date === d.from)?.index ?? 0) + 1) : "Add to Day " + ((days.find((x) => x.date === d.date)?.index ?? 0) + 1) }),
              !viewOnly && !existing && !replaceSel && g.jsx(Btn, { onClick: () => onSave({ ...d, id: d.id }, true), variant: "outline", className: "w-full", disabled: !canSave, children: "Add & choose another for this day" }),
              g.jsx(Btn, { onClick: onBack, variant: "outline", className: "w-full", children: existing ? "Close" : "← Back to products" }),
            ] }),
        ] }),
    ] });
}
function EditModal({ api, sel, onClose }) {
  const view = !!sel._view;
  const clean = { ...sel }; delete clean._view;
  return g.jsx("div", { className: "fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-ink/90 p-3 backdrop-blur-sm md:p-8", onClick: onClose, children: g.jsxs("div", { onClick: (e) => e.stopPropagation(), className: "my-2 w-full max-w-5xl border-2 border-ivory bg-surface", children: [
      g.jsxs("div", { className: "flex items-center justify-between border-b border-ivory/20 px-6 py-4", children: [g.jsx("p", { className: "text-[11px] uppercase tracking-[0.3em] text-gold", children: view ? "Product details" : "Edit selection" }), g.jsx("button", { onClick: onClose, "aria-label": "Close", className: "text-3xl leading-none text-stone hover:text-ivory", children: "×" })] }),
      g.jsx(Configure, { api, slug: clean.slug, existing: clean, viewOnly: view, onBack: onClose, onSave: (x) => { api.upsert(x); onClose(); } }),
    ] }) });
}

/* ======================= STEP 4: OVERVIEW ========================= */
function StepOverview({ api, user }) {
  const { s, set, go, est, nights } = api;
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  const [agree, setAgree] = useState(false);
  const f = s.info;
  const meta = W.dayMeta(f, [], s.sels);
  const w = W.destinationsFromStays(f, s.sels);
  const live = W.validateRequest(f, s.sels, s.custom, []);
  const warn = W.planWarnings(f, s.sels, []);
  const { dirty } = api;
  const submit = () => {
    setBusy(true);
    const days = meta.map((m) => m.date);
    if (dirty && !api.save(null)) { setBusy(false); return; }
    const r = W.submitVacationRequest({ info: f, sels: s.sels, custom: s.custom.filter((c) => days.includes(c.date)), titles: Object.fromEntries(meta.map((m) => [m.date, s.titles[m.date] ?? m.title])), legs: [], tripId: store.draft?.tripId }, user);
    setBusy(false);
    if (!r.ok) { setErrors(r.errors); return; }
    /* submitted: the builder returns to a blank itinerary */
    set(() => ({ ...blank(), lastSubmitted: { inquiryId: r.inquiryId, requestId: r.requestId, tripId: r.tripId, at: Date.now(), email: f.email.trim(), name: f.name.trim(), estimate: r.estimate, heldUntil: r.heldUntil } }));
    typeof window !== "undefined" && window.scrollTo && window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const Row = (k, v) => g.jsxs("div", { className: "flex flex-wrap justify-between gap-2 border-b border-ivory/10 py-2 text-[14px]", children: [g.jsx("dt", { className: "text-stone", children: k }), g.jsx("dd", { className: "text-ivory", children: v || "—" })] }, k);
  const Sec = (title, step, body, extra) => g.jsxs("section", { className: "border border-ivory/25 bg-surface p-6", children: [g.jsxs("div", { className: "mb-3 flex flex-wrap items-baseline justify-between gap-2", children: [g.jsx("h3", { className: "serif text-2xl font-semibold text-ivory", children: title }), g.jsxs("span", { className: "flex gap-4", children: [extra, g.jsx("button", { onClick: () => go(step), className: "text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-soft hover:text-ivory", children: "Edit" })] })] }), body] });
  return g.jsxs("div", { children: [
      g.jsx(StepHead, { n: 2, title: T("step3"), sub: T("step3Intro") }),
      g.jsx("div", { className: cx("mt-8 flex flex-wrap items-center justify-between gap-3 border-2 p-5", dirty ? "border-gold bg-gold/10" : "border-ivory bg-cream/70"), children: [
          g.jsxs("div", { children: [g.jsx("p", { className: lab, children: "Saved itinerary" }), g.jsx("p", { className: "serif mt-1 text-2xl font-semibold text-ivory", children: s.draft?.tripId ? "Trip " + s.draft.tripId : "Not saved yet" }), g.jsx("p", { className: "text-[12px] text-stone", children: dirty ? "You have changes that are not saved yet." : "Saved " + new Date(s.draft.savedAt).toLocaleString("en-GB") + " — you can leave and resume any time with this Trip ID." })] }),
          dirty && g.jsx(Btn, { onClick: () => api.save(2), variant: "gold", children: T("save") }),
        ] }),
      api.saveErrors.length > 0 && g.jsx("ul", { className: "mt-3 space-y-1 text-[13px] text-rose-300", children: api.saveErrors.map((e, i) => g.jsxs("li", { children: ["· ", e] }, i)) }),
      g.jsxs("div", { className: "mt-9 space-y-5", children: [
          Sec("Guest details", 0, g.jsxs("dl", { children: [Row("Name", f.name), Row("Email", f.email), Row("WhatsApp / mobile", f.phone), Row("Country of residence", f.country), Row("Arrival – departure", D.fmtDate(f.arrival) + " – " + D.fmtDate(f.departure)), Row("Total vacation days", nights + 1 + " days / " + nights + " nights"), Row("Total PAX", W.totalPax(f) + " (" + f.adults + " adults" + (Number(f.children) ? ", " + f.children + " children" : "") + ")" + (Number(f.infants) ? " + " + f.infants + " infants" : ""))] })),
          Sec("Destinations & accommodation", 1, w.length ? g.jsx("div", { className: "space-y-2", children: w.map((l, i) => { const stays = l.stays; return g.jsxs("div", { className: "flex flex-wrap items-baseline justify-between gap-2 border-b border-ivory/10 py-2 text-[14px]", children: [g.jsxs("span", { className: "text-ivory", children: [g.jsx("span", { className: "serif mr-2 text-xl font-semibold text-gold", children: i + 1 }), l.destination || "—", " – ", l.nights, " night", l.nights === 1 ? "" : "s", g.jsxs("span", { className: "text-stone", children: [" · ", D.fmtDate(l.from), " → ", D.fmtDate(l.to)] })] }), g.jsx("span", { className: "text-[13px] text-stone", children: stays.map((x) => x.name + " · " + x.rooms + " room" + (x.rooms === 1 ? "" : "s") + (x.guestsPerRoom ? " × " + x.guestsPerRoom : "")).join(", ") })] }, l.id); }) }) : g.jsx("p", { className: "text-[13px] text-stone", children: "No accommodation selected — add it within your days." })),
          Sec("Day-by-day itinerary", 1, g.jsx("div", { className: "space-y-4", children: meta.map((m) => {
              const d = m.date;
              const items = itemsOn(s, d);
              const ins = s.sels.filter((x) => x.kind === "stay" && x.from === d), outs = s.sels.filter((x) => x.kind === "stay" && x.to === d);
              const cs = s.custom.filter((c) => c.date === d);
              return g.jsxs("div", { className: "border-l-2 border-gold/60 pl-4", children: [
                  g.jsxs("div", { className: "flex flex-wrap items-baseline justify-between gap-2", children: [
                      g.jsxs("p", { className: "text-[11px] uppercase tracking-[0.24em] text-gold", children: ["Day ", m.index + 1, " · ", D.fmtDate(d), " — ", s.titles[d] ?? m.title, m.destination ? " | " + (m.transfer ? m.transfer.from + " → " + m.transfer.to : m.destination) : ""] }),
                      g.jsxs("span", { className: "flex gap-3 text-[10px] font-semibold uppercase tracking-[0.18em]", children: [g.jsx("button", { onClick: () => api.setPicker({ date: d, dest: m.destination || "all" }), className: "text-gold-soft hover:text-ivory", children: "+ Add product" }), g.jsx("button", { onClick: () => { go(1); setTimeout(() => document.getElementById?.("day-" + d)?.scrollIntoView?.({ behavior: "smooth" }), 80); }, className: "text-stone hover:text-ivory", children: "Edit day" })] }),
                    ] }),
                  g.jsxs("div", { className: "mt-1.5 space-y-1", children: [
                      outs.map((x) => g.jsx("p", { className: "text-[13px] text-stone", children: "↗ Check-out · " + D.productOf(x.slug)?.name }, "o" + x.id)),
                      ins.map((x) => g.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 text-[13px] text-ivory/90", children: [g.jsxs("span", { children: ["⌂ Check-in · ", D.productOf(x.slug)?.name, g.jsxs("span", { className: "text-stone", children: [" · ", x.rooms, " × ", D.daysBetween(x.from, x.to), " nights"] })] }), g.jsxs("span", { className: "flex items-center gap-3", children: [g.jsx("span", { className: "tabular-nums text-gold-soft", children: priceText(x) }), g.jsx(ItemActions, { api, sel: x })] })] }, "i" + x.id)),
                      items.map((x) => { const p = D.productOf(x.slug); return g.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 text-[13px] text-ivory/90", children: [g.jsxs("span", { children: [x.time ? x.time + " · " : "", p?.name, g.jsxs("span", { className: "text-stone", children: [" · ", W.paxOf(x), " pax", !W.isPerPerson(p) ? " · " + x.qty + " × " + (I.getInventory(x.slug)?.unitLabel || "unit") : ""] })] }), g.jsxs("span", { className: "flex items-center gap-3", children: [g.jsx("span", { className: "tabular-nums text-gold-soft", children: priceText(x) }), g.jsx(ItemActions, { api, sel: x })] })] }, x.id); }),
                      cs.map((c) => g.jsx("p", { className: "text-[13px] italic text-ivory/80", children: (c.time ? c.time + " · " : "") + c.text + " (custom request)" }, c.id)),
                      !items.length && !ins.length && !outs.length && !cs.length && g.jsx("p", { className: "text-[13px] text-stone", children: "Free day" }),
                    ] }),
                ] }, d);
            }) })),
          Sec("Special requests", 0, g.jsx("p", { className: "text-[14px] leading-relaxed text-ivory/85", children: f.requests || "None." })),
        ] }),
      g.jsxs("div", { className: "mt-8 border-2 border-ivory bg-cream/70 p-6", children: [
          [["Subtotal", est.subtotal], [T("taxLabel") + " " + est.taxRate + "%", est.tax]].map(([k, v]) => g.jsxs("div", { className: "flex justify-between py-1 text-[14px] text-stone", children: [g.jsx("span", { children: k }), g.jsx("span", { className: "tabular-nums text-ivory", children: D.money(v) })] }, k)),
          g.jsxs("div", { className: "mt-2 flex items-baseline justify-between border-t border-ivory/20 pt-3", children: [g.jsx("span", { className: lab, children: "Estimated vacation total" }), g.jsx("span", { className: "serif text-4xl font-semibold text-gold-soft", children: D.money(est.total) })] }),
          est.onRequest > 0 && g.jsxs("p", { className: "mt-2 text-[12px] text-gold-soft", children: ["+ ", est.onRequest, " item", est.onRequest === 1 ? "" : "s", " priced on request — confirmed in your quotation."] }),
          g.jsx("p", { className: "mt-2 text-[12px] leading-relaxed text-stone", children: "An estimate, subject to availability and final confirmation by Prestige Bali Leisure. Nothing is charged now — a deposit is requested only after you approve your formal quotation." }),
        ] }),
      warn.length > 0 && g.jsxs("div", { className: "mt-6 border border-gold/50 bg-gold/10 p-5", children: [g.jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-soft", children: "Worth checking" }), g.jsx("ul", { className: "mt-2 space-y-1 text-[13px] text-ivory/80", children: warn.map((e, i) => g.jsxs("li", { children: ["· ", e] }, i)) })] }),
      (errors.length > 0 || live.length > 0) && g.jsxs("div", { className: "mt-6 border border-rose-400/50 bg-rose-500/10 p-5", children: [g.jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-300", children: "Before you submit" }), g.jsx("ul", { className: "mt-2 space-y-1 text-[13px] text-rose-200", children: (errors.length ? errors : live).map((e, i) => g.jsxs("li", { children: ["· ", e] }, i)) })] }),
      g.jsxs("label", { className: "mt-6 flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-stone", children: [g.jsx("input", { type: "checkbox", checked: agree, onChange: (e) => setAgree(e.target.checked), className: "mt-1 h-4 w-4 accent-[#b08d57]" }), g.jsx("span", { children: T("consent") })] }),
      g.jsxs("div", { className: "mt-8 flex flex-wrap gap-4", children: [
          g.jsx(Btn, { onClick: () => go(1), variant: "outline", children: "← Edit itinerary" }),
          g.jsx(Btn, { onClick: submit, variant: "gold", disabled: busy || !agree || live.length > 0 || !s.draft?.tripId, className: "sm:min-w-[320px]", children: busy ? "Sending…" : T("submit") }),
        ] }),
    ] });
}

/* ========================== SUBMITTED ============================= */
function SubmittedBanner({ api }) {
  const { s, set } = api;
  const r = s.lastSubmitted;
  const auth = bridge.useAuth ? bridge.useAuth() : {};
  const mail = (D.db().emails || []).find((e) => e.kind === "submitted" && e.refs?.inquiryId === r.inquiryId);
  const st = mail?.status;
  const status = !mail ? { tone: "text-stone", text: "Your itinerary was received." }
    : st === "sent" ? { tone: "text-emerald-300", text: "A copy of your itinerary has been emailed to " + r.email + "." }
    : st === "queued" || !st ? { tone: "text-gold-soft", text: "Sending a copy of your itinerary to " + r.email + "…" }
    : { tone: "text-gold-soft", text: "Your itinerary is safely received, but the email copy could not be sent yet. Please keep your copy below — our team will contact you at " + r.email + "." };
  const openCopy = () => {
    const html = mail?.html;
    const w = typeof window !== "undefined" && window.open ? window.open("", "_blank") : null;
    if (!w || !html) return;
    w.document.write(html.replace("</body>", '<p style="text-align:center;font:12px Arial;margin:20px"><button onclick="window.print()" style="padding:10px 18px">Print or save as PDF</button></p></body>'));
    w.document.close();
  };
  return g.jsxs("div", { role: "status", className: "mb-8 border-2 border-gold bg-gold/10 p-6", children: [
      g.jsxs("div", { className: "flex flex-wrap items-start justify-between gap-4", children: [
          g.jsxs("div", { children: [
              g.jsx("p", { className: "text-[11px] uppercase tracking-[0.3em] text-gold", children: T("submittedTitle") }),
              g.jsx("p", { className: "serif mt-1 text-4xl font-semibold text-ivory", children: r.inquiryId }),
              r.tripId && g.jsxs("p", { className: "mt-1 text-[11px] uppercase tracking-[0.22em] text-stone", children: ["Trip ", r.tripId, " · submitted ", new Date(r.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })] }),
            ] }),
          g.jsx("button", { onClick: () => set({ lastSubmitted: null }), "aria-label": "Dismiss", className: "text-2xl leading-none text-stone hover:text-ivory", children: "×" }),
        ] }),
      g.jsxs("p", { className: "mt-4 max-w-2xl text-[14px] leading-relaxed text-stone", children: ["Thank you", r.name ? ", " + r.name.split(" ")[0] : "", ". ", g.jsx("b", { className: "text-ivory", children: "This is a booking inquiry, not yet a confirmed reservation." }), " Our team will check availability and send your booking confirmation and invoice — usually within one working day. The builder below is now clear for a new itinerary."] }),
      g.jsx("p", { className: cx("mt-2 text-[13px] font-medium", status.tone), children: status.text }),
      g.jsxs("div", { className: "mt-5 flex flex-wrap gap-3", children: [
          mail?.html && g.jsx(Btn, { onClick: openCopy, variant: "gold", children: "View / print your itinerary copy" }),
          auth?.user?.role === "customer" ? g.jsx(Btn, { to: "/account", variant: "outline", children: "Follow it in your account" }) : g.jsx(Btn, { to: "/account", variant: "outline", children: "Create an account to follow it" }),
        ] }),
    ] });
}
function Submitted({ api }) {
  const { s, set } = api;
  const r = s.submitted;
  return g.jsxs("div", { className: "border-2 border-gold bg-gold/10 p-10 text-center", children: [
      g.jsx("p", { className: "text-[11px] uppercase tracking-[0.3em] text-gold", children: T("submittedTitle") }),
      g.jsx("p", { className: "serif mt-3 text-5xl font-semibold text-ivory", children: r.inquiryId || r.requestId }),
      r.tripId && g.jsxs("p", { className: "mt-2 text-[12px] uppercase tracking-[0.24em] text-stone", children: ["Trip ", r.tripId] }),
      g.jsxs("p", { className: "mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-stone", children: ["Thank you. Your itinerary is with our team and a copy with your inquiry reference has been sent to ", g.jsx("span", { className: "text-ivory", children: r.email }), ". ", g.jsx("b", { className: "text-ivory", children: "This is a booking inquiry, not yet a confirmed reservation." }), " We'll check availability with every supplier and send your booking confirmation and invoice — usually within one working day."] }),
      g.jsxs("p", { className: "mt-4 text-[13px] text-stone", children: ["Estimated total ", g.jsx("span", { className: "text-ivory", children: D.money(r.estimate?.total) }), r.heldUntil ? " · availability held until " + new Date(r.heldUntil).toLocaleString("en-GB") : ""] }),
      g.jsxs("div", { className: "mt-8 flex flex-wrap justify-center gap-4", children: [g.jsx(Btn, { to: "/account", children: "Follow it in your account" }), g.jsx(Btn, { onClick: () => set(blank()), variant: "outline", children: "Plan another vacation" })] }),
    ] });
}
