/* ==================================================================
   VACATION REQUESTS · EMAIL & NOTIFICATIONS — backend screens
   ================================================================== */
import * as React from "react";
import * as jsxrt from "react/jsx-runtime";
import * as D from "./db.js";
import * as I from "./inventory.js";
import * as W from "./workflow.js";
import * as U from "./ui.js";
import { drillTo } from "./bridge.js";
import { DayPlanner } from "./modules4.js";
import { printQuote, printInvoice } from "./modules2.js";
import { AvailabilityBadge } from "./inventoryUI.js";

const g = jsxrt;
const { useState, useMemo } = React;
const inp = "border border-ivory/20 bg-ink/40 px-3 py-2 text-[12px] text-ivory [color-scheme:dark]";
const kv = (k, v) => g.jsxs("p", { className: "flex justify-between gap-3 border-b border-line/60 py-1.5 text-[12px]", children: [g.jsx("span", { className: "text-ivory/45", children: k }), g.jsx("span", { className: "text-right text-ivory/85", children: v ?? "—" })] }, k);
const waLink = (phone) => "https://wa.me/" + String(phone || "").replace(/\D/g, "");

/* ========================= VACATION REQUESTS ====================== */
export function VacationRequests({ user, params }) {
  const data = U.useDB();
  const [stage, setStage] = useState(params?.stage || "open");
  const [open, setOpen] = useState(params?.id || null);
  const rows = data.inquiries.filter((i) => i.type === "vacation").filter((i) => stage === "all" || (stage === "open" ? !["Confirmed Booking", "Rejected"].includes(i.stage) : i.stage === stage));
  const count = (st) => data.inquiries.filter((i) => i.type === "vacation" && i.stage === st).length;
  const rec = open && data.inquiries.find((i) => i.id === open);
  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsx("div", { className: "grid gap-2 sm:grid-cols-3 xl:grid-cols-6", children: W.STAGES.map((st, i) => g.jsxs("button", { onClick: () => setStage(st), className: U.cx("border p-3 text-left transition-colors", stage === st ? "border-gold bg-gold/10" : "border-line bg-surface hover:border-gold/40"), children: [
          g.jsxs("p", { className: "text-[9px] font-semibold uppercase tracking-[0.16em] text-ivory/45", children: ["Stage ", i + 1] }),
          g.jsx("p", { className: "mt-1 text-[12px] font-medium text-ivory", children: st }),
          g.jsx("p", { className: "mt-1 font-display text-2xl text-gold-soft", children: count(st) }),
        ] }, st)) }),
      g.jsx(U.Panel, { title: "Itinerary inquiries", subtitle: "Itineraries submitted from the website vacation builder — also listed under Inquiries. One trip record from submission to confirmed booking.", pad: false, actions: [
          g.jsx("select", { value: stage, onChange: (e) => setStage(e.target.value), className: inp, children: [["open", "Open requests"], ["all", "All requests"], ...W.STAGES.map((s) => [s, s]), ["Rejected", "Rejected"]].map(([v, l]) => g.jsx("option", { value: v, children: l }, v)) }),
        ], children: g.jsx(U.DataTable, { pageSize: 12, rows, empty: "No vacation requests in this view.", searchKeys: ["id", "tripId", "requestId", "customerName", "destination", "stage"], columns: [
            { key: "id", label: "Inquiry ID", render: (i) => g.jsxs("span", { children: [g.jsx("span", { className: "block font-medium text-gold-soft", children: i.id }), i.tripId && g.jsx("span", { className: "block text-[10px] text-ivory/45", children: i.tripId })] }) },
            { key: "destinations", label: "Destinations", sortable: false, render: (i) => (i.destinations || []).map((l) => l.destination + " " + l.nights + "n").join(" → ") || i.destination },
            { key: "customerName", label: "Guest", render: (i) => g.jsxs("span", { children: [i.contact?.name || i.customerName, g.jsx("span", { className: "block text-[11px] text-ivory/45", children: i.contact?.country })] }) },
            { key: "arrival", label: "Travel", render: (i) => D.fmtDate(i.arrival) + " → " + D.fmtDate(i.departure) },
            { key: "guests", label: "Guests", render: (i) => i.adults + "A" + (i.children ? " · " + i.children + "C" : "") + (i.infants ? " · " + i.infants + "I" : "") },
            { key: "items", label: "Products", sortable: false, render: (i) => W.flatten(i.plan || []).filter((l) => !l.custom).length },
            { key: "estimate", label: "Estimate", sortable: false, render: (i) => g.jsx("span", { className: "num", children: D.money(i.estimate?.total) }) },
            { key: "submittedAt", label: "Submitted", render: (i) => (i.submittedAt ? D.fmtDateTime(i.submittedAt) : D.fmtDate(i.createdAt?.slice(0, 10))) },
            { key: "stage", label: "Stage", render: (i) => g.jsx(U.Badge, { tone: W.STAGE_TONE[i.stage], children: i.stage }) },
            { key: "bcn", label: "BCN", render: (i) => i.bcn || "—" },
          ], onRowClick: (i) => setOpen(i.id) }) }),
      rec && g.jsx(RequestDetail, { inq: rec, user, onClose: () => setOpen(null) }),
    ] });
}

