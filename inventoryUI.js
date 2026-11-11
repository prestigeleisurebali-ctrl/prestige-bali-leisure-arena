/* ==================================================================
   INVENTORY & AVAILABILITY — SCREENS
   · InventoryManager   per-product calendar, configuration, supplier,
                        channels and history (opened from Product Master)
   · InventoryOverview  backend module: every product's inventory,
                        reservations, discrepancies, settings, history
   · AvailabilityBadge  used by the Vacation Builder / day planner
   · BookingInventory   allocations inside a booking record
   · QuoteInventory     availability check + reserve on a quotation
   · SiteAvailability   live availability on customer product pages
   · BuilderAvailability check before a customer sends a request
   ================================================================== */
import * as React from "react";
import * as jsxrt from "react/jsx-runtime";
import * as D from "./db.js";
import * as I from "./inventory.js";
import * as U from "./ui.js";
import { BookingDrawer } from "./modules1.js";
import { bridge } from "./bridge.js";

const g = jsxrt;
const { useState, useMemo } = React;
const inp = "border border-ivory/20 bg-ink/40 px-2.5 py-1.5 text-[12px] text-ivory [color-scheme:dark]";
const TONE = { available: "green", limited: "amber", soldout: "red", unavailable: "neutral", onrequest: "neutral", insufficient: "amber", overmax: "amber" };
const CELL = {
  available: "border-emerald-400/40 bg-emerald-500/10",
  limited: "border-amber-400/50 bg-amber-500/10",
  soldout: "border-rose-400/50 bg-rose-500/15",
  unavailable: "border-ivory/10 bg-ivory/[0.03] opacity-60",
  onrequest: "border-line bg-ink/20",
};
const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmtN = (v) => (v === null || v === undefined ? "—" : String(v));

/* ========================= INVENTORY MANAGER ====================== */
export function InventoryManager({ slug, user, onClose, inline = false }) {
  const data = U.useDB();
  const p = D.productOf(slug);
  const inv = I.getInventory(slug);
  const [tab, setTab] = useState(I.isManaged(I.invOf(slug)) ? "calendar" : "configure");
  const canEdit = D.can(user, "edit", "inventory");
  if (!p || !inv) return null;
  const TABS = [
    { id: "calendar", label: "Calendar" }, { id: "configure", label: "Configure" },
    { id: "supplier", label: "Supplier" }, { id: "channels", label: "Channels" }, { id: "history", label: "History" },
  ];
  const body = g.jsxs("div", { className: "space-y-4", children: [
      g.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [
          g.jsx(U.Tabs, { tabs: TABS, active: tab, onChange: setTab }),
          g.jsxs("p", { className: "text-[11px] text-ivory/50", children: [p.productId, " · ", data.categories.find((c) => c.id === p.categoryId)?.name, " · ", p.supplier, " · ", inv.kind === "unit" ? "Unit inventory (" + inv.unitPlural + ")" : "Capacity inventory (" + inv.unitPlural + ")", I.isNightly(p) ? " · by night" : " · by date"] }),
        ] }),
      !I.isManaged(I.invOf(slug)) && tab !== "configure" && g.jsx("p", { className: "border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200", children: "No inventory is set for this product, so it is sold “On request” and the supplier confirms each booking. Set a capacity in Configure to manage availability." }),
      tab === "calendar" && g.jsx(InvCalendar, { slug, user, canEdit }),
      tab === "configure" && g.jsx(InvConfigure, { slug, user, canEdit }),
      tab === "supplier" && g.jsx(InvSupplier, { slug, user, canEdit }),
      tab === "channels" && g.jsx(InvChannels, { slug, user, canEdit }),
      tab === "history" && g.jsx(InvHistory, { slug }),
    ] });
  if (inline) return body;
  return g.jsx(U.Modal, { open: true, onClose, wide: true, title: "Inventory · " + p.name, footer: [g.jsx(U.Btn, { size: "sm", onClick: onClose, children: "Close" })], children: body });
}

function InvCalendar({ slug, user, canEdit }) {
  const data = U.useDB();
  const inv = I.getInventory(slug);
  const [month, setMonth] = useState(D.today().slice(0, 7));
  const [poolId, setPoolId] = useState(inv.pools[0].id);
  const [sel, setSel] = useState(null);
  const [openB, setOpenB] = useState(null);
  const first = new Date(month + "-01T00:00:00");
  const lead = (first.getDay() + 6) % 7;
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const dates = Array.from({ length: daysIn }, (_, i) => month + "-" + String(i + 1).padStart(2, "0"));
  const stats = useMemo(() => dates.map((d) => I.dayStat(slug, d, poolId)), [data, month, poolId, slug]);
  const shift = (n) => { const d = new Date(first); d.setMonth(d.getMonth() + n); setMonth(D.ym(d)); };
  const S = sel ? I.dayStat(slug, sel, poolId) : null;
  const [qty, setQty] = useState("");

  return g.jsxs("div", { className: "grid gap-5 lg:grid-cols-[1fr_300px]", children: [
      g.jsxs("div", { children: [
          g.jsxs("div", { className: "mb-3 flex flex-wrap items-center gap-2", children: [
              g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => shift(-1), children: "←" }),
              g.jsx("input", { type: "month", value: month, onChange: (e) => e.target.value && setMonth(e.target.value), className: inp }),
              g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => shift(1), children: "→" }),
              inv.pools.length > 1 && g.jsx("select", { value: poolId, onChange: (e) => setPoolId(e.target.value), className: inp, children: inv.pools.map((x) => g.jsx("option", { value: x.id, children: x.name + (x.time ? " · " + x.time : "") }, x.id)) }),
              g.jsx("span", { className: "ml-auto flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-ivory/50", children: ["available", "limited", "soldout", "unavailable", "onrequest"].map((k) => g.jsxs("span", { className: "flex items-center gap-1", children: [g.jsx("span", { className: U.cx("h-2.5 w-2.5 border", CELL[k]) }), I.STATUS_LABEL[k]] }, k)) }),
            ] }),
          g.jsxs("div", { className: "grid grid-cols-7 gap-1.5", children: [
              ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => g.jsx("div", { className: "pb-1 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-ivory/40", children: d }, d)),
              Array.from({ length: lead }, (_, i) => g.jsx("div", {}, "x" + i)),
              stats.map((s) => g.jsxs("button", {
                onClick: () => { setSel(s.date); setQty(s.total ?? ""); },
                className: U.cx("min-h-[64px] border p-1.5 text-left transition-colors hover:border-gold", CELL[s.status], sel === s.date && "ring-1 ring-gold", s.date === D.today() && "outline outline-1 outline-gold/50"),
                children: [
                  g.jsxs("p", { className: "flex justify-between text-[10px] text-ivory/55", children: [g.jsx("span", { children: Number(s.date.slice(-2)) }), s.oversold > 0 && g.jsx("span", { className: "font-bold text-rose-300", children: "!" })] }),
                  s.total === null ? g.jsx("p", { className: "mt-1 text-[10px] text-ivory/40", children: "req." })
                    : g.jsxs("p", { className: "mt-1 font-display text-[15px] leading-none text-ivory", children: [s.available, g.jsxs("span", { className: "text-[10px] text-ivory/45", children: ["/", s.total] })] }),
                  (s.sold > 0 || s.reserved > 0) && g.jsxs("p", { className: "mt-1 text-[9px] text-ivory/50", children: [s.sold ? s.sold + " sold" : "", s.sold && s.reserved ? " · " : "", s.reserved ? s.reserved + " held" : ""] }),
                ],
              }, s.date)),
            ] }),
        ] }),
      g.jsx("div", { className: "border border-line bg-ink/20 p-4", children: !S ? g.jsx("p", { className: "text-[12px] text-ivory/50", children: "Select a date to see its inventory, reservations and bookings." }) : g.jsxs("div", { className: "space-y-3 text-[12px]", children: [
          g.jsx("p", { className: "font-display text-lg text-ivory", children: D.fmtDate(S.date) }),
          g.jsx(U.Badge, { tone: TONE[S.status], children: I.STATUS_LABEL[S.status] }),
          g.jsx("div", { className: "grid grid-cols-2 gap-2", children: [["Total", S.total], ["Reserved", S.reserved], ["Confirmed / sold", S.sold], ["Available", S.available]].map(([k, v]) => g.jsxs("div", { className: "border border-line px-2.5 py-2", children: [g.jsx("p", { className: "text-[9px] uppercase tracking-[0.14em] text-ivory/45", children: k }), g.jsx("p", { className: "font-display text-lg text-ivory", children: fmtN(v) })] }, k)) }),
          g.jsxs("p", { className: "text-[11px] text-ivory/45", children: ["Source: ", S.reason, S.oversold ? g.jsxs("span", { className: "block text-rose-300", children: ["Oversold by ", S.oversold, " — investigate"] }) : null] }),
          canEdit && g.jsxs("div", { className: "flex flex-wrap items-end gap-2 border-t border-line pt-3", children: [
              g.jsxs("label", { className: "text-[10px] uppercase tracking-[0.12em] text-ivory/50", children: ["Inventory this date", g.jsx("input", { type: "number", min: 0, value: qty, onChange: (e) => setQty(e.target.value), className: U.cx(inp, "mt-1 block w-24") })] }),
              g.jsx(U.Btn, { size: "sm", variant: "dark", onClick: () => I.setDates(slug, { from: S.date, poolId, mode: "set", qty: Number(qty) || 0 }, user), children: "Set" }),
              g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => I.setDates(slug, { from: S.date, poolId, mode: "clear" }, user), children: "Use rule" }),
              S.status !== "unavailable" ? g.jsx(U.Btn, { size: "sm", variant: "danger", onClick: () => I.addBlackout(slug, { from: S.date, reason: prompt("Reason for closing this date?") || "" }, user), children: "Block" })
                : g.jsx(U.Btn, { size: "sm", onClick: () => { const b = I.getInventory(slug).blackouts.find((x) => S.date >= x.from && S.date <= x.to); if (b) I.removeBlackout(slug, b.id, user); }, children: "Reopen" }),
            ] }),
          g.jsxs("div", { className: "border-t border-line pt-3", children: [
              g.jsx("p", { className: "eyebrow mb-2", children: "Reservations & bookings" }),
              S.allocs.length ? S.allocs.map((a) => g.jsxs("button", {
                onClick: () => a.bookingId && setOpenB(D.collection("bookings").find((b) => b.id === a.bookingId)),
                className: "mb-1.5 block w-full border border-line px-2.5 py-2 text-left hover:border-gold/50",
                children: [
                  g.jsxs("span", { className: "flex justify-between", children: [g.jsx("span", { className: "font-medium text-gold-soft", children: a.bcn || a.externalRef || a.quoteId || a.inquiryId || "Reservation" }), g.jsx(U.Badge, { tone: a.kind === "confirmed" ? "green" : "amber", children: a.kind === "confirmed" ? "sold" : "held" })] }),
                  g.jsxs("span", { className: "block text-[11px] text-ivory/55", children: [a.qty, " ", a.qty === 1 ? inv.unitLabel : inv.unitPlural, " · ", a.channel, a.expiresAt ? " · expires " + D.fmtDateTime(a.expiresAt) : "", a.conflict ? " · conflict" : ""] }),
                  a.bookingId && g.jsx("span", { className: "block text-[11px] text-ivory/45", children: D.collection("bookings").find((b) => b.id === a.bookingId)?.customerName }),
                ],
              }, a.id)) : g.jsx("p", { className: "text-ivory/45", children: "None on this date." }),
            ] }),
        ] }) }),
      openB && g.jsx(BookingDrawer, { booking: openB, user, onClose: () => setOpenB(null) }),
    ] });
}

