/* ==================================================================
   PRESTIGE BALI LEISURE — CENTRAL INVENTORY SERVICE
   ------------------------------------------------------------------
   Date-based inventory for every Product Master record.

     capacity(product, date, pool)   ← pools · rules · overrides ·
                                        blackouts · open days
     reserved                         ← active, unexpired holds
     sold                             ← confirmed allocations
     available = capacity − reserved − sold   (never below zero)

   Allocations are derived from bookings by reconciliation: every
   booking write is checked BEFORE it is committed (atomic — the write
   is refused if any date would oversell) and the booking's
   allocations are then rebuilt so that a booking is allocated exactly
   once, amendments move inventory between old and new dates and
   cancellations release it.

   A product with no capacity set is "On request": sales are still
   recorded, but the supplier confirms availability.

   Every change is written to the inventory transaction log with the
   user, source (manual · booking · supplier · api · system) and the
   booking or external reference.
   ================================================================== */
import * as D from "./db.js";

export class InventoryError extends Error {
  constructor(message, conflicts = []) {
    super(message);
    this.name = "InventoryError";
    this.conflicts = conflicts;
  }
}

const uid = (p) => p + "-" + Math.random().toString(36).slice(2, 9).toUpperCase();
const DB = () => D.db();
export const rangeDates = (from, to) => {
  const out = [];
  if (!from) return out;
  if (!to || to <= from) return [from];
  for (let d = from, n = 0; d < to && n < 400; d = D.addDays(d, 1), n++) out.push(d);
  return out;
};

/* ------------------------- inventory types ------------------------ */
export const TYPE_DEFAULTS = {
  accommodation: { kind: "unit", unitLabel: "room", unitPlural: "rooms", poolLabel: "Room type", poolName: "Standard" },
  transportation: { kind: "unit", unitLabel: "vehicle", unitPlural: "vehicles", poolLabel: "Vehicle type", poolName: "Standard vehicle" },
  yacht: { kind: "unit", unitLabel: "vessel", unitPlural: "vessels", poolLabel: "Vessel / departure", poolName: "Vessel" },
  concierge: { kind: "unit", unitLabel: "slot", unitPlural: "slots", poolLabel: "Service option", poolName: "Standard" },
  activities: { kind: "capacity", unitLabel: "seat", unitPlural: "seats", poolLabel: "Session", poolName: "All day" },
  adventure: { kind: "capacity", unitLabel: "place", unitPlural: "places", poolLabel: "Session / departure", poolName: "Daily departure" },
  attractions: { kind: "capacity", unitLabel: "ticket", unitPlural: "tickets", poolLabel: "Session", poolName: "All day" },
  tours: { kind: "capacity", unitLabel: "seat", unitPlural: "seats", poolLabel: "Departure", poolName: "Daily departure" },
  watersports: { kind: "capacity", unitLabel: "place", unitPlural: "places", poolLabel: "Session", poolName: "All day" },
  wellness: { kind: "capacity", unitLabel: "slot", unitPlural: "slots", poolLabel: "Session", poolName: "All day" },
  dining: { kind: "capacity", unitLabel: "cover", unitPlural: "covers", poolLabel: "Seating", poolName: "All day" },
};
export const typeFor = (categoryId) => TYPE_DEFAULTS[categoryId] || TYPE_DEFAULTS.activities;
const productOf = (slug) => D.productOf(slug);
export const isNightly = (p) => (p?.unit || "") === "night";

export function blankInventory(p) {
  const t = typeFor(p?.categoryId);
  return {
    slug: p.slug, kind: t.kind, unitLabel: t.unitLabel, unitPlural: t.unitPlural,
    pools: [{ id: "default", name: t.poolName, capacity: null, maxPerBooking: null, time: "", detail: "" }],
    rules: [], blackouts: [], overrides: {}, openDays: null,
    source: "internal", externalId: "",
    supplier: { allocation: null, contracted: null, reported: null, status: "Not requested", ref: "", updatedAt: null, updatedBy: "" },
    updatedAt: null, updatedBy: "",
  };
}
export const invOf = (slug) => DB().inventory[slug] || null;
export function getInventory(slug) {
  const inv = invOf(slug);
  if (inv) return inv;
  const p = productOf(slug);
  return p ? blankInventory(p) : null;
}
export const isManaged = (inv) => !!inv && (inv.pools.some((x) => x.capacity !== null && x.capacity !== "" && x.capacity !== undefined) || inv.rules.length > 0 || Object.keys(inv.overrides).length > 0);
const poolOf = (inv, poolId) => inv.pools.find((x) => x.id === poolId) || inv.pools[0];

/* ---------------------------- capacity ---------------------------- */
export function capacityAt(slug, date, poolId) {
  const inv = invOf(slug);
  if (!inv) return { cap: null, reason: "on request" };
  const pool = poolOf(inv, poolId);
  if (inv.blackouts.some((b) => date >= b.from && date <= (b.to || b.from))) return { cap: 0, reason: "blackout" };
  const dow = new Date(date + "T00:00:00").getDay();
  if (Array.isArray(inv.openDays) && !inv.openDays.includes(dow)) return { cap: 0, reason: "closed" };
  const ov = inv.overrides[date + "|" + pool.id];
  if (ov !== undefined && ov !== null) return { cap: Math.max(0, Number(ov)), reason: "date override" };
  for (let i = inv.rules.length - 1; i >= 0; i--) {
    const r = inv.rules[i];
    if (date < r.from || date > (r.to || r.from)) continue;
    if (r.poolId && r.poolId !== "all" && r.poolId !== pool.id) continue;
    if (Array.isArray(r.dows) && r.dows.length && !r.dows.includes(dow)) continue;
    return { cap: Math.max(0, Number(r.qty) || 0), reason: r.label || "period rule" };
  }
  const c = pool.capacity;
  if (c === null || c === "" || c === undefined) return { cap: null, reason: "on request" };
  return { cap: Math.max(0, Number(c)), reason: "default capacity" };
}