function RequestDetail({ inq, user, onClose }) {
  const data = U.useDB();
  const [tab, setTab] = useState("workflow");
  const canEdit = D.can(user, "edit", "requests");
  const quote = inq.quoteId && data.quotations.find((q) => q.id === inq.quoteId);
  const invoice = data.invoices.find((i) => i.id === inq.invoiceId) || (quote && data.invoices.find((i) => i.quoteId === quote.id));
  const booking = inq.bookingId && data.bookings.find((b) => b.id === inq.bookingId);
  const emails = (data.emails || []).filter((e) => e.refs?.inquiryId === inq.id || (e.refs?.requestId && e.refs.requestId === inq.requestId));
  const TABS = [
    { id: "workflow", label: "Workflow" }, { id: "trip", label: "Trip & destinations" }, { id: "itinerary", label: "Working itinerary" }, { id: "original", label: "Guest-submitted original" },
    { id: "versions", label: "Versions (" + (inq.versions?.length || 0) + ")" }, { id: "notes", label: "Notes (" + (inq.notes?.length || 0) + ")" },
    { id: "emails", label: "Emails (" + emails.length + ")" }, { id: "history", label: "History" },
  ];
  return g.jsx(U.Modal, { open: true, onClose, wide: true, title: inq.id + (inq.tripId ? " · " + inq.tripId : "") + " · " + (inq.contact?.name || inq.customerName), footer: [g.jsx(U.Btn, { size: "sm", onClick: onClose, children: "Close" }, "c")], children: g.jsxs("div", { className: "space-y-4", children: [
      g.jsx("div", { className: "flex flex-wrap gap-1", children: [...W.STAGES, ...(inq.stage === "Rejected" ? ["Rejected"] : [])].map((st, i) => { const cur = W.STAGES.indexOf(inq.stage); const done = inq.stage !== "Rejected" && i <= cur; return g.jsx("span", { className: U.cx("px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]", st === inq.stage ? (st === "Rejected" ? "bg-rose-500/20 text-rose-200" : "bg-gold text-ink") : done ? "bg-emerald-500/15 text-emerald-200" : "bg-ivory/5 text-ivory/40"), children: (st === "Rejected" ? "" : i + 1 + ". ") + st }, st); }) }),
      g.jsx(U.Tabs, { tabs: TABS, active: tab, onChange: setTab }),
      tab === "workflow" && g.jsx(Workflow, { inq, quote, invoice, booking, user, canEdit }),
      tab === "trip" && g.jsx(TripPanel, { inq, user, canEdit }),
      tab === "itinerary" && g.jsx(WorkingItinerary, { inq, user, canEdit }),
      tab === "original" && g.jsx(Original, { inq }),
      tab === "versions" && g.jsx(U.DataTable, { searchable: false, pageSize: 8, rows: [...(inq.versions || [])].reverse().map((v) => ({ ...v, id: "v" + v.v })), columns: [
          { key: "v", label: "Version" }, { key: "label", label: "Label" }, { key: "by", label: "By" }, { key: "at", label: "Saved", render: (v) => D.fmtDateTime(v.at) },
          { key: "items", label: "Items", sortable: false, render: (v) => W.flatten(v.plan).length },
          { key: "total", label: "Selling", sortable: false, render: (v) => D.money(W.flatten(v.plan).reduce((s, l) => s + D.lineTotals(l).sell, 0)) },
          { key: "x", label: "", sortable: false, render: (v) => canEdit && v.v !== inq.versions.length ? g.jsx("button", { onClick: () => W.savePlan(inq.id, v.plan, user, "Restored version " + v.v), className: "text-[11px] uppercase text-gold-soft hover:underline", children: "Restore" }) : v.v === inq.versions.length ? g.jsx(U.Badge, { tone: "green", children: "current" }) : null },
        ] }),
      tab === "notes" && g.jsx(Notes, { inq, user, canEdit }),
      tab === "emails" && g.jsx(EmailTable, { rows: emails }),
      tab === "history" && g.jsx("div", { className: "space-y-2", children: [...(inq.history || [])].reverse().map((h, i) => g.jsxs("div", { className: "border-l-2 border-gold/50 pl-3 text-[12px]", children: [g.jsxs("p", { className: "text-ivory", children: [h.stage, g.jsxs("span", { className: "text-ivory/45", children: [" · ", D.fmtDateTime(h.at), " · ", h.by] })] }), h.note && g.jsx("p", { className: "text-ivory/60", children: h.note })] }, i)) }),
    ] }) });
}

