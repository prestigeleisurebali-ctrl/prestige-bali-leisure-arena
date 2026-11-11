/* ==================================================================
   MODULES 2 — INQUIRIES · VACATION BUILDER · QUOTATIONS · BOOKINGS
               ITINERARIES · CUSTOMERS · INVOICES & PAYMENTS
   One continuous workflow. No record is created twice: the quotation
   becomes the booking, the booking becomes the invoice and the
   itinerary, and every screen reads the same central database.
   ================================================================== */
import * as React from "react";
import * as jsxrt from "react/jsx-runtime";
import * as D from "./db.js";
import * as U from "./ui.js";
import { bridge, drillTo } from "./bridge.js";
import { BookingDrawer, exportBookingPDF } from "./modules1.js";
import { DayPlanner, printDayPlan, flattenPlan } from "./modules4.js";
import * as INV from "./inventory.js";
import { QuoteInventory } from "./inventoryUI.js";
import * as W from "./workflow.js";

const g = jsxrt;
const We = React;
const { useState, useMemo } = React;

/* --------------------- shared line-item editor -------------------- */
function LinesEditor({ lines, setLines, showMargin = true }) {
  const data = U.useDB();
  const live = data.products.filter((p) => p.status === "live");
  const [pick, setPick] = useState("");
  const add = () => {
    const p = live.find((x) => x.slug === pick);
    if (!p) return;
    setLines([...lines, { slug: p.slug, name: p.name, qty: p.unit === "night" ? 7 : 1, unit: p.unit, sell: p.sellingRate, net: p.netRate, categoryId: p.categoryId }]);
    setPick("");
  };
  const totals = lines.map((l) => D.lineTotals(l));
  const sell = totals.reduce((s, t) => s + t.sell, 0);
  const net = totals.reduce((s, t) => s + t.net, 0);

  return g.jsxs("div", { className: "space-y-3", children: [
      g.jsxs("div", { className: "flex flex-wrap gap-2", children: [
          g.jsxs("select", { value: pick, onChange: (e) => setPick(e.target.value), className: "min-w-[240px] flex-1 border border-ivory/20 bg-ink/40 px-3 py-2 text-[13px] text-ivory", children: [
              g.jsx("option", { value: "", children: "Add a product from Product Master…" }),
              live.map((p) => g.jsx("option", { value: p.slug, children: `${p.name} · ${p.destination} · ${D.money(p.sellingRate)}/${p.unit}` }, p.slug)),
            ] }),
          g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: add, disabled: !pick, children: "Add line" }),
        ] }),
      g.jsx("table", { className: "w-full text-left text-[12px]", children: g.jsxs("tbody", { children: [
          g.jsx("tr", { children: ["Product", "Qty", "Unit", showMargin ? "Net" : "", "Selling", "Total", ""].filter(Boolean).map((h, i) => g.jsx("th", { className: U.cx("border-b border-line py-2 text-[9px] uppercase tracking-[0.14em] text-ivory/45", i >= 3 && "text-right"), children: h }, h)) }),
          lines.length ? lines.map((l, i) => { const t = totals[i]; return g.jsxs("tr", { children: [
              g.jsx("td", { className: "border-b border-line/50 py-2 pr-2 text-ivory/85", children: l.name }),
              g.jsx("td", { className: "border-b border-line/50 py-2", children: g.jsx("input", { type: "number", min: 1, value: l.qty, onChange: (e) => { const n = [...lines]; n[i] = { ...l, qty: Math.max(1, Number(e.target.value)) }; setLines(n); }, className: "w-16 border border-ivory/20 bg-ink/40 px-2 py-1 text-[12px] text-ivory" }) }),
              g.jsx("td", { className: "border-b border-line/50 py-2 text-ivory/50", children: l.unit }),
              showMargin && g.jsx("td", { className: "border-b border-line/50 py-2 text-right num text-ivory/60", children: D.money(t.unitNet) }),
              g.jsx("td", { className: "border-b border-line/50 py-2 text-right num", children: g.jsx("input", { type: "number", value: t.unit, onChange: (e) => { const n = [...lines]; n[i] = { ...l, sell: Number(e.target.value) }; setLines(n); }, className: "w-24 border border-ivory/20 bg-ink/40 px-2 py-1 text-right text-[12px] text-ivory" }) }),
              g.jsx("td", { className: "border-b border-line/50 py-2 text-right num text-gold-soft", children: D.money(t.sell) }),
              g.jsx("td", { className: "border-b border-line/50 py-2 text-right", children: g.jsx("button", { onClick: () => setLines(lines.filter((_, j) => j !== i)), className: "text-[11px] uppercase tracking-wide text-rose-300 hover:underline", children: "Del" }) }),
            ] }, i); }) : g.jsx("tr", { children: g.jsx("td", { colSpan: 7, className: "py-6 text-center text-ivory/40", children: "No lines yet." }) }),
        ] }) }),
      g.jsxs("div", { className: "flex flex-wrap justify-end gap-6 text-[12px]", children: [
          showMargin && g.jsxs("p", { className: "text-ivory/55", children: ["Net cost ", g.jsx("span", { className: "num text-ivory", children: D.money(net) })] }),
          g.jsxs("p", { className: "text-ivory/55", children: ["Selling ", g.jsx("span", { className: "num text-gold-soft", children: D.money(sell) })] }),
          showMargin && g.jsxs("p", { className: "text-ivory/55", children: ["Margin ", g.jsx("span", { className: "num text-emerald-300", children: D.money(sell - net) })] }),
        ] }),
    ] });
}