/* ------------------------- allocation index ----------------------- */
let idx = new Map();
let idxVer = -1;
let lastHousekeeping = 0;
const keyOf = (slug, date, poolId) => slug + "|" + date + "|" + (poolId || "default");
const liveHold = (a, now) => a.kind === "hold" && a.status === "active" && (!a.expiresAt || a.expiresAt > now);

function index() {
  housekeeping();
  if (idxVer === D.getVersion() && idx.size !== undefined) return idx;
  idx = new Map();
  for (const a of DB().allocations) {
    if (a.status !== "active") continue;
    const inv = invOf(a.slug);
    const pid = inv ? poolOf(inv, a.poolId).id : a.poolId || "default";
    const k = keyOf(a.slug, a.date, pid);
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(a);
  }
  idxVer = D.getVersion();
  return idx;
}
const invalidate = () => { idxVer = -1; };

export function dayStat(slug, date, poolId) {
  const inv = invOf(slug);
  const pid = inv ? poolOf(inv, poolId).id : poolId || "default";
  const now = Date.now();
  const allocs = index().get(keyOf(slug, date, pid)) || [];
  const reserved = allocs.filter((a) => liveHold(a, now)).reduce((s, a) => s + a.qty, 0);
  const sold = allocs.filter((a) => a.kind === "confirmed").reduce((s, a) => s + a.qty, 0);
  const { cap, reason } = capacityAt(slug, date, pid);
  const available = cap === null ? null : Math.max(0, cap - reserved - sold);
  const oversold = cap !== null && reserved + sold > cap ? reserved + sold - cap : 0;
  return { date, poolId: pid, total: cap, reserved, sold, available, oversold, reason, status: statusOf(cap, available, reason), allocs: allocs.filter((a) => a.kind === "confirmed" || liveHold(a, now)) };
}
export function statusOf(cap, available, reason) {
  if (cap === null) return "onrequest";
  if (cap === 0 && (reason === "blackout" || reason === "closed")) return "unavailable";
  if (available <= 0) return "soldout";
  if (available <= 2 || available <= Math.ceil(cap * 0.2)) return "limited";
  return "available";
}
export const STATUS_LABEL = { available: "Available", limited: "Limited", soldout: "Sold out", unavailable: "Unavailable", onrequest: "On request" };

/* availability for a stay or service: the minimum across its dates */
export function rangeStat(slug, from, to, poolId, need = 1) {
  const p = productOf(slug);
  const dates = isNightly(p) ? rangeDates(from, to) : [from];
  const days = dates.map((d) => dayStat(slug, d, poolId));
  const inv = invOf(slug);
  const onRequest = days.some((d) => d.total === null);
  const minAvail = onRequest ? null : Math.min(...days.map((d) => d.available));
  const pool = inv ? poolOf(inv, poolId) : null;
  const overMax = pool?.maxPerBooking ? need > Number(pool.maxPerBooking) : false;
  let status = onRequest ? "onrequest" : days.some((d) => d.status === "unavailable") ? "unavailable" : minAvail <= 0 ? "soldout" : minAvail < need ? "insufficient" : days.some((d) => d.status === "limited") ? "limited" : "available";
  if (overMax) status = "overmax";
  return { slug, dates, days, minAvail, onRequest, status, ok: onRequest || (status !== "soldout" && status !== "unavailable" && status !== "insufficient" && !overMax), maxPerBooking: pool?.maxPerBooking || null };
}

/* customer-facing wording */
export function customerLabel(slug, rs, need = 1) {
  const inv = getInventory(slug);
  const plural = inv?.unitPlural || "places";
  switch (rs.status) {
    case "onrequest": return { text: "On request", tone: "neutral", bookable: true };
    case "unavailable": return { text: "Unavailable on these dates", tone: "red", bookable: false };
    case "soldout": return { text: "Sold out", tone: "red", bookable: false };
    case "insufficient": return { text: `Only ${rs.minAvail} ${rs.minAvail === 1 ? inv.unitLabel : plural} ${inv.kind === "unit" ? "left" : "available"} — reduce the quantity`, tone: "amber", bookable: false };
    case "overmax": return { text: `Maximum ${rs.maxPerBooking} per booking`, tone: "amber", bookable: false };
    default:
      if (rs.minAvail <= 3) return { text: `Only ${rs.minAvail} ${rs.minAvail === 1 ? inv.unitLabel : plural} ${inv.kind === "unit" ? "left" : "available"}`, tone: "amber", bookable: true };
      if (rs.status === "limited") return { text: "Limited availability", tone: "amber", bookable: true };
      return { text: "Available", tone: "green", bookable: true };
  }
}

/* ---------------------------- logging ----------------------------- */
function log(entry, actor) {
  const p = productOf(entry.slug);
  DB().inventoryLog.unshift({
    id: uid("INV"), at: Date.now(),
    user: actor?.name || actor?.email || "system", role: actor?.role || "system",
    productId: p?.productId || "", name: p?.name || entry.slug, ...entry,
  });
  if (DB().inventoryLog.length > 4000) DB().inventoryLog.length = 4000;
}
export function syncLog(entry) {
  DB().inventorySync.unshift({ id: uid("SYN"), at: Date.now(), ...entry });
  if (DB().inventorySync.length > 1500) DB().inventorySync.length = 1500;
}

/* -------------------- booking → desired allocations --------------- */
export function lineDates(line, b) {
  const p = productOf(line.slug);
  const start = line.date || b.arrival;
  if (isNightly(p) || line.unit === "night") {
    const end = line.to || (line.date ? D.addDays(line.date, Math.max(1, Number(line.qty) || 1)) : b.departure);
    return { dates: rangeDates(start, end), units: Math.max(1, Number(line.units ?? b.rooms ?? 1) || 1) };
  }
  return { dates: [start], units: Math.max(1, Number(line.qty) || 1) };
}
const isOperational = (b) => (b.status === "Confirmed" || b.status === "Completed") && b.paymentStatus !== "Unpaid";