function Workflow({ inq, quote, invoice, booking, user, canEdit }) {
  const data = U.useDB();
  const [disc, setDisc] = useState(0);
  const [pay, setPay] = useState({ amount: invoice?.depositDue || 0, method: "Bank transfer", reference: "", date: D.today() });
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  const run = (fn, ok) => { try { const r = fn(); setMsg(typeof ok === "function" ? ok(r) : ok); } catch (e) { setMsg("⚠ " + e.message); } };
  const canFinance = D.can(user, "edit", "invoices");
  const closed = ["Confirmed Booking", "Rejected"].includes(inq.stage);
  const t = quote ? D.quoteTotals(quote) : null;
  const provisionalPDF = () => U.printDoc(invoice.provisionalRef, `<div class="brand"><div><div class="m">Provisional booking confirmation</div><h1>${invoice.provisionalRef}</h1></div><div class="m">${inq.requestId} · ${quote.id}</div></div>
    <div class="grid"><div><div class="kv"><b>Guest</b><span>${inq.contact?.name}</span></div><div class="kv"><b>Guests</b><span>${inq.adults} adults${inq.children ? ", " + inq.children + " children" : ""}${inq.infants ? ", " + inq.infants + " infants" : ""}</span></div></div>
    <div><div class="kv"><b>Arrival</b><span>${D.fmtDate(quote.arrival)}</span></div><div class="kv"><b>Departure</b><span>${D.fmtDate(quote.departure)}</span></div></div></div>
    <table><thead><tr><th>Arrangement</th><th class="r">Qty</th><th class="r">Amount</th></tr></thead><tbody>${t.lines.map((l) => `<tr><td>${l.name}</td><td class="r num">${l.qty}</td><td class="r num">${D.money(l.sell)}</td></tr>`).join("")}</tbody></table>
    <table class="tot"><tbody><tr class="grand"><td class="l">Total</td><td class="r num" style="width:150px">${D.money(t.total)}</td></tr><tr><td class="l">Deposit to confirm (${invoice.id})</td><td class="r num">${D.money(invoice.depositDue)}</td></tr><tr><td class="l">Deposit due by</td><td class="r">${D.fmtDate(invoice.depositDueDate)}</td></tr></tbody></table>
    <div class="note"><b>Provisional.</b> Availability is held until the deposit due date. The official Booking Confirmation Number is issued once the deposit is received. Reference ${invoice.id} on payment.</div><div class="foot">Prestige Bali Leisure</div>`);

  return g.jsxs("div", { className: "grid gap-5 lg:grid-cols-[1fr_300px]", children: [
      g.jsxs("div", { className: "space-y-4", children: [
          msg && g.jsx("p", { className: U.cx("whitespace-pre-line border px-4 py-3 text-[12px]", msg.startsWith("⚠") ? "border-rose-400/40 bg-rose-500/10 text-rose-200" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"), children: msg }),
          inq.holdWarning && g.jsxs("p", { className: "border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200", children: ["Availability warning at submission: ", inq.holdWarning] }),

          step("1 · Itinerary submitted — review & check availability", ["New Inquiry", "Under Review"].includes(inq.stage), g.jsxs("div", { className: "flex flex-wrap gap-2", children: [
              canEdit && inq.stage === "New Inquiry" && g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => run(() => W.startReview(inq.id, user), "Marked under review · guest notified."), children: "Start review & notify guest" }),
              g.jsx("a", { href: "mailto:" + inq.contact?.email + "?subject=" + encodeURIComponent("Your Bali vacation " + inq.requestId), className: "inline-flex items-center rounded-full border border-ivory/25 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ivory/85 hover:border-ivory", children: "Email guest" }),
              inq.contact?.phone && g.jsx("a", { href: waLink(inq.contact.phone), target: "_blank", rel: "noreferrer", className: "inline-flex items-center rounded-full border border-ivory/25 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ivory/85 hover:border-ivory", children: "WhatsApp" }),
            ] })),

          step("2 · Send booking confirmation & invoice", ["New Inquiry", "Under Review", "Quotation Sent", "Quotation Approved"].includes(inq.stage) && !invoice, g.jsxs("div", { className: "space-y-3", children: [
              g.jsx("p", { className: "text-[12px] text-ivory/55", children: "Check availability, replace unavailable products and adjust selling prices in the Working itinerary tab. Then send the official booking confirmation with the deposit invoice — availability is re-verified and inventory is held until the deposit due date." }),
              canEdit && !closed && !invoice && g.jsxs("div", { className: "flex flex-wrap items-end gap-2", children: [
                  g.jsxs("label", { className: "text-[10px] uppercase tracking-[0.14em] text-ivory/50", children: ["Discount %", g.jsx("input", { type: "number", min: 0, max: 50, value: disc, onChange: (e) => setDisc(Number(e.target.value) || 0), className: U.cx(inp, "mt-1 block w-24") })] }),
                  g.jsx(U.Btn, { variant: "solid", onClick: () => run(() => W.sendConfirmationAndInvoice(inq.id, user, { discountPct: disc }), (inv2) => "Booking confirmation " + inv2.provisionalRef + " and deposit invoice " + inv2.id + " sent to " + inq.contact?.email + " · inventory held."), children: "Send booking confirmation & invoice" }),
                ] }),
              invoice && g.jsxs("p", { className: "text-[12px] text-emerald-300", children: ["Sent · invoice ", invoice.id, " · confirmation ", invoice.provisionalRef] }),
              g.jsx("p", { className: "pt-1 text-[10px] uppercase tracking-[0.14em] text-ivory/40", children: "Optional — send a quotation for the guest to approve first" }),
              canEdit && !closed && g.jsxs("div", { className: "flex flex-wrap items-end gap-2", children: [
                  g.jsxs("label", { className: "text-[10px] uppercase tracking-[0.14em] text-ivory/50", children: ["Discount %", g.jsx("input", { type: "number", min: 0, max: 50, value: disc, onChange: (e) => setDisc(Number(e.target.value) || 0), className: U.cx(inp, "mt-1 block w-24") })] }),
                  g.jsx(U.Btn, { size: "sm", variant: quote ? "ghost" : "solid", onClick: () => run(() => W.generateQuotation(inq.id, user, { discountPct: disc }), (q) => "Quotation " + q.id + " prepared · " + D.money(q.total) + "."), children: quote ? "Regenerate quotation" : "Generate quotation" }),
                  quote && quote.status !== "Approved" && g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => run(() => W.sendQuotation(quote.id, user), "Quotation " + quote.id + " sent to " + inq.contact?.email + "."), children: quote.status === "Sent" ? "Resend quotation" : "Send quotation to guest" }),
                  quote && g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => printQuote(quote, data), children: "Quotation PDF" }),
                ] }),
              quote && g.jsxs("div", { className: "grid gap-2 sm:grid-cols-4", children: [mini("Quotation", quote.id), mini("Status", quote.status), mini("Total", D.money(t.total)), mini("Margin", D.money(t.margin) + " · " + (t.sell ? Math.round((t.margin / t.sell) * 100) : 0) + "%")] }),
            ] })),

          step("Optional · Guest approval of a quotation", inq.stage === "Quotation Sent", quote ? g.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
              quote.status === "Approved" ? g.jsxs("span", { className: "text-[12px] text-emerald-300", children: ["Approved ", quote.approvedAt ? D.fmtDateTime(quote.approvedAt) : "", " · ", quote.approvedBy || ""] })
                : g.jsx("span", { className: "text-[12px] text-ivory/55", children: "The guest can approve in their account, or record approval received by email or WhatsApp." }),
              canEdit && quote.status === "Sent" && g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => run(() => W.approveQuotation(quote.id, user), "Customer approval recorded."), children: "Record customer approval" }),
            ] }) : g.jsx("p", { className: "text-[12px] text-ivory/40", children: "No quotation yet." })),

          step("Booking confirmation & deposit invoice", ["Quotation Approved", "Awaiting Deposit Payment"].includes(inq.stage), g.jsxs("div", { className: "space-y-3", children: [
              quote && g.jsx(QuoteInvSummary, { quote }),
              !invoice && canEdit && quote?.status === "Approved" && g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => run(() => W.issueDeposit(quote.id, user), (inv) => "Deposit invoice " + inv.id + " and provisional confirmation " + inv.provisionalRef + " issued · inventory held · guest emailed."), children: "Verify availability & issue deposit invoice" }),
              invoice && g.jsxs("div", { className: "space-y-2", children: [
                  g.jsxs("div", { className: "grid gap-2 sm:grid-cols-4", children: [mini("Invoice", invoice.id), mini("Provisional ref", invoice.provisionalRef || "—"), mini("Deposit due", D.money(invoice.depositDue) + " by " + D.fmtDate(invoice.depositDueDate)), mini("Paid", D.money(invoice.amountPaid))] }),
                  g.jsxs("div", { className: "flex flex-wrap gap-2", children: [
                      g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => printInvoice(invoice, data), children: "Invoice PDF" }),
                      invoice.provisionalRef && quote && g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: provisionalPDF, children: "Provisional confirmation PDF" }),
                    ] }),
                ] }),
            ] })),

          step("3 · Deposit received → confirmed booking", inq.stage === "Awaiting Deposit Payment", booking ? g.jsx(Confirmed, { inq, booking, invoice, user }) : invoice && !invoice.bookingId ? (canFinance ? g.jsxs("div", { className: "space-y-3", children: [
              g.jsx("p", { className: "text-[12px] text-ivory/55", children: "Record the payment once it is verified in PayPal or the bank. The BCN, booking, invoice update, itinerary and inventory allocation are created automatically — only when the full deposit is received." }),
              g.jsx(U.RecordForm, { value: pay, onChange: setPay, cols: 2, fields: [
                  { key: "amount", label: "Amount received", type: "number" }, { key: "date", label: "Payment date", type: "date" },
                  { key: "method", label: "Method", type: "select", options: ["Bank transfer", "PayPal", "Stripe card", "Virtual account", "Cash"] }, { key: "reference", label: "Transaction reference" },
                ] }),
              g.jsx(U.Btn, { variant: "solid", onClick: () => run(() => W.recordDeposit(invoice.id, pay, user), (r) => (r.confirmed ? "Deposit verified · booking " + r.booking.bcn + " confirmed and distributed." : "Part payment recorded — " + D.money(r.paid) + " of the " + D.money(invoice.depositDue) + " deposit.")), children: "Verify deposit & confirm booking" }),
            ] }) : g.jsx("p", { className: "text-[12px] text-ivory/50", children: "Finance verifies the deposit. Paid so far: " + D.money(invoice.amountPaid) + " of " + D.money(invoice.depositDue) + "." })) : g.jsx("p", { className: "text-[12px] text-ivory/40", children: "Issue the deposit invoice first." })),

          canEdit && !closed && g.jsxs("div", { className: "flex flex-wrap items-end gap-2 border-t border-line pt-4", children: [
              g.jsx("input", { value: reason, onChange: (e) => setReason(e.target.value), placeholder: "Reason (internal)", className: U.cx(inp, "min-w-[240px] flex-1") }),
              g.jsx(U.Btn, { size: "sm", variant: "danger", onClick: () => confirm("Reject " + inq.requestId + "? Any reserved inventory is released.") && run(() => W.rejectRequest(inq.id, reason, user), "Request rejected · holds released."), children: "Reject request" }),
            ] }),
        ] }),
      g.jsxs("div", { className: "space-y-3", children: [
          g.jsxs("div", { className: "border border-line p-4", children: [
              g.jsx("p", { className: "eyebrow mb-2", children: "Guest · " + inq.id }),
              kv("Name", inq.contact?.name), kv("Email", inq.contact?.email), kv("WhatsApp", inq.contact?.phone), kv("Country", inq.contact?.country),
              g.jsx("button", { onClick: () => drillTo("customers", { q: inq.contact?.email }), className: "mt-2 text-[11px] uppercase tracking-wide text-gold-soft hover:underline", children: "Customer profile →" }),
            ] }),
          g.jsxs("div", { className: "border border-line p-4", children: [
              g.jsx("p", { className: "eyebrow mb-2", children: "Trip" }),
              kv("Arrival", D.fmtDate(inq.arrival)), kv("Departure", D.fmtDate(inq.departure)), kv("Nights", inq.nights),
              kv("Guests", inq.adults + " adults · " + (inq.children || 0) + " children · " + (inq.infants || 0) + " infants"),
              kv("Guest estimate", D.money(inq.estimate?.total)), kv("Submitted", inq.submittedAt ? D.fmtDateTime(inq.submittedAt) : "—"),
            ] }),
          inq.specialRequests && g.jsxs("div", { className: "border border-line p-4 text-[12px] text-ivory/80", children: [g.jsx("p", { className: "eyebrow mb-2", children: "Special requests" }), inq.specialRequests] }),
        ] }),
    ] });
}
const step = (title, active, body) => g.jsxs("section", { className: U.cx("border p-4", active ? "border-gold/60 bg-gold/[0.04]" : "border-line"), children: [g.jsx("p", { className: U.cx("mb-3 text-[11px] font-semibold uppercase tracking-[0.16em]", active ? "text-gold-soft" : "text-ivory/55"), children: title }), body] }, title);
const mini = (k, v) => g.jsxs("div", { className: "border border-line px-3 py-2", children: [g.jsx("p", { className: "text-[9px] uppercase tracking-[0.14em] text-ivory/45", children: k }), g.jsx("p", { className: "text-[13px] text-ivory", children: v })] }, k);

