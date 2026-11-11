/* ==================================================================
   VACATION REQUEST WORKFLOW & GUEST EMAILS
   ------------------------------------------------------------------
   STAGE 1  New Vacation Request     guest submits the builder
   STAGE 2  Under Review / Quotation Sent
   STAGE 3  Quotation Approved       guest (portal) or staff records it
   STAGE 4  Awaiting Deposit Payment provisional confirmation + deposit
                                      invoice + temporary inventory hold
   STAGE 5  Confirmed Booking        deposit verified → BCN, booking,
                                      invoice, itinerary, allocation

   A booking is created ONLY in stage 5. Quotations, approvals and
   deposit invoices never create bookings or consume inventory.

   One request = one inquiry record (the trip record). It keeps the
   guest's original submission untouched and every staff version.
   ================================================================== */
import * as D from "./db.js";
import * as I from "./inventory.js";

export const STAGES = ["New Inquiry", "Under Review", "Quotation Sent", "Quotation Approved", "Awaiting Deposit Payment", "Confirmed Booking"];
export const STAGE_TONE = { "New Inquiry": "blue", "Under Review": "amber", "Quotation Sent": "amber", "Quotation Approved": "amber", "Awaiting Deposit Payment": "amber", "Confirmed Booking": "green", Rejected: "red" };
const SYSTEM = { name: "Website", role: "super_admin", email: "website@prestigebalileisure.com" };
/* stage renamed: existing records follow */
(() => { try { D.db().inquiries.forEach((i) => { if (i.stage === "New Vacation Request") i.stage = "New Inquiry"; }); if (!Array.isArray(D.db().tripDrafts)) D.db().tripDrafts = []; } catch {} })();
const db = () => D.db();
const clone = (x) => JSON.parse(JSON.stringify(x));
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ------------------------- pricing helpers ------------------------ */
/* ------------------------- PAX & units ---------------------------- */
export const isPerPerson = (p) => ["guest", "person", "class", "ticket", "cover", "activity", "dive"].includes(p?.unit);
/* participants on one product (each product may have its own PAX) */
export const paxOf = (sel) => (sel.adults === undefined && sel.children === undefined ? Math.max(1, Number(sel.qty) || 1) : Math.max(1, (Number(sel.adults) || 0) + (Number(sel.children) || 0)));
/* units consumed: rooms for stays, participants for per-person pricing, quantity otherwise */
export const unitsOf = (sel, p = D.productOf(sel.slug)) => (sel.kind === "stay" ? Math.max(1, Number(sel.rooms) || 1) : isPerPerson(p) ? paxOf(sel) : Math.max(1, Number(sel.qty) || 1));
/* per-unit capacity written in Product Master, e.g. "6 guests" */
export const capNum = (p) => { const m = /(\d+)\s*(?:guests?|pax|people|persons?|passengers?|seats?|adults?)/i.exec(p?.capacity || ""); return m ? Number(m[1]) : (Number(p?.maxPax) || null); };
export const minPaxOf = (p) => Number(p?.minPax) || null;
export const totalPax = (info) => (Number(info.adults) || 0) + (Number(info.children) || 0);

/* Guest-facing price: selling rate only.
   Stays: rate × nights × rooms · per-person: rate × participants · otherwise rate × quantity */
export function selPrice(sel) {
  const p = D.productOf(sel.slug);
  if (!p) return 0;
  return (Number(p.sellingRate) || 0) * (sel.kind === "stay" ? Math.max(1, D.daysBetween(sel.from, sel.to)) * unitsOf(sel, p) : unitsOf(sel, p));
}

/* ------------------- multi-destination legs ------------------------ */
/* legs: [{ id, destination, nights }] in travel order → dated windows */
export function legWindows(info, legs = []) {
  let d = info.arrival;
  return legs.map((l) => { const from = d; const to = D.addDays(d, Math.max(1, Number(l.nights) || 1)); d = to; return { ...l, from, to }; });
}
/* destinations follow the accommodation chosen on each day */
export function destinationsFromStays(info, sels) {
  const stays = sels.filter((s) => s.kind === "stay" && s.from && s.to).sort((a, b) => a.from.localeCompare(b.from));
  const out = [];
  stays.forEach((s) => {
    const dest = D.productOf(s.slug)?.destination || "Bali";
    const last = out[out.length - 1];
    const stay = { slug: s.slug, name: D.productOf(s.slug)?.name, from: s.from, to: s.to, rooms: s.rooms, guestsPerRoom: s.guestsPerRoom || null, poolId: s.poolId };
    if (last && last.destination === dest && s.from <= last.to) { last.to = s.to > last.to ? s.to : last.to; last.stays.push(stay); }
    else out.push({ id: "D" + (out.length + 1), destination: dest, from: s.from, to: s.to, stays: [stay] });
  });
  return out.map((l) => ({ ...l, nights: D.daysBetween(l.from, l.to) }));
}
export function dayMetaFromStays(info, sels) {
  const days = tripDays(info.arrival, info.departure);
  const stays = sels.filter((s) => s.kind === "stay").sort((a, b) => (a.from || "").localeCompare(b.from || ""));
  const destOf = (s) => D.productOf(s.slug)?.destination || "";
  return days.map((date, i) => {
    const last = i === days.length - 1;
    const tonight = stays.find((s) => date >= s.from && date < s.to);
    const lastNight = stays.find((s) => s.to === date);
    const transfer = lastNight && tonight && destOf(lastNight) !== destOf(tonight) ? { from: destOf(lastNight), to: destOf(tonight) } : null;
    const destination = tonight ? destOf(tonight) : lastNight ? destOf(lastNight) : "";
    const title = i === 0 ? "Arrival in Bali" + (destination ? " | " + destination : "") : last ? "Departure" : transfer ? "Transfer to " + transfer.to : destination ? destination + " experience" : "Day " + (i + 1);
    return { date, index: i, destination, legId: "", transfer, title, last, stay: tonight || null };
  });
}
/* per-day destination and default title */
export function dayMeta(info, legs = [], sels) {
  if (!legs.length && sels) return dayMetaFromStays(info, sels);
  const days = tripDays(info.arrival, info.departure);
  const w = legWindows(info, legs);
  return days.map((date, i) => {
    const k = w.findIndex((x) => date >= x.from && date < x.to);
    const leaving = w.findIndex((x, j) => x.to === date && j + 1 < w.length);
    const cur = k >= 0 ? w[k] : w[w.length - 1];
    const last = i === days.length - 1;
    const transfer = leaving >= 0 && !last ? { from: w[leaving].destination, to: w[leaving + 1].destination } : null;
    const destination = transfer ? transfer.to : cur?.destination || "";
    const title = i === 0 ? "Arrival in Bali" + (destination ? " | " + destination : "") : last ? "Departure" : transfer ? "Transfer to " + transfer.to : destination ? destination + " experience" : "Day " + (i + 1);
    return { date, index: i, destination, legId: (transfer ? w[leaving + 1] : cur)?.id || "", transfer, title, last };
  });
}
export function estimate(sels) {
  const subtotal = sels.reduce((s, x) => s + selPrice(x), 0);
  const onRequest = sels.filter((x) => { const p = D.productOf(x.slug); return p?.priceOnRequest && !(Number(p.sellingRate) > 0); }).length;
  const taxRate = db().settings.taxRate || 0;
  const tax = Math.round((subtotal * taxRate) / 100);
  return { subtotal, taxRate, tax, onRequest, total: subtotal + tax, deposit: Math.round(((subtotal + tax) * (db().settings.depositPct || 30)) / 100) };
}
export const tripDays = (arrival, departure) => {
  if (!arrival || !departure || departure < arrival) return arrival ? [arrival] : [];
  const out = [];
  for (let d = arrival, n = 0; d <= departure && n < 60; d = D.addDays(d, 1), n++) out.push(d);
  return out;
};
export function selAvailability(sel) {
  const n = unitsOf(sel);
  const rs = sel.kind === "stay" ? I.rangeStat(sel.slug, sel.from, sel.to, sel.poolId, n) : I.rangeStat(sel.slug, sel.date, null, sel.poolId, n);
  return I.customerLabel(sel.slug, rs, n);
}