function desiredFor(b) {
  if (!b || b.status === "Cancelled") return [];
  let kind = null;
  if (isOperational(b)) kind = "confirmed";
  else if ((b.status === "Confirmed" || b.status === "Completed") && b.paymentStatus === "Unpaid" && (!b.holdExpiresAt || b.holdExpiresAt > Date.now())) kind = "hold";
  if (!kind) return [];
  const out = [];
  (b.lines || []).forEach((l, i) => {
    if (!l.slug || l.custom || !productOf(l.slug)) return;
    const { dates, units } = lineDates(l, b);
    const inv = invOf(l.slug);
    const poolId = inv ? poolOf(inv, l.poolId).id : l.poolId || "default";
    dates.forEach((date) => out.push({ lineKey: i, slug: l.slug, date, poolId, qty: units, kind }));
  });
  return out;
}

/* availability check for a set of needs, ignoring the given allocations */
export function checkNeeds(needs, ignore = () => false) {
  const grouped = new Map();
  needs.forEach((n) => {
    const k = keyOf(n.slug, n.date, n.poolId);
    grouped.set(k, { ...n, qty: (grouped.get(k)?.qty || 0) + n.qty });
  });
  const conflicts = [];
  const now = Date.now();
  grouped.forEach((n) => {
    const { cap, reason } = capacityAt(n.slug, n.date, n.poolId);
    const inv = invOf(n.slug);
    const pool = inv ? poolOf(inv, n.poolId) : null;
    if (pool?.maxPerBooking && n.qty > Number(pool.maxPerBooking)) conflicts.push({ ...n, available: Number(pool.maxPerBooking), reason: "maximum per booking" });
    if (cap === null) return;
    const used = (index().get(keyOf(n.slug, n.date, n.poolId)) || [])
      .filter((a) => (a.kind === "confirmed" || liveHold(a, now)) && !ignore(a))
      .reduce((s, a) => s + a.qty, 0);
    const available = Math.max(0, cap - used);
    if (n.qty > available) conflicts.push({ ...n, available, reason });
  });
  return conflicts;
}
export function describeConflicts(conflicts) {
  return conflicts.slice(0, 6).map((c) => {
    const p = productOf(c.slug);
    const inv = getInventory(c.slug);
    return `${p?.name || c.slug} · ${D.fmtDate(c.date)}${inv && inv.pools.length > 1 ? " · " + poolOf(inv, c.poolId).name : ""}: needs ${c.qty}, ${c.reason === "maximum per booking" ? "maximum " + c.available + " per booking" : c.available + " available" + (c.reason === "blackout" || c.reason === "closed" ? " (" + c.reason + ")" : "")}`;
  }).join("\n") + (conflicts.length > 6 ? `\n… and ${conflicts.length - 6} more` : "");
}

/* public pre-check used by screens before they write */
export function checkBooking(draft, ignoreBookingId) {
  const b = { status: "Confirmed", paymentStatus: "Deposit paid", ...draft };
  const needs = desiredFor(b);
  return checkNeeds(needs, (a) => (ignoreBookingId && a.bookingId === ignoreBookingId) || (b.quoteId && a.quoteId === b.quoteId && !a.bookingId) || (b.inquiryId && a.inquiryId === b.inquiryId && !a.bookingId));
}

/* ------------------------- reconciliation ------------------------- */
function reconcile(b, actor, note) {
  const all = DB().allocations;
  const current = b ? all.filter((a) => a.bookingId === b.id && a.status === "active") : [];
  const desired = desiredFor(b);
  const sig = (x) => x.lineKey + "|" + x.slug + "|" + x.date + "|" + x.poolId + "|" + x.kind + "|" + x.qty;
  const want = new Map(desired.map((x) => [sig(x), x]));
  const have = new Map(current.map((a) => [sig(a), a]));
  const now = Date.now();
  const touched = new Map();
  const touch = (slug) => { if (!touched.has(slug)) touched.set(slug, { slug, reserved: 0, sold: 0, released: 0, dates: new Set(), firstBefore: null }); return touched.get(slug); };

  current.forEach((a) => {
    if (want.has(sig(a))) return;
    const t = touch(a.slug);
    if (t.firstBefore === null) t.firstBefore = dayStat(a.slug, a.date, a.poolId).available;
    a.status = desired.some((d) => d.slug === a.slug && d.date === a.date && d.kind === "confirmed") && a.kind === "hold" ? "converted" : "released";
    a.releasedAt = now;
    if (a.status === "released") t.released += a.qty;
    t.dates.add(a.date);
  });
  desired.forEach((x) => {
    if (have.has(sig(x))) return;
    const t = touch(x.slug);
    if (t.firstBefore === null) t.firstBefore = dayStat(x.slug, x.date, x.poolId).available;
    all.push({
      id: uid("ALC"), slug: x.slug, productId: productOf(x.slug)?.productId || "", date: x.date, poolId: x.poolId, qty: x.qty,
      kind: x.kind, status: "active", bookingId: b.id, bcn: b.bcn, quoteId: b.quoteId || "", inquiryId: b.inquiryId || "",
      lineKey: x.lineKey, channel: b.channel || "staff", source: "booking", externalRef: b.externalRef || "",
      expiresAt: x.kind === "hold" ? b.holdExpiresAt || now + (DB().settings.holdHoursStaff || 48) * 3600e3 : null,
      createdAt: now, releasedAt: null,
    });
    if (x.kind === "hold") t.reserved += x.qty; else t.sold += x.qty;
    t.dates.add(x.date);
  });
  /* holds placed against the quotation or inquiry are converted */
  if (b && desired.length) {
    all.forEach((a) => {
      if (a.status !== "active" || a.bookingId || a.kind !== "hold") return;
      if ((b.quoteId && a.quoteId === b.quoteId) || (b.inquiryId && a.inquiryId === b.inquiryId)) {
        a.status = "converted"; a.releasedAt = now; a.bookingId = b.id;
        touch(a.slug).dates.add(a.date);
      }
    });
  }
  invalidate();
  touched.forEach((t) => {
    const dates = [...t.dates].sort();
    const first = dates[0];
    const after = first ? dayStat(t.slug, first, (desired.find((d) => d.slug === t.slug) || current.find((c) => c.slug === t.slug) || {}).poolId).available : null;
    log({
      slug: t.slug, action: t.sold ? "confirm" : t.reserved ? "reserve" : t.released ? "release" : "convert",
      from: first, to: dates[dates.length - 1], prevQty: t.firstBefore, newQty: after,
      reserved: t.reserved, sold: t.sold, released: t.released,
      bookingRef: b?.bcn || "", source: note === "system" ? "system" : "booking",
      note: note && note !== "system" ? note : b?.status === "Cancelled" ? "Booking cancelled" : "",
    }, actor);
  });
  return touched.size;
}