function InvConfigure({ slug, user, canEdit }) {
  const data = U.useDB();
  const p = D.productOf(slug);
  const inv = I.getInventory(slug);
  const t = I.typeFor(p.categoryId);
  const [cfg, setCfg] = useState(() => JSON.parse(JSON.stringify({ kind: inv.kind, unitLabel: inv.unitLabel, unitPlural: inv.unitPlural, pools: inv.pools, openDays: inv.openDays || [0, 1, 2, 3, 4, 5, 6] })));
  const [rule, setRule] = useState({ from: D.today(), to: D.addDays(D.today(), 30), qty: 1, poolId: "all", label: "", dows: [] });
  const [bulk, setBulk] = useState({ from: D.today(), to: D.addDays(D.today(), 6), poolId: "all", mode: "increase", qty: 1 });
  const [blk, setBlk] = useState({ from: D.today(), to: D.today(), reason: "" });
  const setPool = (i, patch) => setCfg({ ...cfg, pools: cfg.pools.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const detailLabel = p.categoryId === "accommodation" ? "Room details / bedrooms" : p.categoryId === "transportation" ? "Vehicle type & passenger capacity" : p.categoryId === "yacht" ? "Vessel & guest capacity" : "Notes";
  const ro = !canEdit;

  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsx(U.Panel, { title: "Inventory type", subtitle: I.isNightly(p) ? "Consumed per night between check-in and check-out" : "Consumed on the service date", children: g.jsxs("div", { className: "grid gap-4 md:grid-cols-3", children: [
          g.jsx(U.Field, { label: "Type", type: "select", disabled: ro, value: cfg.kind, onChange: (v) => setCfg({ ...cfg, kind: v }), options: [{ value: "unit", label: "Fixed units (rooms, villas, vehicles, vessels)" }, { value: "capacity", label: "Capacity (seats, places, participants)" }] }),
          g.jsx(U.Field, { label: "Unit (singular)", disabled: ro, value: cfg.unitLabel, onChange: (v) => setCfg({ ...cfg, unitLabel: v }) }),
          g.jsx(U.Field, { label: "Unit (plural)", disabled: ro, value: cfg.unitPlural, onChange: (v) => setCfg({ ...cfg, unitPlural: v }) }),
        ] }) }),
      g.jsx(U.Panel, { title: t.poolLabel + "s & default inventory", subtitle: "Leave capacity empty to sell on request", children: g.jsxs("div", { className: "space-y-2", children: [
          cfg.pools.map((x, i) => g.jsxs("div", { className: "grid gap-2 border border-line p-3 md:grid-cols-[1.4fr_0.8fr_0.8fr_0.7fr_1.4fr_auto]", children: [
              g.jsx(U.Field, { label: t.poolLabel, disabled: ro, value: x.name, onChange: (v) => setPool(i, { name: v }) }),
              g.jsx(U.Field, { label: "Default " + cfg.unitPlural, type: "number", disabled: ro, value: x.capacity ?? "", onChange: (v) => setPool(i, { capacity: v === "" ? null : v }) }),
              g.jsx(U.Field, { label: "Max per booking", type: "number", disabled: ro, value: x.maxPerBooking ?? "", onChange: (v) => setPool(i, { maxPerBooking: v === "" ? null : v }) }),
              g.jsx(U.Field, { label: "Time", type: "time", disabled: ro, value: x.time || "", onChange: (v) => setPool(i, { time: v }) }),
              g.jsx(U.Field, { label: detailLabel, disabled: ro, value: x.detail || "", onChange: (v) => setPool(i, { detail: v }) }),
              !ro && cfg.pools.length > 1 && g.jsx("button", { onClick: () => setCfg({ ...cfg, pools: cfg.pools.filter((_, k) => k !== i) }), className: "self-end pb-2 text-[11px] uppercase text-rose-300 hover:underline", children: "Remove" }),
            ] }, x.id || i)),
          !ro && g.jsx(U.Btn, { size: "sm", onClick: () => setCfg({ ...cfg, pools: [...cfg.pools, { id: "", name: "", capacity: null, maxPerBooking: null, time: "", detail: "" }] }), children: "+ Add " + t.poolLabel.toLowerCase() }),
          g.jsxs("div", { className: "pt-2", children: [
              g.jsx("p", { className: "mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/55", children: "Recurring availability — open on" }),
              g.jsx("div", { className: "flex flex-wrap gap-3", children: DOWS.map((d, k) => g.jsx(U.Field, { label: d, type: "checkbox", disabled: ro, value: cfg.openDays.includes(k), onChange: (on) => setCfg({ ...cfg, openDays: on ? [...cfg.openDays, k] : cfg.openDays.filter((x) => x !== k) }) }, d)) }),
            ] }),
          !ro && g.jsx("div", { className: "pt-2", children: g.jsx(U.Btn, { variant: "dark", onClick: () => I.saveConfig(slug, cfg, user), children: "Save inventory configuration" }) }),
        ] }) }),

      g.jsx(U.Panel, { title: "Seasonal & period inventory", subtitle: "Later periods take precedence where they overlap · date overrides beat periods", children: g.jsxs("div", { className: "space-y-3", children: [
          !ro && g.jsxs("div", { className: "grid gap-2 md:grid-cols-[1fr_1fr_0.7fr_1fr_1.2fr_auto]", children: [
              g.jsx(U.Field, { label: "From", type: "date", value: rule.from, onChange: (v) => setRule({ ...rule, from: v }) }),
              g.jsx(U.Field, { label: "To", type: "date", value: rule.to, onChange: (v) => setRule({ ...rule, to: v }) }),
              g.jsx(U.Field, { label: "Quantity", type: "number", value: rule.qty, onChange: (v) => setRule({ ...rule, qty: v }) }),
              g.jsx(U.Field, { label: t.poolLabel, type: "select", value: rule.poolId, onChange: (v) => setRule({ ...rule, poolId: v }), options: [{ value: "all", label: "All" }, ...inv.pools.map((x) => ({ value: x.id, label: x.name }))] }),
              g.jsx(U.Field, { label: "Season label", value: rule.label, placeholder: "e.g. Peak season", onChange: (v) => setRule({ ...rule, label: v }) }),
              g.jsx("div", { className: "self-end", children: g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => I.addRule(slug, rule, user), children: "Add period" }) }),
            ] }),
          !ro && g.jsxs("div", { className: "flex flex-wrap items-center gap-3 text-[11px] text-ivory/55", children: ["Only on:", DOWS.map((d, k) => g.jsx(U.Field, { label: d, type: "checkbox", value: rule.dows.includes(k), onChange: (on) => setRule({ ...rule, dows: on ? [...rule.dows, k] : rule.dows.filter((x) => x !== k) }) }, d)), g.jsx("span", { children: "(leave empty for every day)" })] }),
          g.jsx(U.DataTable, { searchable: false, pageSize: 8, rows: inv.rules.slice().reverse(), empty: "No periods — the default inventory applies.", columns: [
              { key: "from", label: "Period", render: (r) => D.fmtDate(r.from) + " – " + D.fmtDate(r.to) },
              { key: "label", label: "Season", render: (r) => r.label || "—" },
              { key: "poolId", label: t.poolLabel, render: (r) => (r.poolId === "all" ? "All" : inv.pools.find((x) => x.id === r.poolId)?.name || r.poolId) },
              { key: "dows", label: "Days", render: (r) => (r.dows ? r.dows.map((k) => DOWS[k]).join(" ") : "Every day") },
              { key: "qty", label: "Quantity" },
              { key: "x", label: "", sortable: false, render: (r) => canEdit ? g.jsx("button", { onClick: () => I.removeRule(slug, r.id, user), className: "text-[11px] uppercase text-rose-300 hover:underline", children: "Remove" }) : null },
            ] }),
        ] }) }),

      g.jsxs("div", { className: "grid gap-5 lg:grid-cols-2", children: [
          g.jsx(U.Panel, { title: "Adjust a date range", subtitle: "Increase, decrease or set specific dates", children: ro ? g.jsx("p", { className: "text-[12px] text-ivory/45", children: "View only." }) : g.jsxs("div", { className: "space-y-3", children: [
              g.jsxs("div", { className: "grid gap-2 sm:grid-cols-2", children: [
                  g.jsx(U.Field, { label: "From", type: "date", value: bulk.from, onChange: (v) => setBulk({ ...bulk, from: v }) }),
                  g.jsx(U.Field, { label: "To", type: "date", value: bulk.to, onChange: (v) => setBulk({ ...bulk, to: v }) }),
                  g.jsx(U.Field, { label: "Action", type: "select", value: bulk.mode, onChange: (v) => setBulk({ ...bulk, mode: v }), options: [{ value: "increase", label: "Increase by" }, { value: "decrease", label: "Decrease by" }, { value: "set", label: "Set to" }, { value: "clear", label: "Clear date overrides" }] }),
                  g.jsx(U.Field, { label: "Quantity", type: "number", value: bulk.qty, onChange: (v) => setBulk({ ...bulk, qty: v }) }),
                  inv.pools.length > 1 && g.jsx(U.Field, { label: t.poolLabel, type: "select", value: bulk.poolId, onChange: (v) => setBulk({ ...bulk, poolId: v }), options: [{ value: "all", label: "All" }, ...inv.pools.map((x) => ({ value: x.id, label: x.name }))] }),
                ] }),
              g.jsx(U.Btn, { size: "sm", variant: "dark", onClick: () => I.setDates(slug, bulk, user), children: "Apply" }),
            ] }) }),
          g.jsx(U.Panel, { title: "Blackout dates", children: g.jsxs("div", { className: "space-y-3", children: [
              !ro && g.jsxs("div", { className: "grid gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto]", children: [
                  g.jsx(U.Field, { label: "From", type: "date", value: blk.from, onChange: (v) => setBlk({ ...blk, from: v }) }),
                  g.jsx(U.Field, { label: "To", type: "date", value: blk.to, onChange: (v) => setBlk({ ...blk, to: v }) }),
                  g.jsx(U.Field, { label: "Reason", value: blk.reason, onChange: (v) => setBlk({ ...blk, reason: v }) }),
                  g.jsx("div", { className: "self-end", children: g.jsx(U.Btn, { size: "sm", variant: "danger", onClick: () => I.addBlackout(slug, blk, user), children: "Block" }) }),
                ] }),
              inv.blackouts.length ? inv.blackouts.map((b) => g.jsxs("p", { className: "flex items-center justify-between border border-line px-3 py-2 text-[12px]", children: [g.jsxs("span", { children: [D.fmtDate(b.from), " – ", D.fmtDate(b.to), b.reason ? g.jsxs("span", { className: "text-ivory/45", children: [" · ", b.reason] }) : null] }), canEdit && g.jsx("button", { onClick: () => I.removeBlackout(slug, b.id, user), className: "text-[11px] uppercase text-gold-soft hover:underline", children: "Reopen" })] }, b.id)) : g.jsx("p", { className: "text-[12px] text-ivory/45", children: "No blackout dates." }),
            ] }) }),
        ] }),
    ] });
}