function QuoteInvSummary({ quote }) {
  U.useDB();
  const c = I.checkBooking({ ...quote, status: "Confirmed", paymentStatus: "Deposit paid" });
  return c.length ? g.jsx("p", { className: "whitespace-pre-line border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200", children: "Not available as quoted:\n" + I.describeConflicts(c) + "\nEdit the working itinerary and regenerate the quotation." })
    : g.jsx("p", { className: "text-[12px] text-emerald-300", children: "✓ Every managed product in the quotation is available. On-request products are confirmed with suppliers." });
}

function Confirmed({ inq, booking, invoice, user }) {
  const data = U.useDB();
  const iti = data.itineraries.find((i) => i.bookingId === booking.id);
  const [msg, setMsg] = useState("");
  const links = [["Confirmed bookings", "bookings"], ["Booking calendar", "calendar"], ["Arrival list", "arrivals", { date: booking.arrival }], ["Departure list", "departures", { date: booking.departure }], ["Invoices & payments", "invoices", { q: booking.bcn }], ["Itinerary", "itineraries"], ["Customer", "customers", { q: inq.contact?.email }], ["Sales report", "reports", { tab: "sales" }], ["Inventory", "inventory"]];
  return g.jsxs("div", { className: "space-y-3", children: [
      g.jsxs("div", { className: "grid gap-2 sm:grid-cols-4", children: [mini("BCN", booking.bcn), mini("Total", D.money(booking.total)), mini("Paid", D.money(booking.depositPaid)), mini("Balance", D.money(booking.balance) + " · due " + D.fmtDate(booking.dueDate))] }),
      g.jsxs("div", { children: [g.jsx("p", { className: "mb-1.5 text-[10px] uppercase tracking-[0.14em] text-ivory/45", children: "The same booking record appears in" }), g.jsx("div", { className: "flex flex-wrap gap-1.5", children: links.filter(([, m]) => D.can(user, "view", m)).map(([l, m, p]) => g.jsx("button", { onClick: () => drillTo(m, p || {}), className: "rounded-full border border-ivory/20 px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-ivory/75 hover:border-gold hover:text-gold-soft", children: l + " →" }, m)) })] }),
      g.jsxs("div", { className: "flex flex-wrap gap-2", children: [
          iti && D.can(user, "edit", "itineraries") && g.jsx(U.Btn, { size: "sm", onClick: () => { try { W.sendFinalItinerary(booking.id, user); setMsg("Final itinerary sent."); } catch (e) { setMsg("⚠ " + e.message); } }, children: iti.status === "Published" ? "Resend final itinerary" : "Publish & send final itinerary" }),
          invoice && invoice.balance > 0 && g.jsx(U.Btn, { size: "sm", onClick: () => { try { W.sendBalanceReminder(invoice.id, user); setMsg("Balance reminder sent."); } catch (e) { setMsg("⚠ " + e.message); } }, children: "Send balance reminder" }),
        ] }),
      msg && g.jsx("p", { className: "text-[12px] text-emerald-300", children: msg }),
    ] });
}