/* write hooks: validate first, reconcile after */
D.hooks.before.push((coll, prev, next, actor) => {
  if (coll !== "bookings" || !next) return;
  if (next.status !== "Cancelled" && next.paymentStatus === "Unpaid" && !next.holdExpiresAt && (next.status === "Confirmed" || next.status === "Completed"))
    next.holdExpiresAt = Date.now() + (DB().settings.holdHoursStaff || 48) * 3600e3;
  if (next.status === "Cancelled") return;
  const changed = !prev || prev.arrival !== next.arrival || prev.departure !== next.departure || prev.status !== next.status ||
    prev.paymentStatus !== next.paymentStatus || prev.rooms !== next.rooms || JSON.stringify(prev.lines) !== JSON.stringify(next.lines);
  if (!changed) return;
  const needs = desiredFor(next);
  const conflicts = checkNeeds(needs, (a) => a.bookingId === next.id || (next.quoteId && a.quoteId === next.quoteId && !a.bookingId) || (next.inquiryId && a.inquiryId === next.inquiryId && !a.bookingId));
  if (conflicts.length) throw new InventoryError("Not enough inventory for " + (next.bcn || "this booking") + ":\n" + describeConflicts(conflicts) + "\n\nIncrease the inventory in Product Master if the supplier has confirmed extra allocation, or change the dates or quantity.", conflicts);
});
D.hooks.after.push((coll, prev, next, actor) => {
  if (coll !== "bookings") return;
  if (!next) {
    DB().allocations.forEach((a) => { if (a.bookingId === prev.id && a.status === "active") { a.status = "released"; a.releasedAt = Date.now(); } });
    invalidate();
    log({ slug: (prev.lines || [])[0]?.slug || "", action: "release", bookingRef: prev.bcn, source: "booking", note: "Booking deleted" }, actor);
    return;
  }
  reconcile(next, actor);
});

/* ------------------------- housekeeping --------------------------- */
function housekeeping() {
  const db = DB();
  if (!db.allocations) return;
  const now = Date.now();
  let migrated = false;
  if (!db.meta.inventoryV1) {
    db.meta.inventoryV1 = true;
    db.bookings.forEach((b) => reconcile(b, { name: "Inventory migration", role: "system" }, "system"));
    invalidate();
    migrated = true;
  }
  if (migrated) { try { localStorage.setItem("pbl-ops-v1", JSON.stringify(db)); } catch {} }
  if (now - lastHousekeeping < 15000 && idxVer === D.getVersion()) return;
  lastHousekeeping = now;
  let changed = false;
  const bookingIds = new Set(db.bookings.map((b) => b.id));
  db.allocations.forEach((a) => {
    if (a.status !== "active") return;
    if (a.bookingId && !bookingIds.has(a.bookingId)) { a.status = "released"; a.releasedAt = now; changed = true; log({ slug: a.slug, action: "release", from: a.date, to: a.date, released: a.qty, bookingRef: a.bcn, source: "system", note: "Booking no longer exists" }); }
    else if (a.kind === "hold" && a.expiresAt && a.expiresAt <= now) { a.status = "expired"; a.releasedAt = now; changed = true; log({ slug: a.slug, action: "expire", from: a.date, to: a.date, released: a.qty, bookingRef: a.bcn || a.quoteId || a.inquiryId || a.externalRef, source: "system", note: "Temporary reservation expired" }); }
  });
  if (changed) { invalidate(); try { localStorage.setItem("pbl-ops-v1", JSON.stringify(db)); } catch {} }
}

/* ---------------------- configuration changes --------------------- */
function ensureRecord(slug) {
  const db = DB();
  if (!db.inventory[slug]) {
    const p = productOf(slug);
    if (!p) throw new InventoryError("Unknown product " + slug);
    db.inventory[slug] = blankInventory(p);
  }
  return db.inventory[slug];
}
function assertInv(actor, action = "edit") {
  if (!D.can(actor, action, "inventory")) throw new D.PermissionError("Your role is not permitted to " + action + " inventory.");
}
function stamp(inv, actor) { inv.updatedAt = Date.now(); inv.updatedBy = actor?.name || "system"; }
function finish(actor, slug, entry, auditAfter) {
  invalidate();
  log({ slug, source: "manual", ...entry }, actor);
  D.audit(actor, "inventory-" + entry.action, "inventory", productOf(slug)?.productId || slug, null, auditAfter || entry);
  D.commit("inventory");
}
/* committed (sold + reserved) on a date — capacity may not go below it */
function committedOn(slug, date, poolId) { const s = dayStat(slug, date, poolId); return s.sold + s.reserved; }