/* ============================= INQUIRIES ========================== */
export function Inquiries({ user, params }) {
  const data = U.useDB();
  const [status, setStatus] = useState(params?.status || "all");
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const list = D.collection("inquiries");
  const rows = status === "all" ? list : list.filter((i) => i.status === status);
  const can = (a) => D.can(user, a, "inquiries");

  const QuoteForm = ({ inquiry, onClose }) => {
    const t = D.today();
    const [form, setForm] = useState({
      title: "", arrival: inquiry.arrival, departure: inquiry.departure,
      nights: inquiry.nights, guests: inquiry.guests, lines: [],
      discountPct: 0, taxPct: data.settings.taxRate, validity: D.addDays(t, data.settings.quoteValidityDays),
      paymentTerms: `${data.settings.depositPct}% deposit on confirmation · balance ${data.settings.fullPaymentDaysBeforeArrival} days before arrival`,
    });
    const totals = D.quoteTotals(form);
    return g.jsx(U.Modal, { open: true, onClose, wide: true, title: "Quotation from " + inquiry.id,
      footer: [
        g.jsx(U.Btn, { onClick: onClose, children: "Cancel" }),
        g.jsx(U.Btn, { variant: "solid", disabled: !form.lines.length, onClick: () => {
            D.insert("quotations", {
              id: D.nextNumber("QUO-", "quoSeq"), inquiryId: inquiry.id, customerId: inquiry.customerId, customerName: inquiry.customerName,
              title: form.title || (form.lines[0]?.name + " · " + form.nights + " nights"),
              arrival: form.arrival, departure: form.departure, nights: D.daysBetween(form.arrival, form.departure), guests: form.guests,
              lines: form.lines, discountPct: form.discountPct, taxPct: form.taxPct,
              total: totals.total, depositDue: Math.round((totals.total * data.settings.depositPct) / 100),
              paymentTerms: form.paymentTerms, validity: form.validity,
              cancellationPolicy: "House cancellation schedule applies",
              status: "Draft", createdAt: new Date().toISOString(),
            }, user, { module: "quotations" });
            D.update("inquiries", inquiry.id, { status: "Quoted" }, user, { module: "inquiries" });
            onClose();
          }, children: "Create quotation" }),
      ],
      children: g.jsxs("div", { className: "space-y-4", children: [
          g.jsx(U.RecordForm, { value: form, onChange: setForm, fields: [
              { key: "title", label: "Trip title" },
              { key: "guests", label: "Guests", type: "number" },
              { key: "arrival", label: "Arrival", type: "date" },
              { key: "departure", label: "Departure", type: "date" },
              { key: "discountPct", label: "Discount %", type: "number" },
              { key: "validity", label: "Valid until", type: "date" },
            ] }),
          g.jsx(U.Field, { label: "Payment terms", value: form.paymentTerms, onChange: (v) => setForm({ ...form, paymentTerms: v }) }),
          g.jsx(LinesEditor, { lines: form.lines, setLines: (lines) => setForm({ ...form, lines }) }),
          g.jsxs("div", { className: "border border-line px-4 py-3 text-right text-[13px] text-ivory/70", children: [
              g.jsxs("p", { children: ["Selling ", g.jsx("span", { className: "num text-ivory", children: D.money(totals.sell) }), " · Discount ", D.money(totals.discount), " · Tax ", D.money(totals.tax)] }),
              g.jsxs("p", { className: "mt-1 font-display text-xl text-gold-soft", children: ["Total ", D.money(totals.total)] }),
              g.jsxs("p", { className: "text-[12px] text-ivory/50", children: ["Deposit due ", D.money(Math.round((totals.total * data.settings.depositPct) / 100))] }),
            ] }),
        ] }) });
  };

  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsx(U.Panel, { title: "Inquiries", subtitle: "The top of the booking workflow", pad: false, actions: [
          g.jsx("select", { value: status, onChange: (e) => setStatus(e.target.value), className: "border border-ivory/20 bg-ink/40 px-3 py-2 text-[12px] text-ivory", children: ["all", "New", "Contacted", "Quoted", "Converted", "Lost"].map((s) => g.jsx("option", { value: s, children: s === "all" ? "All statuses" : s }, s)) }),
          D.can(user, "add", "inquiries") && g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => setCreating(true), children: "New inquiry" }),
        ], children: g.jsx(U.DataTable, { pageSize: 12, rows, columns: [
            { key: "id", label: "Inquiry ID", render: (i) => g.jsxs("span", { children: [g.jsx("span", { className: "block font-medium text-gold-soft", children: i.id }), i.type === "vacation" && g.jsx("span", { className: "block text-[10px] uppercase tracking-wider text-emerald-300", children: "Itinerary · " + (i.tripId || "") })] }) },
            { key: "customerName", label: "Customer" },
            { key: "destination", label: "Destination" },
            { key: "channel", label: "Channel" },
            { key: "arrival", label: "Travel", render: (i) => D.fmtDate(i.arrival) + " → " + D.fmtDate(i.departure) },
            { key: "guests", label: "Pax" },
            { key: "createdAt", label: "Received", render: (i) => D.fmtDate(i.createdAt.slice(0, 10)) },
            { key: "status", label: "Status", render: (i) => g.jsx(U.Badge, { tone: i.type === "vacation" ? W.STAGE_TONE[i.stage] : undefined, children: i.type === "vacation" ? i.stage : i.status }) },
            { key: "act", label: "", sortable: false, render: (i) => g.jsx("span", { className: "text-[11px] uppercase tracking-wide text-gold-soft/70", children: i.type === "vacation" ? "Open itinerary →" : i.status === "Quoted" ? "Quote again →" : "Open →" }) },
          ], onRowClick: (i) => (i.type === "vacation" ? drillTo("requests", { id: i.id, stage: "all" }) : setEditing(i)) }) }),
      editing && g.jsxs(U.Modal, { open: true, onClose: () => setEditing(null), wide: true, title: editing.id + " · " + editing.customerName,
          footer: [
            can("edit") && g.jsx(U.Btn, { size: "sm", onClick: () => { const v = prompt("Update status", editing.status); if (v) { D.update("inquiries", editing.id, { status: v }, user, { module: "inquiries" }); setEditing({ ...editing, status: v }); } }, children: "Change status" }),
            D.can(user, "add", "builder") && g.jsx(U.Btn, { size: "sm", onClick: () => drillTo("builder", { inquiryId: editing.id }), children: "Plan day by day" }),
            g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => setEditing({ ...editing, _quote: true }), children: "Build quotation" }),
            g.jsx(U.Btn, { size: "sm", onClick: () => setEditing(null), children: "Close" }),
          ],
          children: g.jsxs("div", { className: "space-y-4", children: [
              g.jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [
                  g.jsxs("div", { className: "border border-line px-4 py-3 text-[13px]", children: [
                      g.jsx("p", { className: "eyebrow mb-1", children: "Customer" }),
                      g.jsx("p", { className: "text-ivory", children: editing.customerName }),
                      g.jsxs("button", { onClick: () => { drillTo("customers"); }, className: "text-[12px] text-gold-soft hover:underline", children: "Open customer record →" }),
                    ] }),
                  g.jsxs("div", { className: "border border-line px-4 py-3 text-[13px]", children: [
                      g.jsx("p", { className: "eyebrow mb-1", children: "Trip" }),
                      g.jsxs("p", { className: "text-ivory/80", children: [editing.destination, " · ", editing.guests, " guests · ", editing.nights, " nights"] }),
                      g.jsxs("p", { className: "text-ivory/60", children: [D.fmtDate(editing.arrival), " → ", D.fmtDate(editing.departure)] }),
                    ] }),
                ] }),
              g.jsxs("div", { children: [g.jsx("p", { className: "eyebrow mb-1", children: "Brief" }), g.jsx("p", { className: "text-[13px] leading-relaxed text-ivory/75", children: editing.brief })] }),
              g.jsxs("div", { children: [g.jsx("p", { className: "eyebrow mb-1", children: "Related quotations" }), g.jsx(U.DataTable, { searchable: false, pageSize: 5, rows: D.collection("quotations").filter((q) => q.inquiryId === editing.id), columns: [
                    { key: "id", label: "Quote" }, { key: "title", label: "Title" },
                    { key: "total", label: "Total", render: (q) => D.money(q.total) },
                    { key: "status", label: "Status", render: (q) => g.jsx(U.Badge, { children: q.status }) },
                  ] })] }),
            ] }) }),
      editing?._quote && g.jsx(QuoteForm, { inquiry: editing, onClose: () => setEditing(null) }),
      creating && g.jsx(NewInquiry, { user, onClose: () => setCreating(false) }),
    ] });
}
function NewInquiry({ user, onClose }) {
  const data = U.useDB();
  const [form, setForm] = useState({
    customerId: data.customers[0]?.id || "", customerName: data.customers[0]?.name || "",
    channel: "Website", destination: "Uluwatu", guests: 2, nights: 7,
    arrival: D.addDays(D.today(), 45), departure: D.addDays(D.today(), 52),
    brief: "", status: "New", ownerId: data.users.find((u) => u.role === "sales")?.id || "USR-002",
  });
  return g.jsx(U.Modal, { open: true, onClose, wide: true, title: "New inquiry",
    footer: [g.jsx(U.Btn, { onClick: onClose, children: "Cancel" }),
      g.jsx(U.Btn, { variant: "solid", onClick: () => {
          const c = data.customers.find((x) => x.id === form.customerId);
          D.insert("inquiries", { id: D.nextNumber("INQ-", "inqSeq"), ...form, customerName: c?.name || form.customerName, createdAt: new Date().toISOString(), timeline: [] }, user, { module: "inquiries" });
          onClose();
        }, children: "Save inquiry" })],
    children: g.jsx(U.RecordForm, { value: form, onChange: (f) => setForm({ ...f, ...f.customerId ? { customerName: data.customers.find((c) => c.id === f.customerId)?.name } : {} }), fields: [
        { key: "customerId", label: "Customer", type: "select", options: data.customers.map((c) => ({ value: c.id, label: c.name })) },
        { key: "channel", label: "Channel", type: "select", options: ["Website", "WhatsApp", "Referral", "Instagram", "Repeat guest"] },
        { key: "destination", label: "Destination", type: "select", options: data.destinations.map((d) => d.name) },
        { key: "guests", label: "Guests", type: "number" },
        { key: "nights", label: "Nights", type: "number" },
        { key: "arrival", label: "Arrival", type: "date" },
        { key: "departure", label: "Departure", type: "date" },
        { key: "ownerId", label: "Assigned to", type: "select", options: data.users.filter((u) => ["sales", "admin", "super_admin"].includes(u.role)).map((u) => ({ value: u.id, label: u.name })) },
        { key: "brief", label: "Brief", type: "textarea", rows: 3 },
      ] }) });
}

