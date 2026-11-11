/* ==================================================================
   MODULES 1 — DASHBOARD · BOOKING CALENDAR · REPORTS
   Every figure is computed from real records in the central database,
   and every figure is a link into the underlying records.
   ================================================================== */
import * as React from "react";
import * as jsxrt from "react/jsx-runtime";
import * as D from "./db.js";
import * as U from "./ui.js";
import { bridge, drillTo } from "./bridge.js";
import { SalesReport } from "./modules4.js";
import * as INV from "./inventory.js";
import { BookingInventory } from "./inventoryUI.js";

const g = jsxrt;
const We = React;
const { useState, useMemo } = React;

const Card = ({ children, className, onClick, children2 }) =>
  g.jsx("div", { onClick, className: U.cx("border border-line bg-surface p-5", className), children });

/* --------------------------- date ranges -------------------------- */
const RANGES = [
  { id: "mtd", label: "This month" },
  { id: "last30", label: "Last 30 days" },
  { id: "last90", label: "Last 90 days" },
  { id: "ytd", label: "Year to date" },
  { id: "prevMonth", label: "Last month" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];
function rangeOf(id, custom) {
  const t = D.today();
  const m = t.slice(0, 7);
  switch (id) {
    case "mtd": return { from: m + "-01", to: t };
    case "prevMonth": {
      const d = new Date(t + "T00:00:00");
      d.setMonth(d.getMonth() - 1);
      const key = D.ym(d);
      const end = D.ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      return { from: key + "-01", to: end };
    }
    case "last30": return { from: D.addDays(t, -30), to: t };
    case "last90": return { from: D.addDays(t, -90), to: t };
    case "ytd": return { from: t.slice(0, 4) + "-01-01", to: t };
    case "custom": return { from: custom.from || D.addDays(t, -30), to: custom.to || t };
    default: return { from: null, to: null };
  }
}
function prevRange(r) {
  if (!r.from || !r.to) return { from: null, to: null };
  const days = D.daysBetween(r.from, r.to) || 1;
  return { from: D.addDays(r.from, -days), to: D.addDays(r.from, -1) };
}
const delta = (a, b) => (b ? Math.round(((a - b) / b) * 100) : a ? 100 : 0);
const arrow = (n) => (n >= 0 ? "▲ " + n + "%" : "▼ " + Math.abs(n) + "%");

function RangeBar({ range, setRange, custom, setCustom, onExport }) {
  return g.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
      g.jsx("div", { className: "flex flex-wrap gap-1", children: RANGES.map((r) => g.jsx("button", {
          onClick: () => setRange(r.id),
          className: U.cx("rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors",
            range === r.id ? "border-gold bg-gold/15 text-gold-soft" : "border-ivory/20 text-ivory/60 hover:border-ivory/50 hover:text-ivory"),
          children: r.label,
        }, r.id)) }),
      range === "custom" && g.jsxs("span", { className: "flex items-center gap-2", children: [
          g.jsx("input", { type: "date", value: custom.from, onChange: (e) => setCustom({ ...custom, from: e.target.value }), className: "border border-ivory/20 bg-ink/40 px-2 py-1.5 text-[12px] text-ivory" }),
          g.jsx("span", { className: "text-ivory/40", children: "→" }),
          g.jsx("input", { type: "date", value: custom.to, onChange: (e) => setCustom({ ...custom, to: e.target.value }), className: "border border-ivory/20 bg-ink/40 px-2 py-1.5 text-[12px] text-ivory" }),
        ] }),
      onExport && g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: onExport, children: "Export CSV" }),
    ] });
}