export function saveConfig(slug, cfg, actor) {
  assertInv(actor);
  const inv = ensureRecord(slug);
  const prevCaps = inv.pools.map((p) => p.name + ": " + (p.capacity ?? "on request")).join(", ");
  const pools = (cfg.pools || inv.pools).map((p, i) => ({ id: p.id || "pool" + Date.now().toString(36) + i, name: p.name || "Option " + (i + 1), capacity: p.capacity === "" || p.capacity === null || p.capacity === undefined ? null : Math.max(0, Number(p.capacity)), maxPerBooking: p.maxPerBooking ? Number(p.maxPerBooking) : null, time: p.time || "", detail: p.detail || "" }));
  if (!pools.length) throw new InventoryError("A product needs at least one inventory option.");
  /* removing a pool that still holds bookings is refused */
  inv.pools.forEach((old) => {
    if (pools.some((p) => p.id === old.id)) return;
    const used = DB().allocations.some((a) => a.slug === slug && a.poolId === old.id && a.status === "active" && a.kind === "confirmed");
    if (used) throw new InventoryError(`“${old.name}” still has confirmed bookings — move or cancel them before removing it.`);
  });
  /* lowering default capacity below what is already sold on an upcoming date is refused */
  const t = D.today();
  pools.forEach((p) => {
    if (p.capacity === null) return;
    const upcoming = DB().allocations.filter((a) => a.slug === slug && a.poolId === p.id && a.status === "active" && a.date >= t);
    const dates = [...new Set(upcoming.map((a) => a.date))];
    inv.pools = inv.pools; // unchanged until validated
    for (const d of dates) {
      const ov = inv.overrides[d + "|" + p.id];
      const ruled = inv.rules.some((r) => d >= r.from && d <= (r.to || r.from) && (!r.poolId || r.poolId === "all" || r.poolId === p.id));
      if (ov !== undefined || ruled) continue;
      const c = committedOn(slug, d, p.id);
      if (c > p.capacity) throw new InventoryError(`${p.name}: ${c} already sold or reserved on ${D.fmtDate(d)} — capacity cannot be set to ${p.capacity}.`);
    }
  });
  Object.assign(inv, {
    kind: cfg.kind || inv.kind, unitLabel: cfg.unitLabel || inv.unitLabel, unitPlural: cfg.unitPlural || inv.unitPlural,
    pools, openDays: Array.isArray(cfg.openDays) && cfg.openDays.length < 7 ? cfg.openDays : null,
  });
  stamp(inv, actor);
  finish(actor, slug, { action: "capacity", prevQty: prevCaps, newQty: pools.map((p) => p.name + ": " + (p.capacity ?? "on request")).join(", "), note: "Inventory configuration saved" });
}

export function addRule(slug, rule, actor) {
  assertInv(actor);
  const inv = ensureRecord(slug);
  if (!rule.from) throw new InventoryError("Choose the first date of the period.");
  const to = rule.to && rule.to >= rule.from ? rule.to : rule.from;
  const qty = Math.max(0, Number(rule.qty) || 0);
  const pid = rule.poolId || "all";
  rangeDates(rule.from, D.addDays(to, 1)).forEach((d) => {
    const pools = pid === "all" ? inv.pools : [poolOf(inv, pid)];
    pools.forEach((p) => { const c = committedOn(slug, d, p.id); if (qty < c) throw new InventoryError(`${D.fmtDate(d)}${inv.pools.length > 1 ? " · " + p.name : ""}: ${c} already sold or reserved — the period cannot be set to ${qty}.`); });
  });
  const r = { id: uid("RUL"), from: rule.from, to, qty, poolId: pid, label: rule.label || "", dows: rule.dows && rule.dows.length && rule.dows.length < 7 ? rule.dows : null, createdAt: Date.now(), createdBy: actor?.name || "" };
  inv.rules.push(r);
  stamp(inv, actor);
  finish(actor, slug, { action: "rule", from: r.from, to: r.to, poolId: pid, newQty: qty, note: (r.label ? r.label + " · " : "") + "Period inventory set" });
}
export function removeRule(slug, ruleId, actor) {
  assertInv(actor, "delete");
  const inv = ensureRecord(slug);
  const r = inv.rules.find((x) => x.id === ruleId);
  inv.rules = inv.rules.filter((x) => x.id !== ruleId);
  const bad = r ? rangeDates(r.from, D.addDays(r.to, 1)).find((d) => inv.pools.some((p) => { const s = dayStat(slug, d, p.id); return s.total !== null && s.total < s.sold + s.reserved; })) : null;
  if (bad) { inv.rules.push(r); throw new InventoryError(`Removing this period would oversell ${D.fmtDate(bad)}.`); }
  stamp(inv, actor);
  finish(actor, slug, { action: "rule", from: r?.from, to: r?.to, prevQty: r?.qty, newQty: "removed", note: "Period inventory removed" });
}
export function setDates(slug, { from, to, poolId, mode = "set", qty }, actor) {
  assertInv(actor);
  const inv = ensureRecord(slug);
  const end = to && to >= from ? to : from;
  const pools = !poolId || poolId === "all" ? inv.pools : [poolOf(inv, poolId)];
  const changes = [];
  rangeDates(from, D.addDays(end, 1)).forEach((d) => pools.forEach((p) => {
    const cur = capacityAt(slug, d, p.id).cap;
    let next = mode === "clear" ? undefined : mode === "set" ? Number(qty) : (cur ?? 0) + (mode === "increase" ? 1 : -1) * Number(qty);
    if (next !== undefined) {
      next = Math.max(0, Math.round(next));
      const c = committedOn(slug, d, p.id);
      if (next < c) throw new InventoryError(`${D.fmtDate(d)}${inv.pools.length > 1 ? " · " + p.name : ""}: ${c} already sold or reserved — inventory cannot drop to ${next}.`);
    }
    changes.push({ d, p, cur, next });
  }));
  changes.forEach(({ d, p, next }) => { const k = d + "|" + p.id; if (next === undefined) delete inv.overrides[k]; else inv.overrides[k] = next; });
  stamp(inv, actor);
  finish(actor, slug, { action: mode === "clear" ? "override" : mode === "set" ? "override" : "adjust", from, to: end, poolId: poolId || "all", prevQty: changes[0]?.cur ?? "—", newQty: mode === "clear" ? "rule/default" : changes[0]?.next, note: (mode === "increase" ? "+" : mode === "decrease" ? "−" : "") + (mode === "set" ? "Set to " + qty : mode === "clear" ? "Date overrides cleared" : qty) + " for " + changes.length + " date(s)" });
}
export function addBlackout(slug, { from, to, reason }, actor) {
  assertInv(actor);
  const inv = ensureRecord(slug);
  const end = to && to >= from ? to : from;
  const sold = rangeDates(from, D.addDays(end, 1)).find((d) => inv.pools.some((p) => committedOn(slug, d, p.id) > 0));
  if (sold) throw new InventoryError(`${D.fmtDate(sold)} already has bookings — move or cancel them before blocking the date.`);
  inv.blackouts.push({ id: uid("BLK"), from, to: end, reason: reason || "" });
  stamp(inv, actor);
  finish(actor, slug, { action: "blackout", from, to: end, newQty: 0, note: reason || "Blackout" });
}
export function removeBlackout(slug, id, actor) {
  assertInv(actor, "delete");
  const inv = ensureRecord(slug);
  const b = inv.blackouts.find((x) => x.id === id);
  inv.blackouts = inv.blackouts.filter((x) => x.id !== id);
  stamp(inv, actor);
  finish(actor, slug, { action: "blackout", from: b?.from, to: b?.to, prevQty: 0, newQty: "reopened", note: "Blackout removed" });
}