/* ========================== VACATION BUILDER ====================== */
export function VacationBuilder({ user, params }) {
  const data = U.useDB();
  const blank = () => [{ date: D.addDays(D.today(), 30), title: "Arrival in Bali", items: [] }];
  const [planId, setPlanId] = useState(null);
  const [customer, setCustomer] = useState(data.customers[0]?.id || "");
  const [inquiryId, setInquiryId] = useState("");
  const [title, setTitle] = useState("");
  const [guests, setGuests] = useState(2);
  const [days, setDays] = useState(blank);
  const [msg, setMsg] = useState("");
  const canAdd = D.can(user, "add", "builder");

  const fromInquiry = (id) => {
    const inq = data.inquiries.find((i) => i.id === id);
    if (!inq) return;
    const n = Math.min(30, Math.max(1, D.daysBetween(inq.arrival, inq.departure) + 1));
    setPlanId(null); setInquiryId(id); setCustomer(inq.customerId); setGuests(inq.guests || 2);
    setTitle(inq.destination + " · " + (n - 1) + " nights");
    setDays(Array.from({ length: n }, (_, i) => ({ date: D.addDays(inq.arrival, i), title: i === 0 ? "Arrival in Bali" : i === n - 1 ? "Departure" : "Day " + (i + 1), items: [] })));
    setMsg("Started from " + id + (inq.brief ? " — “" + inq.brief + "”" : ""));
  };
  const load = (p) => {
    setPlanId(p.id); setCustomer(p.customerId); setInquiryId(p.inquiryId || ""); setTitle(p.title || ""); setGuests(p.guests || 2);
    const q = p.quoteId && data.quotations.find((x) => x.id === p.quoteId);
    setDays(p.dayPlan?.length ? JSON.parse(JSON.stringify(p.dayPlan)) : q?.dayPlan?.length ? JSON.parse(JSON.stringify(q.dayPlan)) : blank());
    setMsg("Loaded " + p.id + " · " + p.status);
  };
  React.useEffect(() => {
    if (params?.inquiryId) fromInquiry(params.inquiryId);
    else if (params?.planId) { const p = data.vacationPlans.find((x) => x.id === params.planId); if (p) load(p); }
  }, []);

  const flat = flattenPlan(days);
  const total = flat.reduce((s2, l) => s2 + D.lineTotals(l).sell, 0);
  const net = flat.reduce((s2, l) => s2 + D.lineTotals(l).net, 0);
  const cust = data.customers.find((c) => c.id === customer);

  const save = (status) => {
    const rec = { customerId: customer, customerName: cust?.name || "", inquiryId, title: title || "Vacation plan", guests, dayPlan: days, days: days.length, total, status, source: "staff", updatedAt: Date.now() };
    if (planId) { D.update("vacationPlans", planId, rec, user, { module: "builder" }); setMsg("Saved " + planId + " · " + status); return planId; }
    const r = D.insert("vacationPlans", { id: D.nextNumber("VPL-", "vplSeq", 4), ...rec }, user, { module: "builder" });
    setPlanId(r.id); setMsg("Created " + r.id + " · " + status); return r.id;
  };
  const toQuote = () => {
    const pid = save("Quoted");
    const disc = 0, tax = data.settings.taxRate;
    const t = D.quoteTotals({ lines: flat, discountPct: disc, taxPct: tax });
    const q = D.insert("quotations", {
      id: D.nextNumber("QUO-", "quoSeq"), inquiryId, customerId: customer, customerName: cust?.name || "",
      title: title || flat[0]?.name + " · " + days.length + " days",
      arrival: days[0]?.date, departure: days[days.length - 1]?.date, nights: Math.max(1, D.daysBetween(days[0]?.date, days[days.length - 1]?.date)),
      guests, lines: flat, dayPlan: days, discountPct: disc, taxPct: tax, total: t.total,
      depositDue: Math.round((t.total * data.settings.depositPct) / 100),
      paymentTerms: `${data.settings.depositPct}% deposit on confirmation · balance ${data.settings.fullPaymentDaysBeforeArrival} days before arrival`,
      validity: D.addDays(D.today(), data.settings.quoteValidityDays), cancellationPolicy: "House cancellation schedule applies",
      status: "Draft", createdAt: new Date().toISOString(),
    }, user, { module: "quotations" });
    D.update("vacationPlans", pid, { quoteId: q.id }, user, { module: "builder" });
    if (inquiryId) D.update("inquiries", inquiryId, { status: "Quoted" }, user, { module: "inquiries" });
    setMsg("Quotation " + q.id + " created from " + pid + " — open Quotations to approve and send.");
  };

  return g.jsxs("div", { className: "space-y-6", children: [
      g.jsxs("div", { className: "grid gap-6 xl:grid-cols-[1fr_330px]", children: [
          g.jsx(U.Panel, { title: "Vacation builder", subtitle: "Unlimited days · several products per day from every category · custom activities", children: g.jsx(DayPlanner, { days, setDays, mode: "staff", readOnly: !canAdd }) }),
          g.jsxs("div", { className: "space-y-6", children: [
              g.jsx(U.Panel, { title: planId ? "Plan " + planId : "New plan", children: g.jsxs("div", { className: "space-y-4", children: [
                  g.jsx(U.Field, { label: "Build from inquiry", type: "select", value: inquiryId, onChange: (v) => (v ? fromInquiry(v) : setInquiryId("")), options: [{ value: "", label: "— none —" }, ...data.inquiries.filter((i) => i.status !== "Lost").map((i) => ({ value: i.id, label: i.id + " · " + i.customerName + " · " + D.fmtDate(i.arrival) }))] }),
                  g.jsx(U.Field, { label: "Customer", type: "select", value: customer, onChange: setCustomer, options: data.customers.map((c) => ({ value: c.id, label: c.name })) }),
                  g.jsx(U.Field, { label: "Plan title", value: title, onChange: setTitle, placeholder: "Seven nights — Ubud & the Bukit" }),
                  g.jsx(U.Field, { label: "Guests", type: "number", value: guests, onChange: (v) => setGuests(Number(v) || 1) }),
                  g.jsxs("div", { className: "border border-line px-4 py-3 text-[13px] text-ivory/70", children: [
                      g.jsxs("p", { children: [days.length, " days · ", flat.length, " items"] }),
                      g.jsx("p", { className: "mt-1 font-display text-2xl text-gold-soft", children: D.money(total) }),
                      g.jsxs("p", { className: "text-[11px] text-ivory/45", children: ["Before ", data.settings.taxRate, "% tax · net ", D.money(net), " · margin ", D.money(total - net)] }),
                    ] }),
                  canAdd && g.jsxs("div", { className: "grid gap-2", children: [
                      g.jsx(U.Btn, { variant: "dark", onClick: () => save("Draft"), children: "Save draft" }),
                      g.jsx(U.Btn, { onClick: () => save("Shared"), disabled: !customer, children: "Share with guest portal" }),
                      g.jsx(U.Btn, { variant: "solid", onClick: toQuote, disabled: !flat.length, children: "Convert to quotation" }),
                      g.jsx(U.Btn, { variant: "subtle", onClick: () => printDayPlan(title || "Vacation plan", { kind: "Vacation plan", ref: planId || "", guest: cust?.name, guests }, days), children: "Download PDF" }),
                      g.jsx(U.Btn, { variant: "subtle", onClick: () => { setPlanId(null); setInquiryId(""); setTitle(""); setDays(blank()); setMsg(""); }, children: "Start a new plan" }),
                    ] }),
                  msg && g.jsx("p", { className: "border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-200", children: msg }),
                ] }) }),
            ] }),
        ] }),
      g.jsx(U.Panel, { title: "Vacation plans", subtitle: "Plans built by staff and plans submitted by guests from their portal — click to open", pad: false, children: g.jsx(U.DataTable, { pageSize: 8, rows: data.vacationPlans, empty: "No plans yet.", columns: [
          { key: "id", label: "Plan", render: (p) => g.jsx("span", { className: "text-gold-soft", children: p.id }) },
          { key: "title", label: "Title" },
          { key: "customerName", label: "Customer" },
          { key: "days", label: "Days", render: (p) => p.dayPlan?.length || p.days || "—" },
          { key: "source", label: "Built by", render: (p) => (p.source === "guest" ? g.jsx(U.Badge, { tone: "blue", children: "Guest" }) : "Staff") },
          { key: "quoteId", label: "Quotation", render: (p) => p.quoteId || "—" },
          { key: "status", label: "Status", render: (p) => g.jsx(U.Badge, { children: p.status }) },
          { key: "updatedAt", label: "Updated", render: (p) => (p.updatedAt ? D.fmtDateTime(p.updatedAt) : "—") },
        ], onRowClick: load }) }),
    ] });
}