function InvSupplier({ slug, user, canEdit }) {
  const data = U.useDB();
  const inv = I.getInventory(slug);
  const p = D.productOf(slug);
  const sup = data.suppliers.find((s) => s.id === p.supplierId);
  const [f, setF] = useState({ ...inv.supplier });
  const next = I.dayStat(slug, D.today(), inv.pools[0].id);
  const mismatch = f.reported !== null && f.reported !== "" && next.available !== null && Number(f.reported) < next.available;
  return g.jsxs("div", { className: "space-y-4", children: [
      g.jsxs("div", { className: "grid gap-3 sm:grid-cols-3", children: [
          box("Supplier", sup?.name || p.supplier || "—"), box("Supplier confirmation", inv.supplier.status || "—"),
          box("Last supplier update", inv.supplier.updatedAt ? D.fmtDateTime(inv.supplier.updatedAt) + " · " + inv.supplier.updatedBy : "Never"),
        ] }),
      g.jsx(U.RecordForm, { value: f, onChange: setF, cols: 3, fields: [
          { key: "contracted", label: "Contracted inventory", type: "number", disabled: !canEdit, hint: "Units in the supplier contract" },
          { key: "allocation", label: "Supplier allocation", type: "number", disabled: !canEdit, hint: "Allotment released to Prestige" },
          { key: "reported", label: "Supplier-reported availability", type: "number", disabled: !canEdit },
          { key: "status", label: "Confirmation status", type: "select", disabled: !canEdit, options: ["Not requested", "Requested", "Confirmed", "Partially confirmed", "Declined"] },
          { key: "ref", label: "Supplier booking / allotment reference", disabled: !canEdit },
        ] }),
      mismatch && g.jsxs("p", { className: "border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200", children: ["Supplier reports ", f.reported, " available but the system shows ", next.available, " for today. Reduce inventory or confirm with the supplier."] }),
      canEdit && g.jsxs("div", { className: "flex flex-wrap gap-2", children: [
          g.jsx(U.Btn, { variant: "dark", onClick: () => I.updateSupplier(slug, f, user), children: "Save supplier inventory" }),
          (f.allocation || f.contracted) && g.jsx(U.Btn, { onClick: () => { const cfg = { ...inv, pools: inv.pools.map((x, i) => (i === 0 ? { ...x, capacity: Number(f.allocation || f.contracted) } : x)) }; I.saveConfig(slug, cfg, user); }, children: "Use allocation as default inventory" }),
        ] }),
      g.jsx("p", { className: "text-[11px] text-ivory/45", children: "Suppliers can report availability from their own portal. Supplier costs and contract terms are never shown to customers." }),
    ] });
}