/* ------------------------ temporary holds ------------------------- */
/* items: [{ slug, from, to, poolId, qty }] — all-or-nothing */
export function placeHolds(items, ref, actor, { minutes, channel = "staff" } = {}) {
  const needs = [];
  items.forEach((it) => {
    const p = productOf(it.slug);
    if (!p) return;
    const inv = invOf(it.slug);
    const poolId = inv ? poolOf(inv, it.poolId).id : it.poolId || "default";
    const dates = isNightly(p) ? rangeDates(it.from, it.to) : [it.from];
    dates.forEach((date) => needs.push({ slug: it.slug, date, poolId, qty: Math.max(1, Number(it.qty) || 1) }));
  });
  const conflicts = checkNeeds(needs, (a) => (ref.quoteId && a.quoteId === ref.quoteId && !a.bookingId) || (ref.inquiryId && a.inquiryId === ref.inquiryId && !a.bookingId));
  if (conflicts.length) throw new InventoryError("Cannot reserve:\n" + describeConflicts(conflicts), conflicts);
  const now = Date.now();
  const mins = minutes ?? (channel === "website" ? DB().settings.holdMinutesWeb || 1440 : (DB().settings.holdHoursQuote || 72) * 60);
  DB().allocations.forEach((a) => {
    if (a.status === "active" && a.kind === "hold" && !a.bookingId && ((ref.quoteId && a.quoteId === ref.quoteId) || (ref.inquiryId && a.inquiryId === ref.inquiryId))) { a.status = "released"; a.releasedAt = now; }
  });
  needs.forEach((n) => DB().allocations.push({
    id: uid("ALC"), ...n, productId: productOf(n.slug)?.productId || "", kind: "hold", status: "active",
    bookingId: "", bcn: "", quoteId: ref.quoteId || "", inquiryId: ref.inquiryId || "", lineKey: null,
    channel, source: channel === "website" ? "booking" : "manual", externalRef: ref.externalRef || "",
    expiresAt: now + mins * 60e3, createdAt: now, releasedAt: null,
  }));
  invalidate();
  const bySlug = new Map();
  needs.forEach((n) => bySlug.set(n.slug, [...(bySlug.get(n.slug) || []), n]));
  bySlug.forEach((ns, slug) => log({ slug, action: "reserve", from: ns[0].date, to: ns[ns.length - 1].date, reserved: ns.reduce((s, n) => s + n.qty, 0), bookingRef: ref.quoteId || ref.inquiryId || ref.externalRef || "", source: channel === "website" ? "booking" : "manual", note: "Temporary reservation until " + new Date(now + mins * 60e3).toLocaleString("en-GB") }, actor));
  D.commit("inventory-hold");
  return { count: needs.length, expiresAt: now + mins * 60e3 };
}
export function releaseHold(allocId, actor) {
  const a = DB().allocations.find((x) => x.id === allocId);
  if (!a || a.status !== "active") return;
  if (a.bookingId) throw new InventoryError("This reservation belongs to booking " + a.bcn + " — cancel or update the booking instead.");
  assertInv(actor);
  a.status = "released"; a.releasedAt = Date.now();
  finish(actor, a.slug, { action: "release", from: a.date, to: a.date, released: a.qty, bookingRef: a.quoteId || a.inquiryId || a.externalRef, note: "Reservation released manually" });
}
export function extendBookingHold(bookingId, hours, actor) {
  const b = DB().bookings.find((x) => x.id === bookingId);
  if (!b) return;
  const until = Date.now() + hours * 3600e3;
  DB().allocations.forEach((a) => { if (a.bookingId === bookingId && a.kind === "hold" && a.status === "active") a.expiresAt = until; });
  D.update("bookings", bookingId, { holdExpiresAt: until }, actor, { module: D.can(actor, "edit", "bookings") ? "bookings" : "calendar" });
}

/* ---------------------- supplier inventory ------------------------ */
export function supplierIdFor(user) {
  const sups = DB().suppliers;
  const first = (user?.name || "").toLowerCase().split(" ")[0];
  return (sups.find((s) => first && s.name.toLowerCase().includes(first)) || sups[0])?.id;
}
export function updateSupplier(slug, patch, actor) {
  const p = productOf(slug);
  const isSupplier = actor?.role === "supplier";
  if (isSupplier) {
    if (!D.can(actor, "edit", "supplier-portal") || p?.supplierId !== supplierIdFor(actor)) throw new D.PermissionError("Suppliers may only update inventory for their own products.");
  } else assertInv(actor);
  const inv = ensureRecord(slug);
  const before = { ...inv.supplier };
  const num = (v) => (v === "" || v === null || v === undefined ? null : Math.max(0, Number(v)));
  const allowed = isSupplier ? ["reported", "status", "ref"] : ["allocation", "contracted", "reported", "status", "ref"];
  allowed.forEach((k) => { if (patch[k] !== undefined) inv.supplier[k] = ["allocation", "contracted", "reported"].includes(k) ? num(patch[k]) : patch[k]; });
  inv.supplier.updatedAt = Date.now();
  inv.supplier.updatedBy = actor?.name || "";
  stamp(inv, actor);
  invalidate();
  log({ slug, action: "supplier", source: "supplier", prevQty: before.reported ?? before.contracted ?? "—", newQty: inv.supplier.reported ?? inv.supplier.contracted ?? "—", bookingRef: inv.supplier.ref || "", note: isSupplier ? "Supplier-reported availability updated" : "Supplier allocation updated" }, actor);
  D.audit(actor, "inventory-supplier", "inventory", p?.productId || slug, before, inv.supplier);
  D.commit("inventory-supplier");
}