/* Customer → Request → Trip → Destinations → Days → Products → PAX → Pricing */
function TripPanel({ inq, user, canEdit }) {
  const data = U.useDB();
  const [legs, setLegs] = useState(() => JSON.parse(JSON.stringify(inq.destinations || [])));
  const plan = inq.plan || [];
  const flat = W.flatten(plan);
  const locked = ["Confirmed Booking", "Rejected"].includes(inq.stage);
  const sum = legs.reduce((t, l) => t + (Number(l.nights) || 0), 0);
  const save = () => {
    const w = W.legWindows({ arrival: inq.arrival }, legs).map((l, i) => ({ ...l, stays: legs[i].stays || [] }));
    const days = plan.map((d) => { const m = W.dayMeta({ arrival: inq.arrival, departure: inq.departure }, w).find((x) => x.date === d.date); return m ? { ...d, destination: m.destination, transfer: m.transfer } : d; });
    D.update("inquiries", inq.id, { destinations: w, plan: days, history: [...(inq.history || []), { at: Date.now(), stage: inq.stage, by: user?.name, note: "Destinations updated: " + w.map((l) => l.destination + " " + l.nights + "n").join(" → ") }] }, user, { module: "requests" });
  };
  return g.jsxs("div", { className: "space-y-4", children: [
      g.jsxs("div", { className: "grid gap-2 sm:grid-cols-5", children: [mini("Trip ID", inq.tripId || "—"), mini("Request", inq.requestId), mini("Customer", inq.contact?.name || inq.customerName), mini("PAX", (inq.adults + (inq.children || 0)) + (inq.infants ? " + " + inq.infants + " inf." : "")), mini("Duration", inq.nights + 1 + " days / " + inq.nights + " nights")] }),
      g.jsxs("div", { className: "border border-line", children: [
          g.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3", children: [g.jsx("p", { className: "eyebrow", children: "Destinations" }), g.jsxs("span", { className: U.cx("text-[11px]", sum === inq.nights ? "text-emerald-300" : "text-amber-300"), children: [sum, " of ", inq.nights, " nights"] })] }),
          g.jsx("div", { className: "divide-y divide-line/60", children: legs.map((l, i) => g.jsxs("div", { className: "grid items-center gap-3 px-4 py-3 text-[12px] md:grid-cols-[30px_1fr_90px_1.6fr_auto]", children: [
              g.jsx("span", { className: "font-display text-lg text-gold-soft", children: i + 1 }),
              canEdit && !locked ? g.jsx("input", { value: l.destination, onChange: (e) => setLegs(legs.map((x, k) => (k === i ? { ...x, destination: e.target.value } : x))), className: inp }) : g.jsx("span", { className: "text-ivory", children: l.destination }),
              canEdit && !locked ? g.jsx("input", { type: "number", min: 1, value: l.nights, onChange: (e) => setLegs(legs.map((x, k) => (k === i ? { ...x, nights: Math.max(1, Number(e.target.value) || 1) } : x))), className: inp }) : g.jsx("span", { children: l.nights + " nights" }),
              g.jsxs("span", { className: "text-ivory/70", children: [D.fmtDate(l.from), " → ", D.fmtDate(l.to), " · ", (l.stays || []).map((x) => x.name + " · " + x.rooms + " rm" + (x.guestsPerRoom ? " × " + x.guestsPerRoom : "")).join(", ") || g.jsx("span", { className: "text-amber-300", children: "no accommodation" })] }),
              canEdit && !locked ? g.jsxs("span", { className: "flex gap-2", children: [
                  g.jsx("button", { onClick: () => { if (i === 0) return; const n = [...legs]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setLegs(n); }, className: "text-ivory/50 hover:text-ivory", children: "↑" }),
                  g.jsx("button", { onClick: () => setLegs(legs.filter((_, k) => k !== i)), className: "text-[11px] uppercase text-rose-300", children: "Remove" }),
                ] }) : g.jsx("span", {}),
            ] }, l.id || i)) }),
          canEdit && !locked && g.jsxs("div", { className: "flex flex-wrap gap-2 border-t border-line px-4 py-3", children: [
              g.jsx(U.Btn, { size: "sm", onClick: () => setLegs([...legs, { id: "L" + Date.now(), destination: "", nights: Math.max(1, inq.nights - sum), stays: [] }]), children: "+ Destination" }),
              g.jsx(U.Btn, { size: "sm", variant: "dark", onClick: save, disabled: JSON.stringify(legs) === JSON.stringify(inq.destinations || []), children: "Save destinations" }),
              g.jsx("span", { className: "self-center text-[11px] text-ivory/45", children: "Change accommodation itself in the Working itinerary — destinations label each day." }),
            ] }),
        ] }),
      g.jsx(U.DataTable, { searchable: false, pageSize: 31, rows: plan.map((d, i) => ({ id: d.date, n: i + 1, ...d })), columns: [
          { key: "n", label: "Day" }, { key: "date", label: "Date", render: (d) => D.fmtDate(d.date) },
          { key: "destination", label: "Destination", render: (d) => (d.transfer ? d.transfer.from + " → " + d.transfer.to : d.destination || "—") },
          { key: "title", label: "Title" },
          { key: "items", label: "Products · PAX", sortable: false, render: (d) => (d.items || []).map((it) => it.name + (it.participants ? " (" + it.participants + ")" : it.units ? " (" + it.units + " rm)" : "")).join(" · ") || "—" },
          { key: "sell", label: "Selling", sortable: false, render: (d) => D.money((d.items || []).reduce((t, it) => t + D.lineTotals(it).sell, 0)) },
        ] }),
      g.jsxs("p", { className: "text-[11px] text-ivory/45", children: [flat.filter((l) => !l.custom).length, " products across ", plan.length, " days · Trip ", inq.tripId || "—", " carries through to the quotation, invoice, booking and itinerary."] }),
    ] });
}

function WorkingItinerary({ inq, user, canEdit }) {
  const data = U.useDB();
  const [plan, setPlan] = useState(() => JSON.parse(JSON.stringify(inq.plan || [])));
  const [label, setLabel] = useState("");
  const flat = W.flatten(plan);
  const sell = flat.reduce((s, l) => s + D.lineTotals(l).sell, 0), net = flat.reduce((s, l) => s + D.lineTotals(l).net, 0);
  const dirty = JSON.stringify(plan) !== JSON.stringify(inq.plan || []);
  const locked = ["Confirmed Booking", "Rejected"].includes(inq.stage);
  return g.jsxs("div", { className: "space-y-4", children: [
      g.jsxs("div", { className: "flex flex-wrap items-end justify-between gap-3", children: [
          g.jsxs("div", { className: "grid gap-2 sm:grid-cols-3", children: [mini("Selling", D.money(sell)), mini("Net cost", D.money(net)), mini("Margin", D.money(sell - net) + " · " + (sell ? Math.round(((sell - net) / sell) * 100) : 0) + "%")] }),
          canEdit && !locked && g.jsxs("div", { className: "flex flex-wrap items-end gap-2", children: [
              g.jsx("input", { value: label, onChange: (e) => setLabel(e.target.value), placeholder: "Version note", className: inp }),
              g.jsx(U.Btn, { size: "sm", variant: "dark", disabled: !dirty, onClick: () => { W.savePlan(inq.id, plan, user, label || "Staff edit"); setLabel(""); }, children: "Save as new version" }),
            ] }),
        ] }),
      locked && g.jsx("p", { className: "text-[12px] text-ivory/50", children: inq.stage === "Rejected" ? "This request is closed." : "Confirmed — edit the itinerary in Itinerary Management (" + (inq.itineraryId || "") + ")." }),
      g.jsx(DayPlanner, { days: plan, setDays: setPlan, mode: "staff", readOnly: !canEdit || locked }),
      g.jsxs("div", { className: "border border-line p-4", children: [
          g.jsx("p", { className: "eyebrow mb-2", children: "Availability check" }),
          flat.filter((l) => l.slug && !l.custom).map((l, i) => { const { dates, units } = I.lineDates(l, inq); return g.jsxs("p", { className: "flex items-center justify-between gap-2 border-b border-line/50 py-1.5 text-[12px]", children: [g.jsxs("span", { className: "text-ivory/80", children: [l.name, g.jsxs("span", { className: "text-ivory/40", children: [" · ", units, " × ", dates.length > 1 ? dates.length + " nights from " : "", D.fmtDate(dates[0])] })] }), g.jsx(AvailabilityBadge, { slug: l.slug, date: dates[0], to: D.addDays(dates[dates.length - 1], 1), qty: units, poolId: l.poolId })] }, i); }),
        ] }),
    ] });
}