function InvChannels({ slug, user, canEdit }) {
  const data = U.useDB();
  const inv = I.getInventory(slug);
  const integs = I.inventoryIntegrations();
  const [src, setSrc] = useState({ source: inv.source, externalId: inv.externalId });
  const [ext, setExt] = useState({ integrationId: integs[0]?.id || "", externalRef: "", from: D.today(), to: D.addDays(D.today(), 3), poolId: inv.pools[0].id, qty: 1, guest: "" });
  const chan = data.allocations.filter((a) => a.slug === slug && a.source === "api");
  const grouped = Object.values(chan.reduce((m, a) => { const k = a.channel + "|" + a.externalRef; (m[k] = m[k] || { ...a, dates: [], id: k }).dates.push(a.date); return m; }, {}));
  const p = D.productOf(slug);
  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsx(U.Panel, { title: "Source of inventory", subtitle: "Identifies which system owns this product's inventory so channel bookings are never counted twice", children: g.jsxs("div", { className: "grid gap-3 md:grid-cols-[1fr_1fr_auto]", children: [
          g.jsx(U.Field, { label: "Source of truth", type: "select", disabled: !canEdit, value: src.source, onChange: (v) => setSrc({ ...src, source: v }), options: [{ value: "internal", label: "Prestige Product Master (internal)" }, ...integs.map((i) => ({ value: i.id, label: i.name + " (" + I.ADAPTERS[I.adapterFor(i)].name + " adapter)" }))] }),
          g.jsx(U.Field, { label: "External listing / room ID", disabled: !canEdit, value: src.externalId, onChange: (v) => setSrc({ ...src, externalId: v }) }),
          canEdit && g.jsx("div", { className: "self-end", children: g.jsx(U.Btn, { size: "sm", variant: "dark", onClick: () => I.setSource(slug, src, user), children: "Save" }) }),
        ] }) }),
      g.jsx(U.Panel, { title: "Record a channel booking", subtitle: "For reservations received from an OTA, PMS or supplier — the same function the API webhooks call", children: canEdit ? g.jsxs("div", { className: "space-y-3", children: [
          g.jsxs("div", { className: "grid gap-2 md:grid-cols-4", children: [
              g.jsx(U.Field, { label: "Channel", type: "select", value: ext.integrationId, onChange: (v) => setExt({ ...ext, integrationId: v }), options: integs.map((i) => ({ value: i.id, label: i.name })) }),
              g.jsx(U.Field, { label: "Channel reference", value: ext.externalRef, placeholder: "e.g. HMX4K2", onChange: (v) => setExt({ ...ext, externalRef: v }) }),
              g.jsx(U.Field, { label: I.isNightly(p) ? "Check-in" : "Date", type: "date", value: ext.from, onChange: (v) => setExt({ ...ext, from: v }) }),
              I.isNightly(p) && g.jsx(U.Field, { label: "Check-out", type: "date", value: ext.to, onChange: (v) => setExt({ ...ext, to: v }) }),
              inv.pools.length > 1 && g.jsx(U.Field, { label: "Option", type: "select", value: ext.poolId, onChange: (v) => setExt({ ...ext, poolId: v }), options: inv.pools.map((x) => ({ value: x.id, label: x.name })) }),
              g.jsx(U.Field, { label: "Quantity", type: "number", value: ext.qty, onChange: (v) => setExt({ ...ext, qty: v }) }),
              g.jsx(U.Field, { label: "Guest", value: ext.guest, onChange: (v) => setExt({ ...ext, guest: v }) }),
            ] }),
          g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => { const r = I.ingestExternal({ ...ext, slug }, user); alert(r.status === "conflict" ? "Recorded, but it oversells:\n" + I.describeConflicts(r.conflicts) : r.status === "ignored" ? "Ignored — this reference is a Prestige booking echoed back by the channel." : "Channel booking recorded and inventory allocated."); }, children: "Record channel booking" }),
        ] }) : g.jsx("p", { className: "text-[12px] text-ivory/45", children: "View only." }) }),
      g.jsx(U.Panel, { title: "Channel bookings", pad: false, children: g.jsx(U.DataTable, { searchable: false, pageSize: 8, rows: grouped, empty: "No channel bookings for this product.", columns: [
          { key: "channel", label: "Channel" }, { key: "externalRef", label: "Reference" }, { key: "guest", label: "Guest", render: (a) => a.guest || "—" },
          { key: "dates", label: "Dates", render: (a) => D.fmtDate(a.dates.sort()[0]) + (a.dates.length > 1 ? " → " + a.dates.length + " nights" : "") },
          { key: "qty", label: "Qty" },
          { key: "status", label: "Status", render: (a) => g.jsx(U.Badge, { tone: a.status === "active" ? (a.conflict ? "red" : "green") : "neutral", children: a.status === "active" ? (a.conflict ? "conflict" : "allocated") : a.status }) },
          { key: "x", label: "", sortable: false, render: (a) => canEdit && a.status === "active" ? g.jsx("button", { onClick: () => I.ingestExternal({ integrationId: data.integrations.find((i) => i.name === a.channel)?.id, externalRef: a.externalRef, action: "cancel", slug }, user), className: "text-[11px] uppercase text-rose-300 hover:underline", children: "Cancel" }) : null },
        ] }) }),
    ] });
}

function InvHistory({ slug }) {
  const data = U.useDB();
  const rows = slug ? data.inventoryLog.filter((l) => l.slug === slug) : data.inventoryLog;
  return g.jsx(HistoryTable, { rows, showProduct: !slug });
}
function HistoryTable({ rows, showProduct }) {
  return g.jsx(U.DataTable, { pageSize: 12, rows, empty: "No inventory transactions yet.", searchKeys: ["name", "productId", "action", "bookingRef", "user", "source", "note"],
    toolbar: g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => U.exportCSV("inventory-history", rows.map((l) => ({ Time: D.fmtDateTime(l.at), ProductID: l.productId, Product: l.name, Action: l.action, From: l.from || "", To: l.to || "", Previous: l.prevQty ?? "", New: l.newQty ?? "", Reserved: l.reserved || 0, Sold: l.sold || 0, Released: l.released || 0, Booking: l.bookingRef || "", Source: l.source, User: l.user, Role: l.role, Note: l.note || "" }))), children: "Export" }),
    columns: [
      { key: "at", label: "Time", render: (l) => D.fmtDateTime(l.at) },
      ...(showProduct ? [{ key: "name", label: "Product", render: (l) => g.jsxs("span", { children: [l.name, g.jsx("span", { className: "block text-[10px] text-ivory/40", children: l.productId })] }) }] : []),
      { key: "action", label: "Action", render: (l) => g.jsx(U.Badge, { tone: /release|expire/.test(l.action) ? "neutral" : /confirm/.test(l.action) ? "green" : /reserve/.test(l.action) ? "amber" : "blue", children: l.action }) },
      { key: "from", label: "Dates", render: (l) => (l.from ? D.fmtDate(l.from) + (l.to && l.to !== l.from ? " – " + D.fmtDate(l.to) : "") : "—") },
      { key: "prevQty", label: "Previous → new", sortable: false, render: (l) => (l.prevQty !== undefined || l.newQty !== undefined ? fmtN(l.prevQty) + " → " + fmtN(l.newQty) : "—") },
      { key: "moves", label: "Reserved / sold / released", sortable: false, render: (l) => [l.reserved ? "+" + l.reserved + " held" : "", l.sold ? "+" + l.sold + " sold" : "", l.released ? "−" + l.released + " released" : ""].filter(Boolean).join(" · ") || "—" },
      { key: "bookingRef", label: "Reference", render: (l) => l.bookingRef || "—" },
      { key: "source", label: "Source", render: (l) => g.jsx(U.Badge, { tone: "neutral", children: l.source }) },
      { key: "user", label: "User", render: (l) => g.jsxs("span", { children: [l.user, g.jsx("span", { className: "block text-[10px] text-ivory/40", children: l.role })] }) },
      { key: "note", label: "Note", render: (l) => l.note || "" },
    ] });
}
const box = (k, v) => g.jsxs("div", { className: "border border-line px-3 py-2", children: [g.jsx("p", { className: "text-[9px] uppercase tracking-[0.14em] text-ivory/45", children: k }), g.jsx("p", { className: "text-[13px] text-ivory", children: v })] }, k);