/* --------------------- channels & API adapters -------------------- */
/* Each adapter declares what the platform can synchronise. Network calls
   run on the server; the browser records the intent and the result. */
export const ADAPTERS = {
  lodgify: { name: "Lodgify", match: /lodgify/i, caps: ["availability", "reservations", "rates", "cancellations"] },
  airbnb: { name: "Airbnb", match: /airbnb/i, caps: ["availability", "reservations", "cancellations"] },
  bookingcom: { name: "Booking.com", match: /booking\.com/i, caps: ["availability", "reservations", "rates", "cancellations"] },
  pms: { name: "Property Management System", match: /pms|property/i, caps: ["availability", "reservations", "rates"] },
  channel: { name: "Channel manager", match: /channel/i, caps: ["availability", "reservations", "rates", "cancellations"] },
  supplier: { name: "Supplier system", match: /supplier/i, caps: ["availability", "reservations"] },
};
export const adapterFor = (integration) => Object.entries(ADAPTERS).find(([, a]) => a.match.test(integration?.name || "") || a.match.test(integration?.kind || ""))?.[0] || "channel";
export const inventoryIntegrations = () => DB().integrations.filter((i) => /OTA|PMS|Channel|Supplier/i.test(i.kind || "") || ADAPTERS[adapterFor(i)].match.test(i.name));

export function setSource(slug, { source, externalId }, actor) {
  assertInv(actor);
  const inv = ensureRecord(slug);
  const prev = inv.source;
  inv.source = source || "internal";
  inv.externalId = externalId || "";
  stamp(inv, actor);
  finish(actor, slug, { action: "source", prevQty: prev, newQty: inv.source, note: "Inventory source of truth" + (inv.externalId ? " · listing " + inv.externalId : "") });
}

/* Booking arriving from a channel (webhook, import or manual entry).
   Deduplicated by channel + external reference; our own bookings echoed
   back by the channel are ignored so nothing is counted twice. */
export function ingestExternal({ integrationId, externalRef, slug, from, to, poolId, qty = 1, action = "book", guest = "" }, actor) {
  assertInv(actor);
  const integ = DB().integrations.find((i) => i.id === integrationId);
  const channel = integ?.name || integrationId || "external";
  if (!externalRef) throw new InventoryError("The channel booking reference is required.");
  if (DB().bookings.some((b) => b.bcn === externalRef || b.externalRef === externalRef && b.channel === channel)) {
    syncLog({ integrationId, channel, direction: "in", action, slug, ref: externalRef, status: "ignored", message: "Echo of a Prestige booking — not counted twice" });
    D.commit("sync");
    return { status: "ignored" };
  }
  const existing = DB().allocations.filter((a) => a.channel === channel && a.externalRef === externalRef && a.status === "active");
  const now = Date.now();
  if (action === "cancel") {
    existing.forEach((a) => { a.status = "released"; a.releasedAt = now; });
    invalidate();
    if (existing.length) log({ slug: existing[0].slug, action: "release", from: existing[0].date, to: existing[existing.length - 1].date, released: existing.reduce((s, a) => s + a.qty, 0), bookingRef: externalRef, source: "api", note: channel + " cancellation" }, actor);
    syncLog({ integrationId, channel, direction: "in", action, slug: existing[0]?.slug || slug, ref: externalRef, status: existing.length ? "ok" : "ignored", message: existing.length ? "Released " + existing.length + " date(s)" : "Nothing to cancel" });
    D.commit("sync");
    return { status: existing.length ? "ok" : "ignored" };
  }
  const p = productOf(slug);
  if (!p) throw new InventoryError("Choose the product this channel booking is for.");
  const inv = invOf(slug);
  const pid = inv ? poolOf(inv, poolId).id : poolId || "default";
  const dates = isNightly(p) ? rangeDates(from, to) : [from];
  const needs = dates.map((date) => ({ slug, date, poolId: pid, qty: Math.max(1, Number(qty) || 1) }));
  const conflicts = checkNeeds(needs, (a) => existing.includes(a));
  existing.forEach((a) => { a.status = "released"; a.releasedAt = now; });
  needs.forEach((n) => DB().allocations.push({ id: uid("ALC"), ...n, productId: p.productId, kind: "confirmed", status: "active", bookingId: "", bcn: "", quoteId: "", inquiryId: "", lineKey: null, channel, source: "api", externalRef, guest, conflict: conflicts.length > 0, expiresAt: null, createdAt: now, releasedAt: null }));
  invalidate();
  log({ slug, action: existing.length ? "amend" : "confirm", from: dates[0], to: dates[dates.length - 1], sold: needs.reduce((s, n) => s + n.qty, 0), released: existing.reduce((s, a) => s + a.qty, 0), bookingRef: externalRef, source: "api", note: channel + (guest ? " · " + guest : "") + (conflicts.length ? " · CONFLICT: oversold" : "") }, actor);
  syncLog({ integrationId, channel, direction: "in", action: existing.length ? "modify" : "book", slug, ref: externalRef, status: conflicts.length ? "conflict" : "ok", message: conflicts.length ? "Channel booking exceeds available inventory — " + describeConflicts(conflicts).split("\n")[0] : dates.length + " date(s) allocated" });
  D.commit("sync");
  return { status: conflicts.length ? "conflict" : "ok", conflicts };
}
/* availability payload a channel adapter would push */
export function availabilityPayload(integrationId, days = 90) {
  const integ = DB().integrations.find((i) => i.id === integrationId);
  const mapped = Object.values(DB().inventory).filter((inv) => isManaged(inv) && (inv.source === integrationId || inv.externalId));
  const from = D.today();
  const rows = [];
  mapped.forEach((inv) => inv.pools.forEach((pool) => rangeDates(from, D.addDays(from, days)).forEach((d) => {
    const s = dayStat(inv.slug, d, pool.id);
    rows.push({ listing: inv.externalId || inv.slug, roomType: pool.name, date: d, available: s.available, closed: s.status === "unavailable" });
  })));
  return { integration: integ?.name, adapter: adapterFor(integ), generatedAt: new Date().toISOString(), listings: mapped.length, rows };
}
export function queuePush(integrationId, actor) {
  assertInv(actor);
  const integ = DB().integrations.find((i) => i.id === integrationId);
  const payload = availabilityPayload(integrationId);
  const ok = integ?.status === "connected";
  syncLog({ integrationId, channel: integ?.name, direction: "out", action: "availability", slug: "", ref: "", status: ok ? (payload.listings ? "queued" : "ignored") : "error", message: ok ? (payload.listings ? `${payload.rows.length} date rows for ${payload.listings} listing(s) queued for the ${ADAPTERS[payload.adapter].name} adapter` : "No products are mapped to this channel yet") : "Integration is not connected" });
  D.commit("sync");
  return payload;
}