/* ============================ QUOTATIONS ========================== */
export function Quotations({ user }) {
  const data = U.useDB();
  const [editing, setEditing] = useState(null);
  const list = D.collection("quotations");
  const can = (a) => D.can(user, a, "quotations");

  const Editor = () => {
    const [form, setForm] = useState({ ...editing });
    const t = D.quoteTotals(form);
    return g.jsx(U.Modal, { open: true, onClose: () => setEditing(null), wide: true, title: "Quotation " + editing.id,
      footer: [
        g.jsx(U.Btn, { size: "sm", onClick: () => printQuote(form, data), children: "Download PDF" }),
        g.jsx(U.Btn, { size: "sm", onClick: () => {
            const copy = D.insert("quotations", { ...form, id: D.nextNumber("QUO-", "quoSeq"), status: "Draft", createdAt: new Date().toISOString() }, user, { module: "quotations" });
            setEditing(copy);
          }, children: "Duplicate" }),
        can("approve") && g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => { const r = D.update("quotations", form.id, { ...form, status: "Approved" }, user, { module: "quotations" }); D.update("inquiries", form.inquiryId, { status: "Converted" }, user, { module: "inquiries" }).catch?.(() => {}); setEditing(r); }, children: "Approve" }),
        g.jsx(U.Btn, { size: "sm", variant: "dark", onClick: () => { D.update("quotations", form.id, form, user, { module: "quotations" }); setEditing(null); }, children: "Save" }),
      ],
      children: g.jsxs("div", { className: "space-y-4", children: [
          g.jsx(U.RecordForm, { value: form, onChange: setForm, cols: 3, fields: [
              { key: "title", label: "Title" },
              { key: "customerName", label: "Customer" },
              { key: "status", label: "Status", type: "select", options: ["Draft", "Sent", "Approved", "Declined"] },
              { key: "arrival", label: "Arrival", type: "date" },
              { key: "departure", label: "Departure", type: "date" },
              { key: "guests", label: "Guests", type: "number" },
              { key: "discountPct", label: "Discount %", type: "number" },
              { key: "taxPct", label: "Tax %", type: "number" },
              { key: "validity", label: "Valid until", type: "date" },
            ] }),
          g.jsx(U.Field, { label: "Payment terms", value: form.paymentTerms, onChange: (v) => setForm({ ...form, paymentTerms: v }) }),
          g.jsx(U.Field, { label: "Cancellation policy", value: form.cancellationPolicy, onChange: (v) => setForm({ ...form, cancellationPolicy: v }) }),
          g.jsx(LinesEditor, { lines: form.lines || [], setLines: (lines) => setForm({ ...form, lines }) }),
          form.id && g.jsx(QuoteInventory, { quote: form, user }),
          g.jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [
              g.jsxs("div", { className: "border border-line px-4 py-3 text-[12px] text-ivory/65", children: [
                  g.jsx("p", { className: "eyebrow mb-2", children: "Internal — not shown to guest" }),
                  g.jsxs("p", { children: ["Net cost ", g.jsx("span", { className: "num text-ivory", children: D.money(t.net) })] }),
                  g.jsxs("p", { children: ["Margin ", g.jsx("span", { className: "num text-emerald-300", children: D.money(t.margin) }), " · ", t.sell ? Math.round((t.margin / t.sell) * 100) : 0, "%"] }),
                ] }),
              g.jsxs("div", { className: "border border-line px-4 py-3 text-right text-[13px]", children: [
                  g.jsxs("p", { className: "text-ivory/70", children: ["Selling ", g.jsx("span", { className: "num", children: D.money(t.sell) })] }),
                  g.jsxs("p", { className: "text-ivory/70", children: ["Discount ", g.jsx("span", { className: "num", children: D.money(t.discount) }), " · Tax ", g.jsx("span", { className: "num", children: D.money(t.tax) })] }),
                  g.jsxs("p", { className: "mt-1 font-display text-2xl text-gold-soft", children: [D.money(t.total)] }),
                ] }),
            ] }),
        ] }) });
  };

  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsx(U.Panel, { title: "Quotations", subtitle: "Only approved quotations with the deposit settled may become bookings", pad: false, children: g.jsx(U.DataTable, { pageSize: 12, rows: list, columns: [
            { key: "id", label: "Quote", render: (q) => g.jsx("span", { className: "font-medium text-gold-soft", children: q.id }) },
            { key: "customerName", label: "Customer" },
            { key: "title", label: "Trip" },
            { key: "arrival", label: "Travel", render: (q) => D.fmtDate(q.arrival) },
            { key: "total", label: "Total", render: (q) => g.jsx("span", { className: "num", children: D.money(q.total) }) },
            { key: "depositDue", label: "Deposit", render: (q) => D.money(q.depositDue) },
            { key: "validity", label: "Valid to", render: (q) => D.fmtDate(q.validity) },
            { key: "status", label: "Status", render: (q) => g.jsx(U.Badge, { children: q.status }) },
            { key: "conv", label: "Booking", sortable: false, render: (q) => { const b = D.collection("bookings").find((x) => x.quoteId === q.id); return b ? g.jsx(U.Badge, { tone: "green", children: b.bcn }) : g.jsx("span", { className: "text-[11px] uppercase text-ivory/40", children: "not converted" }); } },
          ], onRowClick: setEditing }) }),
      editing && g.jsx(Editor, {}),
    ] });
}

export function printQuote(q, data) {
  const t = D.quoteTotals(q);
  U.printDoc(q.id, `
    <div class="brand"><div><div class="m">Quotation ${q.id}</div><h1>${q.title || "Private journey"}</h1></div>
    <div class="m">Valid until ${D.fmtDate(q.validity)}</div></div>
    <div class="grid">
      <div><div class="kv"><b>Guest</b><span>${q.customerName}</span></div>
      <div class="kv"><b>Guests</b><span>${q.guests}</span></div></div>
      <div><div class="kv"><b>Arrival</b><span>${D.fmtDate(q.arrival)}</span></div>
      <div class="kv"><b>Departure</b><span>${D.fmtDate(q.departure)}</span></div>
      <div class="kv"><b>Nights</b><span>${q.nights}</span></div></div>
    </div>
    <div class="eyebrow">Accommodation, transfers, activities & dining</div>
    <table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">Amount</th></tr></thead>
    <tbody>${t.lines.map((l) => `<tr><td>${l.name}</td><td class="num r">${l.qty}</td><td class="r">${l.unit}</td><td class="num r">${D.money(l.sell)}</td></tr>`).join("")}</tbody></table>
    <table class="tot"><tbody>
      <tr><td class="l">Subtotal</td><td class="r num" style="width:150px">${D.money(t.sell)}</td></tr>
      ${t.discount ? `<tr><td class="l">Discount ${q.discountPct}%</td><td class="r num">− ${D.money(t.discount)}</td></tr>` : ""}
      <tr><td class="l">Tax ${q.taxPct}%</td><td class="r num">${D.money(t.tax)}</td></tr>
      <tr class="grand"><td class="l">Total</td><td class="r num">${D.money(t.total)}</td></tr>
      <tr><td class="l">Deposit required</td><td class="r num">${D.money(q.depositDue)}</td></tr>
    </tbody></table>
    <div class="note"><b>Payment terms</b> — ${q.paymentTerms}<br/><b>Cancellation</b> — ${q.cancellationPolicy}<br/><b>Validity</b> — this quotation is held until ${D.fmtDate(q.validity)}.</div>
    <div class="sig"><div>Prepared by Prestige Bali Leisure</div><div>Guest acceptance</div></div>
    <div class="foot">${data.settings.companyName} · ${data.cms.footer?.email || ""}</div>`);
}