/* guest selections → staff day plan (DayPlanner format, with net rates) */
const paxText = (s) => (s.adults !== undefined ? (Number(s.adults) || 0) + " adult" + (Number(s.adults) === 1 ? "" : "s") + (Number(s.children) ? " · " + s.children + " child" + (Number(s.children) === 1 ? "" : "ren") : "") : "");
function planFrom(info, sels, custom = [], titles = {}, legs = []) {
  const meta = dayMeta(info, legs, sels);
  const plan = meta.map((m) => ({ date: m.date, title: titles[m.date] || m.title, destination: m.destination, transfer: m.transfer, items: [] }));
  const dayOf = (d) => plan.find((x) => x.date === d) || plan[0];
  [...sels].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).forEach((s) => {
    const p = D.productOf(s.slug);
    if (!p) return;
    const inv = I.getInventory(s.slug);
    const pool = inv?.pools.find((x) => x.id === s.poolId);
    if (s.kind === "stay") {
      const nights = Math.max(1, D.daysBetween(s.from, s.to)), rooms = Math.max(1, Number(s.rooms) || 1);
      dayOf(s.from)?.items.push({ selId: s.id, slug: s.slug, name: p.name, categoryId: p.categoryId, supplier: p.supplier, qty: nights * rooms, units: rooms, to: s.to, unit: p.unit, sell: p.sellingRate, net: p.netRate, poolId: s.poolId, poolName: pool?.name || "", legId: s.legId || "", destination: p.destination, guestsPerRoom: Number(s.guestsPerRoom) || null, time: "14:00", duration: nights + " night" + (nights === 1 ? "" : "s"), note: (pool ? pool.name + " · " : "") + rooms + " " + (rooms === 1 ? inv.unitLabel : inv.unitPlural) + (s.guestsPerRoom ? " · " + s.guestsPerRoom + " guests per " + inv.unitLabel : "") + " · check-out " + D.fmtDate(s.to) + (s.note ? " · " + s.note : "") });
    } else {
      const pax = paxOf(s);
      dayOf(s.date)?.items.push({ selId: s.id, slug: s.slug, name: p.name, categoryId: p.categoryId, supplier: p.supplier, qty: unitsOf(s, p), adults: Number(s.adults ?? pax) || 0, children: Number(s.children) || 0, participants: pax, vehicles: isPerPerson(p) ? null : Math.max(1, Number(s.qty) || 1), unit: p.unit, sell: p.sellingRate, net: p.netRate, poolId: s.poolId, poolName: pool?.name || "", time: s.time || pool?.time || "", duration: s.duration || p.duration || "", note: [pool?.name, paxText(s), !isPerPerson(p) && Number(s.qty) > 1 ? s.qty + " × " + (inv?.unitLabel || "unit") : "", s.note].filter(Boolean).join(" · ") });
    }
  });
  custom.forEach((c) => dayOf(c.date)?.items.push({ custom: true, slug: null, name: c.text, categoryId: "concierge", qty: 1, unit: "request", sell: 0, net: 0, time: c.time || "", duration: "", note: "Custom request" }));
  return plan;
}
export const flatten = (plan) => plan.flatMap((d) => (d.items || []).map((i) => ({ date: d.date, to: i.to, units: i.units, poolId: i.poolId, slug: i.slug, name: i.name, qty: i.qty || 1, unit: i.unit, sell: Number(i.sell) || 0, net: Number(i.net) || 0, categoryId: i.categoryId, custom: !!i.custom })));
const stripNet = (plan) => plan.map((d) => ({ ...d, items: d.items.map(({ net, supplier, ...rest }) => rest) }));
/* every daily selection is its own itinerary item, linked to the trip and customer */
let itemSeq = 0;
export function stampPlan(plan, { tripId, customerId }) {
  (plan || []).forEach((d, i) => (d.items || []).forEach((it) => {
    if (!it.itemId) it.itemId = "ITM-" + Date.now().toString(36).toUpperCase() + "-" + (++itemSeq).toString(36).toUpperCase();
    it.tripId = tripId || it.tripId || "";
    it.customerId = customerId || it.customerId || "";
    it.dayNumber = i + 1;
    it.date = d.date;
  }));
  return plan;
}
const hist = (inq, stage, by, note) => [...(inq.history || []), { at: Date.now(), stage, by: by?.name || by || "system", note: note || "" }];
const findInq = (id) => db().inquiries.find((x) => x.id === id);

/* ======================= STAGE 1 — SUBMISSION ===================== */
export function validateRequest(info, sels, custom, legs = []) {
  const e = [];
  const tripNights = D.daysBetween(info.arrival, info.departure);
  if (legs.length) {
    const sum = legs.reduce((t, l) => t + (Number(l.nights) || 0), 0);
    if (sum !== tripNights) e.push(`Your destinations add up to ${sum} night${sum === 1 ? "" : "s"}, but your trip is ${tripNights} night${tripNights === 1 ? "" : "s"}.`);
    if (legs.some((l) => !l.destination)) e.push("Choose a destination for every part of your trip.");
  }
  /* accommodation may not overlap, except rooms split across one destination */
  const stays = sels.filter((s) => s.kind === "stay");
  stays.forEach((a, i) => stays.slice(i + 1).forEach((b) => {
    if ((a.legId && a.legId === b.legId) || a.slug === b.slug) return;
    if (a.from < b.to && b.from < a.to) e.push(`${D.productOf(a.slug)?.name} and ${D.productOf(b.slug)?.name} overlap — the same nights can't be booked at two different properties.`);
  }));
  const pax = totalPax(info);
  sels.forEach((s) => {
    const p = D.productOf(s.slug);
    if (!p) return;
    const cap = capNum(p);
    if (s.kind === "stay") {
      if (cap && Number(s.guestsPerRoom) > cap) e.push(`${p.name}: maximum ${cap} guests per ${I.getInventory(s.slug)?.unitLabel || "room"}.`);
      const mn = minPaxOf(p);
      if (mn && pax < mn) e.push(`${p.name}: needs at least ${mn} guests.`);
    } else {
      const n = paxOf(s);
      const mn = minPaxOf(p);
      if (n > pax) e.push(`${p.name}: ${n} participants is more than the ${pax} travellers on this vacation.`);
      if (mn && n < mn) e.push(`${p.name}: minimum ${mn} participant${mn === 1 ? "" : "s"}.`);
      if (!isPerPerson(p) && cap && n > cap * Math.max(1, Number(s.qty) || 1)) e.push(`${p.name}: ${n} passengers need ${Math.ceil(n / cap)} × ${I.getInventory(s.slug)?.unitLabel || "vehicle"} (${cap} each).`);
    }
  });
  if (!info.name?.trim()) e.push("Full name is required.");
  if (!emailRe.test(info.email || "")) e.push("A valid email address is required.");
  if (!/^\+\d[\d\s-]{6,}$/.test((info.phone || "").trim())) e.push("WhatsApp / mobile number must start with the country code, e.g. +44 7700 900123.");
  if (!info.country?.trim()) e.push("Country of residence is required.");
  if (!info.arrival || !info.departure) e.push("Arrival and departure dates are required.");
  else if (info.departure <= info.arrival) e.push("Departure must be after arrival.");
  else if (info.arrival < D.today()) e.push("Arrival cannot be in the past.");
  if (!(Number(info.adults) >= 1)) e.push("At least one adult is required.");
  if (!sels.length && !custom.length && !info.requests?.trim()) e.push("Add at least one product or describe what you would like us to arrange.");
  sels.forEach((s) => {
    const p = D.productOf(s.slug);
    if (!p) return e.push("A selected product is no longer available.");
    const a = selAvailability(s);
    if (!a.bookable) e.push(`${p.name}: ${a.text}.`);
    if (s.kind === "stay" && (s.from < info.arrival || s.to > info.departure)) e.push(`${p.name}: stay dates must fall within your travel dates.`);
    if (s.kind !== "stay" && (s.date < info.arrival || s.date > info.departure)) e.push(`${p.name}: choose a date within your travel dates.`);
  });
  return e;
}