function Original({ inq }) {
  const o = inq.original || {};
  return g.jsxs("div", { className: "space-y-4", children: [
      g.jsxs("p", { className: "text-[12px] text-ivory/55", children: ["Exactly as the guest submitted it on ", o.submittedAt ? D.fmtDateTime(o.submittedAt) : "—", ". This record is never changed."] }),
      g.jsxs("div", { className: "grid gap-2 sm:grid-cols-4", children: [mini("Estimate", D.money(o.estimate?.total)), mini("Subtotal", D.money(o.estimate?.subtotal)), mini("Products", (o.selections || []).length), mini("Custom requests", (o.custom || []).length)] }),
      g.jsx(U.DataTable, { searchable: false, pageSize: 20, rows: (o.selections || []).map((s2) => ({ ...s2, id: s2.id })), columns: [
          { key: "name", label: "Product" },
          { key: "kind", label: "Dates", render: (s2) => (s2.kind === "stay" ? D.fmtDate(s2.from) + " → " + D.fmtDate(s2.to) : D.fmtDate(s2.date) + (s2.time ? " · " + s2.time : "")) },
          { key: "qty", label: "Qty", render: (s2) => (s2.kind === "stay" ? s2.rooms + " room(s)" : s2.qty) },
          { key: "note", label: "Guest note", render: (s2) => s2.note || "—" },
          { key: "status", label: "Availability at submission", sortable: false, render: (s2) => (o.availability || []).find((a) => a.slug === s2.slug)?.status || "—" },
          { key: "price", label: "Guest estimate", render: (s2) => D.money(s2.price) },
        ] }),
      g.jsx(DayPlanner, { days: o.plan || [], setDays: () => {}, mode: "staff", readOnly: true }),
    ] });
}

function Notes({ inq, user, canEdit }) {
  const [t, setT] = useState("");
  return g.jsxs("div", { className: "space-y-3", children: [
      canEdit && g.jsxs("div", { className: "flex gap-2", children: [g.jsx("input", { value: t, onChange: (e) => setT(e.target.value), placeholder: "Internal note — never shown to the guest", className: U.cx(inp, "flex-1") }), g.jsx(U.Btn, { size: "sm", variant: "dark", disabled: !t.trim(), onClick: () => { W.addNote(inq.id, t.trim(), user); setT(""); }, children: "Add note" })] }),
      [...(inq.notes || [])].reverse().map((n, i) => g.jsxs("div", { className: "border border-line px-3 py-2 text-[12px]", children: [g.jsxs("p", { className: "text-[10px] text-ivory/45", children: [D.fmtDateTime(n.at), " · ", n.by] }), g.jsx("p", { className: "text-ivory/85", children: n.text })] }, i)),
      !(inq.notes || []).length && g.jsx("p", { className: "text-[12px] text-ivory/45", children: "No notes yet." }),
    ] });
}

/* ======================= EMAIL & NOTIFICATIONS ==================== */
function EmailTable({ rows }) {
  const [view, setView] = useState(null);
  return g.jsxs("div", { children: [
      g.jsx(U.DataTable, { pageSize: 12, rows, empty: "No emails yet.", searchKeys: ["to", "subject", "label", "status"], columns: [
          { key: "at", label: "Time", render: (e) => D.fmtDateTime(e.at) },
          { key: "label", label: "Template" },
          { key: "to", label: "To" },
          { key: "subject", label: "Subject" },
          { key: "refs", label: "References", sortable: false, render: (e) => [e.refs?.requestId, e.refs?.quoteId, e.refs?.invoiceId, e.refs?.bcn].filter(Boolean).join(" · ") || "—" },
          { key: "status", label: "Status", render: (e) => g.jsx(U.Badge, { tone: e.status === "sent" ? "green" : e.status === "failed" || e.status === "no recipient" ? "red" : "amber", children: e.status }) },
        ], onRowClick: setView }),
      view && g.jsx(U.Modal, { open: true, onClose: () => setView(null), wide: true, title: view.subject, footer: [
          g.jsx("a", { href: W.mailtoFor(view), className: "inline-flex items-center rounded-full border border-ivory/25 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ivory/85 hover:border-ivory", children: "Open in mail app" }, "m"),
          g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => W.deliver(view.id), disabled: !view.to, children: "Resend" }, "r"),
          g.jsx(U.Btn, { size: "sm", onClick: () => setView(null), children: "Close" }, "c"),
        ], children: g.jsxs("div", { className: "space-y-2", children: [
            g.jsxs("p", { className: "text-[12px] text-ivory/60", children: ["To ", view.to || "—", " · ", view.status, view.error ? " · " + view.error : ""] }),
            g.jsx("iframe", { title: "Email preview", srcDoc: view.html, sandbox: "", className: "h-[60vh] w-full border border-line bg-white" }),
          ] }) }),
    ] });
}