/* ========================= CONFIRMED BOOKINGS ===================== */
export function Bookings({ user, params }) {
  const data = U.useDB();
  const [filter, setFilter] = useState(params?.status || "all");
  const [open, setOpen] = useState(null);
  const [converting, setConverting] = useState(null);
  const list = D.collection("bookings");
  const rows = filter === "all" ? list : list.filter((b) => b.status === filter);

  /* conversion rule: quotation approved AND deposit settled */
  const eligible = (q) => q && q.status === "Approved" && !D.collection("bookings").some((b) => b.quoteId === q.id);

  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsx(U.Panel, { title: "Confirmed bookings", subtitle: "Each booking carries a unique Booking Confirmation Number", pad: false, actions: [
          g.jsx("select", { value: filter, onChange: (e) => setFilter(e.target.value), className: "border border-ivory/20 bg-ink/40 px-3 py-2 text-[12px] text-ivory", children: ["all", "Confirmed", "Completed", "Cancelled"].map((s) => g.jsx("option", { value: s, children: s === "all" ? "All bookings" : s }, s)) }),
          g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => U.exportCSV("bookings", rows.map((b) => ({ BCN: b.bcn, Guest: b.customerName, Arrival: b.arrival, Departure: b.departure, Total: b.total, Paid: b.depositPaid, Balance: b.balance, Status: b.status, Payment: b.paymentStatus }))), children: "Export CSV" }),
        ], children: g.jsx(U.DataTable, { pageSize: 12, rows, columns: [
            { key: "bcn", label: "BCN", render: (b) => g.jsx("span", { className: "font-medium text-gold-soft", children: b.bcn }) },
            { key: "tripId", label: "Trip ID", render: (b) => b.tripId || "—" },
            { key: "customerName", label: "Guest" },
            { key: "title", label: "Trip" },
            { key: "arrival", label: "Arrival", render: (b) => D.fmtDate(b.arrival) },
            { key: "total", label: "Total", render: (b) => g.jsx("span", { className: "num", children: D.money(b.total) }) },
            { key: "balance", label: "Balance", render: (b) => g.jsx("span", { className: "num text-amber-300", children: D.money(b.balance) }) },
            { key: "paymentStatus", label: "Payment", render: (b) => g.jsx(U.Badge, { children: b.paymentStatus }) },
            { key: "supplierStatus", label: "Supplier", render: (b) => g.jsx(U.Badge, { children: b.supplierStatus }) },
            { key: "status", label: "Status", render: (b) => g.jsx(U.Badge, { children: b.status }) },
          ], onRowClick: setOpen }) }),

      g.jsx(U.Panel, { title: "Ready to convert", subtitle: "Approved quotations whose deposit has been received", pad: false, children: g.jsx(U.DataTable, { pageSize: 8, searchable: false,
          rows: D.collection("quotations").filter((q) => q.status === "Approved").map((q) => {
            const paid = D.collection("payments").filter((p) => p.quoteId === q.id).reduce((s, p) => s + p.amount, 0);
            const b = D.collection("bookings").find((x) => x.quoteId === q.id);
            return { ...q, paid, booking: b };
          }),
          columns: [
            { key: "id", label: "Quote", render: (q) => g.jsx("span", { className: "text-gold-soft", children: q.id }) },
            { key: "customerName", label: "Guest" },
            { key: "total", label: "Total", render: (q) => D.money(q.total) },
            { key: "paid", label: "Deposit received", render: (q) => g.jsx("span", { className: "num " + (q.paid >= q.depositDue ? "text-emerald-300" : "text-rose-300"), children: D.money(q.paid) }) },
            { key: "state", label: "Eligibility", sortable: false, render: (q) => q.booking ? g.jsx(U.Badge, { tone: "green", children: q.booking.bcn }) : q.paid >= q.depositDue ? g.jsx(U.Badge, { tone: "blue", children: "Ready" }) : g.jsx(U.Badge, { tone: "amber", children: "Awaiting deposit" }) },
            { key: "act", label: "", sortable: false, render: (q) => !q.booking && q.paid >= q.depositDue && D.can(user, "approve", "bookings") ? g.jsx("span", { className: "text-[11px] uppercase tracking-wide text-gold-soft", children: "Convert →" }) : "" },
          ],
          onRowClick: (q) => { if (!q.booking && q.paid >= q.depositDue && D.can(user, "approve", "bookings")) setConverting(q); else if (q.booking) setOpen(q.booking); } }) }),

      open && g.jsx(BookingDrawer, { booking: open, user, onClose: () => setOpen(null), onReschedule: D.can(user, "edit", "bookings") ? (arrival, departure) => {
          const q = D.quoteTotals(open);
          D.update("bookings", open.id, { arrival, departure, nights: D.daysBetween(arrival, departure), dueDate: D.addDays(arrival, -data.settings.fullPaymentDaysBeforeArrival) }, user, { module: "bookings" });
          setOpen({ ...open, arrival, departure });
        } : null,
        onCancel: D.can(user, "edit", "bookings") ? () => {
          const c = D.cancellationQuote(open);
          if (!confirm(`Cancel ${open.bcn}?\nRule: ${c.rule?.label || "none"}\nCharge: ${D.money(c.charge)}\nRefundable: ${D.money(c.refundable)}`)) return;
          D.update("bookings", open.id, { status: "Cancelled", cancelledAt: new Date().toISOString(), cancellationCharge: c.charge, cancellationRule: c.rule?.label || "" }, user, { module: "bookings" });
          D.update("invoices", D.collection("invoices").find((i) => i.bookingId === open.id)?.id, { status: "Cancelled", balance: 0, notes: "Cancelled · " + (c.rule?.label || "") }, user, { module: "invoices" });
          setOpen(null);
        } : null }),

      converting && g.jsx(ConvertModal, { quote: converting, user, onClose: () => setConverting(null) }),
    ] });
}

function ConvertModal({ quote, user, onClose }) {
  const data = U.useDB();
  const t = D.quoteTotals(quote);
  const create = () => {
    const bcn = D.nextNumber("BCN-", "bcnSeq", 5);
    const booking = D.insert("bookings", {
      bcn, quoteId: quote.id, inquiryId: quote.inquiryId, customerId: quote.customerId, customerName: quote.customerName,
      title: quote.title, arrival: quote.arrival, departure: quote.departure, nights: quote.nights, guests: quote.guests,
      lines: quote.lines, total: t.total, depositPaid: quote.depositDue, balance: t.total - quote.depositDue,
      discountPct: quote.discountPct || 0, ...D.OPS_DEFAULTS(quote.guests),
      dueDate: D.addDays(quote.arrival, -data.settings.fullPaymentDaysBeforeArrival),
      paymentStatus: "Deposit paid", supplierStatus: "Pending", status: "Confirmed",
      createdAt: new Date().toISOString(), cancelledAt: null, cancellationCharge: 0, cancellationRule: "",
    }, user, { module: "bookings" });
    const inv = D.insert("invoices", {
      id: D.nextNumber("INV-", "invSeq"), bcn, bookingId: booking.id, quoteId: quote.id,
      customerId: quote.customerId, customerName: quote.customerName, lines: quote.lines,
      total: t.total, depositDue: quote.depositDue, amountPaid: quote.depositDue, balance: t.total - quote.depositDue,
      issued: D.today(), dueDate: booking.dueDate, terms: `Full payment 30 days before arrival`, status: "Part paid", notes: "",
    }, user, { module: "invoices" });
    D.insert("payments", { invoiceId: inv.id, quoteId: quote.id, bcn, customerId: quote.customerId, customerName: quote.customerName, amount: quote.depositDue, method: "PayPal", reference: "TXN-" + Math.floor(Math.random() * 900000 + 100000), date: D.today(), status: "Cleared", recordedBy: user?.id }, user, { module: "payments" });
    D.update("quotations", quote.id, { status: "Approved" }, user, { module: "quotations" });
    onClose();
  };
  return g.jsx(U.Modal, { open: true, onClose, wide: true, title: "Convert " + quote.id + " into a confirmed booking",
    footer: [g.jsx(U.Btn, { onClick: onClose, children: "Not yet" }),
      g.jsx(U.Btn, { variant: "solid", onClick: create, children: "Confirm booking + issue invoice" })],
    children: g.jsxs("div", { className: "space-y-4 text-[13px] text-ivory/75", children: [
        g.jsxs("p", { children: ["A Booking Confirmation Number, an invoice and a payment record will be created for ", g.jsx("b", { className: "text-ivory", children: quote.customerName }), "."] }),
        g.jsxs("div", { className: "grid gap-3 sm:grid-cols-3", children: [
            g.jsxs("div", { className: "border border-line px-3 py-2", children: [g.jsx("p", { className: "eyebrow", children: "Total" }), g.jsx("p", { className: "num text-ivory", children: D.money(t.total) })] }),
            g.jsxs("div", { className: "border border-line px-3 py-2", children: [g.jsx("p", { className: "eyebrow", children: "Deposit" }), g.jsx("p", { className: "num text-emerald-300", children: D.money(quote.depositDue) })] }),
            g.jsxs("div", { className: "border border-line px-3 py-2", children: [g.jsx("p", { className: "eyebrow", children: "Balance due" }), g.jsx("p", { className: "num text-amber-300", children: D.fmtDate(D.addDays(quote.arrival, -data.settings.fullPaymentDaysBeforeArrival)) })] }),
          ] }),
        g.jsx(QuoteInventory, { quote, user }),
        g.jsx("p", { className: "text-[12px] text-ivory/50", children: "The itinerary is generated afterwards from the confirmed quotation in Itinerary Management." }),
      ] }) });
}