/* ======================= INVENTORY OVERVIEW ======================= */
export function InventoryOverview({ user, params }) {
  const data = U.useDB();
  const [from, setFrom] = useState(D.today());
  const [to, setTo] = useState(D.addDays(D.today(), 29));
  const [cat, setCat] = useState("all");
  const [scope, setScope] = useState(params?.scope || "managed");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(params?.slug || null);
  const [tab, setTab] = useState("products");
  const canEdit = D.can(user, "edit", "inventory");

  const rows = useMemo(() => data.products
    .filter((p) => (cat === "all" || p.categoryId === cat) && (scope === "all" || (scope === "managed" ? I.isManaged(I.invOf(p.slug)) : !I.isManaged(I.invOf(p.slug)) && p.status === "live")))
    .map((p) => { const s = I.productSummary(p.slug, from, to); return { ...p, inv: s, invStatus: s.status, total: s.total, reserved: s.reserved, sold: s.sold, available: s.available }; })
    .filter((r) => status === "all" || r.invStatus === status), [data, from, to, cat, scope, status]);
  const holds = data.allocations.filter((a) => a.status === "active" && a.kind === "hold" && (!a.expiresAt || a.expiresAt > Date.now()));
  const issues = useMemo(() => I.discrepancies(), [data]);
  const managedCount = Object.values(data.inventory).filter(I.isManaged).length;

  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsxs("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-4", children: [
          stat("Products with managed inventory", managedCount, "of " + data.products.filter((p) => p.status === "live").length + " live products", () => { setTab("products"); setScope("managed"); }),
          stat("Active reservations", holds.length, "Temporary holds counting against availability", () => setTab("holds")),
          stat("Discrepancies", issues.length, "Oversold dates, conflicts, supplier mismatches", () => setTab("issues"), issues.length > 0),
          stat("Inventory transactions", data.inventoryLog.length, "Every change, with user and source", () => setTab("history")),
        ] }),
      g.jsx(U.Panel, { pad: false, children: g.jsx("div", { className: "px-5 py-4", children: g.jsx(U.Tabs, { tabs: [{ id: "products", label: "Products" }, { id: "holds", label: "Reservations" }, { id: "issues", label: "Discrepancies" }, { id: "settings", label: "Settings" }, { id: "history", label: "History" }], active: tab, onChange: setTab }) }) }),

      tab === "products" && g.jsx(U.Panel, { title: "Inventory & availability", subtitle: "Peak reserved and sold, and the lowest availability on any date in the period", pad: false, actions: [
          g.jsx("input", { type: "date", value: from, onChange: (e) => e.target.value && setFrom(e.target.value), className: inp }),
          g.jsx("span", { className: "text-ivory/40", children: "→" }),
          g.jsx("input", { type: "date", value: to, onChange: (e) => e.target.value && setTo(e.target.value), className: inp }),
          g.jsxs("select", { value: cat, onChange: (e) => setCat(e.target.value), className: inp, children: [g.jsx("option", { value: "all", children: "All categories" }), data.categories.map((c) => g.jsx("option", { value: c.id, children: c.name }, c.id))] }),
          g.jsx("select", { value: scope, onChange: (e) => setScope(e.target.value), className: inp, children: [["managed", "Managed inventory"], ["onrequest", "Live, on request"], ["all", "All products"]].map(([v, l]) => g.jsx("option", { value: v, children: l }, v)) }),
          g.jsx("select", { value: status, onChange: (e) => setStatus(e.target.value), className: inp, children: ["all", "available", "limited", "soldout", "unavailable", "onrequest"].map((v) => g.jsx("option", { value: v, children: v === "all" ? "Any status" : I.STATUS_LABEL[v] }, v)) }),
        ], children: g.jsx(U.DataTable, { pageSize: 14, rows, empty: scope === "managed" ? "No products have managed inventory yet — switch to “Live, on request” and open a product to set its inventory." : "No products match.", columns: invColumns(data, (slug) => setOpen(slug)), onRowClick: (r) => setOpen(r.slug) }) }),

      tab === "holds" && g.jsx(U.Panel, { title: "Active temporary reservations", subtitle: "Website requests, quotations and unpaid bookings — released automatically at expiry", pad: false, children: g.jsx(U.DataTable, { pageSize: 12, rows: holds, empty: "No active reservations.", columns: [
          { key: "slug", label: "Product", render: (a) => D.productOf(a.slug)?.name || a.slug },
          { key: "date", label: "Date", render: (a) => D.fmtDate(a.date) },
          { key: "qty", label: "Qty" },
          { key: "ref", label: "Reference", sortable: false, render: (a) => a.bcn || a.quoteId || a.inquiryId || a.externalRef || "—" },
          { key: "channel", label: "Channel" },
          { key: "expiresAt", label: "Expires", render: (a) => g.jsx("span", { className: a.expiresAt - Date.now() < 3600e3 ? "text-amber-300" : "", children: D.fmtDateTime(a.expiresAt) }) },
          { key: "x", label: "", sortable: false, render: (a) => canEdit && !a.bookingId ? g.jsx("button", { onClick: (e) => { e.stopPropagation(); I.releaseHold(a.id, user); }, className: "text-[11px] uppercase text-rose-300 hover:underline", children: "Release" }) : a.bookingId ? g.jsx("span", { className: "text-[10px] text-ivory/40", children: "via booking" }) : null },
        ], onRowClick: (a) => setOpen(a.slug) }) }),

      tab === "issues" && g.jsx(U.Panel, { title: "Discrepancies to investigate", subtitle: "Next 180 days of managed inventory, channel conflicts and supplier mismatches", pad: false, children: g.jsx(U.DataTable, { pageSize: 12, rows: issues, empty: "No discrepancies — inventory and bookings agree.", columns: [
          { key: "kind", label: "Issue", render: (x) => g.jsx(U.Badge, { tone: "red", children: x.kind }) },
          { key: "slug", label: "Product", render: (x) => D.productOf(x.slug)?.name || x.slug || "—" },
          { key: "date", label: "Date", render: (x) => D.fmtDate(x.date) },
          { key: "detail", label: "Detail" },
          { key: "refs", label: "References", render: (x) => x.refs || "—" },
        ], onRowClick: (x) => x.slug && setOpen(x.slug) }) }),

      tab === "settings" && g.jsx(U.Panel, { title: "Reservation expiry", subtitle: "How long temporary reservations hold inventory before they are released automatically", children: g.jsx(HoldSettings, { user }) }),
      tab === "history" && g.jsx(U.Panel, { title: "Inventory transaction history", subtitle: "Every reservation, sale, release, adjustment and sync", pad: false, children: g.jsx(InvHistory, {}) }),
      open && g.jsx(InventoryManager, { slug: open, user, onClose: () => setOpen(null) }),
    ] });
}
function HoldSettings({ user }) {
  const data = U.useDB();
  const [f, setF] = useState({ holdMinutesWeb: data.settings.holdMinutesWeb, holdHoursQuote: data.settings.holdHoursQuote, holdHoursStaff: data.settings.holdHoursStaff });
  const can = D.can(user, "edit", "inventory");
  return g.jsxs("div", { className: "space-y-4", children: [
      g.jsx(U.RecordForm, { value: f, onChange: setF, cols: 3, fields: [
          { key: "holdMinutesWeb", label: "Website requests (minutes)", type: "number", disabled: !can, hint: "From “Send to the desk” until payment" },
          { key: "holdHoursQuote", label: "Quotation reservations (hours)", type: "number", disabled: !can },
          { key: "holdHoursStaff", label: "Unpaid bookings (hours)", type: "number", disabled: !can, hint: "Bookings created before payment" },
        ] }),
      can && g.jsx(U.Btn, { variant: "dark", onClick: () => { const before = { ...data.settings }; Object.assign(data.settings, { holdMinutesWeb: Math.max(5, Number(f.holdMinutesWeb) || 60), holdHoursQuote: Math.max(1, Number(f.holdHoursQuote) || 72), holdHoursStaff: Math.max(1, Number(f.holdHoursStaff) || 48) }); D.audit(user, "edit", "inventory", "settings", before, data.settings); D.commit("settings"); }, children: "Save" }),
    ] });
}
const stat = (label, value, sub, onClick, alarm) => g.jsxs("button", { onClick, className: U.cx("border bg-surface p-4 text-left hover:border-gold/50", alarm ? "border-rose-400/40" : "border-line"), children: [g.jsx("p", { className: "text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/45", children: label }), g.jsx("p", { className: U.cx("mt-1.5 font-display text-2xl font-semibold", alarm ? "text-rose-300" : "text-ivory"), children: value }), g.jsx("p", { className: "text-[11px] text-ivory/50", children: sub })] }, label);