export function EmailCenter({ user }) {
  const data = U.useDB();
  const [tab, setTab] = useState("outbox");
  const cfg = W.emailSettings();
  const [f, setF] = useState(cfg);
  const [preview, setPreview] = useState(null);
  const canSet = D.can(user, "edit", "integrations") || user?.role === "super_admin";
  const due = W.dueReminders(21);
  const emails = data.emails || [];
  const sample = () => {
    const inq = data.inquiries.find((i) => i.type === "vacation") || { requestId: "VR-2026-00001", contact: { name: "Sample Guest", email: "guest@example.com", country: "United Kingdom" }, arrival: D.addDays(D.today(), 40), departure: D.addDays(D.today(), 45), nights: 5, adults: 2, children: 0, infants: 0, plan: [], estimate: { total: 0 } };
    const quote = data.quotations[0], invoice = data.invoices[0], booking = data.bookings[0], itinerary = data.itineraries[0];
    return { inq, quote, invoice: invoice && { ...invoice, provisionalRef: invoice.provisionalRef || "PC-0000", depositDueDate: invoice.depositDueDate || D.addDays(D.today(), 3) }, booking, itinerary, amount: invoice?.depositDue || 0 };
  };
  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsxs("div", { className: "grid gap-3 sm:grid-cols-4", children: [
          mini("Emails", emails.length), mini("Sent", emails.filter((e) => e.status === "sent").length),
          mini("Waiting in outbox", emails.filter((e) => e.status === "queued").length), mini("Delivery", { none: "Off", formsubmit: "FormSubmit", emailjs: "EmailJS", webhook: "Webhook" }[cfg.provider] || cfg.provider),
        ] }),
      cfg.provider === "formsubmit" && (() => {
        const target = cfg.formsubmitTo || cfg.internalTo;
        const fs = emails.filter((e) => e.provider === "formsubmit");
        const sent = fs.some((e) => e.status === "sent");
        const waiting = emails.filter((e) => ["awaiting activation", "failed", "queued"].includes(e.status));
        return g.jsxs("div", { className: U.cx("border px-4 py-3 text-[12px] leading-relaxed", sent ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-amber-400/40 bg-amber-500/10 text-amber-200"), children: [
            sent ? g.jsxs("p", { children: ["✓ Email delivery is active through ", target, ". Guest emails are sent with the guest in CC, so every guest receives a copy and your team keeps one."] })
              : g.jsxs("p", { children: [g.jsx("b", { children: "One step to switch on email: " }), "FormSubmit sends a single “Activate Form” email to ", g.jsx("b", { children: target }), " the first time an email is sent. Open that inbox (check spam), click Activate, then press “Resend waiting emails”. Until then guests do not receive their copies."] }),
            waiting.length > 0 && g.jsxs("div", { className: "mt-2 flex flex-wrap items-center gap-3", children: [g.jsxs("span", { children: [waiting.length, " email", waiting.length === 1 ? "" : "s", " waiting"] }), g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => waiting.forEach((e) => W.deliver(e.id)), children: "Resend waiting emails" })] }),
          ] });
      })(),
      cfg.provider === "none" && g.jsx("p", { className: "border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-[12px] leading-relaxed text-rose-200", children: "Email delivery is switched off — guests receive nothing. Choose FormSubmit in Settings." }),
      g.jsx(U.Panel, { pad: false, children: g.jsx("div", { className: "px-5 py-4", children: g.jsx(U.Tabs, { tabs: [{ id: "outbox", label: "Outbox" }, { id: "templates", label: "Templates" }, { id: "reminders", label: "Balance reminders (" + due.length + ")" }, { id: "settings", label: "Settings" }], active: tab, onChange: setTab }) }) }),
      tab === "outbox" && g.jsx(U.Panel, { title: "Outbox", subtitle: "Every notification sent by the workflow, with its references", pad: false, actions: [
          g.jsx(U.Btn, { size: "sm", variant: "subtle", disabled: cfg.provider === "none", onClick: () => emails.filter((e) => ["queued", "failed", "awaiting activation"].includes(e.status)).forEach((e) => W.deliver(e.id)), children: "Resend waiting emails" }),
        ], children: g.jsx(EmailTable, { rows: emails }) }),
      tab === "templates" && g.jsx(U.Panel, { title: "Email templates", subtitle: "Branded templates, filled automatically at each stage", pad: false, children: g.jsx(U.DataTable, { searchable: false, pageSize: 12, rows: Object.entries(W.TEMPLATES).map(([id, t]) => ({ id, ...t, sent: emails.filter((e) => e.kind === id).length })), columns: [
          { key: "label", label: "Template" }, { key: "to", label: "Audience" }, { key: "sent", label: "Sent" },
          { key: "p", label: "", sortable: false, render: (t) => g.jsx("span", { className: "text-[11px] uppercase text-gold-soft", children: "Preview →" }) },
        ], onRowClick: (t) => { try { setPreview({ ...W.renderEmail(t.id, sample()), label: t.label }); } catch (e) { setPreview({ subject: t.label, html: "<p style='font-family:sans-serif;padding:20px'>A preview needs at least one quotation, invoice and booking in the database.</p>", label: t.label }); } } }) }),
      tab === "reminders" && g.jsx(U.Panel, { title: "Balance payment reminders", subtitle: "Confirmed bookings with a balance due within 21 days", pad: false, actions: [
          D.can(user, "add", "emails") && due.length > 0 && g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => due.forEach((i) => W.sendBalanceReminder(i.id, user)), children: "Send all reminders" }),
        ], children: g.jsx(U.DataTable, { searchable: false, pageSize: 10, rows: due, empty: "No balances due in the next 21 days.", columns: [
          { key: "bcn", label: "BCN" }, { key: "customerName", label: "Guest" }, { key: "dueDate", label: "Due", render: (i) => D.fmtDate(i.dueDate) },
          { key: "balance", label: "Balance", render: (i) => D.money(i.balance) },
          { key: "last", label: "Last reminder", sortable: false, render: (i) => { const e = emails.find((x) => x.kind === "balance_reminder" && x.refs?.invoiceId === i.id); return e ? D.fmtDateTime(e.at) : "—"; } },
          { key: "x", label: "", sortable: false, render: (i) => D.can(user, "add", "emails") ? g.jsx("button", { onClick: (e) => { e.stopPropagation(); W.sendBalanceReminder(i.id, user); }, className: "text-[11px] uppercase text-gold-soft hover:underline", children: "Send" }) : null },
        ] }) }),
      tab === "settings" && g.jsx(U.Panel, { title: "Email delivery", subtitle: "EmailJS sends directly from the website with a public key; a webhook hands each email to Zapier, Make or your own mail server", children: g.jsxs("div", { className: "space-y-4", children: [
          g.jsx(U.RecordForm, { value: f, onChange: setF, fields: [
              { key: "provider", label: "Provider", type: "select", disabled: !canSet, options: [{ value: "formsubmit", label: "FormSubmit — no account, activate once (recommended)" }, { value: "emailjs", label: "EmailJS" }, { value: "webhook", label: "Webhook (Zapier · Make · own server)" }, { value: "none", label: "Off — keep emails in the outbox" }] },
              { key: "fromName", label: "Sender name", disabled: !canSet }, { key: "replyTo", label: "Reply-to address", disabled: !canSet },
              { key: "internalTo", label: "Internal team notifications to", disabled: !canSet, hint: "New itinerary inquiries are sent here, with a link that adds them to this backend" },
              ...(f.provider === "formsubmit" ? [{ key: "formsubmitTo", label: "FormSubmit address", disabled: !canSet, placeholder: f.internalTo, hint: "The business inbox that receives every email and the one-time activation link. After activating, you may paste the random address FormSubmit gives you to keep your email private." }] : []),
              ...(f.provider === "emailjs" ? [{ key: "serviceId", label: "EmailJS service ID", disabled: !canSet }, { key: "templateId", label: "EmailJS template ID", disabled: !canSet, hint: "Template body {{{html}}}, subject {{subject}}, to {{to_email}}" }, { key: "publicKey", label: "EmailJS public key", disabled: !canSet }] : []),
              ...(f.provider === "webhook" ? [{ key: "webhookUrl", label: "Webhook URL", disabled: !canSet, hint: "Receives JSON: to, subject, html, text, refs" }] : []),
            ] }),
          canSet && g.jsxs("div", { className: "flex flex-wrap gap-2", children: [
              g.jsx(U.Btn, { variant: "dark", onClick: () => W.saveEmailSettings(f, user), children: "Save settings" }),
              g.jsx(U.Btn, { onClick: () => { W.saveEmailSettings(f, user); const rec = W.notify("internal_new", { inq: { requestId: "TEST", contact: { name: "Test", email: f.internalTo, phone: "+62", country: "Indonesia" }, arrival: D.today(), departure: D.addDays(D.today(), 3), nights: 3, adults: 2, children: 0, infants: 0, productSlugs: [], estimate: { total: 0 }, plan: [] } }, user); alert("Test email " + (rec ? "created for " + rec.to : "not created") + " — check the outbox for its delivery status."); }, children: "Send test email" }),
            ] }),
        ] }) }),
      preview && g.jsx(U.Modal, { open: true, onClose: () => setPreview(null), wide: true, title: preview.label, footer: [g.jsx(U.Btn, { size: "sm", onClick: () => setPreview(null), children: "Close" }, "c")], children: g.jsxs("div", { className: "space-y-2", children: [g.jsxs("p", { className: "text-[12px] text-ivory/60", children: ["Subject: ", preview.subject] }), g.jsx("iframe", { title: "Template preview", srcDoc: preview.html, sandbox: "", className: "h-[62vh] w-full border border-line bg-white" })] }) }),
    ] });
}