/* ======================== ITINERARY MANAGEMENT ==================== */
export function Itineraries({ user }) {
  const data = U.useDB();
  const [editing, setEditing] = useState(null);
  const [generating, setGenerating] = useState(false);
  const list = D.collection("itineraries");
  const candidates = D.collection("bookings").filter((b) => b.status === "Confirmed" && !list.some((i) => i.bookingId === b.id));

  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsx(U.Panel, { title: "Itinerary management", subtitle: "Generated from confirmed quotations and bookings only", pad: false, actions: [
          g.jsx(U.Btn, { size: "sm", variant: "solid", disabled: !candidates.length, onClick: () => setGenerating(true), children: "Generate from confirmed booking" }),
        ], children: g.jsx(U.DataTable, { pageSize: 10, rows: list, columns: [
            { key: "id", label: "Itinerary", render: (i) => g.jsx("span", { className: "font-medium text-gold-soft", children: i.id }) },
            { key: "bcn", label: "BCN" },
            { key: "customerName", label: "Guest" },
            { key: "arrival", label: "Travel", render: (i) => D.fmtDate(i.arrival) + " → " + D.fmtDate(i.departure) },
            { key: "days", label: "Days", render: (i) => (i.days || []).length },
            { key: "version", label: "Version" },
            { key: "status", label: "Status", render: (i) => g.jsx(U.Badge, { children: i.status }) },
          ], onRowClick: setEditing }) }),
      g.jsx(U.Panel, { title: "Awaiting an itinerary", subtitle: "Confirmed bookings without one", pad: false, children: g.jsx(U.DataTable, { searchable: false, pageSize: 6, rows: candidates, empty: "Every confirmed booking has an itinerary.", columns: [
            { key: "bcn", label: "BCN" }, { key: "customerName", label: "Guest" },
            { key: "arrival", label: "Arrival", render: (b) => D.fmtDate(b.arrival) },
            { key: "nights", label: "Nights" },
          ], onRowClick: (b) => generateItinerary(b, user, setEditing) }) }),
      editing && g.jsx(ItineraryEditor, { itinerary: editing, user, onClose: () => setEditing(null) }),
      generating && g.jsx(U.Modal, { open: true, onClose: () => setGenerating(false), title: "Generate itinerary",
        footer: [g.jsx(U.Btn, { onClick: () => setGenerating(false), children: "Cancel" })],
        children: g.jsxs("div", { className: "space-y-3 text-[13px] text-ivory/75", children: [
            g.jsx("p", { children: "Only confirmed bookings are listed below. Select one to import its approved products into a day-by-day itinerary." }),
            g.jsx(U.DataTable, { searchable: false, pageSize: 6, rows: candidates, columns: [
                { key: "bcn", label: "BCN" }, { key: "customerName", label: "Guest" }, { key: "arrival", label: "Arrival", render: (b) => D.fmtDate(b.arrival) },
              ], onRowClick: (b) => { generateItinerary(b, user, setEditing); setGenerating(false); } }),
          ] }) }),
    ] });
}

function generateItinerary(booking, user, onDone) {
  const data = D.db();
  const nights = Math.max(1, booking.nights || D.daysBetween(booking.arrival, booking.departure) || 1);
  const quote = data.quotations.find((q) => q.id === booking.quoteId);
  const days = quote?.dayPlan?.length ? JSON.parse(JSON.stringify(quote.dayPlan)) : Array.from({ length: nights }, (_, d) => {
    const date = D.addDays(booking.arrival, d);
    const stay = (booking.lines || []).find((l) => D.productOf(l.slug)?.unit === "night") || (booking.lines || [])[0];
    const items = [stay && { slug: stay.slug, name: stay.name, qty: 1, unit: stay.unit, sell: stay.sell, time: d === 0 ? "14:00" : "—", note: d === 0 ? "Check-in" : "Overnight" }].filter(Boolean);
    if (d === 0) items.push(...(booking.lines || []).filter((l) => D.productOf(l.slug)?.categoryId === "transportation").map((l) => ({ slug: l.slug, name: l.name, qty: 1, unit: l.unit, sell: l.sell, time: "14:00", note: "Airport transfer" })));
    if (d === 1) items.push(...(booking.lines || []).filter((l) => D.productOf(l.slug)?.categoryId !== "accommodation" && D.productOf(l.slug)?.categoryId !== "transportation").map((l) => ({ slug: l.slug, name: l.name, qty: 1, unit: l.unit, sell: l.sell, time: "10:00", note: "" })));
    return { date, title: d === 0 ? "Arrival & settle in" : d === nights - 1 ? "Slow morning & departure" : "Day " + (d + 1), items };
  });
  const rec = D.insert("itineraries", {
    id: D.nextNumber("ITI-", "itiSeq"), bcn: booking.bcn, bookingId: booking.id, quoteId: booking.quoteId,
    customerId: booking.customerId, customerName: booking.customerName, title: booking.title,
    arrival: booking.arrival, departure: booking.departure, guests: booking.guests, days,
    status: "Draft", version: 1, updatedAt: Date.now(),
  }, user, { module: "itineraries" });
  onDone(rec);
}

function ItineraryEditor({ itinerary, user, onClose }) {
  const data = U.useDB();
  const [form, setForm] = useState(() => JSON.parse(JSON.stringify(itinerary)));
  const canEdit = D.can(user, "edit", "itineraries");
  const save = (extra = {}) => {
    const n = { ...form, ...extra, version: (form.version || 1) + 1, updatedAt: Date.now() };
    D.update("itineraries", form.id, n, user, { module: "itineraries" });
    setForm(n);
  };
  return g.jsx(U.Modal, { open: true, onClose, wide: true, title: "Itinerary " + form.id + " · " + form.bcn + " · v" + (form.version || 1),
    footer: [
      g.jsx(U.Btn, { size: "sm", onClick: () => printItinerary(form, data), children: "Download PDF" }),
      canEdit && g.jsx(U.Btn, { size: "sm", variant: "dark", onClick: () => save(), children: "Save" }),
      canEdit && g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => { save({ status: "Published" }); onClose(); }, children: "Publish to guest portal" }),
      g.jsx(U.Btn, { size: "sm", onClick: onClose, children: "Close" }),
    ],
    children: g.jsxs("div", { className: "space-y-4", children: [
        g.jsx(U.RecordForm, { value: form, onChange: setForm, cols: 3, fields: [
            { key: "title", label: "Title" }, { key: "status", label: "Status", type: "select", options: ["Draft", "Published"] }, { key: "guests", label: "Guests", type: "number" },
          ] }),
        g.jsx(DayPlanner, { days: form.days || [], setDays: (days) => setForm({ ...form, days }), mode: "staff", readOnly: !canEdit }),
      ] }) });
}

export function printItinerary(it, data) {
  printDayPlan(it.title, { kind: "Travel itinerary", ref: (it.bcn || "") + " · " + it.id + " · v" + (it.version || 1), guest: it.customerName, guests: it.guests }, it.days || [], false);
}