/* advisory checks shown to the guest (do not block submission) */
export function planWarnings(info, sels, legs = []) {
  const w = [];
  const stays = sels.filter((s) => s.kind === "stay");
  legWindows(info, legs).forEach((l) => { if (!stays.some((s) => s.legId === l.id)) w.push(`No accommodation chosen for ${l.destination || "a destination"} (${D.fmtDate(l.from)} – ${D.fmtDate(l.to)}).`); });
  const pax = totalPax(info);
  tripDays(info.arrival, info.departure).slice(0, -1).forEach((d) => {
    const here = stays.filter((s) => d >= s.from && d < s.to);
    if (!here.length) return;
    const beds = here.reduce((t, s) => t + (Number(s.guestsPerRoom) || 0) * Math.max(1, Number(s.rooms) || 1), 0);
    if (here.every((s) => s.guestsPerRoom) && beds < pax) w.push(`Night of ${D.fmtDate(d)}: rooms for ${beds} of ${pax} travellers.`);
  });
  if (!legs.length) {
    const open = tripDays(info.arrival, info.departure).slice(0, -1).filter((d) => !stays.some((s) => d >= s.from && d < s.to));
    if (open.length) w.push(`No accommodation selected for ${open.length} night${open.length === 1 ? "" : "s"} (${open.slice(0, 4).map((d) => D.fmtDate(d)).join(", ")}${open.length > 4 ? "…" : ""}).`);
  }
  dayMeta(info, legs, sels).forEach((m) => {
    if (!m.transfer && m.index !== 0 && !m.last) return;
    const moving = sels.some((s) => s.kind !== "stay" && s.date === m.date && D.productOf(s.slug)?.categoryId === "transportation");
    if (!moving) w.push(m.index === 0 ? `Day 1: no airport pickup selected.` : m.last ? `Departure day: no airport transfer selected.` : `${D.fmtDate(m.date)}: no transfer from ${m.transfer.from} to ${m.transfer.to}.`);
  });
  return w;
}

/* ================ WEBSITE → BACKEND IMPORT LINK ===================
   Each visitor's browser keeps its own copy of the data, so a guest's
   submission is carried to the team inside the notification email as
   a compressed link. Opening it in the backend creates the inquiry
   with the same Inquiry ID the guest was given. */
