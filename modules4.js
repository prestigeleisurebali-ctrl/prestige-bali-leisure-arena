/* ==================================================================
   MODULES 4 — GUEST MOVEMENTS · SALES & REVENUE · DAY PLANNER
   Guest movements read the same booking records as the Booking
   Calendar. The sales report reads the same ledger as every chart.
   The day planner is shared by the Vacation Builder, Itinerary
   Management and the guest portal.
   ================================================================== */
import * as React from "react";
import * as jsxrt from "react/jsx-runtime";
import * as D from "./db.js";
import * as U from "./ui.js";
import { bridge, drillTo } from "./bridge.js";
import { BookingDrawer } from "./modules1.js";
import { AvailabilityBadge } from "./inventoryUI.js";
import { isPerPerson } from "./workflow.js";

const g = jsxrt;
const { useState, useMemo } = React;
const sel = "border border-ivory/20 bg-ink/40 px-3 py-2 text-[12px] text-ivory [color-scheme:dark]";

/* ======================== GUEST MOVEMENTS ========================= */
const VIEWS = {
  arrivals: { label: "Arrivals", title: "Arrival list", key: "arrivals", empty: "No confirmed arrivals on this date." },
  inhouse: { label: "In-house", title: "In-house guests", key: "inHouse", empty: "No confirmed guests in residence on this date." },
  departures: { label: "Departures", title: "Departure list", key: "departures", empty: "No confirmed departures on this date." },
};