/* ============================ CUSTOMERS =========================== */
export function Customers({ user, params }) {
  const data = U.useDB();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const list = D.collection("customers");
  const can = (a) => D.can(user, a, "customers");

  const enriched = list.map((c) => {
    const bookings = D.collection("bookings").filter((b) => b.customerId === c.id);
    return { ...c, bookings: bookings.length, spend: bookings.filter((b) => b.status !== "Cancelled").reduce((s, b) => s + b.total, 0), repeat: bookings.length > 1 };
  });

  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsx(U.Panel, { title: "Customer database", subtitle: "Every customer from inquiries, quotations and bookings — one profile each", pad: false, actions: [
          can("add") && g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => setCreating(true), children: "New customer" }),
          g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => U.exportCSV("customers", enriched.map((c) => ({ Name: c.name, Email: c.email, Phone: c.phone, Country: c.country, Status: c.status, Bookings: c.bookings, Lifetime: c.spend }))), children: "Export CSV" }),
        ], children: g.jsx(U.DataTable, { pageSize: 12, rows: enriched, initialQuery: params?.q, columns: [
            { key: "name", label: "Customer", render: (c) => g.jsxs("span", { children: [g.jsx("span", { className: "font-medium text-ivory", children: c.name }), c.repeat && g.jsx("span", { className: "ml-2 text-[10px] uppercase tracking-wider text-emerald-300", children: "repeat" })] }) },
            { key: "email", label: "Email" },
            { key: "phone", label: "Phone / WhatsApp" },
            { key: "country", label: "Country" },
            { key: "bookings", label: "Bookings" },
            { key: "spend", label: "Lifetime value", render: (c) => g.jsx("span", { className: "num text-gold-soft", children: D.money(c.spend) }) },
            { key: "status", label: "Status", render: (c) => g.jsx(U.Badge, { children: c.status }) },
          ], onRowClick: setEditing }) }),
      editing && g.jsxs(U.Modal, { open: true, onClose: () => setEditing(null), wide: true, title: editing.name,
          footer: [can("edit") && g.jsx(U.Btn, { size: "sm", variant: "dark", onClick: () => { D.update("customers", editing.id, editing, user, { module: "customers" }); }, children: "Save changes" }), g.jsx(U.Btn, { size: "sm", onClick: () => setEditing(null), children: "Close" })],
          children: g.jsxs("div", { className: "space-y-4", children: [
              g.jsx(U.RecordForm, { value: editing, onChange: setEditing, fields: [
                  { key: "name", label: "Full name" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "whatsapp", label: "WhatsApp" },
                  { key: "country", label: "Country" }, { key: "nationality", label: "Nationality" },
                  { key: "status", label: "Status", type: "select", options: ["New", "Inquiry", "Quoted", "Confirmed", "Completed", "Cancelled"] },
                  { key: "notes", label: "Internal notes", type: "textarea", rows: 2 },
                ] }),
              g.jsxs("div", { children: [
                  g.jsx("p", { className: "eyebrow mb-2", children: "Travel & booking history" }),
                  g.jsx(U.DataTable, { searchable: false, pageSize: 5, rows: D.collection("bookings").filter((b) => b.customerId === editing.id), columns: [
                      { key: "bcn", label: "BCN" }, { key: "title", label: "Trip" },
                      { key: "arrival", label: "Arrival", render: (b) => D.fmtDate(b.arrival) },
                      { key: "total", label: "Total", render: (b) => D.money(b.total) },
                      { key: "status", label: "Status", render: (b) => g.jsx(U.Badge, { children: b.status }) },
                    ] }),
                ] }),
              g.jsxs("div", { children: [
                  g.jsx("p", { className: "eyebrow mb-2", children: "Payment history" }),
                  g.jsx(U.DataTable, { searchable: false, pageSize: 5, rows: D.collection("payments").filter((p) => p.customerId === editing.id), columns: [
                      { key: "date", label: "Date", render: (p) => D.fmtDate(p.date) }, { key: "method", label: "Method" },
                      { key: "reference", label: "Reference" }, { key: "amount", label: "Amount", render: (p) => g.jsx("span", { className: "num text-emerald-300", children: D.money(p.amount) }) },
                    ] }),
                ] }),
            ] }) }),
      creating && g.jsx(U.Modal, { open: true, onClose: () => setCreating(false), title: "New customer",
          footer: [g.jsx(U.Btn, { onClick: () => setCreating(false), children: "Cancel" }), g.jsx(U.Btn, { variant: "solid", onClick: () => {
              const dupe = D.collection("customers").find((c) => c.email.toLowerCase() === creating.email?.toLowerCase());
              if (dupe) { alert("A customer with this email already exists: " + dupe.id + " " + dupe.name + ". Open that profile instead of creating a duplicate."); return; }
              D.insert("customers", { ...creating, id: D.nextNumber("CUS-", "cusSeq", 4), createdAt: Date.now(), tags: [] }, user, { module: "customers" });
              setCreating(false);
            }, children: "Save customer" })],
          children: g.jsx(U.RecordForm, { value: creating, onChange: setCreating, fields: [
              { key: "name", label: "Full name" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "whatsapp", label: "WhatsApp" },
              { key: "country", label: "Country" }, { key: "nationality", label: "Nationality" },
              { key: "status", label: "Status", type: "select", options: ["New", "Inquiry", "Quoted", "Confirmed", "Completed", "Cancelled"] },
            ] }) }),
    ] });
}

/* ====================== INVOICES & PAYMENTS ======================= */
export function Invoices({ user, params }) {
  const data = U.useDB();
  const [open, setOpen] = useState(null);
  const [recording, setRecording] = useState(null);
  const list = D.collection("invoices");
  const can = (a) => D.can(user, a, "invoices");
  const totalOutstanding = list.reduce((s, i) => s + i.balance, 0);
  const overdue = list.filter((i) => i.balance > 0 && i.dueDate < D.today());

  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsxs("div", { className: "grid gap-4 sm:grid-cols-3", children: [
          g.jsx(U.Stat, { label: "Invoiced", value: D.money(list.reduce((s, i) => s + i.total, 0)), onClick: () => drillTo("reports", { tab: "payments" }) }),
          g.jsx(U.Stat, { label: "Collected", value: D.money(list.reduce((s, i) => s + i.amountPaid, 0)), tone: "gold", onClick: () => drillTo("reports", { tab: "sales" }) }),
          g.jsx(U.Stat, { label: "Outstanding", value: D.money(totalOutstanding), sub: overdue.length + " past due date", onClick: () => drillTo("reports", { tab: "payments" }) }),
        ] }),
      g.jsx(U.Panel, { title: "Invoices", subtitle: "Created automatically from confirmed bookings · full payment due 30 days before arrival", pad: false, children: g.jsx(U.DataTable, { pageSize: 12, rows: list, initialQuery: params?.q, columns: [
            { key: "id", label: "Invoice", render: (i) => g.jsx("span", { className: "font-medium text-gold-soft", children: i.id }) },
            { key: "bcn", label: "BCN" },
            { key: "customerName", label: "Guest" },
            { key: "issued", label: "Issued", render: (i) => D.fmtDate(i.issued) },
            { key: "dueDate", label: "Due", render: (i) => g.jsx("span", { className: i.balance > 0 && i.dueDate < D.today() ? "text-rose-300" : "", children: D.fmtDate(i.dueDate) }) },
            { key: "total", label: "Total", render: (i) => D.money(i.total) },
            { key: "amountPaid", label: "Paid", render: (i) => g.jsx("span", { className: "num text-emerald-300", children: D.money(i.amountPaid) }) },
            { key: "balance", label: "Balance", render: (i) => g.jsx("span", { className: "num text-amber-300", children: D.money(i.balance) }) },
            { key: "status", label: "Status", render: (i) => g.jsx(U.Badge, { children: i.status }) },
          ], onRowClick: setOpen }) }),
      g.jsx(U.Panel, { title: "Payment ledger", subtitle: "Every transaction recorded against an invoice", pad: false, actions: [
          g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => U.exportCSV("payments", D.collection("payments").map((p) => ({ Date: p.date, BCN: p.bcn, Guest: p.customerName, Method: p.method, Reference: p.reference, Amount: p.amount, Status: p.status }))), children: "Export CSV" }),
        ], children: g.jsx(U.DataTable, { pageSize: 10, rows: D.collection("payments"), columns: [
            { key: "date", label: "Date", render: (p) => D.fmtDate(p.date) },
            { key: "bcn", label: "BCN" },
            { key: "customerName", label: "Guest" },
            { key: "method", label: "Method" },
            { key: "reference", label: "Reference" },
            { key: "amount", label: "Amount", render: (p) => g.jsx("span", { className: "num text-emerald-300", children: D.money(p.amount) }) },
            { key: "status", label: "Status", render: (p) => g.jsx(U.Badge, { children: p.status }) },
          ], onRowClick: setRecording }) }),

      open && g.jsx(InvoiceDrawer, { invoice: open, user, onClose: () => setOpen(null), onRecord: () => { setRecording(open); }, canEdit: can("edit") }),
      recording && g.jsx(PaymentForm, { invoice: recording, user, onClose: () => setRecording(null) }),
    ] });
}