/* ======================= GUEST PORTAL PANEL ======================= */
export function GuestRequests({ user, me }) {
  const data = U.useDB();
  const [msg, setMsg] = useState("");
  if (!me) return null;
  const reqs = data.inquiries.filter((i) => i.type === "vacation" && (i.customerId === me.id || (i.contact?.email || "") === (me.email || "").toLowerCase()));
  const quotes = data.quotations.filter((q) => q.customerId === me.id && ["Sent", "Approved"].includes(q.status));
  const deposits = data.invoices.filter((i) => i.customerId === me.id && i.kind === "deposit" && !i.bookingId);
  const pay = data.cms.footer?.paypal;
  return g.jsxs("div", { className: "space-y-5", children: [
      msg && g.jsx("p", { className: U.cx("border px-4 py-3 text-[12px]", msg.startsWith("⚠") ? "border-rose-400/40 text-rose-200" : "border-emerald-400/30 text-emerald-200"), children: msg }),
      g.jsx(U.Panel, { title: "Your vacation requests", subtitle: "From the vacation builder — follow each stage here", pad: false, children: g.jsx(U.DataTable, { searchable: false, pageSize: 6, rows: reqs, empty: "No vacation requests yet — design one in the vacation builder.", columns: [
          { key: "id", label: "Inquiry ID" }, { key: "tripId", label: "Trip ID" }, { key: "arrival", label: "Travel", render: (i) => D.fmtDate(i.arrival) + " → " + D.fmtDate(i.departure) },
          { key: "estimate", label: "Estimate", render: (i) => D.money(i.estimate?.total) },
          { key: "stage", label: "Status", render: (i) => g.jsx(U.Badge, { tone: W.STAGE_TONE[i.stage], children: i.stage }) },
          { key: "bcn", label: "Booking", render: (i) => i.bcn || "—" },
        ] }) }),
      quotes.length > 0 && g.jsx(U.Panel, { title: "Your quotations", subtitle: "Approving a quotation does not confirm the booking — confirmation follows the deposit", pad: false, children: g.jsx(U.DataTable, { searchable: false, pageSize: 6, rows: quotes, columns: [
          { key: "id", label: "Quotation" }, { key: "title", label: "Trip" }, { key: "total", label: "Total", render: (q) => D.money(q.total) },
          { key: "depositDue", label: "Deposit", render: (q) => D.money(q.depositDue) }, { key: "validity", label: "Valid until", render: (q) => D.fmtDate(q.validity) },
          { key: "x", label: "", sortable: false, render: (q) => g.jsxs("span", { className: "flex gap-3", children: [
              g.jsx("button", { onClick: (e) => { e.stopPropagation(); printQuote(q, data); }, className: "text-[11px] uppercase text-ivory/70 hover:underline", children: "PDF" }),
              q.status === "Sent" ? g.jsx("button", { onClick: (e) => { e.stopPropagation(); if (!confirm("Approve quotation " + q.id + " for " + D.money(q.total) + "?")) return; try { W.approveQuotation(q.id, user, "customer"); setMsg("Thank you — your approval is recorded. Your deposit invoice follows once availability is verified."); } catch (er) { setMsg("⚠ " + er.message); } }, className: "text-[11px] font-semibold uppercase text-gold-soft hover:underline", children: "Approve" })
                : g.jsx(U.Badge, { tone: "green", children: "approved" }),
            ] }) },
        ] }) }),
      deposits.length > 0 && g.jsx(U.Panel, { title: "Deposit to confirm your booking", children: g.jsx("div", { className: "space-y-3", children: deposits.map((i) => g.jsxs("div", { className: "border border-gold/40 bg-gold/[0.05] p-4 text-[13px] text-ivory/85", children: [
          g.jsxs("p", { children: ["Invoice ", g.jsx("b", { children: i.id }), " · provisional confirmation ", i.provisionalRef, " — deposit ", g.jsx("b", { children: D.money(i.depositDue) }), " due by ", D.fmtDate(i.depositDueDate), i.amountPaid ? " · received " + D.money(i.amountPaid) : ""] }),
          g.jsxs("p", { className: "mt-1 text-[12px] text-ivory/60", children: ["Pay by PayPal", pay ? g.jsxs("span", { children: [" at ", g.jsx("a", { href: pay, target: "_blank", rel: "noreferrer", className: "text-gold-soft underline", children: pay })] }) : "", " quoting ", i.id, ". Your Booking Confirmation Number is issued once the deposit is verified."] }),
        ] }, i.id)) }) }),
    ] });
}