/* columns shared with Product Master */
export function invColumns(data, onManage) {
  return [
    { key: "productId", label: "Product ID" },
    { key: "name", label: "Product", render: (p) => g.jsx("span", { className: "font-medium text-ivory", children: p.name }) },
    { key: "categoryId", label: "Category", render: (p) => data.categories.find((c) => c.id === p.categoryId)?.name || p.category },
    { key: "supplier", label: "Supplier" },
    { key: "invType", label: "Inventory type", sortable: false, render: (p) => (p.inv.managed ? (p.inv.type === "unit" ? "Units" : "Capacity") + " · " + p.inv.unitPlural : g.jsx("span", { className: "text-ivory/40", children: "On request" })) },
    { key: "total", label: "Total", render: (p) => fmtN(p.total) },
    { key: "reserved", label: "Reserved", render: (p) => (p.inv.managed ? p.reserved : "—") },
    { key: "sold", label: "Sold", render: (p) => (p.inv.managed ? p.sold : "—") },
    { key: "available", label: "Available", render: (p) => g.jsx("span", { className: U.cx("font-medium", p.available === 0 ? "text-rose-300" : "text-emerald-300"), children: fmtN(p.available) }) },
    { key: "period", label: "Inventory period", sortable: false, render: (p) => (!p.inv.managed ? "—" : p.inv.period?.from ? D.fmtDate(p.inv.period.from) + " – " + D.fmtDate(p.inv.period.to) : "Open-ended") },
    { key: "invStatus", label: "Availability", render: (p) => g.jsx(U.Badge, { tone: TONE[p.invStatus], children: I.STATUS_LABEL[p.invStatus] }) },
    { key: "updated", label: "Last update", sortable: false, render: (p) => (p.inv.updatedAt ? g.jsxs("span", { children: [D.fmtDateTime(p.inv.updatedAt), g.jsx("span", { className: "block text-[10px] text-ivory/40", children: p.inv.updatedBy })] }) : "—") },
    { key: "manage", label: "", sortable: false, render: (p) => g.jsx(U.Btn, { size: "sm", onClick: (e) => { e.stopPropagation(); onManage(p.slug); }, children: "Inventory" }) },
  ];
}

/* ========================= SMALL COMPONENTS ======================= */
export function AvailabilityBadge({ slug, date, to, qty = 1, poolId }) {
  U.useDB();
  if (!slug || !date || !D.productOf(slug)) return null;
  const p = D.productOf(slug);
  const rs = I.rangeStat(slug, date, to || (I.isNightly(p) ? D.addDays(date, 1) : null), poolId, qty);
  const l = I.customerLabel(slug, rs, qty);
  return g.jsx(U.Badge, { tone: l.tone, children: l.text });
}

export function BookingInventory({ booking, user }) {
  const data = U.useDB();
  const allocs = data.allocations.filter((a) => a.bookingId === booking.id && (a.status === "active" || a.status === "converted"));
  const active = allocs.filter((a) => a.status === "active");
  const byLine = Object.values(active.reduce((m, a) => { const k = a.slug + a.kind; (m[k] = m[k] || { ...a, dates: [] }).dates.push(a.date); return m; }, {}));
  const hold = active.find((a) => a.kind === "hold");
  return g.jsxs("div", { children: [
      g.jsxs("div", { className: "mb-2 flex items-center justify-between", children: [
          g.jsx("p", { className: "eyebrow", children: "Inventory allocation" }),
          hold && (D.can(user, "edit", "bookings") || D.can(user, "edit", "calendar")) && g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => I.extendBookingHold(booking.id, data.settings.holdHoursStaff || 48, user), children: "Extend reservation" }),
        ] }),
      byLine.length ? g.jsx("div", { className: "space-y-1.5", children: byLine.map((a) => g.jsxs("p", { className: "flex flex-wrap items-center justify-between gap-2 border border-line px-3 py-2 text-[12px]", children: [
          g.jsxs("span", { children: [g.jsx("span", { className: "text-ivory/85", children: D.productOf(a.slug)?.name || a.slug }), g.jsxs("span", { className: "block text-[11px] text-ivory/45", children: [a.qty, " × ", a.dates.length, a.dates.length > 1 ? " nights from " : " on ", D.fmtDate(a.dates.sort()[0]), I.isManaged(I.invOf(a.slug)) ? "" : " · on request"] })] }),
          g.jsx(U.Badge, { tone: a.kind === "confirmed" ? "green" : "amber", children: a.kind === "confirmed" ? "allocated" : "reserved until " + D.fmtDateTime(a.expiresAt) }),
        ] }, a.slug + a.kind)) })
        : g.jsx("p", { className: "text-[12px] text-ivory/45", children: booking.status === "Cancelled" ? "Released — the booking is cancelled." : booking.paymentStatus === "Unpaid" ? "No inventory held — the reservation has expired. Extend it or record a payment to allocate." : "No inventory allocated." }),
    ] });
}

export function QuoteInventory({ quote, user }) {
  const data = U.useDB();
  const draft = { ...quote, status: "Confirmed", paymentStatus: "Deposit paid", id: "__quote" };
  const lines = (quote.lines || []).filter((l) => l.slug && !l.custom && D.productOf(l.slug));
  const holds = data.allocations.filter((a) => a.quoteId === quote.id && a.kind === "hold" && a.status === "active" && !a.bookingId && (!a.expiresAt || a.expiresAt > Date.now()));
  const conflicts = I.checkBooking(draft);
  const items = lines.map((l) => { const { dates, units } = I.lineDates(l, quote); return { slug: l.slug, from: dates[0], to: D.addDays(dates[dates.length - 1], 1), qty: units, poolId: l.poolId }; });
  return g.jsxs("div", { className: "border border-line px-4 py-3", children: [
      g.jsxs("div", { className: "mb-2 flex flex-wrap items-center justify-between gap-2", children: [
          g.jsx("p", { className: "eyebrow", children: "Inventory check" }),
          D.can(user, "edit", "quotations") && lines.length > 0 && (holds.length
            ? g.jsxs("span", { className: "text-[11px] text-amber-200", children: ["Reserved until ", D.fmtDateTime(Math.min(...holds.map((h) => h.expiresAt))), " · ", g.jsx("button", { onClick: () => holds.forEach((h) => I.releaseHold(h.id, user)), className: "uppercase text-rose-300 hover:underline", children: "release" })] })
            : g.jsx(U.Btn, { size: "sm", variant: "subtle", disabled: conflicts.length > 0, onClick: () => I.placeHolds(items, { quoteId: quote.id }, user, { minutes: (data.settings.holdHoursQuote || 72) * 60 }), children: "Reserve inventory · " + (data.settings.holdHoursQuote || 72) + "h" })),
        ] }),
      g.jsx("div", { className: "space-y-1", children: lines.map((l, i) => { const { dates, units } = I.lineDates(l, quote); return g.jsxs("p", { className: "flex items-center justify-between gap-2 text-[12px]", children: [g.jsxs("span", { className: "text-ivory/75", children: [l.name, g.jsxs("span", { className: "text-ivory/40", children: [" · ", units, " × ", dates.length > 1 ? dates.length + " nights" : D.fmtDate(dates[0])] })] }), g.jsx(AvailabilityBadge, { slug: l.slug, date: dates[0], to: D.addDays(dates[dates.length - 1], 1), qty: units, poolId: l.poolId })] }, i); }) }),
      g.jsx("p", { className: "mt-2 text-[11px] text-ivory/45", children: conflicts.length ? "This quotation cannot be confirmed as it stands — " + conflicts.length + " date(s) lack inventory." : "Quotations never consume inventory. Reserve to hold it while the guest decides; confirming the booking allocates it." }),
    ] });
}