function InvoiceDrawer({ invoice, user, onClose, onRecord, canEdit }) {
  const data = U.useDB();
  const [agree, setAgree] = useState(false);
  const bookings = D.collection("bookings").find((b) => b.id === invoice.bookingId);
  const payments = D.collection("payments").filter((p) => p.invoiceId === invoice.id);
  const daysToArrival = bookings ? D.daysBetween(D.today(), bookings.arrival) : null;
  const needsApproval = daysToArrival !== null && daysToArrival < data.settings.fullPaymentDaysBeforeArrival && invoice.balance > 0;

  return g.jsx(U.Modal, { open: true, onClose, wide: true, title: invoice.id + " · " + invoice.bcn,
    footer: [
      g.jsx(U.Btn, { size: "sm", onClick: () => printInvoice(invoice, data), children: "Download PDF" }),
      invoice.bookingId && invoice.balance > 0 && D.can(user, "add", "emails") && g.jsx(U.Btn, { size: "sm", onClick: () => { try { W.sendBalanceReminder(invoice.id, user); alert("Balance reminder sent to the guest."); } catch (e) { alert(e.message); } }, children: "Send balance reminder" }),
      canEdit && g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: onRecord, children: invoice.kind === "deposit" && !invoice.bookingId ? "Verify deposit" : "Record payment" }),
      g.jsx(U.Btn, { size: "sm", onClick: onClose, children: "Close" }),
    ],
    children: g.jsxs("div", { className: "space-y-4", children: [
        g.jsxs("div", { className: "grid gap-3 sm:grid-cols-4", children: [
            g.jsxs("div", { className: "border border-line px-3 py-2", children: [g.jsx("p", { className: "eyebrow", children: "Total" }), g.jsx("p", { className: "num text-ivory", children: D.money(invoice.total) })] }),
            g.jsxs("div", { className: "border border-line px-3 py-2", children: [g.jsx("p", { className: "eyebrow", children: "Paid" }), g.jsx("p", { className: "num text-emerald-300", children: D.money(invoice.amountPaid) })] }),
            g.jsxs("div", { className: "border border-line px-3 py-2", children: [g.jsx("p", { className: "eyebrow", children: "Balance" }), g.jsx("p", { className: "num text-amber-300", children: D.money(invoice.balance) })] }),
            g.jsxs("div", { className: "border border-line px-3 py-2", children: [g.jsx("p", { className: "eyebrow", children: "Due" }), g.jsx("p", { className: "text-ivory", children: D.fmtDate(invoice.dueDate) })] }),
          ] }),
        needsApproval && g.jsxs("div", { className: "border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200", children: [
            g.jsxs("p", { children: ["Arrival is in ", daysToArrival, " days — inside the ", data.settings.fullPaymentDaysBeforeArrival, "-day full-payment window."] }),
            g.jsx(U.Field, { label: "Administrator approves different payment terms", type: "checkbox", value: agree, onChange: setAgree, disabled: !D.can(user, "approve", "invoices") }),
            agree && g.jsx(U.Btn, { size: "sm", variant: "dark", onClick: () => { D.update("invoices", invoice.id, { terms: "Exception approved by " + (user?.name || "administrator"), notes: "Payment-term exception approved" }, user, { module: "invoices" }); }, children: "Save approved exception" }),
          ] }),
        g.jsxs("div", { children: [
            g.jsx("p", { className: "eyebrow mb-2", children: "Itemised services" }),
            g.jsx("table", { className: "w-full text-left text-[12px]", children: g.jsx("tbody", { children: (invoice.lines || []).map((l, i) => { const t = D.lineTotals(l); return g.jsxs("tr", { children: [
                    g.jsx("td", { className: "border-b border-line/50 py-2 text-ivory/80", children: l.name }),
                    g.jsx("td", { className: "border-b border-line/50 py-2 text-ivory/55", children: l.qty + " × " + l.unit }),
                    g.jsx("td", { className: "border-b border-line/50 py-2 text-right num text-ivory", children: D.money(t.sell) }),
                  ] }, i); }) }) }),
          ] }),
        g.jsxs("div", { children: [
            g.jsx("p", { className: "eyebrow mb-2", children: "Payment history" }),
            payments.length ? g.jsx(U.DataTable, { searchable: false, pageSize: 5, rows: payments, columns: [
                { key: "date", label: "Date", render: (p) => D.fmtDate(p.date) }, { key: "method", label: "Method" },
                { key: "reference", label: "Reference" }, { key: "amount", label: "Amount", render: (p) => g.jsx("span", { className: "num text-emerald-300", children: D.money(p.amount) }) },
              ], onRowClick: (p) => { if (D.can(user, "delete", "payments") && confirm("Delete payment " + p.reference + "? This is logged in the audit trail.")) D.remove("payments", p.id, user, { module: "payments" }); } }) : g.jsx("p", { className: "text-[12px] text-ivory/45", children: "No payments recorded." }),
          ] }),
        g.jsxs("p", { className: "text-[12px] text-ivory/50", children: ["Terms: ", invoice.terms, invoice.notes ? " · " + invoice.notes : ""] }),
      ] }) });
}

export function printInvoice(inv, data) {
  U.printDoc(inv.id, `
    <div class="brand"><div><div class="m">Invoice ${inv.id}</div><h1>${inv.customerName}</h1></div><div class="m">BCN ${inv.bcn}</div></div>
    <div class="grid"><div><div class="kv"><b>Issued</b><span>${D.fmtDate(inv.issued)}</span></div><div class="kv"><b>Due</b><span>${D.fmtDate(inv.dueDate)}</span></div></div>
    <div><div class="kv"><b>Terms</b><span>${inv.terms}</span></div><div class="kv"><b>Booking</b><span>${inv.bcn}</span></div></div></div>
    <div class="eyebrow">Services invoiced</div>
    <table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">Amount</th></tr></thead>
    <tbody>${(inv.lines || []).map((l) => { const t = D.lineTotals(l); return `<tr><td>${l.name}</td><td class="num r">${l.qty}</td><td class="r">${l.unit}</td><td class="num r">${D.money(t.sell)}</td></tr>`; }).join("")}</tbody></table>
    <table class="tot"><tbody>
      <tr><td class="l">Total</td><td class="r num" style="width:150px">${D.money(inv.total)}</td></tr>
      <tr><td class="l">Received</td><td class="r num">${D.money(inv.amountPaid)}</td></tr>
      <tr class="grand"><td class="l">Balance due</td><td class="r num">${D.money(inv.balance)}</td></tr>
    </tbody></table>
    <div class="note">Please quote the booking confirmation number ${inv.bcn} with your transfer. Official payment rail: ${data.cms.footer?.paypal || "PayPal"}.</div>
    <div class="foot">${data.settings.companyName} · ${data.cms.footer?.email || ""} · ${data.cms.footer?.phone || ""}</div>`);
}

function PaymentForm({ invoice, user, onClose }) {
  const data = U.useDB();
  const [form, setForm] = useState({ amount: invoice.balance, method: "Bank transfer", reference: "TXN-" + Math.floor(Math.random() * 900000 + 100000), date: D.today(), status: "Cleared" });
  return g.jsx(U.Modal, { open: true, onClose, title: "Record payment · " + invoice.id,
    footer: [g.jsx(U.Btn, { onClick: onClose, children: "Cancel" }),
      g.jsx(U.Btn, { variant: "solid", onClick: () => {
          /* deposit invoices confirm the booking through the workflow (BCN, booking, allocation) */
          if (invoice.kind === "deposit" && !invoice.bookingId) {
            try { const r = W.recordDeposit(invoice.id, form, user); alert(r.confirmed ? "Deposit verified — booking " + r.booking.bcn + " confirmed." : "Part payment recorded. The booking is confirmed once the full deposit is received."); onClose(); }
            catch (e) { alert(e.message); }
            return;
          }
          const bk = D.collection("bookings").find((x) => x.id === invoice.bookingId);
          if (bk && bk.paymentStatus === "Unpaid" && bk.status !== "Cancelled" && Number(form.amount) > 0) {
            const c = INV.checkBooking({ ...bk, paymentStatus: "Part paid" }, bk.id);
            if (c.length) { alert("Payment not posted — the inventory for this booking is no longer available:\n" + INV.describeConflicts(c) + "\n\nIncrease inventory or move the booking first."); return; }
          }
          D.insert("payments", { ...form, invoiceId: invoice.id, bcn: invoice.bcn, quoteId: invoice.quoteId, customerId: invoice.customerId, customerName: invoice.customerName, recordedBy: user?.id }, user, { module: "payments" });
          const paid = invoice.amountPaid + Number(form.amount);
          const balance = Math.max(0, invoice.total - paid);
          D.update("invoices", invoice.id, { amountPaid: paid, balance, status: balance === 0 ? "Paid" : paid > 0 ? "Part paid" : invoice.status }, user, { module: "invoices" });
          const b = D.collection("bookings").find((x) => x.id === invoice.bookingId);
          if (b) D.update("bookings", b.id, { depositPaid: paid, balance: Math.max(0, b.total - paid), paymentStatus: balance === 0 ? "Paid in full" : "Part paid" }, user, { module: "bookings" });
          onClose();
        }, children: "Post payment" })],
    children: g.jsx(U.RecordForm, { value: form, onChange: setForm, fields: [
        { key: "amount", label: "Amount", type: "number" },
        { key: "date", label: "Date", type: "date" },
        { key: "method", label: "Method", type: "select", options: ["Bank transfer", "PayPal", "Stripe card", "Virtual account", "Cash"] },
        { key: "reference", label: "Reference" },
        { key: "status", label: "Status", type: "select", options: ["Cleared", "Pending", "Refunded"] },
      ] }) });
}