const b64u = (bytes) => { let s2 = ""; bytes.forEach((b) => (s2 += String.fromCharCode(b))); return btoa(s2).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = (str) => { const t = atob(str.replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(t, (c) => c.charCodeAt(0)); };
export async function encodePayload(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === "undefined") return "j." + b64u(bytes);
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer();
  return "z." + b64u(new Uint8Array(buf));
}
export async function decodePayload(str) {
  const [kind, body] = [String(str).slice(0, 1), String(str).slice(2)];
  const bytes = unb64u(body);
  if (kind === "j") return JSON.parse(new TextDecoder().decode(bytes));
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer();
  return JSON.parse(new TextDecoder().decode(buf));
}
export function importSubmission(payload, actor) {
  if (!payload || payload.v !== 1 || !payload.ids?.inquiryId) throw new Error("This link is not a valid itinerary.");
  if (!D.can(actor, "add", "requests") && !D.can(actor, "add", "inquiries")) throw new D.PermissionError("Your role cannot add inquiries.");
  const exists = db().inquiries.find((i) => i.id === payload.ids.inquiryId || (payload.ids.tripId && i.tripId === payload.ids.tripId));
  if (exists) return { ok: true, already: true, inquiryId: exists.id };
  const r = submitVacationRequest({ info: payload.info, sels: payload.sels || [], custom: payload.custom || [], titles: payload.titles || {}, legs: [] }, actor, { imported: true, silent: true, ids: payload.ids, submittedAt: payload.submittedAt });
  if (r.ok) D.audit(actor, "import", "requests", r.inquiryId, null, "Imported from website notification email");
  return r;
}
export const siteBase = () => (typeof location !== "undefined" && location.origin && !/^(file|null)/.test(location.origin) ? location.origin + location.pathname : "");

/* ======================= SAVED ITINERARIES ======================== */
/* Saving keeps the guest's itinerary under a Trip ID. It is NOT an
   inquiry and reserves nothing; the guest can resume it later. */
export function saveDraft({ info, sels, custom = [], titles = {} }, tripId) {
  const e = [];
  if (!info.name?.trim()) e.push("Full name is required to save your itinerary.");
  if (!emailRe.test(info.email || "")) e.push("A valid email address is required to save and resume your itinerary.");
  if (!info.arrival || !info.departure || info.departure <= info.arrival) e.push("Choose arrival and departure dates.");
  if (e.length) return { ok: false, errors: e };
  const drafts = db().tripDrafts || (db().tripDrafts = []);
  let rec = tripId && drafts.find((d) => d.tripId === tripId && d.status === "Draft");
  if (!rec) { rec = { tripId: D.webId("TRP"), createdAt: Date.now(), status: "Draft", saves: 0 }; drafts.unshift(rec); }
  const plan = planFrom(info, sels, custom, titles, []);
  Object.assign(rec, {
    email: info.email.trim().toLowerCase(), name: info.name.trim(), info: clone(info), sels: clone(sels), custom: clone(custom), titles: clone(titles),
    destinations: destinationsFromStays(info, sels), plan: stripNet(plan), estimate: estimate(sels), savedAt: Date.now(), saves: (rec.saves || 0) + 1,
    productSlugs: [...new Set(sels.map((s) => s.slug))],
  });
  D.commit("draft");
  return { ok: true, tripId: rec.tripId, savedAt: rec.savedAt };
}
export function loadDraft(tripId, email) {
  const rec = (db().tripDrafts || []).find((d) => d.tripId === String(tripId || "").trim().toUpperCase());
  if (!rec || rec.email !== String(email || "").trim().toLowerCase()) return { ok: false, error: "No saved itinerary matches that Trip ID and email." };
  if (rec.status !== "Draft") return { ok: false, error: "This itinerary was already submitted as inquiry " + rec.inquiryId + "." };
  return { ok: true, tripId: rec.tripId, state: { info: clone(rec.info), sels: clone(rec.sels), custom: clone(rec.custom || []), titles: clone(rec.titles || {}) }, savedAt: rec.savedAt };
}

export function submitVacationRequest({ info, sels, custom = [], titles = {}, legs = [], tripId: draftId }, user, opts = {}) {
  const errors = opts.imported ? (!info?.email || !info?.arrival ? ["The imported itinerary is incomplete."] : []) : validateRequest(info, sels, custom, legs);
  if (errors.length) return { ok: false, errors };
  const year = info.arrival.slice(0, 4);
  const requestId = opts.ids?.requestId || D.webId("VR");
  const email = info.email.trim().toLowerCase();
  /* one customer profile per email address */
  let cust = db().customers.find((c) => (c.email || "").toLowerCase() === email);
  if (cust) {
    const patch = {};
    if (!cust.phone) patch.phone = info.phone;
    if (!cust.whatsapp) patch.whatsapp = info.phone;
    if (!cust.country) patch.country = info.country;
    if (Object.keys(patch).length) D.update("customers", cust.id, patch, SYSTEM, { module: "customers" });
  } else {
    cust = D.insert("customers", { id: D.nextNumber("CUS-", "cusSeq", 4), name: info.name.trim(), email, phone: info.phone.trim(), whatsapp: info.phone.trim(), country: info.country.trim(), nationality: "", address: "", status: "Inquiry", notes: "", tags: ["website"], createdAt: Date.now() }, SYSTEM, { module: "customers" });
  }
  const plan = planFrom(info, sels, custom, titles, legs);
  const est = estimate(sels);
  const draft = draftId && (db().tripDrafts || []).find((d) => d.tripId === draftId && d.status === "Draft");
  const tripId = opts.ids?.tripId || (draft ? draft.tripId : D.webId("TRP"));
  stampPlan(plan, { tripId, customerId: cust.id });
  const destinations = !legs.length ? destinationsFromStays(info, sels) : legWindows(info, legs).map((l) => ({ ...l, stays: sels.filter((s) => s.kind === "stay" && s.legId === l.id).map((s) => ({ slug: s.slug, name: D.productOf(s.slug)?.name, from: s.from, to: s.to, rooms: s.rooms, guestsPerRoom: s.guestsPerRoom || null, poolId: s.poolId })) }));
  const nights = D.daysBetween(info.arrival, info.departure);
  const adults = Number(info.adults) || 1, children = Number(info.children) || 0, infants = Number(info.infants) || 0;
  const availability = sels.map((s) => ({ slug: s.slug, name: D.productOf(s.slug)?.name, status: selAvailability(s).text }));
  const firstStay = sels.find((s) => s.kind === "stay");
  const inq = D.insert("inquiries", {
    id: opts.ids?.inquiryId || D.webId("INQ"), type: "vacation", requestId, tripId, destinations, source: opts.imported ? "Imported from website notification" : "Website",
    customerId: cust.id, customerName: cust.name,
    contact: { name: info.name.trim(), email, phone: info.phone.trim(), country: info.country.trim() },
    channel: "Website vacation builder", destination: (firstStay && D.productOf(firstStay.slug)?.destination) || "Bali",
    adults, children, infants, guests: adults + children, nights, arrival: info.arrival, departure: info.departure,
    brief: info.requests?.trim() || `${sels.length} products · ${nights} nights`, specialRequests: info.requests?.trim() || "",
    stage: STAGES[0], status: "New", ownerId: db().users.find((u) => u.role === "sales")?.id || "",
    createdAt: opts.submittedAt ? new Date(opts.submittedAt).toISOString() : new Date().toISOString(), submittedAt: opts.submittedAt || Date.now(),
    original: { submittedAt: opts.submittedAt || Date.now(), info: clone(info), destinations: clone(destinations), plan: stripNet(plan), selections: sels.map((s) => ({ ...clone(s), name: D.productOf(s.slug)?.name, participants: s.kind === "stay" ? null : paxOf(s), price: selPrice(s) })), custom: clone(custom), estimate: est, availability },
    plan, versions: [{ v: 1, at: Date.now(), by: "Guest", label: "Customer submission", plan: clone(plan) }],
    productSlugs: [...new Set(sels.map((s) => s.slug))], notes: [], estimate: est,
    history: [{ at: Date.now(), stage: STAGES[0], by: info.name.trim(), note: "Submitted via the website vacation builder" }],
  }, SYSTEM, { module: "inquiries" });
  /* temporary reservation for products with managed inventory */
  const holdItems = sels.filter((s) => I.isManaged(I.invOf(s.slug))).map((s) => s.kind === "stay" ? { slug: s.slug, from: s.from, to: s.to, qty: s.rooms, poolId: s.poolId } : { slug: s.slug, from: s.date, qty: unitsOf(s), poolId: s.poolId });
  let heldUntil = null;
  if (holdItems.length) {
    try { heldUntil = I.placeHolds(holdItems, { inquiryId: inq.id, externalRef: requestId }, SYSTEM, { channel: "website" }).expiresAt; }
    catch (e) { D.update("inquiries", inq.id, { holdWarning: e.message }, SYSTEM, { module: "inquiries" }); }
  }
  if (draft) Object.assign(draft, { status: "Submitted", inquiryId: inq.id, submittedAt: Date.now() });
  if (!opts.silent) {
    notify("submitted", { inq: findInq(inq.id) });
    notify("internal_new", { inq: findInq(inq.id) }, null, { importPayload: { v: 1, ids: { inquiryId: inq.id, requestId, tripId }, submittedAt: inq.submittedAt, info: clone(info), sels: clone(sels), custom: clone(custom), titles: clone(titles) } });
  }
  return { ok: true, requestId, tripId, inquiryId: inq.id, customerId: cust.id, heldUntil, estimate: est };
}

/* ======================= STAGE 2 — REVIEW ========================= */
const mod = "requests";
export function startReview(inqId, actor) {
  const inq = findInq(inqId);
  D.update("inquiries", inqId, { stage: "Under Review", status: "Contacted", history: hist(inq, "Under Review", actor, "Review started") }, actor, { module: mod });
  notify("under_review", { inq: findInq(inqId) });
}
export function savePlan(inqId, plan, actor, label = "Staff edit") {
  const inq = findInq(inqId);
  plan = stampPlan(clone(plan), { tripId: inq.tripId, customerId: inq.customerId });
  const v = (inq.versions?.length || 0) + 1;
  D.update("inquiries", inqId, { plan: clone(plan), versions: [...(inq.versions || []), { v, at: Date.now(), by: actor?.name, label, plan: clone(plan) }], productSlugs: [...new Set(flatten(plan).filter((l) => l.slug).map((l) => l.slug))], history: hist(inq, inq.stage, actor, "Itinerary saved as version " + v) }, actor, { module: mod });
}
export function addNote(inqId, text, actor) {
  const inq = findInq(inqId);
  D.update("inquiries", inqId, { notes: [...(inq.notes || []), { at: Date.now(), by: actor?.name, text }] }, actor, { module: mod });
}
export function generateQuotation(inqId, actor, { discountPct = 0, validityDays } = {}) {
  const inq = findInq(inqId);
  const lines = flatten(inq.plan || []);
  if (!lines.length) throw new Error("The itinerary has no products to quote.");
  const t = D.quoteTotals({ lines, discountPct, taxPct: db().settings.taxRate });
  const q = D.insert("quotations", {
    id: D.nextNumber("QUO-", "quoSeq"), inquiryId: inq.id, requestId: inq.requestId, tripId: inq.tripId || "", destinations: clone(inq.destinations || []), customerId: inq.customerId, customerName: inq.customerName,
    title: (inq.destination || "Bali") + " · " + inq.nights + " nights", arrival: inq.arrival, departure: inq.departure, nights: inq.nights,
    guests: inq.guests, adults: inq.adults, children: inq.children, infants: inq.infants, lines, dayPlan: clone(inq.plan), discountPct, taxPct: db().settings.taxRate,
    total: t.total, depositDue: Math.round((t.total * (db().settings.depositPct || 30)) / 100),
    paymentTerms: `${db().settings.depositPct}% deposit to confirm · balance ${db().settings.fullPaymentDaysBeforeArrival} days before arrival`,
    validity: D.addDays(D.today(), validityDays || db().settings.quoteValidityDays || 14),
    cancellationPolicy: "House cancellation schedule applies", status: "Draft", createdAt: new Date().toISOString(),
  }, actor, { module: "quotations" });
  D.update("inquiries", inqId, { quoteId: q.id, stage: inq.stage === STAGES[0] ? "Under Review" : inq.stage, history: hist(inq, "Under Review", actor, "Quotation " + q.id + " prepared · " + D.money(t.total)) }, actor, { module: mod });
  return q;
}
export function sendQuotation(quoteId, actor) {
  const q = db().quotations.find((x) => x.id === quoteId);
  D.update("quotations", quoteId, { status: "Sent", sentAt: Date.now() }, actor, { module: "quotations" });
  const inq = q.inquiryId && findInq(q.inquiryId);
  if (inq) D.update("inquiries", inq.id, { quoteId, stage: "Quotation Sent", status: "Quoted", history: hist(inq, "Quotation Sent", actor, "Quotation " + quoteId + " sent") }, actor, { module: mod });
  notify("quotation_sent", { inq: inq && findInq(inq.id), quote: db().quotations.find((x) => x.id === quoteId) });
}

/* ===================== STAGE 3 — APPROVAL ========================= */
export function approveQuotation(quoteId, actor, by = "staff") {
  const q = db().quotations.find((x) => x.id === quoteId);
  if (!q) return;
  if (q.validity && q.validity < D.today()) throw new Error("This quotation expired on " + D.fmtDate(q.validity) + " — please ask for an updated quotation.");
  const module = by === "customer" ? "account" : "quotations";
  D.update("quotations", quoteId, { status: "Approved", approvedAt: Date.now(), approvedBy: by === "customer" ? "Guest (portal)" : actor?.name }, actor, { module });
  const inq = q.inquiryId && findInq(q.inquiryId);
  if (inq) D.update("inquiries", inq.id, { stage: "Quotation Approved", history: hist(inq, "Quotation Approved", by === "customer" ? "Guest" : actor, by === "customer" ? "Approved by the guest in the portal" : "Guest approval recorded by " + actor?.name) }, actor, { module: by === "customer" ? "account" : mod });
  notify("quotation_approved", { inq: inq && findInq(inq.id), quote: db().quotations.find((x) => x.id === quoteId) });
}

/* ============ STAGE 4 — PROVISIONAL CONFIRMATION + DEPOSIT ========= */
/* Stage 2 in one step: price the working itinerary, verify availability,
   send the official (provisional) booking confirmation and deposit
   invoice. The guest accepts by paying the deposit. */
export function sendConfirmationAndInvoice(inqId, actor, { discountPct = 0 } = {}) {
  const inq = findInq(inqId);
  if (!inq) throw new Error("Inquiry not found.");
  if (inq.invoiceId && db().invoices.some((i) => i.id === inq.invoiceId && i.status !== "Cancelled")) throw new Error("A confirmation and invoice were already sent (" + inq.invoiceId + ").");
  const lines = flatten(inq.plan || []);
  const unpriced = lines.filter((l) => !l.custom && l.slug && !(Number(l.sell) > 0));
  if (unpriced.length) throw new Error("Set a selling price in the working itinerary first for: " + [...new Set(unpriced.map((l) => l.name))].join(", ") + ".");
  const conflicts = I.checkBooking({ arrival: inq.arrival, departure: inq.departure, lines, inquiryId: inq.id, status: "Confirmed", paymentStatus: "Deposit paid" });
  if (conflicts.length) throw new I.InventoryError("Some products are not available — replace them in the working itinerary first:\n" + I.describeConflicts(conflicts), conflicts);
  const q = generateQuotation(inqId, actor, { discountPct });
  D.update("quotations", q.id, { status: "Confirmation sent", sentAt: Date.now() }, actor, { module: "quotations" });
  return issueDeposit(q.id, actor);
}

export function issueDeposit(quoteId, actor) {
  const q = db().quotations.find((x) => x.id === quoteId);
  if (!q || !["Approved", "Confirmation sent"].includes(q.status)) throw new Error("Only an approved quotation can receive a deposit invoice.");
  if (db().invoices.some((i) => i.quoteId === quoteId && i.status !== "Cancelled")) throw new Error("A deposit invoice already exists for " + quoteId + ".");
  const draft = { ...q, status: "Confirmed", paymentStatus: "Deposit paid" };
  const conflicts = I.checkBooking(draft);
  if (conflicts.length) throw new I.InventoryError("Availability has changed — adjust the itinerary before issuing the deposit invoice:\n" + I.describeConflicts(conflicts), conflicts);
  const items = (q.lines || []).filter((l) => l.slug && !l.custom && I.isManaged(I.invOf(l.slug))).map((l) => { const { dates, units } = I.lineDates(l, q); return { slug: l.slug, from: dates[0], to: D.addDays(dates[dates.length - 1], 1), qty: units, poolId: l.poolId }; });
  const holdMins = (db().settings.holdHoursQuote || 72) * 60;
  let heldUntil = null;
  if (items.length) heldUntil = I.placeHolds(items, { quoteId: q.id, inquiryId: q.inquiryId }, actor, { minutes: holdMins }).expiresAt;
  const t = D.quoteTotals(q);
  const inv = D.insert("invoices", {
    id: D.nextNumber("INV-", "invSeq"), kind: "deposit", bcn: "", bookingId: "", quoteId: q.id, inquiryId: q.inquiryId || "", requestId: q.requestId || "", tripId: q.tripId || "",
    customerId: q.customerId, customerName: q.customerName, lines: q.lines, total: t.total, depositDue: q.depositDue, amountPaid: 0, balance: t.total,
    issued: D.today(), depositDueDate: D.addDays(D.today(), Math.max(1, Math.floor(holdMins / 1440))), dueDate: D.addDays(q.arrival, -(db().settings.fullPaymentDaysBeforeArrival || 30)),
    terms: `Deposit of ${D.money(q.depositDue)} to confirm · balance due ${db().settings.fullPaymentDaysBeforeArrival} days before arrival`, status: "Awaiting deposit", notes: "",
    provisionalRef: "PC-" + q.id.replace(/^QUO-/, ""),
  }, actor, { module: D.can(actor, "add", "invoices") ? "invoices" : "requests" });
  const inq = q.inquiryId && findInq(q.inquiryId);
  if (inq) D.update("inquiries", inq.id, { invoiceId: inv.id, provisional: { ref: inv.provisionalRef, issuedAt: Date.now(), heldUntil }, stage: "Awaiting Deposit Payment", history: hist(inq, "Awaiting Deposit Payment", actor, "Provisional confirmation " + inv.provisionalRef + " and deposit invoice " + inv.id + " issued") }, actor, { module: mod });
  notify("deposit_invoice", { inq: inq && findInq(inq.id), quote: q, invoice: inv, heldUntil });
  return inv;
}

/* ================= STAGE 5 — DEPOSIT VERIFIED → BOOKING ============ */
export function recordDeposit(invoiceId, pay, actor) {
  if (!D.can(actor, "edit", "invoices")) throw new D.PermissionError("Only Finance or an administrator can verify payments.");
  const invc = db().invoices.find((i) => i.id === invoiceId);
  if (!invc) throw new Error("Invoice not found.");
  if (invc.bookingId) throw new Error("Invoice " + invoiceId + " already belongs to booking " + invc.bcn + " — record the payment against it instead.");
  const q = db().quotations.find((x) => x.id === invc.quoteId);
  const amount = Math.round(Number(pay.amount) || 0);
  if (amount <= 0) throw new Error("Enter the amount received.");
  const paid = (invc.amountPaid || 0) + amount;
  const enough = paid >= (invc.depositDue || 0);
  /* inventory is re-checked BEFORE any record is written */
  if (enough) {
    const conflicts = I.checkBooking({ ...q, status: "Confirmed", paymentStatus: "Deposit paid" });
    if (conflicts.length) throw new I.InventoryError("The deposit cannot confirm this booking — inventory is no longer available:\n" + I.describeConflicts(conflicts) + "\n\nPayment not recorded. Adjust the itinerary or inventory first.", conflicts);
  }
  D.insert("payments", { invoiceId, quoteId: invc.quoteId, bcn: "", customerId: invc.customerId, customerName: invc.customerName, amount, method: pay.method || "Bank transfer", reference: pay.reference || "", date: pay.date || D.today(), status: "Cleared", recordedBy: actor?.id }, actor, { module: "payments" });
  const inq = invc.inquiryId && findInq(invc.inquiryId);
  if (!enough) {
    D.update("invoices", invoiceId, { amountPaid: paid, balance: Math.max(0, invc.total - paid), status: "Deposit part paid" }, actor, { module: "invoices" });
    notify("payment_received", { inq, quote: q, invoice: db().invoices.find((i) => i.id === invoiceId), amount, partial: true });
    return { confirmed: false, paid };
  }
  const bcn = D.nextNumber("BCN-", "bcnSeq", 5);
  const t = D.quoteTotals(q);
  const booking = D.insert("bookings", {
    bcn, quoteId: q.id, inquiryId: q.inquiryId || "", requestId: q.requestId || "", tripId: q.tripId || "", invoiceId,
    customerId: q.customerId, customerName: q.customerName, title: q.title, arrival: q.arrival, departure: q.departure,
    nights: q.nights, guests: q.guests, lines: q.lines, total: t.total, depositPaid: paid, balance: Math.max(0, t.total - paid),
    dueDate: invc.dueDate, paymentStatus: paid >= t.total ? "Paid in full" : "Deposit paid", supplierStatus: "Requested", status: "Confirmed",
    channel: inq ? "website" : "staff", discountPct: q.discountPct || 0, createdAt: new Date().toISOString(),
    cancelledAt: null, cancellationCharge: 0, cancellationRule: "",
    ...D.OPS_DEFAULTS(q.guests), adults: q.adults ?? q.guests, children: q.children ?? 0, specialRequests: inq?.specialRequests || "",
  }, actor, { module: "bookings" });
  db().payments.filter((p) => p.invoiceId === invoiceId).forEach((p) => { p.bcn = bcn; });
  D.update("invoices", invoiceId, { bookingId: booking.id, bcn, kind: "booking", amountPaid: paid, balance: Math.max(0, t.total - paid), status: paid >= t.total ? "Paid" : "Part paid", depositReceivedAt: Date.now() }, actor, { module: "invoices" });
  const iti = D.insert("itineraries", { id: D.nextNumber("ITI-", "itiSeq"), bcn, tripId: q.tripId || "", bookingId: booking.id, quoteId: q.id, customerId: q.customerId, customerName: q.customerName, title: q.title, arrival: q.arrival, departure: q.departure, guests: q.guests, days: clone(q.dayPlan || []), status: "Draft", version: 1, updatedAt: Date.now() }, actor, { module: D.can(actor, "add", "itineraries") ? "itineraries" : "bookings" });
  D.update("quotations", q.id, { bookingId: booking.id, bcn }, actor, { module: D.can(actor, "edit", "quotations") ? "quotations" : "bookings" });
  const cust = db().customers.find((c) => c.id === q.customerId);
  if (cust) D.update("customers", cust.id, { status: "Confirmed" }, actor, { module: D.can(actor, "edit", "customers") ? "customers" : "bookings" });
  if (inq) D.update("inquiries", inq.id, { bookingId: booking.id, bcn, itineraryId: iti.id, stage: "Confirmed Booking", status: "Converted", history: hist(inq, "Confirmed Booking", actor, "Deposit " + D.money(amount) + " verified (" + (pay.reference || pay.method || "") + ") · " + bcn + " issued") }, actor, { module: D.can(actor, "edit", "requests") ? mod : "invoices" });
  const ctx = { inq: inq && findInq(inq.id), quote: q, invoice: db().invoices.find((i) => i.id === invoiceId), booking: db().bookings.find((b) => b.id === booking.id), amount };
  notify("payment_received", ctx);
  notify("booking_confirmed", ctx);
  return { confirmed: true, booking: ctx.booking };
}

/* ======================= after-confirmation ======================= */
export function sendFinalItinerary(bookingId, actor) {
  const b = db().bookings.find((x) => x.id === bookingId);
  const iti = db().itineraries.find((i) => i.bookingId === bookingId);
  if (!iti) throw new Error("Generate the itinerary first.");
  D.update("itineraries", iti.id, { status: "Published", sentAt: Date.now() }, actor, { module: "itineraries" });
  const inq = b.inquiryId && findInq(b.inquiryId);
  if (inq) D.update("inquiries", inq.id, { history: hist(inq, inq.stage, actor, "Final itinerary " + iti.id + " sent") }, actor, { module: D.can(actor, "edit", "requests") ? mod : "itineraries" });
  notify("final_itinerary", { inq, booking: b, itinerary: db().itineraries.find((i) => i.id === iti.id) });
}
export function sendBalanceReminder(invoiceId, actor) {
  const invc = db().invoices.find((i) => i.id === invoiceId);
  if (!invc?.bookingId || invc.balance <= 0) throw new Error("There is no outstanding balance on this invoice.");
  notify("balance_reminder", { invoice: invc, booking: db().bookings.find((b) => b.id === invc.bookingId), inq: invc.inquiryId && findInq(invc.inquiryId) }, actor);
}
export function rejectRequest(inqId, reason, actor) {
  const inq = findInq(inqId);
  I.releaseRef({ inquiryId: inq.id, quoteId: inq.quoteId }, actor, "Vacation request closed");
  D.update("inquiries", inqId, { stage: "Rejected", status: "Lost", rejectReason: reason || "", history: hist(inq, "Rejected", actor, reason || "Closed") }, actor, { module: mod });
}
export const dueReminders = (days = 14) => db().invoices.filter((i) => i.bookingId && i.balance > 0 && i.dueDate && i.dueDate <= D.addDays(D.today(), days) && db().bookings.find((b) => b.id === i.bookingId)?.status === "Confirmed");

/* payment completed: whenever a booking invoice reaches a zero balance */
D.hooks.after.push((coll, prev, next) => {
  if (coll !== "invoices" || !prev || !next || !next.bookingId) return;
  if ((prev.balance || 0) > 0 && next.balance === 0) setTimeout(() => notify("payment_completed", { invoice: next, booking: db().bookings.find((b) => b.id === next.bookingId), inq: next.inquiryId && findInq(next.inquiryId) }), 0);
});

/* ============================ EMAILS ============================== */
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cfg = () => ({ provider: "formsubmit", formsubmitTo: "", fromName: "Prestige Bali Leisure", replyTo: db().cms.footer?.email || "", internalTo: db().cms.footer?.email || "reservations@prestigebalileisure.com", serviceId: "", templateId: "", publicKey: "", webhookUrl: "", ...(db().settings.email || {}) });
export const emailSettings = cfg;
(() => { try { const e = D.db().settings.email; if (e && e.provider === "none" && !e.migratedV2) { e.provider = "formsubmit"; e.migratedV2 = true; } } catch {} })();

function shell(title, intro, body, refs) {
  const f = db().cms.footer || {};
  const refRow = Object.entries(refs).filter(([, v]) => v).map(([k, v]) => `<td style="padding:0 18px 0 0"><div style="font:600 9px/1.4 Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#8a8377">${esc(k)}</div><div style="font:600 14px/1.5 Georgia,serif;color:#1f2a26">${esc(v)}</div></td>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#efe9dc;padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fbf8f1">
<tr><td style="background:#101b17;padding:28px 36px"><div style="font:600 22px/1 Georgia,serif;letter-spacing:.28em;color:#d2ab6d">PRESTIGE</div><div style="font:400 9px/1.8 Arial,sans-serif;letter-spacing:.32em;text-transform:uppercase;color:#a29b8a">Leisures and Wellness · Bali</div></td></tr>
<tr><td style="padding:34px 36px 8px"><div style="font:600 24px/1.25 Georgia,serif;color:#1f2a26">${esc(title)}</div><p style="font:400 14px/1.7 Arial,sans-serif;color:#4a4a42;margin:14px 0 0">${intro}</p></td></tr>
<tr><td style="padding:18px 36px 0"><table role="presentation" cellpadding="0" cellspacing="0" style="border-top:1px solid #e3dccb;border-bottom:1px solid #e3dccb;padding:12px 0;width:100%"><tr>${refRow}</tr></table></td></tr>
<tr><td style="padding:22px 36px 30px;font:400 13px/1.7 Arial,sans-serif;color:#3b3b34">${body}</td></tr>
<tr><td style="background:#101b17;padding:22px 36px;font:400 11px/1.7 Arial,sans-serif;color:#a29b8a">Prestige Bali Leisure · ${esc(f.email || "")} · ${esc(f.phone || "")}<br/>Your concierge desk replies within one working day.</td></tr>
</table></td></tr></table></body></html>`;
}
const table = (rows, head) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 14px">${head ? `<tr>${head.map((h, i) => `<td style="font:600 9px/1.4 Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#8a8377;border-bottom:1px solid #e3dccb;padding:6px 4px;${i === head.length - 1 ? "text-align:right" : ""}">${esc(h)}</td>`).join("")}</tr>` : ""}${rows.map((r) => `<tr>${r.map((c, i) => `<td style="padding:8px 4px;border-bottom:1px solid #efe9dc;vertical-align:top;${i === r.length - 1 ? "text-align:right;white-space:nowrap" : ""}">${c}</td>`).join("")}</tr>`).join("")}</table>`;
const planHtml = (plan, prices) => (plan || []).map((d, i) => `<div style="font:600 10px/1.4 Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#b08d57;margin-top:14px">Day ${i + 1} · ${esc(D.fmtDate(d.date))} — ${esc(d.title || "")}</div>${table((d.items || []).map((it) => [esc(it.time || ""), `<b>${esc(it.name)}</b>${it.note ? `<br/><span style="color:#8a8377">${esc(it.note)}</span>` : ""}`, prices ? (it.custom || !Number(it.sell) ? "price on request" : D.money(D.lineTotals(it).sell)) : esc(it.duration || "")]).concat((d.items || []).length ? [] : [["", '<span style="color:#8a8377">Free day</span>', ""]]))}`).join("");
const btn = (label, href) => href ? `<p style="margin:20px 0"><a href="${esc(href)}" style="display:inline-block;background:#b08d57;color:#101b17;font:600 11px/1 Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;text-decoration:none;padding:14px 24px">${esc(label)}</a></p>` : "";
const siteUrl = () => (typeof location !== "undefined" && location.origin && !/^file|null/.test(location.origin) ? location.origin + location.pathname : "");

export const TEMPLATES = {
  submitted: { label: "1 · Itinerary submitted (inquiry reference)", to: "customer" },
  internal_new: { label: "Internal · New itinerary inquiry", to: "internal" },
  under_review: { label: "2 · Request under review", to: "customer" },
  quotation_sent: { label: "3 · Quotation sent", to: "customer" },
  quotation_approved: { label: "4 · Quotation approved", to: "customer" },
  deposit_invoice: { label: "5 · Booking confirmation & deposit invoice", to: "customer" },
  payment_received: { label: "6 · Payment received", to: "customer" },
  booking_confirmed: { label: "7 · Official booking confirmation", to: "customer" },
  final_itinerary: { label: "8 · Final itinerary", to: "customer" },
  balance_reminder: { label: "9 · Balance payment reminder", to: "customer" },
  payment_completed: { label: "10 · Payment completed", to: "customer" },
  newsletter_signup: { label: "Internal · Newsletter sign-up", to: "internal" },
};

export function renderEmail(kind, ctx) {
  const { inq, quote, invoice, booking, itinerary } = ctx;
  const name = (inq?.contact?.name || booking?.customerName || quote?.customerName || invoice?.customerName || "").split(" ")[0] || "there";
  const refs = { Inquiry: inq?.id, Trip: inq?.tripId || quote?.tripId || booking?.tripId, Quotation: quote?.id, Invoice: invoice?.id, "Booking (BCN)": booking?.bcn };
  const pay = db().cms.footer?.paypal;
  const trip = inq ? `${D.fmtDate(inq.arrival)} – ${D.fmtDate(inq.departure)} · ${inq.nights} nights · ${inq.adults} adult${inq.adults === 1 ? "" : "s"}${inq.children ? ", " + inq.children + " children" : ""}${inq.infants ? ", " + inq.infants + " infants" : ""}` : "";
  const quoteTable = (q) => { const t = D.quoteTotals(q); return table(t.lines.map((l) => [esc(l.name), String(l.qty), l.custom ? "to quote" : D.money(l.sell)]), ["Item", "Qty", "Amount"]) + table([["Subtotal", "", D.money(t.sell)], ...(t.discount ? [["Discount", "", "− " + D.money(t.discount)]] : []), ["Tax " + q.taxPct + "%", "", D.money(t.tax)], ["<b>Total</b>", "", "<b>" + D.money(t.total) + "</b>"], ["Deposit to confirm", "", D.money(q.depositDue)]]); };
  switch (kind) {
    case "submitted": return { subject: `Your Bali itinerary has been received — Inquiry ${inq.id}`, html: shell("Thank you, " + name + ".", `Your vacation itinerary has reached our concierge desk under inquiry <b>${esc(inq.id)}</b>. <b>This is a booking inquiry, not a confirmed reservation</b> — our team will check availability with every supplier and send your booking confirmation and invoice, usually within one working day.`, `<p><b>${esc(trip)}</b></p>${(inq.destinations || []).length ? `<p>${esc(inq.destinations.map((l) => l.destination + " · " + l.nights + " night" + (l.nights === 1 ? "" : "s")).join(" → "))}</p>` : ""}${planHtml(inq.original?.plan || inq.plan, true)}${table([["Estimated total incl. tax", "", "<b>" + D.money(inq.estimate?.total) + "</b>"]])}<p style="color:#8a8377">Prices are estimates until confirmed in your quotation. No payment is taken until you approve it.</p>${inq.specialRequests ? `<p><b>Your requests:</b> ${esc(inq.specialRequests)}</p>` : ""}`, refs) };
    case "internal_new": return { subject: `New itinerary inquiry ${inq.id} · ${inq.contact?.name} · ${D.fmtDate(inq.arrival)}`, html: shell("New itinerary inquiry", `${esc(inq.contact?.name)} (${esc(inq.contact?.country)}) submitted a request from the website builder.`, `${(inq.destinations || []).length ? `<p><b>Destinations:</b> ${esc(inq.destinations.map((l) => l.destination + " " + l.nights + "n").join(" → "))}</p>` : ""}${table([["Email", "", esc(inq.contact?.email)], ["WhatsApp", "", esc(inq.contact?.phone)], ["Travel", "", esc(trip)], ["Products", "", String(inq.productSlugs?.length || 0)], ["Estimated total", "", D.money(inq.estimate?.total)]])}${inq.holdWarning ? `<p style="color:#b4432f"><b>Availability warning:</b> ${esc(inq.holdWarning)}</p>` : ""}${planHtml(inq.plan, true)}<p>Open <b>Vacation requests</b> in the operations console to review.</p>`, refs) };
    case "under_review": return { subject: `Your vacation request ${inq.requestId} is being prepared`, html: shell("We're preparing your journey", `Dear ${esc(name)}, a travel designer is now checking availability with each villa, driver and venue in your request. You'll receive your formal quotation shortly.`, `<p>${esc(trip)}</p><p style="color:#8a8377">This is still a request — nothing is reserved or charged yet.</p>`, refs) };
    case "quotation_sent": return { subject: `Your quotation ${quote.id} — ${quote.title}`, html: shell("Your quotation is ready", `Dear ${esc(name)}, here is your itemised quotation, held until ${esc(D.fmtDate(quote.validity))}. Approve it from your guest account or simply reply to this email.`, `${quoteTable(quote)}${planHtml(quote.dayPlan, false)}<p><b>Payment terms:</b> ${esc(quote.paymentTerms)}<br/><b>Cancellation:</b> ${esc(quote.cancellationPolicy)}</p>${btn("Review & approve", siteUrl() ? siteUrl() + "#/account" : "")}<p style="color:#8a8377">Approving the quotation does not confirm the booking — confirmation follows once the deposit is received.</p>`, refs) };
    case "quotation_approved": return { subject: `Quotation ${quote.id} approved — next: your deposit invoice`, html: shell("Thank you for approving", `Dear ${esc(name)}, we've recorded your approval of quotation ${esc(quote.id)}. We are verifying final availability and will send your provisional confirmation and deposit invoice next.`, `<p><b>Total:</b> ${D.money(quote.total)} · <b>Deposit:</b> ${D.money(quote.depositDue)}</p><p style="color:#8a8377">Your booking is not yet confirmed.</p>`, refs) };
    case "deposit_invoice": return { subject: `Deposit invoice ${invoice.id} · provisional confirmation ${invoice.provisionalRef}`, html: shell("Provisional confirmation", `Dear ${esc(name)}, availability is verified and your arrangements are <b>provisionally held until ${esc(ctx.heldUntil ? new Date(ctx.heldUntil).toLocaleString("en-GB") : D.fmtDate(invoice.depositDueDate))}</b>. To confirm your booking, please pay the deposit below.`, `${table([["Provisional confirmation", "", esc(invoice.provisionalRef)], ["Total", "", D.money(invoice.total)], ["<b>Deposit due now</b>", "", "<b>" + D.money(invoice.depositDue) + "</b>"], ["Deposit due by", "", esc(D.fmtDate(invoice.depositDueDate))], ["Balance due by", "", esc(D.fmtDate(invoice.dueDate))]])}<p><b>How to pay:</b> ${pay ? `PayPal — <a href="${esc(pay)}" style="color:#b08d57">${esc(pay)}</a>. ` : ""}Please quote <b>${esc(invoice.id)}</b> as the payment reference. For bank transfer details, reply to this email.</p>${btn("Pay deposit", pay)}${planHtml(quote.dayPlan, false)}<p style="color:#8a8377">This is a provisional confirmation. Your official Booking Confirmation Number is issued once the deposit is received. If the deposit is not received by the date above, the hold is released.</p>`, refs) };
    case "payment_received": return { subject: `Payment received — ${D.money(ctx.amount)}${invoice ? " · " + invoice.id : ""}`, html: shell("Payment received", `Dear ${esc(name)}, thank you — we've received your payment of <b>${D.money(ctx.amount)}</b>.`, `${table([["Invoice", "", esc(invoice?.id)], ["Paid to date", "", D.money(invoice?.amountPaid)], ["Remaining balance", "", D.money(invoice?.balance)], ["Balance due by", "", esc(D.fmtDate(invoice?.dueDate))]])}${ctx.partial ? `<p>The full deposit of ${D.money(invoice?.depositDue)} is needed to confirm your booking.</p>` : ""}`, refs) };
    case "booking_confirmed": return { subject: `Booking confirmed — ${booking.bcn}`, html: shell("Your booking is confirmed", `Dear ${esc(name)}, your Bali journey is officially confirmed. Your Booking Confirmation Number is <b>${esc(booking.bcn)}</b> — please quote it in all correspondence.`, `${table([["Booking confirmation", "", "<b>" + esc(booking.bcn) + "</b>"], ["Dates", "", esc(D.fmtDate(booking.arrival) + " – " + D.fmtDate(booking.departure))], ["Guests", "", String(booking.guests)], ["Total", "", D.money(booking.total)], ["Paid", "", D.money(booking.depositPaid)], ["Balance", "", D.money(booking.balance)], ["Balance due by", "", esc(D.fmtDate(booking.dueDate))]])}${planHtml(quote?.dayPlan, false)}<p>Your final itinerary with times and driver details follows before arrival. Please send your flight details so we can arrange your airport welcome.</p>`, refs) };
    case "final_itinerary": return { subject: `Your final itinerary — ${booking.bcn}`, html: shell("Your final itinerary", `Dear ${esc(name)}, here is your day-by-day itinerary. Timings are confirmed with each supplier the day before.`, `${planHtml(itinerary.days, false)}<p>Your concierge is reachable 24/7 during your stay.</p>`, refs) };
    case "balance_reminder": return { subject: `Balance reminder — ${booking?.bcn} · ${D.money(invoice.balance)} due ${D.fmtDate(invoice.dueDate)}`, html: shell("A gentle reminder", `Dear ${esc(name)}, the remaining balance for booking ${esc(booking?.bcn)} is due on <b>${esc(D.fmtDate(invoice.dueDate))}</b>, ${db().settings.fullPaymentDaysBeforeArrival} days before arrival.`, `${table([["Invoice", "", esc(invoice.id)], ["Total", "", D.money(invoice.total)], ["Paid", "", D.money(invoice.amountPaid)], ["<b>Balance due</b>", "", "<b>" + D.money(invoice.balance) + "</b>"]])}<p><b>How to pay:</b> ${pay ? `PayPal — <a href="${esc(pay)}" style="color:#b08d57">${esc(pay)}</a>. ` : ""}Reference: <b>${esc(invoice.id)}</b>.</p>${btn("Pay balance", pay)}`, refs) };
    case "payment_completed": return { subject: `Paid in full — ${booking?.bcn}`, html: shell("Paid in full", `Dear ${esc(name)}, your booking ${esc(booking?.bcn)} is now paid in full. Thank you — everything is ready for your arrival on ${esc(D.fmtDate(booking?.arrival))}.`, table([["Invoice", "", esc(invoice.id)], ["Total paid", "", D.money(invoice.amountPaid)]]), refs) };
    case "newsletter_signup": return { subject: "Newsletter sign-up · " + ctx.email, html: shell("New newsletter subscriber", esc(ctx.email) + " joined the newsletter from the website.", "<p>Add them to your mailing list.</p>", {}) };
    default: return { subject: kind, html: shell(kind, "", "", refs) };
  }
}
const htmlToText = (h) => h.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|tr|div)>/gi, "\n").replace(/<td[^>]*>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();

export function notify(kind, ctx, actor, extra = {}) {
  const t = TEMPLATES[kind];
  if (!t) return null;
  const c = cfg();
  const to = t.to === "internal" ? c.internalTo : ctx.inq?.contact?.email || db().customers.find((x) => x.id === (ctx.booking?.customerId || ctx.quote?.customerId || ctx.invoice?.customerId))?.email;
  const { subject, html } = renderEmail(kind, ctx);
  const rec = {
    id: "EML-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase(), at: Date.now(), kind, label: t.label, audience: t.to,
    to: to || "", subject, html, text: htmlToText(html), status: to ? "queued" : "no recipient", provider: c.provider, error: "",
    refs: { requestId: ctx.inq?.requestId || ctx.invoice?.requestId || "", inquiryId: ctx.inq?.id || "", quoteId: ctx.quote?.id || ctx.invoice?.quoteId || "", invoiceId: ctx.invoice?.id || "", bcn: ctx.booking?.bcn || ctx.invoice?.bcn || "" },
    sentBy: actor?.name || "system",
    ...(extra.importPayload ? { importPayload: extra.importPayload } : {}),
    guestName: ctx.inq?.contact?.name || ctx.booking?.customerName || ctx.quote?.customerName || ctx.invoice?.customerName || "",
  };
  if (!db().emails) db().emails = [];
  db().emails.unshift(rec);
  if (db().emails.length > 1500) db().emails.length = 1500;
  D.commit("email");
  if (to) deliver(rec.id);
  return rec;
}

/* Delivery: EmailJS (browser-safe public key) or a webhook (Zapier/Make/
   own server). Without a provider the email stays in the outbox with
   its full content, ready to resend or open in a mail client. */
export async function deliver(id) {
  const rec = (db().emails || []).find((e) => e.id === id);
  if (!rec || !rec.to) return;
  const c = cfg();
  const set = (patch) => { Object.assign(rec, patch); D.commit("email"); };
  try {
    if (c.provider === "emailjs" && c.serviceId && c.templateId && c.publicKey) {
      const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ service_id: c.serviceId, template_id: c.templateId, user_id: c.publicKey, template_params: { to_email: rec.to, subject: rec.subject, html: rec.html, message: rec.text, from_name: c.fromName, reply_to: c.replyTo } }) });
      set(res.ok ? { status: "sent", sentAt: Date.now(), provider: "emailjs", error: "" } : { status: "failed", error: "EmailJS " + res.status + " " + (await res.text()).slice(0, 160) });
    } else if (c.provider === "formsubmit") {
      /* FormSubmit: no account. The first email asks the business inbox to
         click "Activate Form" once; afterwards every email is delivered.
         Guest emails are sent to the business inbox with the guest in CC,
         so the guest receives their copy and the team keeps one too. */
      const target = (c.formsubmitTo || c.internalTo || "").trim();
      if (!target) { set({ status: "failed", error: "Set the business email address in Email & notifications." }); return; }
      let importUrl = "";
      if (rec.importPayload && siteBase()) { try { importUrl = siteBase() + "#/workspace/import?d=" + (await encodePayload(rec.importPayload)); } catch {} }
      const body = {
        _subject: rec.subject, _template: "box", _captcha: "false", _replyto: rec.audience === "internal" ? rec.to : c.replyTo || target,
        ...(rec.audience !== "internal" && rec.to && rec.to.toLowerCase() !== target.toLowerCase() ? { _cc: rec.to } : {}),
        name: rec.audience === "internal" ? rec.guestName || "Website" : c.fromName, email: rec.audience === "internal" ? (rec.importPayload?.info?.email || target) : target,
        ...(rec.refs.inquiryId ? { "Inquiry ID": rec.refs.inquiryId } : {}), ...(rec.refs.requestId && rec.refs.requestId !== rec.refs.inquiryId ? { "Request ID": rec.refs.requestId } : {}),
        ...(rec.refs.bcn ? { "Booking (BCN)": rec.refs.bcn } : {}), ...(rec.refs.invoiceId ? { Invoice: rec.refs.invoiceId } : {}), ...(rec.refs.quoteId ? { Quotation: rec.refs.quoteId } : {}),
        message: rec.text,
        ...(importUrl ? { "Open in Prestige backend": importUrl } : {}),
      };
      const res = await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(target), { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
      let out = {};
      try { out = await res.json(); } catch {}
      const okSent = res.ok && String(out.success) === "true";
      const needsActivation = /activat/i.test(out.message || "");
      set(okSent ? { status: "sent", sentAt: Date.now(), provider: "formsubmit", error: "", importUrl }
        : needsActivation ? { status: "awaiting activation", provider: "formsubmit", error: "FormSubmit sent an “Activate Form” email to " + target + ". Click it once, then resend.", importUrl }
        : { status: "failed", provider: "formsubmit", error: "FormSubmit: " + (out.message || "HTTP " + res.status), importUrl });
    } else if (c.provider === "webhook" && c.webhookUrl) {
      const res = await fetch(c.webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: rec.to, subject: rec.subject, html: rec.html, text: rec.text, fromName: c.fromName, replyTo: c.replyTo, kind: rec.kind, refs: rec.refs }) });
      set(res.ok ? { status: "sent", sentAt: Date.now(), provider: "webhook", error: "" } : { status: "failed", error: "Webhook " + res.status });
    } else {
      set({ status: "queued", error: "Email delivery is switched off — choose a provider in Email & notifications." });
    }
  } catch (e) {
    set({ status: "failed", error: String(e.message || e).slice(0, 200) });
  }
}
export function saveEmailSettings(patch, actor) {
  if (!D.can(actor, "edit", "integrations") && actor?.role !== "super_admin") throw new D.PermissionError("Only administrators can change email settings.");
  const before = cfg();
  db().settings.email = { ...before, ...patch };
  D.audit(actor, "edit", "integrations", "email-settings", { provider: before.provider }, { provider: db().settings.email.provider });
  D.commit("email-settings");
}
export const mailtoFor = (e) => `mailto:${encodeURIComponent(e.to)}?subject=${encodeURIComponent(e.subject)}&body=${encodeURIComponent(e.text.slice(0, 1800))}`;