/* ============================ DASHBOARD =========================== */
export function Dashboard({ user }) {
  const data = U.useDB();
  const [range, setRange] = useState("ytd");
  const [custom, setCustom] = useState({ from: D.addDays(D.today(), -30), to: D.today() });
  const r = rangeOf(range, custom);
  const p = prevRange(r);
  const a = useMemo(() => D.analytics(r), [data, range, custom]);
  const b = useMemo(() => D.analytics(p), [data, range, custom]);
  const series = useMemo(() => {
    const t = D.today();
    const start = new Date(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 12, 1);
    const from = new Date(Date.UTC(start.getFullYear(), start.getMonth(), 1)).toISOString().slice(0, 10);
    return D.salesSeries("month", from, D.periodOf({ mode: "month", anchor: t }).to);
  }, [data]);
  const toPeriod = (x) => (x.from ? { mode: "custom", from: x.from, to: x.to } : { mode: "all" });

  const compare = D.analytics(p);
  const rows = [
    { label: "Inquiries", v: a.inquiries, o: b.inquiries, go: () => drillTo("inquiries", { range: r }) },
    { label: "Confirmed bookings", v: a.confirmed, o: b.confirmed, go: () => drillTo("bookings", { status: "Confirmed", range: r }) },
    { label: "Revenue collected", v: D.money(a.revenue), o: D.money(b.revenue), go: () => drillTo("reports", { tab: "sales", period: toPeriod(r) }) },
    { label: "Outstanding payments", v: D.money(a.outstanding), o: D.money(b.outstanding), go: () => drillTo("invoices", { status: "Overdue" }) },
    { label: "Customers", v: a.customers, o: b.customers, go: () => drillTo("customers") },
    { label: "Suppliers", v: a.suppliers, o: b.suppliers, go: () => drillTo("suppliers") },
    { label: "Products live", v: a.products, o: b.products, go: () => drillTo("products") },
  ];

  const statusSlices = [
    { label: "Confirmed", value: a.confirmed, color: "#3f9d7a" },
    { label: "Completed", value: a.completed, color: "#d2ab6d" },
    { label: "Cancelled", value: a.cancelled, color: "#c05a5a" },
  ];
  const paySlices = [
    { label: "Collected", value: a.revenue, color: "#3f9d7a" },
    { label: "Outstanding", value: a.outstanding, color: "#d98b3a" },
  ];

  return g.jsxs("div", { className: "space-y-6", children: [
      g.jsxs(Card, { className: "flex flex-wrap items-center justify-between gap-4", children: [
          g.jsxs("div", { children: [
              g.jsx("p", { className: "eyebrow", children: "Operations dashboard" }),
              g.jsxs("h2", { className: "font-display mt-1 text-2xl font-semibold text-ivory", children: ["Good day, ", (user?.name || "").split(" ")[0], "."] }),
              g.jsxs("p", { className: "mt-1 text-[12px] text-ivory/55", children: [
                  "Live figures from the central database · ", D.collection("bookings").length, " bookings, ",
                  D.collection("payments").length, " payments, ", D.collection("products").length, " products.",
                ] }),
            ] }),
          g.jsx(RangeBar, { range, setRange, custom, setCustom }),
        ] }),

      g.jsxs("div", { className: "grid gap-4 sm:grid-cols-2 xl:grid-cols-4", children: [
          g.jsx(U.Stat, { label: "Cash collected", value: D.money(a.revenue), sub: arrow(delta(a.revenue, b.revenue)) + " vs previous period", tone: "gold", onClick: () => drillTo("reports", { tab: "sales", period: toPeriod(r) }) }),
          g.jsx(U.Stat, { label: "Sales revenue", value: D.money(a.gross), sub: "Booked, before tax · " + a.activeBookings + " active bookings", onClick: () => drillTo("reports", { tab: "sales", period: toPeriod(r) }) }),
          g.jsx(U.Stat, { label: "Outstanding", value: D.money(a.outstanding), sub: "Across all issued invoices", onClick: () => drillTo("invoices", { status: "Overdue" }) }),
          g.jsx(U.Stat, { label: "Net margin", value: a.marginPct + "%", sub: D.money(a.net) + " gross profit", onClick: () => drillTo("reports", { tab: "sales", period: toPeriod(r) }) }),
          g.jsx(U.Stat, { label: "Inquiries", value: a.inquiries, sub: arrow(delta(a.inquiries, b.inquiries)) + " · " + a.conversionPct + "% converted", onClick: () => drillTo("inquiries", { range: r }) }),
          g.jsx(U.Stat, { label: "Quotations", value: a.quotations, sub: "Approval pipeline", onClick: () => drillTo("quotations", { range: r }) }),
          g.jsx(U.Stat, { label: "Cancellation rate", value: a.cancelRate + "%", sub: a.cancelled + " cancelled of " + a.bookings, onClick: () => drillTo("reports", { tab: "cancellations", period: toPeriod(r) }) }),
          g.jsx(U.Stat, { label: "Average order value", value: D.money(a.aov), sub: arrow(delta(a.aov, b.aov)) + " vs previous", onClick: () => drillTo("bookings", { range: r }) }),
        ] }),

      g.jsxs("div", { className: "grid gap-6 lg:grid-cols-3", children: [
          g.jsx(U.Panel, { className: "lg:col-span-2", title: "Monthly sales revenue", subtitle: "Booked selling revenue before tax · click a month to open its sales report", actions: [
              g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => drillTo("reports", { tab: "sales", period: toPeriod(r) }), children: "Full report" }),
            ], children: g.jsx(U.BarChart, { data: series, valueKey: "revenue", onBarClick: (d) => drillTo("reports", { tab: "sales", period: D.periodForBucket(d.key, "month") }) }) }),
          g.jsx(U.Panel, { title: "Booking performance", children: g.jsx(U.Donut, { slices: statusSlices }) }),
        ] }),

      g.jsxs("div", { className: "grid gap-6 lg:grid-cols-3", children: [
          g.jsx(U.Panel, { title: "Payment summary", subtitle: "Collected vs outstanding", children: g.jsx(U.Donut, { slices: paySlices }) }),
          g.jsx(U.Panel, { className: "lg:col-span-2", title: "Sales & booking performance", subtitle: "Every row opens the underlying records", pad: false, children: g.jsx(U.DataTable, {
              pageSize: 9, searchable: false,
              rows,
              columns: [
                { key: "label", label: "Metric", render: (x) => g.jsx("span", { className: "font-medium text-ivory", children: x.label }) },
                { key: "v", label: "Current", render: (x) => g.jsx("span", { className: "font-medium text-gold-soft", children: typeof x.v === "number" ? x.v : x.v }) },
                { key: "o", label: "Previous" },
                { key: "d", label: "Change", sortable: false, render: (x) => g.jsx(U.Badge, { tone: delta(typeof x.v === "number" ? x.v : parseFloat(String(x.v).replace(/\D/g, "")), typeof x.o === "number" ? x.o : parseFloat(String(x.o).replace(/\D/g, ""))) >= 0 ? "green" : "red", children: arrow(delta(typeof x.v === "number" ? x.v : parseFloat(String(x.v).replace(/\D/g, "")), typeof x.o === "number" ? x.o : parseFloat(String(x.o).replace(/\D/g, "")))) }) },
                { key: "go", label: "", sortable: false, render: (x) => g.jsx("span", { className: "text-[11px] uppercase tracking-[0.14em] text-gold-soft/70", children: "Open →" }) },
              ],
              onRowClick: (x) => x.go(),
            }) }),
        ] }),
    ] });
}