export function GuestMovements({ user, params, view = "arrivals" }) {
  const data = U.useDB();
  const [date, setDate] = useState(params?.date || D.today());
  const [span, setSpan] = useState("week");
  const [hotel, setHotel] = useState("all");
  const [dest, setDest] = useState("all");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(null);
  const V = VIEWS[view];

  const m = useMemo(() => D.guestMovements(date), [data, date]);
  const enrich = (b) => ({ ...b, ...D.bookingOps(b, date), _b: b });
  const all = m[V.key].map(enrich);
  const hotels = [...new Set(all.map((r) => r.accommodation))].sort();
  const dests = [...new Set(all.flatMap((r) => r.accomLines.map((l) => l.product?.destination)).filter(Boolean))].sort();
  const rows = all.filter((r) =>
    (hotel === "all" || r.accommodation === hotel) &&
    (dest === "all" || r.accomLines.some((l) => l.product?.destination === dest)) &&
    (status === "all" || r.status === status || r.paymentStatus === status));

  const range = span === "week"
    ? { from: D.startOfWeek(date), to: D.addDays(D.startOfWeek(date), 6) }
    : { from: date.slice(0, 8) + "01", to: new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).toISOString().slice(0, 10) };
  const overview = useMemo(() => D.movementCounts(range.from, range.to), [data, range.from, range.to]);
  const pax = (list) => list.reduce((s, b) => s + (Number(b.guests) || 0), 0);
  const upcoming = useMemo(() => [1, 2, 3].flatMap((n) => D.guestMovements(D.addDays(date, n)).departures.map((b) => ({ ...b, ...D.bookingOps(b, D.addDays(date, n)), on: D.addDays(date, n) }))), [data, date]);

  const shift = (n) => setDate(D.addDays(date, n));
  const exportRows = () => rows.map((r) => ({
    Date: date, Guest: r.customerName, BCN: r.bcn, Country: r.customer?.country || "", Nationality: r.customer?.nationality || "",
    Adults: r.adults, Children: r.children, Accommodation: r.accommodation, "Check-in": r.arrival, "Check-out": r.departure, Nights: r.nights,
    Rooms: r.rooms ?? "", "Room details": r.roomDetails || "", Transport: r.transport.map((t) => t.name).join("; "), Pickup: r.pickup || "",
    "Arrival flight": r.flightNumber || "", Landing: r.landingTime || "", "Departure flight": r.departureFlight || "", "Departure time": r.departureTime || "",
    Services: r.services.map((x) => x.name).join("; "), "Special requests": r.specialRequests || "", Phone: r.customer?.phone || "", Email: r.customer?.email || "",
    "Booking status": r.status, "Payment status": r.paymentStatus,
  }));
  const exportPDF = () => U.printDoc(V.title + " " + date, `
    <div class="brand"><div><div class="m">${V.title}</div><h1>${D.fmtDate(date)}</h1></div><div class="m">${rows.length} bookings · ${pax(rows)} guests</div></div>
    <table><thead><tr><th>Guest / BCN</th><th>Pax</th><th>Accommodation</th><th>Stay</th><th>Transport & flight</th><th>Requests</th><th>Status</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><b>${r.customerName}</b><br/>${r.bcn}<br/><span style="color:#8a8377">${r.customer?.country || ""}</span></td>
      <td>${r.adults}A${r.children ? " · " + r.children + "C" : ""}</td>
      <td>${r.accommodation}${r.rooms ? "<br/>" + r.rooms + " room(s) " + (r.roomDetails || "") : ""}</td>
      <td>${D.fmtDate(r.arrival)} → ${D.fmtDate(r.departure)}<br/>${r.nights} nights${view === "inhouse" ? " · night " + r.night + ", " + r.remaining + " left" : ""}</td>
      <td>${r.transport.map((t) => t.name).join("<br/>") || "—"}${r.pickup ? "<br/>Pickup: " + r.pickup : ""}${r.flightNumber ? "<br/>Flight " + r.flightNumber + (r.landingTime ? " · lands " + r.landingTime : "") : ""}</td>
      <td>${r.specialRequests || "—"}${r.services.length ? "<br/>" + r.services.map((x) => x.name).join(", ") : ""}</td>
      <td>${r.status}<br/>${r.paymentStatus}</td></tr>`).join("")}
    </tbody></table><div class="foot">Prestige Bali Leisure · operations · printed ${D.fmtDateTime(Date.now())}</div>`);

  const flight = (r) => r.flightNumber ? g.jsxs("span", { children: [r.flightNumber, r.landingTime && g.jsxs("span", { className: "block text-ivory/50", children: ["lands ", r.landingTime] })] }) : g.jsx("span", { className: "text-ivory/35", children: "Not provided" });
  const paxCell = (r) => g.jsxs("span", { children: [r.adults, "A", r.children ? " · " + r.children + "C" : ""] });
  const guestCell = (r) => g.jsxs("span", { children: [g.jsx("span", { className: "block font-medium text-ivory", children: r.customerName }), g.jsx("span", { className: "block text-[11px] text-gold-soft", children: r.bcn })] });
  const list = (items) => items.length ? g.jsx("span", { children: items.map((x, i) => g.jsx("span", { className: "block", children: x.name || x }, i)) }) : g.jsx("span", { className: "text-ivory/35", children: "—" });

  const COLS = {
    arrivals: [
      { key: "arrival", label: "Arrival", render: (r) => D.fmtDate(r.arrival) },
      { key: "customerName", label: "Guest · BCN", render: guestCell },
      { key: "country", label: "Country / nationality", sortable: false, render: (r) => g.jsxs("span", { children: [r.customer?.country || "—", g.jsx("span", { className: "block text-ivory/50", children: r.customer?.nationality || "" })] }) },
      { key: "guests", label: "Pax", render: paxCell },
      { key: "accommodation", label: "Accommodation" },
      { key: "departure", label: "Check-in → out", render: (r) => D.fmtDate(r.arrival) + " → " + D.fmtDate(r.departure) },
      { key: "nights", label: "Nights" },
      { key: "rooms", label: "Rooms", render: (r) => (r.rooms ? r.rooms + (r.roomDetails ? " · " + r.roomDetails : "") : r.roomDetails || "—") },
      { key: "transport", label: "Transport / pickup", sortable: false, render: (r) => g.jsxs("span", { children: [list(r.transport), r.pickup && g.jsxs("span", { className: "block text-ivory/55", children: ["Pickup ", r.pickup] })] }) },
      { key: "flightNumber", label: "Flight", render: flight },
      { key: "specialRequests", label: "Requests & services", sortable: false, render: (r) => g.jsxs("span", { children: [r.specialRequests && g.jsx("span", { className: "block text-amber-200", children: r.specialRequests }), list(r.services)] }) },
      { key: "status", label: "Status", render: (r) => g.jsxs("span", { className: "flex flex-col gap-1", children: [g.jsx(U.Badge, { children: r.status }), g.jsx(U.Badge, { children: r.paymentStatus })] }) },
    ],
    inhouse: [
      { key: "customerName", label: "Guest · BCN", render: guestCell },
      { key: "accommodation", label: "Accommodation" },
      { key: "arrival", label: "Check-in", render: (r) => D.fmtDate(r.arrival) },
      { key: "departure", label: "Check-out", render: (r) => D.fmtDate(r.departure) },
      { key: "night", label: "Stay", render: (r) => "Night " + r.night + " of " + r.nights },
      { key: "remaining", label: "Nights left", render: (r) => g.jsx("span", { className: r.remaining <= 1 ? "text-amber-300" : "", children: r.remaining }) },
      { key: "guests", label: "Pax", render: paxCell },
      { key: "rooms", label: "Rooms", render: (r) => (r.rooms ? r.rooms + (r.roomDetails ? " · " + r.roomDetails : "") : r.roomDetails || "—") },
      { key: "contact", label: "Contact", sortable: false, render: (r) => g.jsxs("span", { children: [r.customer?.phone || "—", g.jsx("span", { className: "block text-ivory/50", children: r.customer?.email || "" })] }) },
      { key: "plan", label: "Today & services", sortable: false, render: (r) => r.todaysPlan.length ? list(r.todaysPlan) : list([...r.transport, ...r.services]) },
      { key: "opsNotes", label: "Arrangements & notes", sortable: false, render: (r) => [r.specialRequests, r.opsNotes].filter(Boolean).join(" · ") || g.jsx("span", { className: "text-ivory/35", children: "—" }) },
      { key: "status", label: "Status", render: (r) => g.jsx(U.Badge, { children: r.status }) },
    ],
    departures: [
      { key: "customerName", label: "Guest · BCN", render: guestCell },
      { key: "accommodation", label: "Accommodation" },
      { key: "departure", label: "Check-out", render: (r) => D.fmtDate(r.departure) },
      { key: "nights", label: "Nights" },
      { key: "guests", label: "Pax", render: paxCell },
      { key: "transport", label: "Transfer", sortable: false, render: (r) => list(r.transport) },
      { key: "departureFlight", label: "Departure flight", render: (r) => r.departureFlight ? r.departureFlight + (r.departureTime ? " · " + r.departureTime : "") : g.jsx("span", { className: "text-ivory/35", children: "Not provided" }) },
      { key: "balance", label: "Balance", render: (r) => g.jsx("span", { className: "num " + (r.balance > 0 ? "text-amber-300" : "text-emerald-300"), children: D.money(r.balance) }) },
      { key: "paymentStatus", label: "Payment", render: (r) => g.jsx(U.Badge, { children: r.paymentStatus }) },
    ],
  };

  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsx(U.Panel, { pad: false, children: g.jsxs("div", { className: "space-y-4 px-5 py-4", children: [
          g.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [
              g.jsx("div", { className: "flex flex-wrap gap-1", children: Object.entries(VIEWS).map(([k, v]) => g.jsx("button", {
                  onClick: () => drillTo(k, { date }),
                  className: U.cx("rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em]", k === view ? "border-gold bg-gold/15 text-gold-soft" : "border-ivory/20 text-ivory/60 hover:text-ivory"),
                  children: v.label + " · " + m[v.key].length,
                }, k)) }),
              g.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
                  g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => shift(-1), children: "←" }),
                  g.jsx("input", { type: "date", value: date, onChange: (e) => e.target.value && setDate(e.target.value), className: sel }),
                  g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => shift(1), children: "→" }),
                  g.jsx(U.Btn, { size: "sm", onClick: () => setDate(D.today()), children: "Today" }),
                ] }),
            ] }),
          g.jsxs("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-5", children: [
              statBox("Arrivals", m.arrivals.length, pax(m.arrivals) + " guests", () => drillTo("arrivals", { date })),
              statBox("In-house", m.inHouse.length, pax(m.inHouse) + " guests", () => drillTo("inhouse", { date })),
              statBox("Departures", m.departures.length, pax(m.departures) + " guests", () => drillTo("departures", { date })),
              statBox("Sleeping tonight", m.arrivals.length + m.inHouse.length, pax([...m.arrivals, ...m.inHouse]) + " guests on property"),
              statBox("Held back", m.heldBack.length, "Unpaid or cancelled — not operational"),
            ] }),
        ] }) }),

      g.jsx(U.Panel, { title: (span === "week" ? "Week" : "Month") + " overview", subtitle: "Arrivals · in-house · departures per day — click a day to open it", actions: [
          g.jsx(U.Tabs, { tabs: [{ id: "week", label: "Week" }, { id: "month", label: "Month" }], active: span, onChange: setSpan }),
        ], children: g.jsx("div", { className: U.cx("grid gap-2", span === "week" ? "grid-cols-2 sm:grid-cols-4 lg:grid-cols-7" : "grid-cols-4 sm:grid-cols-7"), children: overview.map((o) => g.jsxs("button", {
            onClick: () => setDate(o.date),
            className: U.cx("border p-2.5 text-left transition-colors", o.date === date ? "border-gold bg-gold/10" : "border-line hover:border-ivory/30", o.date === D.today() && o.date !== date && "border-gold/40"),
            children: [
              g.jsx("p", { className: "text-[10px] font-semibold uppercase tracking-[0.12em] text-ivory/50", children: new Date(o.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: span === "week" ? "short" : undefined }) }),
              g.jsxs("p", { className: "mt-1.5 flex flex-wrap gap-x-2 text-[11px]", children: [
                  g.jsxs("span", { className: o.arrivals ? "text-emerald-300" : "text-ivory/30", children: ["↘", o.arrivals] }),
                  g.jsxs("span", { className: o.inHouse ? "text-gold-soft" : "text-ivory/30", children: ["●", o.inHouse] }),
                  g.jsxs("span", { className: o.departures ? "text-sky-300" : "text-ivory/30", children: ["↗", o.departures] }),
                ] }),
            ],
          }, o.date)) }) }),

      g.jsx(U.Panel, { title: V.title + " · " + D.fmtDate(date), subtitle: "Confirmed stays only · click a guest for the full booking", pad: false, actions: [
          g.jsxs("select", { value: hotel, onChange: (e) => setHotel(e.target.value), className: sel, children: [g.jsx("option", { value: "all", children: "All accommodation" }), hotels.map((h) => g.jsx("option", { value: h, children: h }, h))] }),
          g.jsxs("select", { value: dest, onChange: (e) => setDest(e.target.value), className: sel, children: [g.jsx("option", { value: "all", children: "All destinations" }), dests.map((h) => g.jsx("option", { value: h, children: h }, h))] }),
          g.jsx("select", { value: status, onChange: (e) => setStatus(e.target.value), className: sel, children: ["all", "Confirmed", "Completed", "Paid in full", "Deposit paid", "Part paid"].map((x) => g.jsx("option", { value: x, children: x === "all" ? "All statuses" : x }, x)) }),
          D.can(user, "export", view) && g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => U.exportCSV(view + "-" + date, exportRows()), children: "Excel" }),
          D.can(user, "export", view) && g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: exportPDF, children: "PDF" }),
        ], children: g.jsx(U.DataTable, { pageSize: 15, rows, empty: V.empty, searchKeys: ["customerName", "bcn", "accommodation"], columns: COLS[view], onRowClick: (r) => setOpen(r._b) }) }),

      view === "inhouse" && g.jsx(U.Panel, { title: "Upcoming departures", subtitle: "Next three days", pad: false, children: g.jsx(U.DataTable, { searchable: false, pageSize: 8, rows: upcoming, empty: "No departures in the next three days.", columns: [
          { key: "on", label: "Check-out", render: (r) => D.fmtDate(r.on) },
          { key: "customerName", label: "Guest · BCN", render: guestCell },
          { key: "accommodation", label: "Accommodation" },
          { key: "transport", label: "Transfer", sortable: false, render: (r) => list(r.transport) },
          { key: "balance", label: "Balance", render: (r) => D.money(r.balance) },
        ], onRowClick: (r) => setOpen(D.collection("bookings").find((b) => b.id === r.id)) }) }),

      m.heldBack.length > 0 && g.jsx(U.Panel, { title: "Held back from operations", subtitle: "Bookings covering this date that are not confirmed operational stays", pad: false, children: g.jsx(U.DataTable, { searchable: false, pageSize: 6, rows: m.heldBack, columns: [
          { key: "bcn", label: "BCN" }, { key: "customerName", label: "Guest" },
          { key: "arrival", label: "Stay", render: (b) => D.fmtDate(b.arrival) + " → " + D.fmtDate(b.departure) },
          { key: "reason", label: "Reason", sortable: false, render: (b) => g.jsx(U.Badge, { tone: "red", children: D.heldBackReason(b) }) },
        ], onRowClick: setOpen }) }),

      open && g.jsx(BookingDrawer, { booking: D.collection("bookings").find((b) => b.id === open.id) || open, user, onClose: () => setOpen(null) }),
    ] });
}
function statBox(label, value, sub, onClick) {
  return g.jsxs("button", { onClick, className: U.cx("border border-line bg-ink/20 px-4 py-3 text-left", onClick ? "hover:border-gold/50" : "cursor-default"), children: [
      g.jsx("p", { className: "text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/45", children: label }),
      g.jsx("p", { className: "mt-1 font-display text-2xl font-semibold text-ivory", children: value }),
      g.jsx("p", { className: "text-[11px] text-ivory/50", children: sub }),
    ] }, label);
}

/* ========================= SALES & REVENUE ======================== */
export function SalesReport({ user, period, setPeriod }) {
  const data = U.useDB();
  const [metric, setMetric] = useState("revenue");
  const [open, setOpen] = useState(null);
  const P = D.periodOf(period);
  const L = useMemo(() => D.salesLedger({ from: P.from, to: P.to }), [data, P.from, P.to]);
  const prev = useMemo(() => D.salesLedger(P.prev), [data, P.prev.from, P.prev.to]);
  const series = useMemo(() => D.salesSeries(P.gran, P.from, P.to), [data, P.from, P.to, P.gran]);
  const years = useMemo(() => D.salesSeries("year", null, null), [data]);
  const T = L.totals, Q = prev.totals;
  const seeMargins = D.can(user, "view", "invoices") || user?.role === "super_admin" || user?.role === "admin";

  const byDay = useMemo(() => {
    const map = new Map();
    L.rows.forEach((r) => {
      const x = map.get(r.date) || { date: r.date, bookings: new Set(), guests: 0, revenue: 0, net: 0 };
      if (!x.bookings.has(r.bookingId)) { x.bookings.add(r.bookingId); x.guests += r.guests; }
      x.revenue += r.revenue; x.net += r.net;
      map.set(r.date, x);
    });
    L.payments.forEach((p) => { if (!map.has(p.date)) map.set(p.date, { date: p.date, bookings: new Set(), guests: 0, revenue: 0, net: 0 }); });
    return [...map.values()].map((x) => {
      const pays = L.payments.filter((p) => p.date === x.date);
      const collected = pays.filter((p) => p.status === "Cleared").reduce((s, p) => s + p.amount, 0) - pays.filter((p) => p.status === "Refunded").reduce((s, p) => s + p.amount, 0);
      return { ...x, id: x.date, bookingsN: x.bookings.size, profit: x.revenue - x.net, margin: x.revenue ? Math.round(((x.revenue - x.net) / x.revenue) * 1000) / 10 : 0, collected };
    }).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [L]);

  const card = (label, now, before, fmt = D.money, opts = {}) => g.jsxs("button", {
    onClick: opts.onClick, className: U.cx("border border-line bg-surface p-4 text-left", opts.onClick ? "hover:border-gold/50" : "cursor-default"),
    children: [
      g.jsx("p", { className: "text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/45", children: label }),
      g.jsx("p", { className: U.cx("mt-1.5 font-display text-[22px] font-semibold", opts.gold ? "text-gold-soft" : "text-ivory"), children: fmt(now) }),
      P.prev.from && g.jsxs("p", { className: "mt-1 flex items-center gap-2 text-[11px] text-ivory/45", children: [g.jsx(U.Delta, { now, before, invert: opts.invert }), "vs ", fmt(before)] }),
    ],
  }, label);

  const exportCSV = () => U.exportCSV("sales-" + (P.from || "all") + "_" + (P.to || ""), L.rows.map((r) => ({
    Date: r.date, Guest: r.customerName, BCN: r.bcn, Invoice: r.invoiceId, Type: r.type, Product: r.product, Category: r.category,
    Supplier: r.supplier, Destination: r.destination, Qty: r.qty, "Selling rate": r.sellRate, "Net rate": r.netRate,
    "Gross selling": r.gross, Discount: r.discount, "Selling revenue": r.revenue, "Net cost": r.net, Profit: r.profit,
    "Margin %": r.revenue ? Math.round((r.profit / r.revenue) * 1000) / 10 : 0,
  })));
  const exportPDF = () => U.printDoc("Sales report " + P.label, `
    <div class="brand"><div><div class="m">Sales & revenue report</div><h1>${P.label}</h1></div><div class="m">${P.from ? D.fmtDate(P.from) + " – " + D.fmtDate(P.to) : "All time"}</div></div>
    <div class="grid"><div>
      <div class="kv"><b>Selling revenue</b><span>${D.money(T.revenue)}</span></div><div class="kv"><b>Supplier cost</b><span>${D.money(T.net)}</span></div>
      <div class="kv"><b>Gross profit</b><span>${D.money(T.profit)} (${T.marginPct}%)</span></div><div class="kv"><b>Discounts</b><span>${D.money(T.discount)}</span></div></div><div>
      <div class="kv"><b>Bookings</b><span>${T.bookings} · ${T.guests} guests</span></div><div class="kv"><b>Booked value</b><span>${D.money(T.bookedValue)} incl. tax</span></div>
      <div class="kv"><b>Cash collected</b><span>${D.money(T.collected)}${T.refunds ? " (after " + D.money(T.refunds) + " refunds)" : ""}</span></div><div class="kv"><b>Outstanding</b><span>${D.money(T.outstanding)}</span></div></div></div>
    <table><thead><tr><th>Date</th><th>Guest / BCN</th><th>Invoice</th><th>Product</th><th>Category</th><th>Supplier</th><th class="r">Qty</th><th class="r">Sell</th><th class="r">Net</th><th class="r">Revenue</th><th class="r">Cost</th><th class="r">Profit</th></tr></thead><tbody>
    ${L.rows.map((r) => `<tr><td>${D.fmtDate(r.date)}</td><td>${r.customerName}<br/>${r.bcn}</td><td>${r.invoiceId}</td><td>${r.product}</td><td>${r.category}</td><td>${r.supplier}</td><td class="r num">${r.qty}</td><td class="r num">${D.money(r.sellRate)}</td><td class="r num">${D.money(r.netRate)}</td><td class="r num">${D.money(r.revenue)}</td><td class="r num">${D.money(r.net)}</td><td class="r num">${D.money(r.profit)}</td></tr>`).join("")}
    <tr class="grand"><td colspan="9">Totals</td><td class="r num">${D.money(T.revenue)}</td><td class="r num">${D.money(T.net)}</td><td class="r num">${D.money(T.profit)}</td></tr>
    </tbody></table><div class="foot">Revenue excludes tax, inquiries, unapproved quotations and cancelled bookings (cancellation charges are shown as their own line).</div>`);

  const link = (text, fn) => g.jsx("button", { onClick: (e) => { e.stopPropagation(); fn(); }, className: "text-left text-gold-soft hover:underline", children: text });
  const openBooking = (id) => setOpen(D.collection("bookings").find((b) => b.id === id));

  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsxs("div", { className: "grid gap-3 sm:grid-cols-2 xl:grid-cols-4", children: [
          card("Selling revenue", T.revenue, Q.revenue, D.money, { gold: true }),
          seeMargins && card("Supplier cost", T.net, Q.net, D.money, { invert: true }),
          seeMargins && card("Gross profit", T.profit, Q.profit, D.money, { onClick: () => setMetric("profit") }),
          seeMargins && card("Average margin", T.marginPct, Q.marginPct, (v) => v + "%"),
          card("Bookings", T.bookings, Q.bookings, (v) => String(v), { onClick: () => drillTo("bookings", {}) }),
          card("Guests", T.guests, Q.guests, (v) => String(v)),
          card("Cash collected", T.collected, Q.collected, D.money, { onClick: () => setMetric("collected") }),
          card("Outstanding", T.outstanding, Q.outstanding, D.money, { invert: true, onClick: () => drillTo("invoices", {}) }),
        ] }),
      g.jsxs("p", { className: "text-[11px] leading-relaxed text-ivory/45", children: [
          "Selling revenue is recognised per booked item on the confirmation date, after discounts and before tax. Booked value including tax: ", g.jsx("span", { className: "text-ivory/70", children: D.money(T.bookedValue) }),
          ". Cash collected is cleared payments by payment date, net of refunds", T.refunds ? " (" + D.money(T.refunds) + ")" : "", ". Inquiries, unapproved quotations and cancelled bookings are excluded",
          T.cancellationCharges ? "; retained cancellation charges of " + D.money(T.cancellationCharges) + " are included." : ".",
        ] }),

      g.jsx(U.Panel, { title: "Sales performance · " + P.label, subtitle: "Click a bar to open that " + (P.gran === "month" ? "month" : "day") + "'s transactions", actions: [
          g.jsx(U.Tabs, { tabs: [{ id: "revenue", label: "Revenue" }, ...(seeMargins ? [{ id: "profit", label: "Profit" }] : []), { id: "collected", label: "Cash collected" }, { id: "bookings", label: "Bookings" }], active: metric, onChange: setMetric }),
        ], children: series.length ? g.jsx(U.BarChart, { data: series.slice(-40), valueKey: metric, format: metric === "bookings" ? (v) => v + " bookings" : D.money, onBarClick: (b) => setPeriod(D.periodForBucket(b.key, b.gran)) }) : g.jsx("p", { className: "text-[13px] text-ivory/45", children: "No transactions in this period." }) }),

      g.jsx(U.Panel, { title: "Daily sales totals", subtitle: "Click a day to open its transactions", pad: false, children: g.jsx(U.DataTable, { searchable: false, pageSize: 10, rows: byDay, empty: "No sales or payments in this period.", columns: [
          { key: "date", label: "Date", render: (x) => D.fmtDate(x.date) },
          { key: "bookingsN", label: "Bookings" },
          { key: "guests", label: "Guests" },
          { key: "revenue", label: "Revenue", render: (x) => g.jsx("span", { className: "num text-gold-soft", children: D.money(x.revenue) }) },
          ...(seeMargins ? [
            { key: "net", label: "Supplier cost", render: (x) => g.jsx("span", { className: "num", children: D.money(x.net) }) },
            { key: "profit", label: "Profit", render: (x) => g.jsx("span", { className: "num text-emerald-300", children: D.money(x.profit) }) },
            { key: "margin", label: "Margin", render: (x) => x.revenue ? x.margin + "%" : "—" },
          ] : []),
          { key: "collected", label: "Collected", render: (x) => g.jsx("span", { className: "num", children: D.money(x.collected) }) },
        ], onRowClick: (x) => setPeriod({ mode: "day", anchor: x.date }) }) }),

      g.jsx(U.Panel, { title: "Sales transactions", subtitle: L.rows.length + " booked items · every guest, booking, invoice and product opens its record", pad: false, actions: [
          g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: exportCSV, children: "Excel" }),
          g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: exportPDF, children: "PDF" }),
        ], children: g.jsx(U.DataTable, { pageSize: 15, rows: L.rows, searchKeys: ["customerName", "bcn", "invoiceId", "product", "category", "supplier", "destination"],
          footer: g.jsxs("tr", { className: "border-t-2 border-gold/40 text-[13px]", children: [
              g.jsx("td", { colSpan: seeMargins ? 9 : 8, className: "px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/55", children: "Period totals" }),
              g.jsx("td", { className: "px-3 py-3 num font-semibold text-gold-soft", children: D.money(T.revenue) }),
              seeMargins && g.jsx("td", { className: "px-3 py-3 num font-semibold", children: D.money(T.net) }),
              seeMargins && g.jsx("td", { className: "px-3 py-3 num font-semibold text-emerald-300", children: D.money(T.profit) }),
            ] }),
          columns: [
            { key: "date", label: "Date", render: (r) => D.fmtDate(r.date) },
            { key: "customerName", label: "Guest", render: (r) => link(r.customerName, () => drillTo("customers", { q: r.customerName })) },
            { key: "bcn", label: "BCN", render: (r) => link(r.bcn, () => openBooking(r.bookingId)) },
            { key: "invoiceId", label: "Invoice", render: (r) => r.invoiceId ? link(r.invoiceId, () => drillTo("invoices", { q: r.invoiceId })) : "—" },
            { key: "product", label: "Product / service", render: (r) => r.slug ? link(r.product, () => drillTo("products", { q: r.product })) : g.jsx("span", { className: "text-rose-200", children: r.product }) },
            { key: "category", label: "Category" },
            { key: "supplier", label: "Supplier" },
            { key: "destination", label: "Destination" },
            { key: "qty", label: "Qty" },
            ...(seeMargins ? [
              { key: "sellRate", label: "Sell rate", render: (r) => D.money(r.sellRate) },
              { key: "netRate", label: "Net rate", render: (r) => D.money(r.netRate) },
            ] : []),
            { key: "revenue", label: "Revenue", render: (r) => g.jsxs("span", { className: "num text-gold-soft", children: [D.money(r.revenue), r.discount ? g.jsxs("span", { className: "block text-[10px] text-ivory/40", children: ["after −", D.money(r.discount)] }) : null] }) },
            ...(seeMargins ? [
              { key: "net", label: "Net cost", render: (r) => g.jsx("span", { className: "num", children: D.money(r.net) }) },
              { key: "profit", label: "Profit", render: (r) => g.jsxs("span", { className: "num text-emerald-300", children: [D.money(r.profit), g.jsx("span", { className: "block text-[10px] text-ivory/40", children: r.revenue ? Math.round((r.profit / r.revenue) * 100) + "%" : "" })] }) },
            ] : []),
          ],
          onRowClick: (r) => openBooking(r.bookingId) }) }),

      g.jsx(U.Panel, { title: "Payments collected", subtitle: "Cash movements in the period — separate from booked value", pad: false, children: g.jsx(U.DataTable, { pageSize: 8, rows: L.payments, empty: "No payments in this period.", columns: [
          { key: "date", label: "Date", render: (p) => D.fmtDate(p.date) },
          { key: "customerName", label: "Guest" },
          { key: "bcn", label: "BCN" },
          { key: "invoiceId", label: "Invoice" },
          { key: "method", label: "Method" },
          { key: "reference", label: "Reference" },
          { key: "status", label: "Status", render: (p) => g.jsx(U.Badge, { children: p.status }) },
          { key: "amount", label: "Amount", render: (p) => g.jsx("span", { className: "num " + (p.status === "Refunded" ? "text-rose-300" : "text-emerald-300"), children: (p.status === "Refunded" ? "−" : "") + D.money(p.amount) }) },
        ], onRowClick: (p) => drillTo("invoices", { q: p.invoiceId }) }) }),

      g.jsx(U.Panel, { title: "Historical comparison", subtitle: "Year on year, from the same ledger", pad: false, children: g.jsx(U.DataTable, { searchable: false, pageSize: 8, rows: [...years].reverse(), columns: [
          { key: "key", label: "Year" },
          { key: "bookings", label: "Bookings" },
          { key: "revenue", label: "Revenue", render: (y) => g.jsx("span", { className: "num text-gold-soft", children: D.money(y.revenue) }) },
          ...(seeMargins ? [{ key: "profit", label: "Profit", render: (y) => g.jsx("span", { className: "num text-emerald-300", children: D.money(y.profit) }) }] : []),
          { key: "collected", label: "Collected", render: (y) => D.money(y.collected) },
        ], onRowClick: (y) => setPeriod({ mode: "year", anchor: y.key + "-01-01" }) }) }),

      open && g.jsx(BookingDrawer, { booking: open, user, onClose: () => setOpen(null) }),
    ] });
}

/* =========================== DAY PLANNER ========================== */
/* item: { slug|null, name, categoryId, qty, unit, sell, net, time, duration, note, custom } */
export function DayPlanner({ days, setDays, mode = "staff", readOnly = false }) {
  const staff = mode === "staff";
  const total = days.reduce((s, d) => s + (d.items || []).reduce((t, i) => t + D.lineTotals(i).sell, 0), 0);
  const patchDay = (di, patch) => setDays(days.map((d, i) => (i === di ? { ...d, ...patch } : d)));
  const moveDay = (di, dir) => { const n = [...days]; const j = di + dir; if (j < 0 || j >= n.length) return; [n[di], n[j]] = [n[j], n[di]]; setDays(n); };
  const moveItem = (di, ii, dir) => { const items = [...days[di].items]; const j = ii + dir; if (j < 0 || j >= items.length) return; [items[ii], items[j]] = [items[j], items[ii]]; patchDay(di, { items }); };
  const toDay = (di, ii, target) => {
    if (target === di) return;
    const it = days[di].items[ii];
    setDays(days.map((d, i) => i === di ? { ...d, items: d.items.filter((_, k) => k !== ii) } : i === target ? { ...d, items: [...(d.items || []), it] } : d));
  };
  const addDay = () => setDays([...days, { date: days.length ? D.addDays(days[days.length - 1].date, 1) : D.addDays(D.today(), 30), title: "Day " + (days.length + 1), items: [] }]);

  return g.jsxs("div", { className: "space-y-4", children: [
      days.map((day, di) => g.jsx(PlannerDay, { key: di, day, di, days, staff, readOnly, patchDay, moveDay, moveItem, toDay, removeDay: () => setDays(days.filter((_, i) => i !== di)) }, di)),
      g.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 border border-dashed border-line px-4 py-3", children: [
          !readOnly ? g.jsx(U.Btn, { size: "sm", onClick: addDay, children: "+ Add day" }) : g.jsx("span", {}),
          g.jsxs("p", { className: "text-[13px] text-ivory/70", children: [days.length, " days · ", days.reduce((s, d) => s + (d.items || []).length, 0), " items · ", g.jsx("span", { className: "font-display text-lg text-gold-soft", children: D.money(total) }), g.jsx("span", { className: "text-[11px] text-ivory/40", children: " before tax" })] }),
        ] }),
    ] });
}

function PlannerDay({ day, di, days, staff, readOnly, patchDay, moveDay, moveItem, toDay, removeDay }) {
  const data = U.useDB();
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [pick, setPick] = useState("");
  const live = data.products.filter((p) => p.status === "live" && (staff || p.published !== false));
  const options = useMemo(() => live.filter((p) => (cat === "all" || p.categoryId === cat) && (!q || (p.name + " " + p.destination + " " + p.supplier).toLowerCase().includes(q.toLowerCase()))).slice(0, 250), [data, cat, q]);
  const items = day.items || [];
  const setItem = (ii, patch) => patchDay(di, { items: items.map((x, k) => (k === ii ? { ...x, ...patch } : x)) });
  const add = () => {
    const p = live.find((x) => x.slug === pick);
    if (!p) return;
    patchDay(di, { items: [...items, { slug: p.slug, name: p.name, categoryId: p.categoryId, supplier: p.supplier, qty: 1, unit: p.unit, sell: p.sellingRate, net: p.netRate, time: "", duration: "", note: "" }] });
    setPick("");
  };
  const addCustom = () => patchDay(di, { items: [...items, { slug: null, custom: true, name: staff ? "Custom arrangement" : "Special request", categoryId: "concierge", qty: 1, unit: "item", sell: 0, net: 0, time: "", duration: "", note: "" }] });
  const dayTotal = items.reduce((s, i) => s + D.lineTotals(i).sell, 0);
  const inp = "border border-ivory/20 bg-ink/40 px-2 py-1 text-[12px] text-ivory [color-scheme:dark]";
  const [swap, setSwap] = useState(null);
  const [swapCat, setSwapCat] = useState("same");
  const doSwap = (ii, slug) => {
    const p = live.find((x) => x.slug === slug);
    const old = items[ii];
    if (!p || !old) return;
    setItem(ii, { slug: p.slug, name: p.name, categoryId: p.categoryId, supplier: p.supplier, unit: p.unit, sell: p.sellingRate, net: p.netRate, poolId: undefined, replacedFrom: (old.replacedFrom ? old.replacedFrom + " → " : "") + old.name });
    setSwap(null);
  };

  return g.jsxs("div", { className: "border border-line bg-ink/20", children: [
      g.jsxs("div", { className: "flex flex-wrap items-center gap-2 border-b border-line px-4 py-3", children: [
          g.jsxs("span", { className: "font-lux text-[11px] tracking-[0.2em] text-gold-soft", children: ["DAY ", di + 1] }),
          g.jsx("input", { type: "date", value: day.date || "", disabled: readOnly, onChange: (e) => patchDay(di, { date: e.target.value }), className: inp }),
          (day.destination || day.transfer) && g.jsx("span", { className: "border border-gold/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-soft", children: day.transfer ? day.transfer.from + " → " + day.transfer.to : day.destination }),
          g.jsx("input", { value: day.title || "", disabled: readOnly, onChange: (e) => patchDay(di, { title: e.target.value }), placeholder: "Day title — e.g. Ubud experience", className: U.cx(inp, "min-w-[180px] flex-1 py-1.5 text-[13px]") }),
          g.jsx("span", { className: "num text-[12px] text-gold-soft", children: D.money(dayTotal) }),
          !readOnly && g.jsxs("span", { className: "flex gap-1", children: [
              g.jsx("button", { onClick: () => moveDay(di, -1), title: "Move day up", className: "px-1.5 text-ivory/50 hover:text-ivory", children: "↑" }),
              g.jsx("button", { onClick: () => moveDay(di, 1), title: "Move day down", className: "px-1.5 text-ivory/50 hover:text-ivory", children: "↓" }),
              days.length > 1 && g.jsx("button", { onClick: removeDay, className: "px-1.5 text-[11px] uppercase tracking-wide text-rose-300 hover:underline", children: "Remove day" }),
            ] }),
        ] }),
      g.jsxs("div", { className: "space-y-2 px-4 py-3", children: [
          !items.length && g.jsx("p", { className: "py-2 text-[12px] text-ivory/40", children: "No items yet — add transfers, activities, dining, spa or anything else below." }),
          items.map((it, ii) => g.jsxs("div", { className: "grid items-start gap-2 border border-line/70 bg-surface/60 p-2.5 text-[12px] md:grid-cols-[84px_70px_1fr_auto]", children: [
              g.jsx("input", { type: "time", value: it.time || "", disabled: readOnly, onChange: (e) => setItem(ii, { time: e.target.value }), className: inp, title: "Start time" }),
              g.jsx("input", { value: it.duration || "", disabled: readOnly, onChange: (e) => setItem(ii, { duration: e.target.value }), placeholder: "2h", className: inp, title: "Duration" }),
              g.jsxs("div", { className: "min-w-0 space-y-1", children: [
                  it.custom && !readOnly ? g.jsx("input", { value: it.name, onChange: (e) => setItem(ii, { name: e.target.value }), className: U.cx(inp, "w-full") }) : g.jsx("p", { className: "font-medium text-ivory", children: it.name }),
                  g.jsxs("p", { className: "text-[11px] text-ivory/45", children: [data.categories.find((c) => c.id === it.categoryId)?.name || (it.custom ? "Custom" : "—"), it.supplier && it.supplier !== "—" ? " · " + it.supplier : ""] }),
                  it.slug && !it.custom && g.jsx("div", { children: g.jsx(AvailabilityBadge, { slug: it.slug, date: day.date, qty: it.qty, poolId: it.poolId }) }),
                  g.jsx("input", { value: it.note || "", disabled: readOnly, onChange: (e) => setItem(ii, { note: e.target.value }), placeholder: staff ? "Operational notes" : "Notes for your concierge", className: U.cx(inp, "w-full text-[11px]") }),
                ] }),
              g.jsxs("div", { className: "flex flex-wrap items-center justify-end gap-1.5", children: [
                  it.participants !== undefined && g.jsxs("span", { className: "flex items-center gap-1 text-[10px] text-ivory/50", title: "Adults / children on this product", children: [
                      g.jsx("input", { type: "number", min: 0, value: it.adults ?? 0, disabled: readOnly, onChange: (e) => { const ad = Math.max(0, Number(e.target.value) || 0), n = Math.max(1, ad + (Number(it.children) || 0)); setItem(ii, { adults: ad, participants: n, ...(isPerPerson({ unit: it.unit }) ? { qty: n } : {}) }); }, className: U.cx(inp, "w-11") }), "A",
                      g.jsx("input", { type: "number", min: 0, value: it.children ?? 0, disabled: readOnly, onChange: (e) => { const ch = Math.max(0, Number(e.target.value) || 0), n = Math.max(1, (Number(it.adults) || 0) + ch); setItem(ii, { children: ch, participants: n, ...(isPerPerson({ unit: it.unit }) ? { qty: n } : {}) }); }, className: U.cx(inp, "w-11") }), "C",
                    ] }),
                  g.jsx("input", { type: "number", min: 1, value: it.qty, disabled: readOnly, onChange: (e) => setItem(ii, { qty: Math.max(1, Number(e.target.value) || 1) }), className: U.cx(inp, "w-14"), title: "Quantity" }),
                  staff && !readOnly ? g.jsx("input", { type: "number", value: it.sell, onChange: (e) => setItem(ii, { sell: Number(e.target.value) || 0 }), className: U.cx(inp, "w-20 text-right"), title: "Selling rate" })
                    : g.jsx("span", { className: "w-20 text-right text-ivory/60", children: it.custom && !it.sell ? "to quote" : D.money(it.sell) }),
                  g.jsx("span", { className: "num w-20 text-right text-gold-soft", children: D.money(D.lineTotals(it).sell) }),
                  !readOnly && g.jsxs("span", { className: "flex items-center gap-1", children: [
                      g.jsx("button", { onClick: () => moveItem(di, ii, -1), title: "Move up", className: "px-1 text-ivory/50 hover:text-ivory", children: "↑" }),
                      g.jsx("button", { onClick: () => moveItem(di, ii, 1), title: "Move down", className: "px-1 text-ivory/50 hover:text-ivory", children: "↓" }),
                      days.length > 1 && g.jsxs("select", { value: di, onChange: (e) => toDay(di, ii, Number(e.target.value)), title: "Move to another day", className: U.cx(inp, "w-[74px] px-1"), children: days.map((_, k) => g.jsx("option", { value: k, children: "Day " + (k + 1) }, k)) }),
                      !it.custom && g.jsx("button", { onClick: () => setSwap(swap === ii ? null : ii), className: "px-1 text-[11px] uppercase text-gold-soft hover:underline", title: "Replace this product on this day only", children: swap === ii ? "Cancel" : "Change" }),
                      g.jsx("button", { onClick: () => patchDay(di, { items: items.filter((_, k) => k !== ii) }), className: "px-1 text-[11px] uppercase text-rose-300 hover:underline", children: "Del" }),
                    ] }),
                ] }),
              swap === ii && g.jsxs("div", { className: "flex flex-wrap items-center gap-2 border-t border-line/60 pt-2 md:col-span-4", children: [
                  g.jsx("span", { className: "text-[10px] uppercase tracking-[0.14em] text-gold-soft", children: "Replace with" }),
                  g.jsxs("select", { value: swapCat, onChange: (e) => setSwapCat(e.target.value), className: U.cx(inp, "py-1.5"), children: [g.jsx("option", { value: "same", children: "Same category" }), g.jsx("option", { value: "all", children: "Any category" }), data.categories.map((c) => g.jsx("option", { value: c.id, children: c.name }, c.id))] }),
                  g.jsxs("select", { value: "", onChange: (e) => doSwap(ii, e.target.value), className: U.cx(inp, "min-w-[220px] flex-1 py-1.5"), children: [
                      g.jsx("option", { value: "", children: "Choose the replacement product…" }),
                      live.filter((x) => x.slug !== it.slug && (swapCat === "all" || (swapCat === "same" ? x.categoryId === it.categoryId : x.categoryId === swapCat))).slice(0, 300).map((x) => g.jsx("option", { value: x.slug, children: `${x.name} · ${x.destination} · ${D.money(x.sellingRate)}/${x.unit}` }, x.slug)),
                    ] }),
                  g.jsx("span", { className: "text-[10px] text-ivory/40", children: "Time, PAX, quantity and notes are kept" }),
                ] }),
              it.replacedFrom && g.jsxs("p", { className: "text-[10px] text-amber-200/80 md:col-span-4", children: ["Replaced: ", it.replacedFrom] }),
            ] }, ii)),
          !readOnly && g.jsxs("div", { className: "flex flex-wrap gap-2 pt-1", children: [
              g.jsxs("select", { value: cat, onChange: (e) => { setCat(e.target.value); setPick(""); }, className: U.cx(inp, "py-1.5"), children: [g.jsx("option", { value: "all", children: "All categories" }), data.categories.map((c) => g.jsx("option", { value: c.id, children: c.name }, c.id))] }),
              g.jsx("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search products…", className: U.cx(inp, "w-40 py-1.5") }),
              g.jsxs("select", { value: pick, onChange: (e) => setPick(e.target.value), className: U.cx(inp, "min-w-[200px] flex-1 py-1.5"), children: [
                  g.jsx("option", { value: "", children: options.length ? "Select from Product Master (" + options.length + ")…" : "No live products match" }),
                  options.map((p) => g.jsx("option", { value: p.slug, children: `${p.name} · ${p.destination} · ${D.money(p.sellingRate)}/${p.unit}` }, p.slug)),
                ] }),
              g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: add, disabled: !pick, children: "Add" }),
              g.jsx(U.Btn, { size: "sm", onClick: addCustom, children: staff ? "+ Custom activity" : "+ Special request" }),
            ] }),
        ] }),
    ] });
}

/* itinerary-style PDF for any day plan */
export function printDayPlan(title, meta, days, showPrices = true) {
  const total = days.reduce((s, d) => s + (d.items || []).reduce((t, i) => t + D.lineTotals(i).sell, 0), 0);
  U.printDoc(title, `
    <div class="brand"><div><div class="m">${meta.kind || "Vacation plan"}</div><h1>${title}</h1></div><div class="m">${meta.ref || ""}</div></div>
    <div class="grid"><div><div class="kv"><b>Guest</b><span>${meta.guest || "—"}</span></div><div class="kv"><b>Guests</b><span>${meta.guests || "—"}</span></div></div>
    <div><div class="kv"><b>From</b><span>${D.fmtDate(days[0]?.date)}</span></div><div class="kv"><b>To</b><span>${D.fmtDate(days[days.length - 1]?.date)}</span></div><div class="kv"><b>Days</b><span>${days.length}</span></div></div></div>
    ${days.map((d, i) => `<div class="eyebrow" style="margin-top:20px">Day ${i + 1} · ${D.fmtDate(d.date)} — ${d.title || ""}</div>
      <table><tbody>${(d.items || []).map((it) => `<tr><td style="width:62px">${it.time || ""}</td><td style="width:52px;color:#8a8377">${it.duration || ""}</td><td><b>${it.name}</b>${it.note ? `<br/><i style="color:#8a8377">${it.note}</i>` : ""}</td>${showPrices ? `<td class="r num" style="width:110px">${it.custom && !it.sell ? "to quote" : D.money(D.lineTotals(it).sell)}</td>` : ""}</tr>`).join("") || `<tr><td colspan="4" style="color:#8a8377">Free day</td></tr>`}</tbody></table>`).join("")}
    ${showPrices ? `<table class="tot"><tbody><tr class="grand"><td class="l">Indicative total before tax</td><td class="r num" style="width:150px">${D.money(total)}</td></tr></tbody></table>` : ""}
    <div class="note">Timings are confirmed with each supplier the day before. Your concierge desk is reachable 24/7.</div>
    <div class="foot">Prestige Bali Leisure</div>`);
}
export const flattenPlan = (days) => days.flatMap((d) => (d.items || []).map((i) => ({ date: d.date, to: i.to, units: i.units, poolId: i.poolId, slug: i.slug, name: i.name, qty: i.qty || 1, unit: i.unit, sell: Number(i.sell) || 0, net: Number(i.net) || 0, categoryId: i.categoryId, custom: !!i.custom })));