/* ===================== CUSTOMER WEBSITE WIDGETS =================== */
const sinp = "w-full border border-ivory/25 bg-transparent px-3 py-2.5 text-[13px] text-ivory [color-scheme:dark] focus:border-gold outline-none";
export function SiteAvailability({ slug }) {
  U.useDB();
  const cart = bridge.useCart();
  const p = D.productOf(slug);
  const inv = I.getInventory(slug);
  const night = I.isNightly(p);
  const [from, setFrom] = useState(D.addDays(D.today(), 30));
  const [to, setTo] = useState(D.addDays(D.today(), 33));
  const [qty, setQty] = useState(1);
  const [poolId, setPoolId] = useState(inv?.pools[0]?.id);
  const [added, setAdded] = useState(false);
  if (!p || !inv) return null;
  const rs = I.rangeStat(slug, from, night ? to : null, poolId, qty);
  const l = I.customerLabel(slug, rs, qty);
  const badDates = night && to <= from;
  const bookable = l.bookable && !badDates;
  const max = Math.min(20, rs.minAvail ?? 20, rs.maxPerBooking ?? 20);
  const color = l.tone === "green" ? "text-emerald-300" : l.tone === "amber" ? "text-gold-soft" : l.tone === "red" ? "text-rose-300" : "text-ivory/70";
  const lab = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-stone";
  return g.jsxs("div", { className: "border border-ivory/20 p-4", children: [
      g.jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [
          g.jsxs("label", { children: [g.jsx("span", { className: lab, children: night ? "Check-in" : "Date" }), g.jsx("input", { type: "date", min: D.today(), value: from, onChange: (e) => { const v = e.target.value; if (!v) return; setFrom(v); if (night && to <= v) setTo(D.addDays(v, 1)); }, className: sinp })] }),
          night && g.jsxs("label", { children: [g.jsx("span", { className: lab, children: "Check-out" }), g.jsx("input", { type: "date", min: D.addDays(from, 1), value: to, onChange: (e) => e.target.value && setTo(e.target.value), className: sinp })] }),
          inv.pools.length > 1 && g.jsxs("label", { children: [g.jsx("span", { className: lab, children: I.typeFor(p.categoryId).poolLabel }), g.jsx("select", { value: poolId, onChange: (e) => setPoolId(e.target.value), className: sinp, children: inv.pools.map((x) => { const s = I.rangeStat(slug, from, night ? to : null, x.id, 1); return g.jsx("option", { value: x.id, disabled: s.status === "soldout" || s.status === "unavailable", children: x.name + (x.time ? " · " + x.time : "") + (s.status === "soldout" ? " — sold out" : s.status === "unavailable" ? " — unavailable" : "") }, x.id); }) })] }),
          g.jsxs("label", { children: [g.jsx("span", { className: lab, children: inv.unitPlural.charAt(0).toUpperCase() + inv.unitPlural.slice(1) }), g.jsx("select", { value: qty, onChange: (e) => setQty(Number(e.target.value)), className: sinp, children: Array.from({ length: Math.max(1, Math.min(20, rs.maxPerBooking ?? 20)) }, (_, i) => i + 1).map((n) => g.jsx("option", { value: n, disabled: rs.minAvail !== null && n > rs.minAvail, children: n }, n)) })] }),
        ] }),
      g.jsxs("p", { className: U.cx("mt-3 flex items-center gap-2 text-[13px] font-medium", color), children: [g.jsx("span", { className: "h-2 w-2 rounded-full bg-current" }), badDates ? "Choose a check-out after check-in" : l.text, night && !badDates ? g.jsxs("span", { className: "font-normal text-stone", children: [" · ", D.daysBetween(from, to), " night", D.daysBetween(from, to) === 1 ? "" : "s"] }) : null] }),
      l.text === "On request" && g.jsx("p", { className: "mt-1 text-[11px] text-stone", children: "Our desk confirms availability with the house before any payment." }),
      g.jsx("button", {
        disabled: !bookable,
        onClick: () => { cart.add(slug, 1, "Morning", { date: from, to: night ? to : null, qty, poolId }); setAdded(true); setTimeout(() => bridge.navigate("/builder"), 350); },
        className: U.cx("mt-3 w-full border px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors", !bookable ? "cursor-not-allowed border-ivory/15 text-ivory/30" : added ? "border-gold bg-gold text-deep" : "border-ivory/30 text-ivory hover:border-ivory"),
        children: !bookable ? (rs.status === "soldout" ? "Sold out" : "Unavailable") : added ? "Added ✓" : "Add to voyage",
      }),
    ] });
}

/* converts the public builder's cart into dated inventory items */
export function cartToItems(items, arrival, nights, guests) {
  return items.map((it) => {
    const p = D.productOf(it.slug);
    if (!p) return null;
    const night = I.isNightly(p);
    const from = it.date || D.addDays(arrival, Math.max(0, (it.day || 1) - 1));
    const to = night ? it.to || (it.date ? D.addDays(it.date, 1) : D.addDays(arrival, nights)) : null;
    const qty = it.qty || (p.unit === "guest" || p.unit === "person" ? guests : 1);
    return { slug: it.slug, name: p.name, from, to, qty, poolId: it.poolId };
  }).filter(Boolean);
}
export function BuilderAvailability({ items, arrival, nights, guests }) {
  U.useDB();
  const list = cartToItems(items, arrival, nights, guests);
  if (!list.length) return null;
  const rows = list.map((x) => ({ ...x, l: I.customerLabel(x.slug, I.rangeStat(x.slug, x.from, x.to, x.poolId, x.qty), x.qty) }));
  const blocked = rows.filter((r) => !r.l.bookable);
  return g.jsxs("div", { className: "mt-5 border border-ivory/25 bg-surface p-5", children: [
      g.jsx("p", { className: "mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-stone", children: "Live availability" }),
      rows.map((r, i) => g.jsxs("p", { className: "flex flex-wrap items-center justify-between gap-2 border-b border-ivory/10 py-2 text-[13px]", children: [
          g.jsxs("span", { className: "text-ivory", children: [r.name, g.jsxs("span", { className: "text-stone", children: [" · ", D.fmtDate(r.from), r.to ? " → " + D.fmtDate(r.to) : ""] })] }),
          g.jsx("span", { className: r.l.tone === "red" ? "text-rose-300" : r.l.tone === "amber" ? "text-gold-soft" : r.l.tone === "green" ? "text-emerald-300" : "text-stone", children: r.l.text }),
        ] }, i)),
      blocked.length > 0 && g.jsx("p", { className: "mt-3 text-[13px] text-rose-300", children: blocked.length + " item(s) are not available for your dates — remove them or change the dates before sending." }),
    ] });
}
/* called by the public builder's “Send it to the desk” */
export function submitWebRequest({ items, arrival, nights, guests, ref, total, requests, user }) {
  const db = D.db();
  const list = cartToItems(items, arrival, nights, guests);
  const blocked = list.filter((x) => !I.customerLabel(x.slug, I.rangeStat(x.slug, x.from, x.to, x.poolId, x.qty), x.qty).bookable);
  if (blocked.length) return { ok: false, message: "Not available for your dates:\n" + blocked.map((b) => "· " + b.name).join("\n") };
  const system = { name: "Website", role: "super_admin", email: "website@prestigebalileisure.com" };
  let cust = user?.email ? db.customers.find((c) => c.email?.toLowerCase() === user.email.toLowerCase()) : null;
  if (!cust) {
    cust = db.customers.find((c) => c.id === "CUS-WEB");
    if (!cust) cust = D.insert("customers", { id: "CUS-WEB", name: "Website visitor (unidentified)", email: "", phone: "", whatsapp: "", country: "", nationality: "", status: "Inquiry", notes: "Requests sent from the public builder without signing in.", createdAt: Date.now(), tags: ["website"] }, system, { module: "customers" });
  }
  const inq = D.insert("inquiries", {
    id: D.nextNumber("INQ-", "inqSeq"), customerId: cust.id, customerName: cust.name, channel: "Website builder",
    destination: D.productOf(list[0]?.slug)?.destination || "Bali", guests, nights, arrival, departure: D.addDays(arrival, nights),
    brief: "Website request " + ref + " · " + list.length + " items · indicative total " + D.money(total) + (requests ? " · “" + requests + "”" : ""),
    status: "New", ownerId: db.users.find((u) => u.role === "sales")?.id || "", createdAt: new Date().toISOString(), timeline: [], webRef: ref,
    requestItems: list,
  }, system, { module: "inquiries" });
  const managed = list.filter((x) => I.isManaged(I.invOf(x.slug)));
  let hold = null;
  if (managed.length) {
    try { hold = I.placeHolds(managed, { inquiryId: inq.id, externalRef: ref }, system, { channel: "website" }); }
    catch (e) { return { ok: false, message: e.message }; }
  }
  return { ok: true, inquiryId: inq.id, heldUntil: hold?.expiresAt || null };
}