/* ======================== BOOKING CALENDAR ======================== */
export function BookingCalendar({ user }) {
  const data = U.useDB();
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(D.today().slice(0, 7));
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [conflict, setConflict] = useState("");

  const bookings = D.collection("bookings");
  const canEdit = D.can(user, "edit", "calendar");

  const shift = (n) => {
    const d = new Date(cursor + "-01T00:00:00");
    if (view === "month") d.setMonth(d.getMonth() + n);
    else d.setDate(d.getDate() + n * (view === "week" ? 7 : 1));
    setCursor(D.ym(d));
  };
  const anchor = view === "month" ? cursor + "-01" : cursor.length === 7 ? cursor + "-01" : cursor;
  const days = view === "month" ? monthGrid(anchor) : view === "week" ? weekGrid(cursor + "-15") : [cursor];

  const forDay = (day) => bookings.filter((b) => day >= b.arrival && day <= b.departure);

  /* double-booking guard: same product overlapping another booking */
  function checkConflict(lines, arrival, departure, ignoreId) {
    /* managed inventory: date-based availability check */
    const invC = INV.checkBooking({ lines, arrival, departure }, ignoreId);
    if (invC.length) return INV.describeConflicts(invC);
    /* on-request accommodation keeps the overlap guard (one property, one stay) */
    for (const l of lines) {
      if (INV.isManaged(INV.invOf(l.slug)) || D.productOf(l.slug)?.categoryId !== "accommodation") continue;
      for (const b of bookings) {
        if (b.id === ignoreId || b.status === "Cancelled") continue;
        if (!(b.lines || []).some((x) => x.slug === l.slug)) continue;
        if (arrival <= b.departure && departure >= b.arrival) return `${l.name} is already held by ${b.bcn} (${b.customerName}, ${D.fmtDate(b.arrival)} → ${D.fmtDate(b.departure)}).`;
      }
    }
    return "";
  }

  const saveNew = (form) => {
    const c = checkConflict(form.lines, form.arrival, form.departure, null);
    if (c && !form.override) { setConflict(c); return; }
    const total = form.lines.reduce((s, l) => s + D.lineTotals(l).sell, 0) * (1 + data.settings.taxRate / 100);
    D.insert("bookings", {
      bcn: D.nextNumber("BCN-", "bcnSeq", 5), quoteId: "", inquiryId: "",
      customerId: form.customerId, customerName: form.customerName,
      title: form.title, arrival: form.arrival, departure: form.departure,
      nights: D.daysBetween(form.arrival, form.departure), guests: Number(form.guests) || 2,
      lines: form.lines, total: Math.round(total), depositPaid: 0, balance: Math.round(total),
      dueDate: D.addDays(form.arrival, -data.settings.fullPaymentDaysBeforeArrival),
      paymentStatus: "Unpaid", supplierStatus: "Pending", status: "Confirmed",
      createdAt: new Date().toISOString(), cancelledAt: null, cancellationCharge: 0, cancellationRule: "",
      discountPct: 0, ...D.OPS_DEFAULTS(form.guests),
    }, user, { module: "calendar" });
    setCreating(false); setConflict("");
  };

  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsxs(U.Panel, { pad: false, children: [
          g.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4", children: [
              g.jsxs("div", { className: "flex items-center gap-3", children: [
                  g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => shift(-1), children: "←" }),
                  g.jsx("h3", { className: "font-display min-w-[190px] text-center text-lg font-semibold text-ivory", children: new Date(anchor + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric", ...(view !== "month" ? { day: "numeric" } : {}) }) }),
                  g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => shift(1), children: "→" }),
                  g.jsx(U.Btn, { size: "sm", onClick: () => { setCursor(D.today().slice(0, 7)); }, children: "Today" }),
                ] }),
              g.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
                  g.jsx(U.Tabs, { tabs: [{ id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }], active: view, onChange: setView }),
                  canEdit && g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => setCreating(true), children: "New booking" }),
                ] }),
            ] }),
          g.jsx("div", { className: "overflow-x-auto p-4", children: g.jsxs("div", { className: U.cx("grid gap-2", view === "month" ? "grid-cols-7" : view === "week" ? "grid-cols-2 md:grid-cols-7" : "grid-cols-1"), children: [
              view === "month" && ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => g.jsx("div", { className: "px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ivory/40", children: d }, d)),
              days.map((day) => {
                const items = forDay(day);
                const isToday = day === D.today();
                return g.jsxs("div", {
                  className: U.cx("min-h-[96px] border p-2", isToday ? "border-gold/60 bg-gold/[0.06]" : "border-line bg-ink/20"),
                  children: [
                    (() => { const mv = D.guestMovements(day); return g.jsxs("button", { onClick: () => drillTo("arrivals", { date: day }), title: "Open guest movements for this date",
                      className: "mb-1.5 flex w-full items-center justify-between text-left", children: [
                        g.jsx("span", { className: U.cx("text-[11px] font-semibold", isToday ? "text-gold-soft" : "text-ivory/50"), children: Number(day.slice(-2)) }),
                        g.jsxs("span", { className: "flex gap-1.5 text-[9px] font-semibold", children: [
                          mv.arrivals.length > 0 && g.jsxs("span", { className: "text-emerald-300", children: ["↘", mv.arrivals.length] }),
                          mv.departures.length > 0 && g.jsxs("span", { className: "text-sky-300", children: ["↗", mv.departures.length] }),
                        ] }),
                      ] }); })(),
                    items.slice(0, view === "month" ? 3 : 20).map((b) => g.jsxs("button", {
                      onClick: () => setSelected(b),
                      className: U.cx("mb-1 block w-full truncate border-l-2 px-1.5 py-1 text-left text-[10px] leading-tight transition-colors hover:bg-ivory/10",
                        b.status === "Cancelled" ? "border-rose-400/70 text-rose-300/80" : b.paymentStatus === "Paid in full" ? "border-emerald-400/70 text-emerald-200" : b.paymentStatus === "Unpaid" ? "border-amber-400/70 text-amber-200" : "border-gold text-ivory/85"),
                      children: [g.jsxs("span", { className: "block font-semibold", children: [b.customerName] }), g.jsx("span", { className: "block opacity-70", children: b.bcn })],
                    }, b.id + day)),
                    items.length > 3 && view === "month" && g.jsx("button", { onClick: () => { setView("day"); setCursor(day); }, className: "text-[10px] uppercase tracking-wide text-gold-soft/70 hover:text-gold-soft", children: "+" + (items.length - 3) + " more" }),
                  ],
                }, day);
              }),
            ] }) }),
        ] }),

      g.jsx(U.Panel, { title: "Arrivals & departures in view", subtitle: "Click any row for the guest, inquiry, quotation and booking", pad: false, children: g.jsx(U.DataTable, {
          pageSize: 10,
          rows: bookings.filter((b) => days[0] && b.departure >= days[0] && b.arrival <= days[days.length - 1]),
          columns: [
            { key: "bcn", label: "BCN", render: (b) => g.jsx("span", { className: "font-medium text-gold-soft", children: b.bcn }) },
            { key: "customerName", label: "Guest" },
            { key: "title", label: "Product" },
            { key: "arrival", label: "Arrival", render: (b) => D.fmtDate(b.arrival) },
            { key: "departure", label: "Departure", render: (b) => D.fmtDate(b.departure) },
            { key: "paymentStatus", label: "Payment", render: (b) => g.jsx(U.Badge, { children: b.paymentStatus }) },
            { key: "status", label: "Status", render: (b) => g.jsx(U.Badge, { children: b.status }) },
          ],
          onRowClick: setSelected,
        }) }),

      selected && g.jsx(BookingDrawer, { booking: selected, user, onClose: () => setSelected(null), onReschedule: canEdit ? (arrival, departure) => {
          const c = checkConflict(selected.lines, arrival, departure, selected.id);
          if (c) { setConflict(c); return; }
          D.update("bookings", selected.id, { arrival, departure, nights: D.daysBetween(arrival, departure), dueDate: D.addDays(arrival, -data.settings.fullPaymentDaysBeforeArrival) }, user, { module: "calendar" });
          setSelected({ ...selected, arrival, departure });
        } : null }),

      creating && g.jsx(NewBookingModal, { user, onClose: () => setCreating(false), onSave: saveNew, conflict, productLines: true }),

      conflict && g.jsx(U.Modal, { open: true, onClose: () => setConflict(""), title: "Availability conflict", footer: [g.jsx(U.Btn, { variant: "solid", onClick: () => setConflict(""), children: "Understood" })],
        children: g.jsx("p", { className: "text-[14px] leading-relaxed text-rose-200", children: conflict }) }),
    ] });
}