/* ------------------------- summaries ------------------------------ */
export function productSummary(slug, from, to) {
  const inv = invOf(slug);
  const p = productOf(slug);
  if (!inv || !isManaged(inv)) return { managed: false, status: "onrequest", type: typeFor(p?.categoryId).kind, period: null };
  const dates = rangeDates(from, D.addDays(to, 1));
  let total = 0, reserved = 0, sold = 0, minAvail = Infinity, worst = "available", any = false;
  const order = { available: 0, limited: 1, soldout: 2, unavailable: 2, onrequest: -1 };
  dates.forEach((d) => inv.pools.forEach((pool) => {
    const s = dayStat(slug, d, pool.id);
    if (s.total === null) return;
    any = true;
    total = Math.max(total, s.total); reserved = Math.max(reserved, s.reserved); sold = Math.max(sold, s.sold);
    minAvail = Math.min(minAvail, s.available);
    if (order[s.status] > order[worst]) worst = s.status;
  }));
  const ruleDates = inv.rules.flatMap((r) => [r.from, r.to]).filter(Boolean).sort();
  return {
    managed: true, type: inv.kind, unitPlural: inv.unitPlural, any,
    total: any ? total : null, reserved, sold, available: any ? minAvail : null,
    status: any ? (minAvail <= 0 && dates.every((d) => inv.pools.every((pool) => dayStat(slug, d, pool.id).available === 0)) ? "soldout" : worst) : "onrequest",
    period: ruleDates.length ? { from: ruleDates[0], to: ruleDates[ruleDates.length - 1] } : { from: null, to: null, open: true },
    updatedAt: inv.updatedAt, updatedBy: inv.updatedBy,
  };
}
export function discrepancies(days = 180) {
  const out = [];
  const from = D.today();
  Object.values(DB().inventory).forEach((inv) => {
    if (!isManaged(inv)) return;
    rangeDates(from, D.addDays(from, days)).forEach((d) => inv.pools.forEach((pool) => {
      const s = dayStat(inv.slug, d, pool.id);
      if (s.oversold) out.push({ id: inv.slug + d + pool.id, kind: "Oversold", slug: inv.slug, date: d, poolId: pool.id, detail: `${s.sold + s.reserved} committed against ${s.total}`, refs: s.allocs.map((a) => a.bcn || a.externalRef || a.quoteId).filter(Boolean).join(", ") });
    }));
    const sup = inv.supplier;
    if (sup?.reported !== null && sup?.reported !== undefined) {
      const next = dayStat(inv.slug, from, inv.pools[0].id);
      if (next.available !== null && sup.reported < next.available) out.push({ id: inv.slug + "sup", kind: "Supplier mismatch", slug: inv.slug, date: from, poolId: inv.pools[0].id, detail: `Supplier reports ${sup.reported}, system shows ${next.available} available`, refs: sup.ref });
    }
  });
  DB().inventorySync.filter((x) => x.status === "conflict" || x.status === "error").slice(0, 50).forEach((x) => out.push({ id: x.id, kind: x.status === "conflict" ? "Channel conflict" : "Sync error", slug: x.slug, date: D.ymd(new Date(x.at)), poolId: "", detail: (x.channel || "") + " · " + x.message, refs: x.ref }));
  return out;
}

/* ------------------- customer website decoration ------------------ */
D.siteDecorators.push((view, master) => {
  const inv = invOf(master.slug);
  const out = { ...view, stock: undefined, availLabel: undefined, availStatus: "onrequest" };
  if (!inv || !isManaged(inv)) return out;
  const t = D.today();
  const days = rangeDates(t, D.addDays(t, 90)).map((d) => inv.pools.map((pool) => dayStat(master.slug, d, pool.id)));
  const flat = days.flat().filter((s) => s.total !== null);
  if (!flat.length) return out;
  const allGone = days.every((ps) => ps.every((s) => s.available === 0 || s.total === 0));
  const tight = flat.some((s) => s.status === "soldout" || s.status === "limited");
  out.availStatus = allGone ? "soldout" : tight ? "limited" : "available";
  out.availLabel = allGone ? "Sold out" : tight ? "Limited availability" : undefined;
  return out;
});

/* Release every temporary reservation attached to an inquiry or
   quotation (used when a vacation request is rejected or withdrawn).
   The caller is responsible for the permission check. */
export function releaseRef({ inquiryId, quoteId }, actor, note = "Request closed") {
  const now = Date.now();
  const hit = DB().allocations.filter((a) => a.status === "active" && a.kind === "hold" && !a.bookingId && ((inquiryId && a.inquiryId === inquiryId) || (quoteId && a.quoteId === quoteId)));
  hit.forEach((a) => { a.status = "released"; a.releasedAt = now; });
  invalidate();
  const bySlug = new Map();
  hit.forEach((a) => bySlug.set(a.slug, [...(bySlug.get(a.slug) || []), a]));
  bySlug.forEach((as, slug) => log({ slug, action: "release", from: as[0].date, to: as[as.length - 1].date, released: as.reduce((s, a) => s + a.qty, 0), bookingRef: quoteId || inquiryId, source: "booking", note }, actor));
  if (hit.length) D.commit("inventory-release");
  return hit.length;
}