/* ===================== INTEGRATIONS: INVENTORY SYNC =============== */
export function InventorySyncPanel({ user }) {
  const data = U.useDB();
  const integs = I.inventoryIntegrations();
  const [preview, setPreview] = useState(null);
  const canEdit = D.can(user, "edit", "inventory");
  const mapped = (id) => Object.values(data.inventory).filter((inv) => inv.source === id).length;
  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsx(U.Panel, { title: "Inventory synchronisation", subtitle: "Modular adapters per platform · each product records its source of inventory so channel bookings are never counted twice", pad: false, children: g.jsx(U.DataTable, { searchable: false, pageSize: 8, rows: integs.map((i) => ({ ...i, adapter: I.adapterFor(i), mapped: mapped(i.id), lastOut: data.inventorySync.find((x) => x.integrationId === i.id && x.direction === "out"), lastIn: data.inventorySync.find((x) => x.integrationId === i.id && x.direction === "in") })), empty: "No OTA, PMS or channel integrations configured.", columns: [
          { key: "name", label: "Platform", render: (i) => g.jsx("span", { className: "font-medium text-ivory", children: i.name }) },
          { key: "adapter", label: "Adapter", render: (i) => I.ADAPTERS[i.adapter].name },
          { key: "caps", label: "Synchronises", sortable: false, render: (i) => I.ADAPTERS[i.adapter].caps.join(", ") },
          { key: "mapped", label: "Products sourced here" },
          { key: "status", label: "Connection", render: (i) => g.jsx(U.Badge, { children: i.status }) },
          { key: "lastOut", label: "Last push", sortable: false, render: (i) => (i.lastOut ? D.fmtDateTime(i.lastOut.at) + " · " + i.lastOut.status : "—") },
          { key: "lastIn", label: "Last inbound", sortable: false, render: (i) => (i.lastIn ? D.fmtDateTime(i.lastIn.at) + " · " + i.lastIn.status : "—") },
          { key: "x", label: "", sortable: false, render: (i) => canEdit ? g.jsx(U.Btn, { size: "sm", onClick: (e) => { e.stopPropagation(); setPreview(I.queuePush(i.id, user)); }, children: "Push availability" }) : null },
        ] }) }),
      g.jsx(U.Panel, { title: "Synchronisation log", subtitle: "Inbound bookings, outbound availability, ignored echoes, conflicts and errors", pad: false, children: g.jsx(U.DataTable, { pageSize: 10, rows: data.inventorySync, empty: "No synchronisation activity yet.", columns: [
          { key: "at", label: "Time", render: (x) => D.fmtDateTime(x.at) },
          { key: "channel", label: "Channel" },
          { key: "direction", label: "Direction", render: (x) => (x.direction === "in" ? "← inbound" : "→ outbound") },
          { key: "action", label: "Action" },
          { key: "slug", label: "Product", render: (x) => D.productOf(x.slug)?.name || "—" },
          { key: "ref", label: "Reference", render: (x) => x.ref || "—" },
          { key: "status", label: "Status", render: (x) => g.jsx(U.Badge, { tone: x.status === "ok" || x.status === "queued" ? "green" : x.status === "ignored" ? "neutral" : "red", children: x.status }) },
          { key: "message", label: "Detail" },
        ] }) }),
      preview && g.jsx(U.Modal, { open: true, onClose: () => setPreview(null), wide: true, title: "Availability payload · " + (preview.integration || ""), footer: [g.jsx(U.Btn, { size: "sm", onClick: () => setPreview(null), children: "Close" }, "c")],
        children: g.jsxs("div", { className: "space-y-3 text-[12px] text-ivory/70", children: [
            g.jsxs("p", { children: [preview.listings, " listing(s) · ", preview.rows.length, " date rows · generated ", preview.generatedAt, ". The server-side ", I.ADAPTERS[preview.adapter].name, " adapter sends this with the stored credentials — credentials never reach the browser."] }),
            g.jsx("pre", { className: "max-h-72 overflow-auto border border-line bg-ink/60 p-3 text-[11px] text-ivory/70", children: JSON.stringify({ ...preview, rows: preview.rows.slice(0, 20) }, null, 2) + (preview.rows.length > 20 ? "\n… " + (preview.rows.length - 20) + " more rows" : "") }),
          ] }) }),
    ] });
}

/* ===================== SUPPLIER PORTAL: INVENTORY ================= */
export function SupplierInventoryPanel({ user, products }) {
  const data = U.useDB();
  const [edit, setEdit] = useState(null);
  const rows = products.map((p) => { const inv = I.getInventory(p.slug); const s = I.productSummary(p.slug, D.today(), D.addDays(D.today(), 29)); return { ...p, invS: s, sup: inv.supplier }; });
  return g.jsxs("div", { children: [
      g.jsx(U.Panel, { title: "Inventory you supply", subtitle: "Report your availability and confirm allocations — Prestige sees the update immediately", pad: false, children: g.jsx(U.DataTable, { pageSize: 8, rows, empty: "No products linked to your company.", columns: [
          { key: "name", label: "Product" },
          { key: "avail", label: "Prestige shows (30 days)", sortable: false, render: (p) => (p.invS.managed && p.invS.any ? p.invS.available + " / " + p.invS.total + " " + p.invS.unitPlural : "On request") },
          { key: "reported", label: "You reported", sortable: false, render: (p) => fmtN(p.sup.reported) },
          { key: "status", label: "Confirmation", sortable: false, render: (p) => g.jsx(U.Badge, { children: p.sup.status }) },
          { key: "ref", label: "Your reference", sortable: false, render: (p) => p.sup.ref || "—" },
          { key: "upd", label: "Updated", sortable: false, render: (p) => (p.sup.updatedAt ? D.fmtDateTime(p.sup.updatedAt) : "—") },
        ], onRowClick: (p) => setEdit({ slug: p.slug, name: p.name, reported: p.sup.reported ?? "", status: p.sup.status, ref: p.sup.ref || "" }) }) }),
      edit && g.jsx(U.Modal, { open: true, onClose: () => setEdit(null), title: "Update availability · " + edit.name,
        footer: [g.jsx(U.Btn, { onClick: () => setEdit(null), children: "Cancel" }, "c"), g.jsx(U.Btn, { variant: "solid", onClick: () => { I.updateSupplier(edit.slug, edit, user); setEdit(null); }, children: "Send update" }, "s")],
        children: g.jsx(U.RecordForm, { value: edit, onChange: setEdit, fields: [
            { key: "reported", label: "Units available", type: "number" },
            { key: "status", label: "Allocation confirmation", type: "select", options: ["Not requested", "Requested", "Confirmed", "Partially confirmed", "Declined"] },
            { key: "ref", label: "Your booking / allotment reference" },
          ] }) }),
    ] });
}