function monthGrid(anchor) {
  const first = new Date(anchor + "T00:00:00");
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return D.ymd(d);
  }).filter((d) => d.slice(0, 7) === anchor.slice(0, 7));
}
function weekGrid(mid) {
  const d = new Date(mid + "T00:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return D.ymd(x); });
}

export function BookingDrawer({ booking: bookingIn, user, onClose, onReschedule, onCancel }) {
  const data = U.useDB();
  const booking = data.bookings.find((b) => b.id === bookingIn.id) || bookingIn;
  const [edit, setEdit] = useState(false);
  const [opsEdit, setOpsEdit] = useState(false);
  const [ops, setOps] = useState(() => ({ ...D.OPS_DEFAULTS(booking.guests), ...booking }));
  const canAmend = D.can(user, "edit", "bookings") || D.can(user, "edit", "calendar") || D.can(user, "edit", "arrivals");
  const [arrival, setArrival] = useState(booking.arrival);
  const [departure, setDeparture] = useState(booking.departure);
  const customer = D.collection("customers").find((c) => c.id === booking.customerId);
  const quote = D.collection("quotations").find((q) => q.id === booking.quoteId);
  const inquiry = D.collection("inquiries").find((i) => i.id === booking.inquiryId);
  const invoice = D.collection("invoices").find((v) => v.bookingId === booking.id);
  const itinerary = D.collection("itineraries").find((i) => i.bookingId === booking.id);
  const payments = D.collection("payments").filter((p) => p.bcn === booking.bcn);
  const cancel = D.cancellationQuote(booking);

  return g.jsx(U.Modal, { open: true, onClose, wide: true, title: booking.bcn + " · " + booking.customerName,
      footer: [
        g.jsx(U.Btn, { size: "sm", onClick: () => exportBookingPDF(booking, data), children: "Download PDF" }),
        onCancel && booking.status !== "Cancelled" && g.jsx(U.Btn, { size: "sm", variant: "danger", onClick: onCancel, children: "Cancel booking" }),
        onReschedule && g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => (edit ? (onReschedule(arrival, departure), setEdit(false)) : setEdit(true)), children: edit ? "Save dates" : "Reschedule" }),
        g.jsx(U.Btn, { size: "sm", onClick: onClose, children: "Close" }),
      ],
      children: g.jsxs("div", { className: "space-y-5", children: [
          g.jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [
              g.jsxs("div", { children: [g.jsx("p", { className: U.cx("mb-1 text-[10px] font-semibold uppercase tracking-[0.16em]", "text-ivory/45"), children: "Arrival" }), edit ? g.jsx("input", { type: "date", value: arrival, onChange: (e) => setArrival(e.target.value), className: "border border-ivory/20 bg-ink/40 px-3 py-2 text-[13px] text-ivory" }) : g.jsx("p", { className: "text-[14px] text-ivory", children: D.fmtDate(booking.arrival) })] }),
              g.jsxs("div", { children: [g.jsx("p", { className: "mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/45", children: "Departure" }), edit ? g.jsx("input", { type: "date", value: departure, onChange: (e) => setDeparture(e.target.value), className: "border border-ivory/20 bg-ink/40 px-3 py-2 text-[13px] text-ivory" }) : g.jsx("p", { className: "text-[14px] text-ivory", children: D.fmtDate(booking.departure) })] }),
              g.jsxs("div", { children: [g.jsx("p", { className: "mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/45", children: "Payment" }), g.jsx(U.Badge, { children: booking.paymentStatus })] }),
              g.jsxs("div", { children: [g.jsx("p", { className: "mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/45", children: "Booking" }), g.jsx(U.Badge, { children: booking.status })] }),
            ] }),
          edit && g.jsx("p", { className: "border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200", children: "Availability is checked against every other booking that holds the same products." }),

          g.jsxs("div", { children: [
              g.jsx("p", { className: "eyebrow mb-2", children: "Chain of records" + (booking.tripId ? " · Trip " + booking.tripId : "") + (booking.requestId ? " · " + booking.requestId : "") }),
              g.jsxs("div", { className: "grid gap-2 text-[12px] sm:grid-cols-2", children: [
                  g.jsxs("div", { className: "border border-line px-3 py-2", children: [g.jsx("span", { className: "text-ivory/45", children: "Inquiry " }), g.jsx("button", { onClick: () => { bridge.navigate(bridge.paths.workspace + "/inquiries"); onClose(); }, className: "text-gold-soft hover:underline", children: inquiry?.id || "—" })] }),
                  g.jsxs("div", { className: "border border-line px-3 py-2", children: [g.jsx("span", { className: "text-ivory/45", children: "Quotation " }), g.jsx("button", { onClick: () => { bridge.navigate(bridge.paths.workspace + "/quotations"); onClose(); }, className: "text-gold-soft hover:underline", children: quote?.id || "—" })] }),
                  g.jsxs("div", { className: "border border-line px-3 py-2", children: [g.jsx("span", { className: "text-ivory/45", children: "Invoice " }), g.jsx("button", { onClick: () => { bridge.navigate(bridge.paths.workspace + "/invoices"); onClose(); }, className: "text-gold-soft hover:underline", children: invoice?.id || "—" })] }),
                  g.jsxs("div", { className: "border border-line px-3 py-2", children: [g.jsx("span", { className: "text-ivory/45", children: "Itinerary " }), g.jsx("button", { onClick: () => { bridge.navigate(bridge.paths.workspace + "/itineraries"); onClose(); }, className: "text-gold-soft hover:underline", children: itinerary?.id || "not generated" })] }),
                ] }),
            ] }),

          g.jsxs("div", { children: [
              g.jsx("p", { className: "eyebrow mb-2", children: "Guest" }),
              g.jsxs("div", { className: "border border-line px-4 py-3 text-[13px] text-ivory/80", children: [
                  g.jsx("p", { className: "font-medium text-ivory", children: customer?.name || booking.customerName }),
                  g.jsxs("p", { className: "text-ivory/60", children: [customer?.email || "—", " · ", customer?.phone || "—"] }),
                  g.jsxs("p", { className: "text-ivory/45", children: [customer?.country || "", " ", booking.guests, " guests"] }),
                ] }),
            ] }),

          g.jsxs("div", { children: [
              g.jsxs("div", { className: "mb-2 flex items-center justify-between", children: [
                  g.jsx("p", { className: "eyebrow", children: "Arrival & operational details" }),
                  canAmend && g.jsx(U.Btn, { size: "sm", variant: opsEdit ? "dark" : "subtle", onClick: () => {
                      if (opsEdit) {
                        const keys = Object.keys(D.OPS_DEFAULTS(0));
                        const patch = Object.fromEntries(keys.map((k) => [k, ops[k]]));
                        patch.adults = Number(ops.adults) || 0; patch.children = Number(ops.children) || 0;
                        patch.guests = patch.adults + patch.children || booking.guests;
                        patch.rooms = ops.rooms === "" || ops.rooms === null ? null : Number(ops.rooms);
                        D.update("bookings", booking.id, patch, user, { module: D.can(user, "edit", "bookings") ? "bookings" : D.can(user, "edit", "calendar") ? "calendar" : "arrivals" });
                      }
                      setOpsEdit(!opsEdit);
                    }, children: opsEdit ? "Save details" : "Amend details" }),
                ] }),
              opsEdit ? g.jsx(U.RecordForm, { value: ops, onChange: setOps, cols: 3, fields: [
                  { key: "adults", label: "Adults", type: "number" }, { key: "children", label: "Children", type: "number" },
                  { key: "rooms", label: "Rooms", type: "number" }, { key: "roomDetails", label: "Room details", placeholder: "e.g. 2 × pool villa, 1 twin" },
                  { key: "flightNumber", label: "Arrival flight", placeholder: "e.g. SQ938" }, { key: "landingTime", label: "Landing time", type: "time" },
                  { key: "flightDate", label: "Flight date", type: "date" }, { key: "pickup", label: "Airport pickup", placeholder: "Driver, vehicle, meeting point" },
                  { key: "departureFlight", label: "Departure flight" }, { key: "departureTime", label: "Departure time", type: "time" },
                  { key: "specialRequests", label: "Special requests", type: "textarea", rows: 2 }, { key: "opsNotes", label: "Operational notes (internal)", type: "textarea", rows: 2 },
                ] })
                : g.jsxs("div", { className: "grid gap-x-6 gap-y-1.5 border border-line px-4 py-3 text-[12px] sm:grid-cols-2", children: [
                    ["Guests", (booking.adults ?? booking.guests) + " adults" + (booking.children ? " · " + booking.children + " children" : "")],
                    ["Rooms", booking.rooms ? booking.rooms + (booking.roomDetails ? " · " + booking.roomDetails : "") : booking.roomDetails || "—"],
                    ["Arrival flight", booking.flightNumber ? booking.flightNumber + (booking.landingTime ? " · lands " + booking.landingTime : "") : "Not provided"],
                    ["Airport pickup", booking.pickup || "—"],
                    ["Departure flight", booking.departureFlight ? booking.departureFlight + (booking.departureTime ? " · " + booking.departureTime : "") : "Not provided"],
                    ["Special requests", booking.specialRequests || "—"],
                    ["Operational notes", booking.opsNotes || "—"],
                  ].map(([k, v]) => g.jsxs("p", { children: [g.jsx("span", { className: "text-ivory/45", children: k + ": " }), g.jsx("span", { className: "text-ivory/85", children: v })] }, k)) }),
            ] }),

          g.jsxs("div", { children: [
              g.jsx("p", { className: "eyebrow mb-2", children: "Confirmed products" }),
              g.jsx("table", { className: "w-full text-left text-[12px]", children: g.jsxs("tbody", { children: [
                    g.jsx("tr", { children: ["Product", "Qty", "Unit", "Selling"].map((h, i) => g.jsx("th", { className: U.cx("border-b border-line py-2 text-[9px] uppercase tracking-[0.16em] text-ivory/45", i === 3 && "text-right"), children: h }, h)) }),
                    ...(booking.lines || []).map((l, i) => { const t = D.lineTotals(l); return g.jsxs("tr", { children: [
                        g.jsx("td", { className: "border-b border-line/50 py-2 text-ivory/80", children: l.name }),
                        g.jsx("td", { className: "border-b border-line/50 py-2 text-ivory/60", children: l.qty }),
                        g.jsx("td", { className: "border-b border-line/50 py-2 text-ivory/60", children: l.unit }),
                        g.jsx("td", { className: "border-b border-line/50 py-2 text-right num text-ivory", children: D.money(t.sell) }),
                      ] }, i); }),
                  ] }) }),
              g.jsxs("div", { className: "mt-2 space-y-1 text-right text-[13px]", children: [
                  g.jsxs("p", { className: "text-ivory/70", children: ["Total incl. tax ", g.jsx("span", { className: "num font-medium text-ivory", children: D.money(booking.total) })] }),
                  g.jsxs("p", { className: "text-ivory/70", children: ["Paid ", g.jsx("span", { className: "num font-medium text-emerald-300", children: D.money(booking.depositPaid) })] }),
                  g.jsxs("p", { className: "text-ivory/70", children: ["Balance ", g.jsx("span", { className: "num font-medium text-amber-300", children: D.money(booking.balance) }), " · due ", D.fmtDate(booking.dueDate)] }),
                ] }),
            ] }),

          g.jsxs("div", { children: [
              g.jsx(BookingInventory, { booking, user }),
              g.jsx("p", { className: "eyebrow mb-2 mt-5", children: "Payment history" }),
              payments.length ? g.jsx(U.DataTable, { searchable: false, pageSize: 5, rows: payments, columns: [
                  { key: "date", label: "Date", render: (p) => D.fmtDate(p.date) },
                  { key: "method", label: "Method" },
                  { key: "reference", label: "Reference" },
                  { key: "amount", label: "Amount", render: (p) => g.jsx("span", { className: "num text-emerald-300", children: D.money(p.amount) }) },
                ] }) : g.jsx("p", { className: "text-[12px] text-ivory/45", children: "No payments recorded yet." }),
            ] }),

          g.jsxs("div", { className: "border border-line px-4 py-3 text-[12px] text-ivory/70", children: [
              g.jsx("p", { className: "eyebrow mb-2", children: "Cancellation position today" }),
              cancel.rule ? g.jsxs("p", { children: ["Rule: ", g.jsx("span", { className: "text-ivory", children: cancel.rule.label }), " · charge ", g.jsx("span", { className: "num text-rose-300", children: D.money(cancel.charge) }), " · refundable from payments ", g.jsx("span", { className: "num text-emerald-300", children: D.money(cancel.refundable) })] })
                : g.jsx("p", { children: "No cancellation charge applies at this date." }),
              g.jsxs("p", { className: "mt-1 text-ivory/45", children: [cancel.daysToArrival, " days to arrival · ", cancel.daysSinceConfirmation, " days since confirmation"] }),
            ] }),
        ] }) });
}

export function exportBookingPDF(booking, data) {
  const t = D.quoteTotals(booking);
  const rowsHtml = (booking.lines || []).map((l) => {
    const x = D.lineTotals(l);
    return `<tr><td>${l.name}</td><td class="num r">${x.qty}</td><td class="r">${l.unit}</td><td class="num r">${D.money(x.sell)}</td></tr>`;
  }).join("");
  U.printDoc(booking.bcn, `
    <div class="brand"><div><div class="m">Booking confirmation</div><h1>${booking.bcn}</h1></div>
    <div class="m">${D.fmtDateTime(Date.now())}</div></div>
    <div class="eyebrow">Guest</div>
    <div class="grid">
      <div><div class="kv"><b>Name</b><span>${booking.customerName}</span></div>
      <div class="kv"><b>Guests</b><span>${booking.guests}</span></div></div>
      <div><div class="kv"><b>Arrival</b><span>${D.fmtDate(booking.arrival)}</span></div>
      <div class="kv"><b>Departure</b><span>${D.fmtDate(booking.departure)}</span></div>
      <div class="kv"><b>Nights</b><span>${booking.nights}</span></div></div>
    </div>
    <div class="eyebrow">Confirmed products & services</div>
    <table><thead><tr><th>Product</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">Amount</th></tr></thead>
    <tbody>${rowsHtml}</tbody></table>
    <table class="tot"><tbody>
      <tr><td class="l">Subtotal</td><td class="r num" style="width:140px">${D.money(t.sell)}</td></tr>
      <tr><td class="l">Tax ${data.settings.taxRate}%</td><td class="r num">${D.money(t.tax)}</td></tr>
      <tr class="grand"><td class="l">Total</td><td class="r num">${D.money(booking.total)}</td></tr>
      <tr><td class="l">Paid</td><td class="r num">${D.money(booking.depositPaid)}</td></tr>
      <tr><td class="l">Balance due ${D.fmtDate(booking.dueDate)}</td><td class="r num">${D.money(booking.balance)}</td></tr>
    </tbody></table>
    <div class="note"><b>Payment terms</b> — full payment is due 30 days before arrival unless approved otherwise.<br/>
    <b>Cancellation</b> — house cancellation schedule applies; the highest applicable rule is charged.</div>
    <div class="sig"><div>Prepared by</div><div>Guest acceptance</div></div>
    <div class="foot">Prestige Bali Leisure · operations desk</div>`);
}

function NewBookingModal({ user, onClose, onSave, conflict, productLines }) {
  const data = U.useDB();
  const live = data.products.filter((p) => p.status === "live");
  const customers = data.customers;
  const [form, setForm] = useState({
    customerId: customers[0]?.id || "", customerName: customers[0]?.name || "",
    title: "", arrival: D.addDays(D.today(), 30), departure: D.addDays(D.today(), 37),
    guests: 2, lines: [], override: false,
  });
  const [pick, setPick] = useState("");
  const addLine = () => {
    const p = live.find((x) => x.slug === pick);
    if (!p) return;
    setForm((f) => ({ ...f, lines: [...f.lines, { slug: p.slug, name: p.name, qty: p.unit === "night" ? D.daysBetween(f.arrival, f.departure) || 1 : 1, unit: p.unit, sell: p.sellingRate, net: p.netRate }] }));
    setPick("");
  };
  return g.jsx(U.Modal, { open: true, onClose, wide: true, title: "New booking",
      footer: [
        g.jsx(U.Btn, { onClick: onClose, children: "Cancel" }),
        g.jsx(U.Btn, { variant: "solid", disabled: !form.lines.length, onClick: () => onSave(form), children: "Create booking" }),
      ],
      children: g.jsxs("div", { className: "space-y-4", children: [
          conflict && g.jsx("p", { className: "border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-[12px] text-rose-200", children: conflict + " Tick the override box only if the supplier has approved it." }),
          g.jsx(U.Field, { label: "Override availability (supplier approved)", type: "checkbox", value: form.override, onChange: (v) => setForm({ ...form, override: v }) }),
          g.jsx(U.RecordForm, { value: form, onChange: setForm, fields: [
              { key: "customerId", label: "Customer", type: "select", options: customers.map((c) => ({ value: c.id, label: c.name })) },
              { key: "title", label: "Trip title", placeholder: "Villa + experiences" },
              { key: "arrival", label: "Arrival", type: "date" },
              { key: "departure", label: "Departure", type: "date" },
              { key: "guests", label: "Guests", type: "number" },
            ] }),
          g.jsxs("div", { children: [
              g.jsx("p", { className: "eyebrow mb-2", children: "Products (from Product Master)" }),
              g.jsxs("div", { className: "flex gap-2", children: [
                  g.jsx("select", { value: pick, onChange: (e) => setPick(e.target.value), className: "flex-1 border border-ivory/20 bg-ink/40 px-3 py-2 text-[13px] text-ivory", children: g.jsx("option", { value: "", children: "Select a product…" }) , children2: null }),
                  g.jsx(U.Btn, { size: "sm", onClick: addLine, disabled: !pick, children: "Add" }),
                ] }),
              g.jsx("select", { value: pick, onChange: (e) => setPick(e.target.value), className: "mt-2 w-full border border-ivory/20 bg-ink/40 px-3 py-2 text-[13px] text-ivory", children: live.map((p) => g.jsx("option", { value: p.slug, children: `${p.name} — ${D.money(p.sellingRate)}/${p.unit}` }, p.slug)) }),
              !!form.lines.length && g.jsx("table", { className: "mt-3 w-full text-left text-[12px]", children: g.jsx("tbody", { children: form.lines.map((l, i) => g.jsxs("tr", { children: [
                      g.jsx("td", { className: "border-b border-line/50 py-2 text-ivory/80", children: l.name }),
                      g.jsx("td", { className: "border-b border-line/50 py-2", children: g.jsx("input", { type: "number", min: 1, value: l.qty, onChange: (e) => { const n = [...form.lines]; n[i] = { ...l, qty: Number(e.target.value) }; setForm({ ...form, lines: n }); }, className: "w-16 border border-ivory/20 bg-ink/40 px-2 py-1 text-[12px] text-ivory" }) }),
                      g.jsx("td", { className: "border-b border-line/50 py-2 text-right num text-ivory", children: D.money(D.lineTotals(l).sell) }),
                      g.jsx("td", { className: "border-b border-line/50 py-2 text-right", children: g.jsx("button", { onClick: () => setForm({ ...form, lines: form.lines.filter((_, j) => j !== i) }), className: "text-rose-300 hover:underline", children: "Remove" }) }),
                    ] }, i)) }) }),
            ] }),
        ] }) });
}

/* ============================= REPORTS ============================ */
export const REPORT_TABS = [
  { id: "sales", label: "Sales & revenue" },
  { id: "conversion", label: "Conversion" },
  { id: "product", label: "Product performance" },
  { id: "category", label: "Categories" },
  { id: "destination", label: "Destinations" },
  { id: "supplier", label: "Suppliers" },
  { id: "staff", label: "Sales staff" },
  { id: "customers", label: "Customer acquisition" },
  { id: "cancellations", label: "Cancellations & refunds" },
  { id: "payments", label: "Payment collection" },
  { id: "margin", label: "Profit & margin" },
];

export function Reports({ user, params }) {
  const data = U.useDB();
  const want = params?.tab === "revenue" ? "sales" : params?.tab;
  const [tab, setTab] = useState(REPORT_TABS.some((t) => t.id === want) ? want : "sales");
  const [period, setPeriod] = useState(params?.period || { mode: "month", anchor: D.today() });
  const P = D.periodOf(period);
  const inR = (d) => (!P.from || d >= P.from) && (!P.to || d <= P.to);
  const L = useMemo(() => D.salesLedger({ from: P.from, to: P.to }), [data, P.from, P.to]);
  const bookings = useMemo(() => D.collection("bookings").filter((b) => inR((b.createdAt || "").slice(0, 10))), [data, P.from, P.to]);
  const inquiries = useMemo(() => D.collection("inquiries").filter((i) => inR((i.createdAt || "").slice(0, 10))), [data, P.from, P.to]);
  const sales = L.rows.filter((x) => x.type === "Sale");
  const bucket = (d) => (P.gran === "month" ? d.slice(0, 7) : d);

  const group = (list, keyFn, valFn, marginFn) => {
    const map = new Map();
    list.forEach((x) => {
      const k = keyFn(x) || "—";
      const c = map.get(k) || { id: k, key: k, count: 0, value: 0, margin: 0 };
      c.count++; c.value += valFn ? valFn(x) : 0; c.margin += marginFn ? marginFn(x) : 0;
      map.set(k, c);
    });
    return [...map.values()].sort((a, b) => b.value - a.value);
  };

  function reportRows(which) {
    switch (which) {
      case "sales": return L.rows.map((r) => ({ Date: r.date, Guest: r.customerName, BCN: r.bcn, Invoice: r.invoiceId, Product: r.product, Category: r.category, Supplier: r.supplier, Qty: r.qty, Revenue: r.revenue, "Net cost": r.net, Profit: r.profit }));
      case "conversion": return group(inquiries, (i) => bucket(i.createdAt.slice(0, 10)));
      case "product": return group(sales, (x) => x.product, (x) => x.revenue, (x) => x.profit);
      case "category": return group(sales, (x) => x.category, (x) => x.revenue, (x) => x.profit);
      case "destination": return group(sales, (x) => x.destination, (x) => x.revenue, (x) => x.profit);
      case "supplier": return group(sales, (x) => x.supplier, (x) => x.net, (x) => x.profit);
      case "staff": return group(inquiries, (i) => D.collection("users").find((u) => u.id === i.ownerId)?.name || "Unassigned", (i) => sales.filter((x) => D.collection("bookings").find((b) => b.id === x.bookingId)?.inquiryId === i.id).reduce((s, x) => s + x.revenue, 0));
      case "customers": return group(D.collection("customers"), (c) => c.country, (c) => sales.filter((x) => x.customerId === c.id).reduce((s, x) => s + x.revenue, 0));
      case "cancellations": return bookings.filter((b) => b.status === "Cancelled").map((b) => ({ id: b.id, BCN: b.bcn, Guest: b.customerName, Arrival: b.arrival, Cancelled: (b.cancelledAt || "").slice(0, 10), Rule: b.cancellationRule || "—", Charge: b.cancellationCharge || 0, Total: b.total }));
      case "payments": return D.collection("invoices").filter((i) => inR(i.issued || "")).map((i) => ({ id: i.id, Invoice: i.id, BCN: i.bcn, Guest: i.customerName, Issued: i.issued, Due: i.dueDate, Total: i.total, Paid: i.amountPaid, Balance: i.balance, Status: i.status }));
      case "margin": return group(sales, (x) => x.bcn, (x) => x.revenue, (x) => x.profit).map((g2) => { const rs = sales.filter((x) => x.bcn === g2.key); const net = rs.reduce((s, x) => s + x.net, 0); return { id: g2.key, BCN: g2.key, Guest: rs[0]?.customerName, bookingId: rs[0]?.bookingId, "Net cost": net, "Selling price": g2.value, Margin: g2.value - net, "Margin %": g2.value ? Math.round(((g2.value - net) / g2.value) * 100) : 0 }; });
      default: return [];
    }
  }
  const exportAll = () => U.exportCSV("prestige-report-" + tab + "-" + (P.from || "all"), reportRows(tab).map(({ id, bookingId, ...rest }) => rest));
  const actions = [
    g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: exportAll, children: "Excel" }),
    g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => window.print(), children: "Print / PDF" }),
  ];

  const body = () => {
    const rows = reportRows(tab);
    switch (tab) {
      case "sales": return g.jsx(SalesReport, { user, period, setPeriod });
      case "conversion":
        return g.jsx(U.Panel, { title: "Inquiry → booking conversion", subtitle: inquiries.length + " inquiries in " + P.label, actions, pad: false, children: g.jsx(U.DataTable, { pageSize: 14, rows, columns: [
            { key: "key", label: P.gran === "month" ? "Month" : "Day" },
            { key: "count", label: "Inquiries" },
            { key: "rate", label: "Converted", sortable: false, render: (x) => { const conv = inquiries.filter((i) => bucket(i.createdAt.slice(0, 10)) === x.key && i.status === "Converted").length; return g.jsx(U.Badge, { tone: "green", children: conv + " · " + (x.count ? Math.round((conv / x.count) * 100) : 0) + "%" }); } },
          ], onRowClick: () => drillTo("inquiries") }) });
      case "product": case "category": case "destination": case "supplier": case "staff": case "customers":
        return g.jsx(U.Panel, { title: REPORT_TABS.find((t) => t.id === tab)?.label + " · " + P.label, subtitle: "Calculated from confirmed booking items in the sales ledger", actions, pad: false, children: g.jsx(U.DataTable, { pageSize: 14, rows, columns: [
            { key: "key", label: tab === "category" ? "Category" : tab === "staff" ? "Sales staff" : tab === "customers" ? "Country" : tab === "supplier" ? "Supplier" : tab === "destination" ? "Destination" : "Product" },
            { key: "count", label: tab === "staff" ? "Inquiries" : tab === "customers" ? "Customers" : "Items sold" },
            { key: "value", label: tab === "supplier" ? "Net cost payable" : "Revenue", render: (x) => g.jsx("span", { className: "num text-gold-soft", children: D.money(x.value) }) },
            ...(["product", "category", "destination", "supplier"].includes(tab) ? [{ key: "margin", label: "Profit", render: (x) => g.jsx("span", { className: "num text-emerald-300", children: D.money(x.margin) }) }] : []),
          ], onRowClick: (x) => drillTo(tab === "product" ? "products" : tab === "supplier" ? "suppliers" : tab === "destination" ? "destinations" : tab === "customers" ? "customers" : tab === "category" ? "catalogue" : "inquiries", tab === "product" ? { q: x.key } : {}) }) });
      case "cancellations":
        return g.jsx(U.Panel, { title: "Cancellations & refunds · " + P.label, subtitle: rows.length + " cancelled bookings", actions, pad: false, children: g.jsx(U.DataTable, { pageSize: 12, rows, columns: [
            { key: "BCN", label: "BCN" }, { key: "Guest", label: "Guest" }, { key: "Arrival", label: "Arrival", render: (x) => D.fmtDate(x.Arrival) },
            { key: "Rule", label: "Rule applied" }, { key: "Charge", label: "Charge retained", render: (x) => g.jsx("span", { className: "num text-rose-300", children: D.money(x.Charge) }) },
            { key: "Total", label: "Booking value", render: (x) => D.money(x.Total) },
          ], onRowClick: () => drillTo("bookings", { status: "Cancelled" }) }) });
      case "payments":
        return g.jsx(U.Panel, { title: "Payment collection & outstanding balances · " + P.label, subtitle: "Invoices issued in the period", actions, pad: false, children: g.jsx(U.DataTable, { pageSize: 12, rows, columns: [
            { key: "Invoice", label: "Invoice" }, { key: "BCN", label: "BCN" }, { key: "Guest", label: "Guest" },
            { key: "Due", label: "Due", render: (x) => D.fmtDate(x.Due) },
            { key: "Total", label: "Total", render: (x) => D.money(x.Total) },
            { key: "Paid", label: "Paid", render: (x) => g.jsx("span", { className: "num text-emerald-300", children: D.money(x.Paid) }) },
            { key: "Balance", label: "Balance", render: (x) => g.jsx("span", { className: "num text-amber-300", children: D.money(x.Balance) }) },
            { key: "Status", label: "Status", render: (x) => g.jsx(U.Badge, { children: x.Status }) },
          ], onRowClick: (x) => drillTo("invoices", { q: x.Invoice }) }) });
      case "margin":
        return g.jsx(U.Panel, { title: "Profit, net cost, selling price & margin · " + P.label, subtitle: "Per booking, from booked items", actions, pad: false, children: g.jsx(U.DataTable, { pageSize: 12, rows, columns: [
            { key: "BCN", label: "BCN" }, { key: "Guest", label: "Guest" },
            { key: "Net cost", label: "Net cost", render: (x) => D.money(x["Net cost"]) },
            { key: "Selling price", label: "Selling (after discount)", render: (x) => D.money(x["Selling price"]) },
            { key: "Margin", label: "Profit", render: (x) => g.jsx("span", { className: "num text-emerald-300", children: D.money(x.Margin) }) },
            { key: "Margin %", label: "%", render: (x) => g.jsx(U.Badge, { tone: x["Margin %"] >= 20 ? "green" : "amber", children: x["Margin %"] + "%" }) },
          ], onRowClick: () => setTab("sales") }) });
      default: return null;
    }
  };

  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsxs(U.Panel, { pad: false, children: [
          g.jsx("div", { className: "border-b border-line px-5 py-4", children: g.jsx(U.Tabs, { tabs: REPORT_TABS, active: tab, onChange: setTab }) }),
          g.jsx("div", { className: "px-5 py-4", children: g.jsx(U.PeriodPicker, { period, onChange: setPeriod }) }),
        ] }),
      body(),
    ] });
}
