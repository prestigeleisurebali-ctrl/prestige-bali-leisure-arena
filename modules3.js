/* ==================================================================
   MODULES 3 — SUPPLIERS · PRODUCT MASTER · CATALOGUE · DESTINATIONS
               CMS · REVIEWS · USERS · INTEGRATIONS · AUDIT
               + supplier portal and customer account
   ================================================================== */
import * as React from "react";
import * as jsxrt from "react/jsx-runtime";
import * as D from "./db.js";
import * as U from "./ui.js";
import { bridge, drillTo } from "./bridge.js";
import { printItinerary } from "./modules2.js";
import { GuestRequests } from "./requestsUI.js";
import { ContentEditor, MenuEditor, BuilderEditor, BrandEditor, TestimonialsEditor } from "./cmsUI.js";
import { DayPlanner, printDayPlan } from "./modules4.js";
import { VERIFY_FIELDS } from "./catalogue-drafts.js";
import * as INV from "./inventory.js";
import { InventoryManager, invColumns, InventorySyncPanel, SupplierInventoryPanel } from "./inventoryUI.js";

const g = jsxrt;
const We = React;
const { useState, useMemo } = React;

/* ========================= PRODUCT MASTER ========================= */
export function ProductMaster({ user, params }) {
  const data = U.useDB();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [cat, setCat] = useState(params?.category || "all");
  const [q, setQ] = useState(params?.q || "");
  const [ver, setVer] = useState(params?.verification || "all");
  const [imported, setImported] = useState("");
  const [view, setView] = useState("catalogue");
  const [invOpen, setInvOpen] = useState(null);
  const can = (a) => D.can(user, a, "products");
  const pending = data.products.filter((p) => p.verification === "pending").length;
  const rows = useMemo(() => data.products.filter((p) =>
    (cat === "all" || p.categoryId === cat) &&
    (ver === "all" || (ver === "pending" ? p.verification === "pending" : ver === "live" ? p.status === "live" && p.published !== false : p.verification !== "pending")) &&
    (!q || (p.name + " " + p.slug + " " + p.supplier + " " + p.destination).toLowerCase().includes(q.toLowerCase()))), [data, cat, q, ver]);
  const importCSV = async (file) => {
    if (!file) return;
    const text = await file.text();
    const parse = (line) => { const out = []; let cur = "", inQ = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; } else if (ch === "," && !inQ) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
    const lines = text.replace(/^\ufeff/, "").split(/\r?\n/).filter((l) => l.trim());
    const head = parse(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
    const col = (row, ...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0 && row[i]) return row[i]; } return ""; };
    let added = 0, skipped = 0;
    lines.slice(1).forEach((l) => {
      const r = parse(l);
      const name = col(r, "name", "productname");
      if (!name || data.products.some((p) => p.name.toLowerCase() === name.toLowerCase())) { skipped++; return; }
      const catIn = col(r, "category", "categoryid").toLowerCase();
      const c = data.categories.find((x) => x.id === catIn || x.name.toLowerCase() === catIn) || data.categories.find((x) => x.id === "activities");
      const supName = col(r, "supplier");
      const sup = data.suppliers.find((x) => x.name.toLowerCase() === supName.toLowerCase());
      const net = Number(col(r, "netrate", "net")) || 0, sell = Number(col(r, "sellingrate", "sell", "price")) || 0;
      D.insert("products", {
        id: D.nextNumber("PRD-", "prdSeq", 5), productId: D.nextNumber("PBL-", "pblSeq", 5),
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString(36).slice(-4),
        name, categoryId: c.id, category: D.SITE_CATEGORY[c.id] || "Experience", subcategory: col(r, "subcategory") || c.subs[0] || "",
        supplierId: sup?.id || "", supplier: sup?.name || supName || "To be contracted",
        destination: col(r, "destination") || "Bali", location: col(r, "location") || "", description: col(r, "description"),
        facilities: col(r, "facilities").split(";").map((x) => x.trim()).filter(Boolean), inclusions: col(r, "inclusions").split(";").map((x) => x.trim()).filter(Boolean),
        exclusions: col(r, "exclusions").split(";").map((x) => x.trim()).filter(Boolean), duration: col(r, "duration"), operatingHours: col(r, "operatinghours", "hours"),
        capacity: col(r, "capacity"), cancellationPolicy: col(r, "cancellationpolicy"), unit: col(r, "unit") || "person",
        netRate: net, sellingRate: sell, markupPct: net ? Math.round(((sell - net) / net) * 100) : 0,
        status: "draft", published: false, verification: "pending", verifyPending: [...VERIFY_FIELDS], images: [], blackoutDates: [], stock: null, rating: 0,
        internalNotes: "Imported from " + file.name + " on " + D.today() + ".",
      }, user, { module: "products" });
      added++;
    });
    setImported(added + " products imported as drafts for verification" + (skipped ? " · " + skipped + " skipped (duplicate or no name)" : "") + ".");
  };

  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsxs(U.Panel, { title: "Product Master", subtitle: "The single source of truth — Catalogue, Marketplace, Destination pages, Vacation Builder, Quotations and the customer website all read from here", pad: false, actions: [
          g.jsx("select", { value: cat, onChange: (e) => setCat(e.target.value), className: "border border-ivory/20 bg-ink/40 px-3 py-2 text-[12px] text-ivory", children: [{ id: "all", name: "All categories" }, ...data.categories].map((c) => g.jsx("option", { value: c.id, children: c.name }, c.id)) }),
          g.jsx("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search products…", className: "border border-ivory/20 bg-ink/40 px-3 py-2 text-[12px] text-ivory" }),
          g.jsx(U.Tabs, { tabs: [{ id: "catalogue", label: "Catalogue view" }, { id: "inventory", label: "Inventory view" }], active: view, onChange: setView }),
          g.jsxs("select", { value: ver, onChange: (e) => setVer(e.target.value), className: "border border-ivory/20 bg-ink/40 px-3 py-2 text-[12px] text-ivory", children: [
              g.jsx("option", { value: "all", children: "All records" }), g.jsx("option", { value: "live", children: "Live on website" }),
              g.jsx("option", { value: "pending", children: "Needs verification (" + pending + ")" }), g.jsx("option", { value: "verified", children: "Verified" }),
            ] }),
          can("add") && g.jsxs("label", { className: "inline-flex cursor-pointer items-center rounded-full border border-ivory/25 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ivory/85 hover:border-ivory", title: "Columns: name, category, subcategory, destination, location, supplier, unit, netRate, sellingRate, description, inclusions, facilities, duration, hours, capacity", children: [
              "Import CSV", g.jsx("input", { type: "file", accept: ".csv,text/csv", className: "hidden", onChange: (e) => { importCSV(e.target.files?.[0]); e.target.value = ""; } }),
            ] }),
          can("add") && g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => setCreating(true), children: "Add product" }),
        ], children: g.jsxs("div", { children: [
          imported && g.jsx("p", { className: "mx-5 mt-4 border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-200", children: imported }),
          ver === "pending" && g.jsx("p", { className: "mx-5 mt-4 border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-200", children: "Verification queue: real venues listed by name and location only. Rates, supplier contracts, inclusions, facilities, hours and photography have not been entered and must be confirmed with each operator. These records are hidden from the website until verified and priced." }),
          view === "inventory" && g.jsx("p", { className: "mx-5 mt-4 text-[11px] text-ivory/50", children: "Next 30 days · Total and Reserved/Sold are the peak on any date; Available is the lowest on any date. Open a product's inventory for the day-by-day calendar." }),
          view === "inventory" ? g.jsx(U.DataTable, { pageSize: 14, rows: rows.map((p) => { const s = INV.productSummary(p.slug, D.today(), D.addDays(D.today(), 29)); return { ...p, inv: s, invStatus: s.status, total: s.total, reserved: s.reserved, sold: s.sold, available: s.available }; }), columns: invColumns(data, setInvOpen), onRowClick: (p) => setInvOpen(p.slug) }) :
          g.jsx(U.DataTable, { pageSize: 14, rows, initialQuery: "", columns: [
            { key: "images", label: "Photo", sortable: false, render: (p) => g.jsx("div", { className: "h-10 w-14 overflow-hidden border border-line bg-ink", children: p.images?.[0]?.url ? g.jsx("img", { src: p.images[0].url, alt: "", className: "h-full w-full object-cover" }) : null }) },
            { key: "productId", label: "Product ID" },
            { key: "name", label: "Name", render: (p) => g.jsx("span", { className: "font-medium text-ivory", children: p.name }) },
            { key: "categoryId", label: "Category", render: (p) => data.categories.find((c) => c.id === p.categoryId)?.name || p.category },
            { key: "subcategory", label: "Sub" },
            { key: "destination", label: "Destination" },
            { key: "supplier", label: "Supplier" },
            { key: "netRate", label: "Net", render: (p) => g.jsx("span", { className: "num text-ivory/60", children: D.money(p.netRate) }) },
            { key: "sellingRate", label: "Sell", render: (p) => p.priceOnRequest && !(Number(p.sellingRate) > 0) ? g.jsx(U.Badge, { tone: "blue", children: "on request" }) : g.jsx("span", { className: "num text-gold-soft", children: D.money(p.sellingRate) }) },
            { key: "marginPct", label: "Margin", sortable: false, render: (p) => { const m = p.netRate ? Math.round(((p.sellingRate - p.netRate) / p.netRate) * 100) : 0; return g.jsx(U.Badge, { tone: m >= 20 ? "green" : "amber", children: m + "%" }); } },
            { key: "unit", label: "Unit" },
            { key: "inventory", label: "Inventory · 30 days", sortable: false, render: (p) => { const s = INV.productSummary(p.slug, D.today(), D.addDays(D.today(), 29)); return s.managed && s.any ? g.jsxs("span", { children: [g.jsxs("span", { className: "block text-ivory", children: [s.available, " / ", s.total, " ", s.unitPlural] }), g.jsx(U.Badge, { tone: { available: "green", limited: "amber", soldout: "red" }[s.status] || "neutral", children: INV.STATUS_LABEL[s.status] })] }) : g.jsx("span", { className: "text-[11px] text-ivory/40", children: "On request" }); } },
            { key: "invbtn", label: "", sortable: false, render: (p) => g.jsx(U.Btn, { size: "sm", onClick: (e) => { e.stopPropagation(); setInvOpen(p.slug); }, children: "Inventory" }) },
            { key: "status", label: "Status", render: (p) => g.jsxs("span", { className: "flex flex-col gap-1", children: [g.jsx(U.Badge, { children: p.published && p.status === "live" ? "live" : p.status === "live" ? "hidden" : p.status }), p.verification === "pending" && g.jsx(U.Badge, { tone: "amber", children: "verify" })] }) },
          ], onRowClick: (p) => can("view") && setEditing(p) }),
        ] }) }),
      editing && g.jsx(ProductForm, { record: editing, user, onClose: () => setEditing(null) }),
      invOpen && g.jsx(InventoryManager, { slug: invOpen, user, onClose: () => setInvOpen(null) }),
      creating && g.jsx(ProductForm, { record: { id: null, slug: "", name: "", productId: "", categoryId: "accommodation", subcategory: "Private Villa", supplierId: data.suppliers[0]?.id || "", supplier: data.suppliers[0]?.name || "", destination: "Uluwatu", description: "", facilities: [], inclusions: [], exclusions: [], netRate: 100, sellingRate: 130, markupPct: 30, unit: "night", capacity: "2 guests", stock: null, operatingHours: "09:00 – 21:00", blackoutDates: [], cancellationPolicy: "House schedule", status: "live", published: true, images: [], internalNotes: "", rating: 4.85 }, user, onClose: () => setCreating(false) }),
    ] });
}

/* Per-category product configuration — only the fields relevant to the
   category are shown; everything is stored in product.typeConfig. */
const TYPE_CONFIG = {
  "yacht-luxury": { label: "Yacht charter", fields: [
    ["vesselType", "Yacht type / model"], ["capacityNote", "Passenger capacity"], ["charterDuration", "Charter duration"], ["departure", "Departure location"], ["timeSlots", "Available time slots (comma separated)"], ["crew", "Crew"], ["catering", "Optional catering"], ["activities", "Optional onboard activities"],
  ] },
  "yacht": { label: "Yacht / boat", fields: [
    ["vesselType", "Vessel type / model"], ["capacityNote", "Passenger capacity"], ["charterDuration", "Charter duration"], ["departure", "Departure location"], ["timeSlots", "Available time slots"], ["crew", "Crew & inclusions"],
  ] },
  premium: { label: "Helicopter / premium", fields: [
    ["aircraft", "Aircraft type"], ["capacityNote", "Passenger capacity"], ["flightDuration", "Flight duration"], ["routes", "Available routes (comma separated)"], ["departure", "Departure location"], ["restrictions", "Weather / operational restrictions"],
  ] },
  transportation: { label: "Transport", fields: [
    ["vehicleType", "Vehicle type"], ["capacityNote", "Passenger capacity"], ["departure", "Operating area"], ["timeSlots", "Available time slots"],
  ] },
  classes: { label: "Class / workshop", fields: [
    ["classDuration", "Class duration"], ["schedule", "Session schedules"], ["instructor", "Instructor details"], ["maxParticipants", "Maximum participants"], ["bookingType", "Individual or group booking"], ["skillLevel", "Skill level"],
  ] },
  "retreat-hosting": { label: "Retreat venue / hosting", fields: [
    ["venueCapacity", "Venue capacity (guests)"], ["bedrooms", "Bedroom count"], ["roomConfig", "Room configurations"], ["accommodation", "Shared or private accommodation"], ["spaces", "Yoga / meditation spaces"], ["facilitiesNote", "Facilities & equipment"], ["catering", "Catering options"], ["minStay", "Minimum stay (nights)"], ["groupSize", "Group size range"], ["rentalRate", "Venue rental rate"],
  ] },
  "retreat-packages": { label: "Wellness package", fields: [
    ["packageDuration", "Package duration"], ["sessions", "Number of sessions"], ["treatments", "Included treatments (comma separated)"], ["accommodation", "Accommodation options"], ["meals", "Meals & nutrition"], ["practitioner", "Instructor / practitioner details"], ["sessionType", "Private or group sessions"], ["packagePrice", "Package price (if fixed)"],
  ] },
  events: { label: "Event / celebration", fields: [
    ["eventCapacity", "Guest capacity"], ["venue", "Venue options"], ["durationNote", "Duration / setup time"], ["decoration", "Planning & decoration"], ["catering", "Catering options"], ["staffing", "Staffing"],
  ] },
  accommodation: { label: "Accommodation", fields: [
    ["bedrooms", "Bedrooms / room count"], ["roomConfig", "Room configurations"], ["occupancy", "Occupancy per room"], ["minStay", "Minimum stay (nights)"],
  ] },
  wellness: { label: "Wellness & spa", fields: [["sessionLength", "Session length"], ["capacityNote", "Capacity"], ["schedule", "Schedule"]] },
  "wellness-spa": { label: "Wellness & spa", fields: [["sessionLength", "Session length"], ["capacityNote", "Capacity"], ["schedule", "Schedule"]] },
  healing: { label: "Healing session", fields: [["sessionLength", "Session length"], ["bookingType", "Private or group"], ["practitioner", "Practitioner details"]] },
  beauty: { label: "Beauty service", fields: [["serviceLength", "Service length"], ["capacityNote", "Simultaneous guests"], ["mobile", "Mobile service available? (yes/no)"]] },
};
function TypeConfig({ form, set, data }) {
  const cfg = TYPE_CONFIG[form.categoryId];
  const tc = form.typeConfig || {};
  const setTc = (k, v) => set({ typeConfig: { ...tc, [k]: v } });
  if (!cfg) return g.jsxs("div", { className: "space-y-3", children: [
      g.jsx("p", { className: "text-[13px] leading-relaxed text-ivory/70", children: "No extra configuration for this category — use Duration, Capacity, Booking requirements and the notes below." }),
      g.jsx(U.Field, { label: "Free-form configuration (one per line, “label: value”)", type: "textarea", rows: 6, value: Object.entries(tc).map(([k, v]) => k + ": " + v).join("\n"), onChange: (v) => set({ typeConfig: Object.fromEntries(v.split("\n").map((l) => { const i = l.indexOf(":"); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : null; }).filter(Boolean)) }) }),
    ] });
  return g.jsxs("div", { className: "space-y-3", children: [
      g.jsx("p", { className: "text-[12px] text-ivory/55", children: cfg.label + " setup — saved on the product; shown to staff, and guest-facing fields appear on the product page." }),
      g.jsx(U.RecordForm, { value: tc, cols: 2, onChange: (v) => set({ typeConfig: v }), fields: cfg.fields.map(([k, l]) => ({ key: k, label: l, type: /capacity|participants|bedrooms|guests|rate|price/i.test(l) ? "number" : "text" })) }),
    ] });
}

function ProductForm({ record, user, onClose }) {
  const data = U.useDB();
  const [form, setForm] = useState(record);
  const [tab, setTab] = useState("details");
  const isNew = !record.id;
  const can = (a) => D.can(user, a, "products");
  const set = (patch) => setForm({ ...form, ...patch });

  const save = () => {
    if (!form.name) return alert("Product name is required.");
    const slug = form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const sup = data.suppliers.find((s) => s.id === form.supplierId);
    const patch = { ...form, slug, supplier: sup?.name || form.supplier, markupPct: form.netRate ? Math.round(((form.sellingRate - form.netRate) / form.netRate) * 100) : 0,
      category: !form.category || form.categoryId !== record.categoryId ? D.SITE_CATEGORY[form.categoryId] || "Experience" : form.category };
    if (Number(patch.sellingRate) > 0) patch.priceOnRequest = false;
    if (patch.status === "live" && patch.published !== false && (patch.verification === "pending" || !(Number(patch.sellingRate) > 0 || patch.priceOnRequest)))
      return alert("This product cannot go live on the website yet: " + (patch.verification === "pending" ? "it is still in the verification queue" : "it has no selling rate") + ". Verify the details and set a selling rate, or tick “Price on request”.");
    if (isNew) D.insert("products", { ...patch, id: D.nextNumber("PRD-", "prdSeq", 5) }, user, { module: "products" });
    else D.update("products", form.id, patch, user, { module: "products" });
    onClose();
  };

  const TABS = [
    { id: "details", label: "Details" },
    { id: "pricing", label: "Pricing" },
    { id: "photos", label: "Photos" },
    { id: "config", label: "Type setup" },
    { id: "availability", label: "Hours & blackouts" },
    ...(isNew ? [] : [{ id: "inventory", label: "Inventory" }]),
    { id: "notes", label: "Notes" },
  ];

  return g.jsx(U.Modal, { open: true, onClose, wide: true, title: (isNew ? "New product" : "Product " + form.productId),
    footer: [
      !isNew && can("delete") && g.jsx(U.Btn, { size: "sm", variant: "danger", onClick: () => { if (confirm("Delete " + form.name + "? It will be removed from the Catalogue, Destination pages and the customer website. The action is written to the audit log.")) { D.remove("products", form.id, user, { module: "products" }); onClose(); } }, children: "Delete" }),
      !isNew && g.jsx(U.Btn, { size: "sm", onClick: () => { bridge.navigate("/marketplace/" + form.slug); onClose(); }, children: "View on site" }),
      g.jsx(U.Btn, { size: "sm", variant: "dark", onClick: save, disabled: !can("edit") && !can("add"), children: isNew ? "Create product" : "Save & sync everywhere" }),
      g.jsx(U.Btn, { size: "sm", onClick: onClose, children: "Close" }),
    ],
    children: g.jsxs("div", { className: "space-y-4", children: [
        g.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3", children: [
            g.jsx(U.Tabs, { tabs: TABS, active: tab, onChange: setTab }),
            g.jsxs("p", { className: "text-[11px] uppercase tracking-[0.14em] text-emerald-300/80", children: ["● Synced to site · ", form.published ? "published" : "hidden"] }),
          ] }),
        tab === "details" && g.jsxs("div", { className: "space-y-4", children: [
            g.jsx(U.RecordForm, { value: form, onChange: set, fields: [
                { key: "name", label: "Product name" },
                { key: "categoryId", label: "Category", type: "select", options: data.categories.map((c) => ({ value: c.id, label: c.name })) },
                { key: "subcategory", label: "Subcategory", type: "select", options: (data.categories.find((c) => c.id === form.categoryId)?.subs || []) },
                { key: "supplierId", label: "Supplier", type: "select", options: data.suppliers.map((s) => ({ value: s.id, label: s.name })) },
                { key: "destination", label: "Destination", type: "select", options: data.destinations.map((d) => d.name) },
                { key: "unit", label: "Pricing unit", type: "select", options: ["night", "guest", "person", "couple", "group", "session", "hour", "day", "vehicle", "boat", "room", "charter", "transfer", "package", "event"] },
                { key: "capacity", label: "Capacity & restrictions (e.g. “up to 8 guests”, “min 2”)" },
                { key: "minPax", label: "Minimum PAX", type: "number" },
                { key: "maxPax", label: "Maximum PAX", type: "number" },
                { key: "duration", label: "Duration (e.g. 2 hours, 3 days)" },
                { key: "location", label: "Exact location" },
                { key: "rating", label: "Rating", type: "number", step: 0.01 },
              ] }),
            g.jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [
                g.jsx(U.Field, { label: "Booking requirements", type: "textarea", rows: 2, value: form.bookingRequirements || "", placeholder: "Deposit, age limits, fitness, notice period…", onChange: (v) => set({ bookingRequirements: v }) }),
                g.jsx(U.Field, { label: "Special instructions (internal + guest-facing notes)", type: "textarea", rows: 2, value: form.specialInstructions || "", placeholder: "Setup time, what the guest should bring…", onChange: (v) => set({ specialInstructions: v }) }),
              ] }),
            g.jsx(U.Field, { label: "Description", type: "textarea", rows: 4, value: form.description, onChange: (v) => set({ description: v }) }),
            g.jsxs("div", { className: "grid gap-4 md:grid-cols-3", children: [
                g.jsx(U.Field, { label: "Facilities (comma separated)", type: "textarea", rows: 3, value: (form.facilities || []).join(", "), onChange: (v) => set({ facilities: v.split(",").map((s) => s.trim()).filter(Boolean) }) }),
                g.jsx(U.Field, { label: "Inclusions", type: "textarea", rows: 3, value: (form.inclusions || []).join(", "), onChange: (v) => set({ inclusions: v.split(",").map((s) => s.trim()).filter(Boolean) }) }),
                g.jsx(U.Field, { label: "Exclusions", type: "textarea", rows: 3, value: (form.exclusions || []).join(", "), onChange: (v) => set({ exclusions: v.split(",").map((s) => s.trim()).filter(Boolean) }) }),
              ] }),
          ] }),
        tab === "pricing" && g.jsxs("div", { className: "space-y-4", children: [
            g.jsx(U.RecordForm, { value: form, onChange: set, cols: 3, fields: [
                { key: "netRate", label: "Net supplier rate", type: "number" },
                { key: "sellingRate", label: "Selling rate", type: "number" },
                { key: "stock", label: "Stock / allotment", type: "number" },
              ] }),
            g.jsxs("div", { className: "grid gap-3 sm:grid-cols-3", children: [
                g.jsxs("div", { className: "border border-line px-3 py-2", children: [g.jsx("p", { className: "eyebrow", children: "Markup" }), g.jsxs("p", { className: "num text-ivory", children: [form.netRate ? Math.round(((form.sellingRate - form.netRate) / form.netRate) * 100) : 0, "%"] })] }),
                g.jsxs("div", { className: "border border-line px-3 py-2", children: [g.jsx("p", { className: "eyebrow", children: "Profit per unit" }), g.jsx("p", { className: "num text-emerald-300", children: D.money(form.sellingRate - form.netRate) })] }),
                g.jsxs("div", { className: "border border-line px-3 py-2", children: [g.jsx("p", { className: "eyebrow", children: "Price on website" }), g.jsx("p", { className: "num text-gold-soft", children: D.money(form.sellingRate) })] }),
              ] }),
            g.jsx(U.Field, { label: "Price on request — show “Price on request” on the website instead of a price (turns off automatically when a selling rate is set)", type: "checkbox", value: !!form.priceOnRequest && !(Number(form.sellingRate) > 0), onChange: (v) => set({ priceOnRequest: v }) }),
            g.jsx("p", { className: "text-[12px] leading-relaxed text-ivory/55", children: "The selling rate is what every connected module uses: the Catalogue, Destination pages, Vacation Builder, Quotations and the live customer website. Net rates and margins are never sent to the public site." }),
          ] }),
        tab === "photos" && g.jsxs("div", { className: "space-y-3", children: [
            g.jsx(U.ImageDrop, { images: form.images, onChange: (images) => set({ images }) }),
            g.jsx("p", { className: "text-[12px] text-ivory/55", children: "The first photo is the main image used on the Catalogue and Destination pages. Guests can click any website photo to open the lightbox gallery." }),
          ] }),
        tab === "config" && g.jsx(TypeConfig, { form, set, data }),
        tab === "availability" && g.jsxs("div", { className: "space-y-4", children: [
            g.jsx(U.RecordForm, { value: form, onChange: set, fields: [
                { key: "operatingHours", label: "Operating hours" },
                { key: "cancellationPolicy", label: "Cancellation policy" },
              ] }),
            g.jsx(U.Field, { label: "Blackout dates (comma separated YYYY-MM-DD)", value: (form.blackoutDates || []).join(", "), onChange: (v) => set({ blackoutDates: v.split(",").map((s) => s.trim()).filter(Boolean) }) }),
          ] }),
        tab === "inventory" && !isNew && g.jsx(InventoryManager, { slug: form.slug, user, inline: true }),
        tab === "notes" && g.jsxs("div", { className: "space-y-4", children: [
            g.jsx(U.Field, { label: "Internal notes (never shown to guests)", type: "textarea", rows: 4, value: form.internalNotes, onChange: (v) => set({ internalNotes: v }) }),
            g.jsx(U.Field, { label: "Product status", type: "select", value: form.status, onChange: (v) => set({ status: v }), options: ["live", "draft", "archived"] }),
            g.jsx(U.Field, { label: "Published to customer website", type: "checkbox", value: form.published, onChange: (v) => set({ published: v }) }),
            g.jsx(U.Field, { label: "Verification", type: "select", value: form.verification || "verified", onChange: (v) => set({ verification: v, verifyPending: v === "verified" ? [] : form.verifyPending?.length ? form.verifyPending : [...VERIFY_FIELDS] }), options: [{ value: "pending", label: "Pending — details not yet confirmed" }, { value: "quote", label: "Price on request — confirmed per quotation" }, { value: "verified", label: "Verified with the operator" }] }),
            form.verification === "pending" && g.jsxs("div", { className: "border border-amber-400/30 bg-amber-500/5 px-4 py-3", children: [
                g.jsx("p", { className: "mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200", children: "Still to confirm" }),
                g.jsx("div", { className: "grid gap-x-4 sm:grid-cols-2", children: VERIFY_FIELDS.map((f) => g.jsx(U.Field, { label: f, type: "checkbox", value: !(form.verifyPending || []).includes(f), onChange: (done) => {
                    const left = new Set(form.verifyPending || []); done ? left.delete(f) : left.add(f);
                    set({ verifyPending: [...left], verification: left.size ? "pending" : "verified" });
                  } }, f)) }),
              ] }),
          ] }),
      ] }) });
}

/* ======================= CATALOGUE & CATEGORIES =================== */
export function Catalogue({ user }) {
  const data = U.useDB();
  const [open, setOpen] = useState(null);
  const [creating, setCreating] = useState(false);
  const can = (a) => D.can(user, a, "catalogue");

  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsx(U.Panel, { title: "Catalogue & category management", subtitle: "Categories are relationships — products are never duplicated per page", pad: false, actions: [
          can("add") && g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => setCreating(true), children: "Add category" }),
          g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => bridge.navigate("/marketplace"), children: "Preview catalogue page" }),
        ], children: g.jsx(U.DataTable, { pageSize: 12, searchable: false, rows: data.categories.map((c) => ({ ...c, count: data.products.filter((p) => p.categoryId === c.id).length, live: data.products.filter((p) => p.categoryId === c.id && p.status === "live" && p.published).length })), columns: [
            { key: "name", label: "Category", render: (c) => g.jsx("span", { className: "font-medium text-ivory", children: c.name }) },
            { key: "subs", label: "Subcategories", render: (c) => g.jsx("span", { className: "text-ivory/60", children: (c.subs || []).join(" · ") }) },
            { key: "count", label: "Products" },
            { key: "live", label: "Live on site" },
            { key: "avg", label: "Avg selling rate", sortable: false, render: (c) => { const l = data.products.filter((p) => p.categoryId === c.id); return g.jsx("span", { className: "num", children: l.length ? D.money(l.reduce((s, p) => s + p.sellingRate, 0) / l.length) : "—" }); } },
          ], onRowClick: setOpen }) }),
      g.jsx(U.Panel, { title: "Products by category", subtitle: "Served directly from Product Master", pad: false, children: g.jsx(U.DataTable, { pageSize: 12, rows: data.products, columns: [
            { key: "name", label: "Product", render: (p) => g.jsx("span", { className: "font-medium text-ivory", children: p.name }) },
            { key: "categoryId", label: "Category", render: (p) => data.categories.find((c) => c.id === p.categoryId)?.name },
            { key: "subcategory", label: "Subcategory" },
            { key: "destination", label: "Destination" },
            { key: "sellingRate", label: "Selling", render: (p) => g.jsx("span", { className: "num text-gold-soft", children: D.money(p.sellingRate) }) },
            { key: "status", label: "On site", render: (p) => g.jsx(U.Badge, { children: p.published && p.status === "live" ? "live" : "hidden" }) },
          ], onRowClick: (p) => drillTo("products") }) }),
      open && g.jsxs(U.Modal, { open: true, onClose: () => setOpen(null), title: open.name,
          footer: [can("delete") && g.jsx(U.Btn, { size: "sm", variant: "danger", onClick: () => { if (data.products.some((p) => p.categoryId === open.id)) return alert("Move or delete the products in this category first."); D.update("categories", open.id, { deleted: true }, user, { module: "catalogue" }); setOpen(null); }, children: "Delete category" }), g.jsx(U.Btn, { size: "sm", onClick: () => setOpen(null), children: "Close" })],
          children: g.jsxs("div", { className: "space-y-4", children: [
              g.jsx(U.Field, { label: "Category name", value: open.name, onChange: (v) => setOpen({ ...open, name: v }) }),
              g.jsx(U.Field, { label: "Subcategories (comma separated)", value: (open.subs || []).join(", "), onChange: (v) => setOpen({ ...open, subs: v.split(",").map((s) => s.trim()).filter(Boolean) }) }),
              g.jsx(U.Btn, { variant: "dark", size: "sm", onClick: () => { D.update("categories", open.id, { name: open.name, subs: open.subs }, user, { module: "catalogue" }); setOpen(null); }, children: "Save category" }),
              g.jsx("div", { children: [
                  g.jsx("p", { className: "eyebrow mb-2", children: "Linked products" }),
                  g.jsx("ul", { className: "space-y-1 text-[13px] text-ivory/75", children: data.products.filter((p) => p.categoryId === open.id).slice(0, 20).map((p) => g.jsxs("li", { children: [p.name, " — ", D.money(p.sellingRate), "/", p.unit] }, p.id)) }),
                ] }),
            ] }) }),
      creating && g.jsx(U.Modal, { open: true, onClose: () => setCreating(false), title: "New category",
          footer: [g.jsx(U.Btn, { onClick: () => setCreating(false), children: "Cancel" }), g.jsx(U.Btn, { variant: "solid", onClick: () => { if (!creating.name) return; D.insert("categories", { ...creating, subs: (creating.subs || []).filter(Boolean) }, user, { module: "catalogue" }); setCreating(false); }, children: "Create" })],
          children: g.jsx(U.RecordForm, { value: creating, onChange: setCreating, fields: [
              { key: "name", label: "Category name" },
              { key: "subs", label: "Subcategories (comma separated)", type: "textarea", rows: 2, },
            ] }) }),
    ] });
}

/* ========================== SUPPLIERS ============================= */
export function Suppliers({ user }) {
  const data = U.useDB();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const can = (a) => D.can(user, a, "suppliers");
  const seeBank = user?.role === "super_admin" || user?.role === "finance";
  const rows = data.suppliers.map((s) => ({ ...s, products: data.products.filter((p) => p.supplierId === s.id).length }));

  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsx(U.Panel, { title: "Supplier management", subtitle: "Contract, net rates, terms and linked products", pad: false, actions: [
          can("add") && g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => setCreating(true), children: "Add supplier" }),
          g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => U.exportCSV("suppliers", rows.map((s) => ({ ID: s.id, Name: s.name, Category: s.category, Region: s.region, Email: s.email, Phone: s.phone, Products: s.products, Status: s.status }))), children: "Export CSV" }),
        ], children: g.jsx(U.DataTable, { pageSize: 12, rows, columns: [
            { key: "id", label: "ID" },
            { key: "name", label: "Supplier", render: (s) => g.jsx("span", { className: "font-medium text-ivory", children: s.name }) },
            { key: "category", label: "Category" },
            { key: "region", label: "Location" },
            { key: "contactPerson", label: "Contact" },
            { key: "email", label: "Email" },
            { key: "paymentTerms", label: "Payment terms" },
            { key: "products", label: "Products" },
            { key: "status", label: "Status", render: (s) => g.jsx(U.Badge, { children: s.status }) },
          ], onRowClick: setEditing }) }),
      editing && g.jsx(U.Modal, { open: true, onClose: () => setEditing(null), wide: true, title: editing.name,
          footer: [
            can("delete") && g.jsx(U.Btn, { size: "sm", variant: "danger", onClick: () => { if (confirm("Delete supplier " + editing.name + "?")) { D.remove("suppliers", editing.id, user, { module: "suppliers" }); setEditing(null); } }, children: "Delete" }),
            g.jsx(U.Btn, { size: "sm", onClick: () => drillTo("products"), children: "View products" }),
            can("edit") && g.jsx(U.Btn, { size: "sm", variant: "dark", onClick: () => { D.update("suppliers", editing.id, editing, user, { module: "suppliers" }); }, children: "Save" }),
            g.jsx(U.Btn, { size: "sm", onClick: () => setEditing(null), children: "Close" }),
          ],
          children: g.jsxs("div", { className: "space-y-4", children: [
              g.jsx(U.RecordForm, { value: editing, onChange: setEditing, fields: [
                  { key: "name", label: "Company" }, { key: "contactPerson", label: "Contact person" },
                  { key: "category", label: "Supplier category" }, { key: "region", label: "Location" },
                  { key: "phone", label: "Phone" }, { key: "whatsapp", label: "WhatsApp" },
                  { key: "email", label: "Email" }, { key: "website", label: "Website" },
                  { key: "address", label: "Address", type: "textarea", rows: 2 },
                  { key: "contract", label: "Contract details" }, { key: "paymentTerms", label: "Payment terms" },
                  { key: "netRates", label: "Net rates / agreements" },
                  { key: "status", label: "Status", type: "select", options: ["active", "inactive"] },
                ] }),
              seeBank ? g.jsx(U.Field, { label: "Bank / payment information (restricted)", value: editing.bank, onChange: (v) => setEditing({ ...editing, bank: v }), hint: "Visible to Super Admin and Finance only." })
                : g.jsx("div", { className: "border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200", children: "Bank details are hidden for your role. Access is enforced in the data layer, not by hiding a field." }),
              g.jsx(U.Field, { label: "Internal notes & documents", type: "textarea", rows: 3, value: editing.notes, onChange: (v) => setEditing({ ...editing, notes: v }) }),
              g.jsxs("div", { children: [
                  g.jsx("p", { className: "eyebrow mb-2", children: "Linked products" }),
                  g.jsx(U.DataTable, { searchable: false, pageSize: 5, rows: data.products.filter((p) => p.supplierId === editing.id), columns: [
                      { key: "name", label: "Product" }, { key: "netRate", label: "Net", render: (p) => D.money(p.netRate) },
                      { key: "sellingRate", label: "Sell", render: (p) => D.money(p.sellingRate) },
                      { key: "status", label: "Status", render: (p) => g.jsx(U.Badge, { children: p.status }) },
                    ] }),
                ] }),
            ] }) }),
      creating && g.jsx(U.Modal, { open: true, onClose: () => setCreating(false), title: "New supplier",
          footer: [g.jsx(U.Btn, { onClick: () => setCreating(false), children: "Cancel" }), g.jsx(U.Btn, { variant: "solid", onClick: () => { D.insert("suppliers", { ...creating, id: D.nextNumber("SUP-", "supSeq", 3), status: "active", restrictedBankAccess: true }, user, { module: "suppliers" }); setCreating(false); }, children: "Create supplier" })],
          children: g.jsx(U.RecordForm, { value: creating, onChange: setCreating, fields: [
              { key: "name", label: "Company" }, { key: "contactPerson", label: "Contact person" }, { key: "category", label: "Category" }, { key: "region", label: "Location" },
              { key: "phone", label: "Phone" }, { key: "email", label: "Email" }, { key: "paymentTerms", label: "Payment terms" },
            ] }) }),
    ] });
}

/* ======================= DESTINATION MANAGEMENT =================== */
export function Destinations({ user }) {
  const data = U.useDB();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const can = (a) => D.can(user, a, "destinations");
  const rows = data.destinations.map((d) => ({ ...d, products: (d.productSlugs || []).length }));

  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsx(U.Panel, { title: "Destination management", subtitle: "Destination pages are generated from these records and their linked products", pad: false, actions: [
          can("add") && g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => setCreating(true), children: "Add destination" }),
          g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => bridge.navigate("/marketplace"), children: "Preview on site" }),
        ], children: g.jsx(U.DataTable, { pageSize: 12, rows, columns: [
            { key: "heroImage", label: "Photo", sortable: false, render: (d) => g.jsx("div", { className: "h-10 w-14 overflow-hidden border border-line bg-ink", children: d.heroImage ? g.jsx("img", { src: d.heroImage, alt: "", className: "h-full w-full object-cover" }) : null }) },
            { key: "name", label: "Destination", render: (d) => g.jsx("span", { className: "font-medium text-ivory", children: d.name }) },
            { key: "tagline", label: "Tagline" },
            { key: "location", label: "Location" },
            { key: "products", label: "Linked products" },
            { key: "status", label: "Status", render: (d) => g.jsx(U.Badge, { children: d.status }) },
          ], onRowClick: setEditing }) }),
      editing && g.jsx(U.Modal, { open: true, onClose: () => setEditing(null), wide: true, title: editing.name,
          footer: [
            can("delete") && g.jsx(U.Btn, { size: "sm", variant: "danger", onClick: () => { if (confirm("Delete " + editing.name + "?")) { D.remove("destinations", editing.id, user, { module: "destinations" }); setEditing(null); } }, children: "Delete" }),
            g.jsx(U.Btn, { size: "sm", variant: "dark", onClick: () => { D.update("destinations", editing.id, editing, user, { module: "destinations" }); }, children: "Save & publish" }),
            g.jsx(U.Btn, { size: "sm", onClick: () => setEditing(null), children: "Close" }),
          ],
          children: g.jsxs("div", { className: "space-y-4", children: [
              g.jsx(U.RecordForm, { value: editing, onChange: setEditing, fields: [
                  { key: "name", label: "Destination name" }, { key: "tagline", label: "Tagline" },
                  { key: "location", label: "Location" }, { key: "mapQuery", label: "Map reference" },
                  { key: "seoTitle", label: "SEO title" }, { key: "typography", label: "Typography", type: "select", options: ["serif", "sans"] },
                  { key: "status", label: "Status", type: "select", options: ["published", "draft"] },
                ] }),
              g.jsx(U.Field, { label: "Description", type: "textarea", rows: 3, value: editing.description, onChange: (v) => setEditing({ ...editing, description: v }) }),
              g.jsx(U.Field, { label: "Detailed content", type: "textarea", rows: 5, value: editing.content, onChange: (v) => setEditing({ ...editing, content: v }) }),
              g.jsx(U.Field, { label: "SEO meta description", type: "textarea", rows: 2, value: editing.seoDescription, onChange: (v) => setEditing({ ...editing, seoDescription: v }) }),
              g.jsx("div", { children: [
                  g.jsx("p", { className: "eyebrow mb-2", children: "Main photo" }),
                  g.jsx(U.ImageDrop, { single: true, images: editing.heroImage ? [{ url: editing.heroImage, caption: editing.name }] : [], onChange: (imgs) => setEditing({ ...editing, heroImage: imgs[0]?.url || "" }) }),
                ] }),
              g.jsx("div", { children: [
                  g.jsx("p", { className: "eyebrow mb-2", children: "Gallery" }),
                  g.jsx(U.ImageDrop, { images: (editing.gallery || []).map((u) => ({ url: u, caption: "" })), onChange: (imgs) => setEditing({ ...editing, gallery: imgs.map((i) => i.url) }) }),
                ] }),
              g.jsxs("div", { children: [
                  g.jsx("p", { className: "eyebrow mb-2", children: "Related categories & products" }),
                  g.jsx(U.Field, { label: "Related categories", type: "select", value: (editing.categories || [])[0] || "accommodation", onChange: (v) => setEditing({ ...editing, categories: [v] }), options: data.categories.map((c) => ({ value: c.id, label: c.name })) }),
                  g.jsx("p", { className: "mt-3 text-[12px] text-ivory/55", children: (editing.productSlugs || []).length + " products are linked to this destination through Product Master. Change a product's destination field in Product Master and it appears here automatically." }),
                ] }),
            ] }) }),
      creating && g.jsx(U.Modal, { open: true, onClose: () => setCreating(false), title: "New destination",
          footer: [g.jsx(U.Btn, { onClick: () => setCreating(false), children: "Cancel" }), g.jsx(U.Btn, { variant: "solid", onClick: () => { D.insert("destinations", { ...creating, id: D.nextNumber("DST-", "dstSeq", 3), gallery: [], productSlugs: [], categories: ["accommodation"], status: "draft" }, user, { module: "destinations" }); setCreating(false); }, children: "Create" })],
          children: g.jsx(U.RecordForm, { value: creating, onChange: setCreating, fields: [
              { key: "name", label: "Destination name" }, { key: "tagline", label: "Tagline" }, { key: "location", label: "Location" },
              { key: "description", label: "Description", type: "textarea", rows: 3 },
            ] }) }),
    ] });
}

/* ============================== CMS =============================== */
export function CMS({ user }) {
  const data = U.useDB();
  const cms = data.cms;
  const [tab, setTab] = useState("home");
  const [draft, setDraft] = useState(cms);
  const [saved, setSaved] = useState("");
  const can = (a) => D.can(user, a, "cms");
  const publish = () => { D.publishCMS(draft, user); setSaved("Published to the customer website " + new Date().toLocaleTimeString()); setTimeout(() => setSaved(""), 4000); };

  const dirty = JSON.stringify(draft) !== JSON.stringify(cms);
  const TABS = [
    { id: "home", label: "Homepage" },
    { id: "content", label: "Website content" },
    { id: "menus", label: "Menus" },
    { id: "builder", label: "Vacation builder" },
    { id: "brand", label: "Logo & contact" },
    { id: "seo", label: "SEO" },
    { id: "testimonials", label: "Testimonials" },
    { id: "blog", label: "Blog" },
    { id: "promo", label: "Announcements" },
  ];

  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsxs(U.Panel, { pad: false, children: [
          g.jsx("div", { className: "border-b border-line px-5 py-4", children: g.jsx(U.Tabs, { tabs: TABS, active: tab, onChange: setTab }) }),
          g.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 px-5 py-4", children: [
              g.jsxs("p", { className: "text-[12px] text-ivory/55", children: [dirty ? "You have unpublished changes — the website updates when you press Publish. " : "Every change here is a draft until you publish it. ", "Internal operations data — costs, margins, staff notes, audit logs — is never published.", saved && g.jsx("span", { className: "ml-2 text-emerald-300", children: saved })] }),
              g.jsxs("div", { className: "flex gap-2", children: [
                  g.jsx(U.Btn, { size: "sm", onClick: () => { bridge.navigate("/"); }, children: "Preview site" }),
                  dirty && g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => confirm("Discard all unpublished changes?") && setDraft(cms), children: "Discard changes" }),
                  g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: publish, disabled: !can("edit") || !dirty, children: dirty ? "Publish changes" : "Published" }),
                ] }),
            ] }),
        ] }),

      tab === "home" && g.jsx(U.Panel, { title: "Homepage background", subtitle: "Desktop and mobile photographs behind the homepage hero", children: g.jsxs("div", { className: "space-y-5", children: [
            g.jsxs("div", { className: "grid gap-6 md:grid-cols-2", children: [
                g.jsxs("div", { children: [
                    g.jsx("p", { className: "eyebrow mb-2", children: "Desktop (landscape)" }),
                    g.jsx(U.ImageDrop, { single: true, maxDim: 1920, images: draft.home.hero?.image ? [{ url: draft.home.hero.image }] : [], hint: "Landscape, at least 1920 px wide. Optimised automatically on upload.", onChange: (imgs) => setDraft({ ...draft, home: { ...draft.home, hero: { ...(draft.home.hero || {}), image: imgs[0]?.url || "" } } }) }),
                  ] }),
                g.jsxs("div", { children: [
                    g.jsx("p", { className: "eyebrow mb-2", children: "Mobile (portrait)" }),
                    g.jsx(U.ImageDrop, { single: true, maxDim: 1200, images: draft.home.hero?.imageMobile ? [{ url: draft.home.hero.imageMobile }] : [], hint: "Portrait crop for phones. If empty, the desktop photograph is used.", onChange: (imgs) => setDraft({ ...draft, home: { ...draft.home, hero: { ...(draft.home.hero || {}), imageMobile: imgs[0]?.url || "" } } }) }),
                  ] }),
              ] }),
            g.jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [
                g.jsx(U.Field, { label: "Image description (alt text)", value: draft.home.hero?.alt || "", placeholder: "Infinity pool above the Indian Ocean, Bali", onChange: (v) => setDraft({ ...draft, home: { ...draft.home, hero: { ...(draft.home.hero || {}), alt: v } } }) }),
                g.jsx(U.Field, { label: "Dark overlay for readability: " + (draft.home.hero?.overlay ?? 25) + "%", type: "range", min: 0, max: 80, step: 5, value: draft.home.hero?.overlay ?? 25, onChange: (v) => setDraft({ ...draft, home: { ...draft.home, hero: { ...(draft.home.hero || {}), overlay: Number(v) } } }) }),
              ] }),
            g.jsxs("p", { className: "text-[12px] text-ivory/50", children: ["With no upload, the site uses the licensed default photography (Tom Fisk and Nastia Ligrain, Pexels licence). ",
                g.jsx("button", { onClick: () => setDraft({ ...draft, home: { ...draft.home, hero: { ...(draft.home.hero || {}), image: "", imageMobile: "" } } }), className: "text-gold-soft hover:underline", children: "Restore default photography" })] }),
          ] }) }),
      tab === "home" && g.jsx(U.Panel, { title: "Homepage hero text", children: g.jsxs("div", { className: "space-y-4", children: [
            g.jsx(U.RecordForm, { value: draft.home.hero || {}, onChange: (hero) => setDraft({ ...draft, home: { ...draft.home, hero } }), fields: [
                { key: "eyebrow", label: "Eyebrow / rating line" },
                { key: "title", label: "Headline" },
                { key: "body", label: "Sub-headline", type: "textarea", rows: 3 },
              ] }),
          ] }) }),

      tab === "content" && g.jsx(ContentEditor, { draft, setDraft }),
      tab === "menus" && g.jsx(MenuEditor, { draft, setDraft }),
      tab === "builder" && g.jsx(BuilderEditor, { draft, setDraft }),
      tab === "brand" && g.jsx(BrandEditor, { draft, setDraft }),
      tab === "seo" && g.jsx(U.Panel, { title: "SEO — search engine title & description", children: g.jsxs("div", { className: "space-y-4", children: [
            g.jsx(U.RecordForm, { value: draft.seo || {}, onChange: (seo) => setDraft({ ...draft, seo }), fields: [
                { key: "title", label: "Site title" },
                { key: "description", label: "Meta description", type: "textarea", rows: 3 },
              ] }),
            
          ] }) }),

      tab === "testimonials" && g.jsx(TestimonialsEditor, { draft, setDraft }),
      tab === "blog" && g.jsx(U.Panel, { title: "Blog & articles", pad: false, actions: [
          g.jsx(U.Btn, { size: "sm", onClick: () => setDraft({ ...draft, blog: [...(draft.blog || []), { id: "BLG-" + Date.now(), title: "New article", excerpt: "", status: "draft", date: D.today() }] }), children: "Add article" }),
        ], children: g.jsx(U.DataTable, { pageSize: 10, rows: draft.blog || [], columns: [
            { key: "title", label: "Title" }, { key: "excerpt", label: "Excerpt" },
            { key: "date", label: "Date", render: (b) => D.fmtDate(b.date) },
            { key: "status", label: "Status", render: (b) => g.jsx(U.Badge, { children: b.status }) },
          ], onRowClick: (b) => { const t = prompt("Title", b.title); if (t) setDraft({ ...draft, blog: (draft.blog || []).map((x) => (x.id === b.id ? { ...x, title: t } : x)) }); } }) }),

      tab === "promo" && g.jsx(U.Panel, { title: "Website announcements & promotions", children: g.jsxs("div", { className: "space-y-4", children: [
            g.jsx(U.Field, { label: "Show announcement bar on the customer website", type: "checkbox", value: draft.announcement?.enabled, onChange: (v) => setDraft({ ...draft, announcement: { ...(draft.announcement || {}), enabled: v } }) }),
            g.jsx(U.Field, { label: "Announcement text", type: "textarea", rows: 2, value: draft.announcement?.text, onChange: (v) => setDraft({ ...draft, announcement: { ...(draft.announcement || {}), text: v } }) }),
          ] }) }),
    ] });
}

/* ============================= REVIEWS ============================ */
export function Reviews({ user }) {
  const data = U.useDB();
  const can = (a) => D.can(user, a, "reviews");
  const [syncing, setSyncing] = useState("");
  const integration = data.integrations.find((i) => i.name === "Google Business Profile");

  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsxs(U.Panel, { title: "Google Business Profile reviews", subtitle: "Synchronised through the authorised Google API — no scraping", actions: [
          g.jsx(U.Btn, { size: "sm", variant: "solid", disabled: integration?.status !== "connected", onClick: () => {
              setSyncing("Syncing…");
              setTimeout(() => {
                D.update("integrations", integration.id, { lastSync: Date.now(), status: "connected" }, user, { module: "reviews" });
                D.insert("reviews", { id: "REV-" + Date.now(), source: "Google Business Profile", author: "Verified guest", rating: 5, text: "Seamless from enquiry to departure — the villa and the team were exceptional.", date: D.today(), status: "pending" }, user, { module: "reviews" });
                setSyncing("Synchronised " + new Date().toLocaleTimeString());
              }, 700);
            }, children: "Refresh from Google" }),
        ], children: g.jsxs("div", { className: "grid gap-4 sm:grid-cols-3", children: [
            g.jsxs("div", { className: "border border-line px-4 py-3", children: [g.jsx("p", { className: "eyebrow", children: "Connection" }), g.jsx(U.Badge, { children: integration?.status || "disconnected" })] }),
            g.jsxs("div", { className: "border border-line px-4 py-3", children: [g.jsx("p", { className: "eyebrow", children: "Last sync" }), g.jsx("p", { className: "text-[13px] text-ivory", children: integration?.lastSync ? D.fmtDateTime(integration.lastSync) : "never" })] }),
            g.jsxs("div", { className: "border border-line px-4 py-3", children: [g.jsx("p", { className: "eyebrow", children: "Average rating" }), g.jsx("p", { className: "font-display text-xl text-gold-soft", children: (data.reviews.reduce((s, r) => s + r.rating, 0) / (data.reviews.length || 1)).toFixed(2) })] }),
          ] }) }),
      syncing && g.jsx("p", { className: "text-[12px] text-emerald-300", children: syncing }),
      g.jsx(U.Panel, { title: "Review moderation", subtitle: "Only published reviews appear on the customer website", pad: false, children: g.jsx(U.DataTable, { pageSize: 10, rows: data.reviews, columns: [
            { key: "author", label: "Reviewer" }, { key: "source", label: "Source" },
            { key: "rating", label: "Rating", render: (r) => g.jsxs("span", { className: "text-gold", children: ["★", r.rating] }) },
            { key: "text", label: "Review" },
            { key: "date", label: "Date", render: (r) => D.fmtDate(r.date) },
            { key: "status", label: "Display", render: (r) => g.jsx(U.Badge, { children: r.status }) },
            { key: "act", label: "", sortable: false, render: (r) => can("approve") ? g.jsx("button", { onClick: () => D.update("reviews", r.id, { status: r.status === "published" ? "hidden" : "published" }, user, { module: "reviews" }), className: "text-[11px] uppercase tracking-wide text-gold-soft hover:underline", children: r.status === "published" ? "Hide" : "Publish" }) : null },
          ] }) }),
    ] });
}

/* ========================= USERS & PERMISSIONS ==================== */
export function Users({ user }) {
  const data = U.useDB();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const MODULES = ["dashboard", "requests", "emails", "inventory", "arrivals", "inhouse", "departures", "calendar", "reports", "inquiries", "builder", "quotations", "bookings", "itineraries", "customers", "invoices", "payments", "suppliers", "products", "catalogue", "destinations", "cms", "reviews", "users", "integrations", "audit"];
  const ACTIONS = ["view", "add", "edit", "delete", "approve", "export"];

  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsx(U.Panel, { title: "User roles & permissions", subtitle: "Permissions are enforced in the data layer — every mutation is checked before it writes", pad: false, actions: [
          g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => setCreating(true), children: "Add user" }),
        ], children: g.jsx(U.DataTable, { pageSize: 12, rows: data.users, columns: [
            { key: "name", label: "Name", render: (u) => g.jsx("span", { className: "font-medium text-ivory", children: u.name }) },
            { key: "email", label: "Email" },
            { key: "role", label: "Role", render: (u) => g.jsx(U.Badge, { tone: u.role === "super_admin" ? "gold" : "neutral", children: D.ROLES[u.role]?.label || u.role }) },
            { key: "phone", label: "Phone" },
            { key: "overrides", label: "Custom permissions", sortable: false, render: (u) => (Object.keys(u.permissions || {}).length ? Object.keys(u.permissions).length + " modules" : "role default") },
            { key: "status", label: "Status", render: (u) => g.jsx(U.Badge, { children: u.status }) },
          ], onRowClick: setEditing }) }),
      editing && g.jsx(U.Modal, { open: true, onClose: () => setEditing(null), wide: true, title: editing.name,
          footer: [g.jsx(U.Btn, { size: "sm", variant: "danger", onClick: () => { if (editing.role === "super_admin") return alert("The Super Admin account cannot be deleted."); if (confirm("Remove " + editing.name + "?")) { D.remove("users", editing.id, user, { module: "users" }); setEditing(null); } }, children: "Delete" }),
            g.jsx(U.Btn, { size: "sm", variant: "dark", onClick: () => { D.update("users", editing.id, editing, user, { module: "users" }); }, children: "Save" }),
            g.jsx(U.Btn, { size: "sm", onClick: () => setEditing(null), children: "Close" })],
          children: g.jsxs("div", { className: "space-y-4", children: [
              g.jsx(U.RecordForm, { value: editing, onChange: setEditing, fields: [
                  { key: "name", label: "Full name" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" },
                  { key: "role", label: "Role", type: "select", options: Object.entries(D.ROLES).map(([k, v]) => ({ value: k, label: v.label })) },
                  { key: "status", label: "Status", type: "select", options: ["active", "suspended"] },
                ] }),
              editing.role === "super_admin" ? g.jsx("p", { className: "border border-gold/30 bg-gold/10 px-4 py-3 text-[12px] text-gold-soft", children: "Super Admin holds unrestricted authority across every module, including financial data, audit management and system settings." })
                : g.jsxs("div", { children: [
                    g.jsx("p", { className: "eyebrow mb-2", children: "Individual permission overrides" }),
                    g.jsx("div", { className: "overflow-x-auto", children: g.jsx("table", { className: "w-full min-w-[620px] text-left text-[12px]", children: [
                        g.jsx("thead", { children: g.jsx("tr", { children: [
                            g.jsx("th", { className: "border-b border-line py-2 text-[9px] uppercase tracking-[0.14em] text-ivory/45", children: "Module" }),
                            ...ACTIONS.map((a) => g.jsx("th", { className: "border-b border-line py-2 text-center text-[9px] uppercase tracking-[0.14em] text-ivory/45", children: a }, a)),
                          ] }) }),
                        g.jsx("tbody", { children: MODULES.map((m) => g.jsx("tr", { children: [
                            g.jsx("td", { className: "border-b border-line/50 py-2 text-ivory/75", children: m }, m),
                            ...ACTIONS.map((a) => g.jsx("td", { className: "border-b border-line/50 py-2 text-center", children: g.jsx("input", {
                                type: "checkbox",
                                checked: (editing.permissions?.[m] || []).includes(a),
                                onChange: (e) => {
                                  const cur = editing.permissions || {};
                                  const list = new Set(cur[m] || []);
                                  if (e.target.checked) list.add(a); else list.delete(a);
                                  setEditing({ ...editing, permissions: { ...cur, [m]: [...list] } });
                                },
                              }) }, m + "-" + a)),
                          ] }, m)) }),
                      ] }) }),
                  ] }),
            ] }) }),
      creating && g.jsx(U.Modal, { open: true, onClose: () => setCreating(false), title: "Add user",
          footer: [g.jsx(U.Btn, { onClick: () => setCreating(false), children: "Cancel" }), g.jsx(U.Btn, { variant: "solid", onClick: () => { D.insert("users", { ...creating, id: D.nextNumber("USR-", "usrSeq", 3), permissions: {}, status: "active" }, user, { module: "users" }); setCreating(false); }, children: "Create user" })],
          children: g.jsx(U.RecordForm, { value: creating, onChange: setCreating, fields: [
              { key: "name", label: "Full name" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" },
              { key: "role", label: "Role", type: "select", options: Object.entries(D.ROLES).map(([k, v]) => ({ value: k, label: v.label })) },
            ] }) }),
    ] });
}

/* ========================== INTEGRATIONS ========================== */
export function Integrations({ user }) {
  const data = U.useDB();
  const [editing, setEditing] = useState(null);
  const can = (a) => D.can(user, a, "integrations");
  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsx(U.Panel, { title: "API & third-party integrations", subtitle: "Modular adapters — credentials are stored encrypted server-side and never sent to the browser", pad: false, actions: [
          g.jsx(U.Btn, { size: "sm", variant: "solid", onClick: () => setEditing({ id: null, name: "", kind: "OTA", status: "disconnected", credentials: {}, webhook: "", autoSync: false, notes: "" }), children: "Add integration" }),
        ], children: g.jsx(U.DataTable, { pageSize: 12, rows: data.integrations, columns: [
            { key: "name", label: "Platform", render: (i) => g.jsx("span", { className: "font-medium text-ivory", children: i.name }) },
            { key: "kind", label: "Type" },
            { key: "status", label: "Status", render: (i) => g.jsx(U.Badge, { children: i.status }) },
            { key: "autoSync", label: "Auto sync", render: (i) => (i.autoSync ? "On" : "Off") },
            { key: "lastSync", label: "Last sync", render: (i) => (i.lastSync ? D.fmtDateTime(i.lastSync) : "—") },
            { key: "webhook", label: "Webhook" },
          ], onRowClick: setEditing }) }),
      g.jsx(InventorySyncPanel, { user }),
      editing && g.jsx(U.Modal, { open: true, onClose: () => setEditing(null), wide: true, title: editing.name || "New integration",
        footer: [
          editing.id && g.jsx(U.Btn, { size: "sm", onClick: () => { D.update("integrations", editing.id, { lastSync: Date.now(), status: editing.status === "connected" ? "connected" : "connected" }, user, { module: "integrations" }); setEditing({ ...editing, lastSync: Date.now() }); }, children: "Sync now" }),
          editing.id && g.jsx(U.Btn, { size: "sm", variant: editing.status === "connected" ? "danger" : "solid", onClick: () => { D.update("integrations", editing.id, { status: editing.status === "connected" ? "disconnected" : "connected" }, user, { module: "integrations" }); setEditing({ ...editing, status: editing.status === "connected" ? "disconnected" : "connected" }); }, children: editing.status === "connected" ? "Disconnect" : "Connect" }),
          can("edit") && g.jsx(U.Btn, { size: "sm", variant: "dark", onClick: () => { editing.id ? D.update("integrations", editing.id, editing, user, { module: "integrations" }) : D.insert("integrations", { ...editing, id: D.nextNumber("INT-", "intSeq", 3), errorLog: [] }, user, { module: "integrations" }); setEditing(null); }, children: "Save" }),
          g.jsx(U.Btn, { size: "sm", onClick: () => setEditing(null), children: "Close" }),
        ],
        children: g.jsxs("div", { className: "space-y-4", children: [
            g.jsx(U.RecordForm, { value: editing, onChange: setEditing, fields: [
                { key: "name", label: "Platform" },
                { key: "kind", label: "Adapter type", type: "select", options: ["OTA", "PMS / Channel Manager", "Payment gateway", "Currency", "Google services", "Notifications", "Other"] },
                { key: "status", label: "Connection status", type: "select", options: ["connected", "disconnected", "error"] },
                { key: "autoSync", label: "Automatic synchronisation", type: "checkbox" },
                { key: "webhook", label: "Webhook endpoint" },
                { key: "notes", label: "Notes", type: "textarea", rows: 2 },
              ] }),
            g.jsxs("div", { children: [
                g.jsx("p", { className: "eyebrow mb-2", children: "Credentials (write-only)" }),
                g.jsx("p", { className: "mb-2 text-[12px] text-ivory/55", children: "Secrets are masked and never returned to the frontend. Enter a new value to replace the stored credential." }),
                g.jsx(U.Field, { label: "API key / token", value: "", placeholder: "Paste to replace stored credential", onChange: () => alert("In production this posts to the secure credential vault over TLS; the value is never persisted in the browser.") }),
              ] }),
            g.jsxs("div", { children: [
                g.jsx("p", { className: "eyebrow mb-2", children: "Capabilities" }),
                g.jsxs("ul", { className: "space-y-1 text-[12px] text-ivory/65", children: [
                    g.jsx("li", { children: "· Availability & rate push/pull where the platform permits" }),
                    g.jsx("li", { children: "· Reservation import with de-duplication against existing BCNs" }),
                    g.jsx("li", { children: "· Webhook receiver for live updates and error logging" }),
                    g.jsx("li", { children: "· Adapter registry so new platforms need no rebuild" }),
                  ] }),
              ] }),
          ] }) }),
    ] });
}

/* ============================ AUDIT LOG =========================== */
export function AuditLog({ user }) {
  const data = U.useDB();
  const [action, setAction] = useState("all");
  const can = (a) => D.can(user, a, "audit");
  const rows = action === "all" ? data.auditLogs : data.auditLogs.filter((l) => l.action === action);
  const actions = [...new Set(data.auditLogs.map((l) => l.action))];

  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsx(U.Panel, { title: "Audit log", subtitle: "Every add, edit, delete, approve, publish, payment and booking action", pad: false, actions: [
          g.jsx("select", { value: action, onChange: (e) => setAction(e.target.value), className: "border border-ivory/20 bg-ink/40 px-3 py-2 text-[12px] text-ivory", children: ["all", ...actions].map((a) => g.jsx("option", { value: a, children: a }, a)) }),
          g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => U.exportCSV("audit-log", rows.map((l) => ({ Time: D.fmtDateTime(l.at), User: l.actor, Role: l.role, Action: l.action, Module: l.module, Record: l.recordId, Before: l.before, After: l.after }))), children: "Export CSV" }),
        ], children: g.jsx(U.DataTable, { pageSize: 15, rows, columns: [
            { key: "at", label: "Timestamp", render: (l) => D.fmtDateTime(l.at) },
            { key: "actor", label: "User" },
            { key: "role", label: "Role" },
            { key: "action", label: "Action", render: (l) => g.jsx(U.Badge, { tone: l.action === "delete" ? "red" : l.action === "add" ? "green" : "neutral", children: l.action }) },
            { key: "module", label: "Module" },
            { key: "recordId", label: "Record" },
            { key: "after", label: "Change" },
            { key: "manage", label: "", sortable: false, render: (l) => can("delete") ? g.jsx("span", { className: "flex gap-2" , children: [
                g.jsx("button", { onClick: () => { const v = prompt("Correct this audit entry", l.after); if (v !== null) { D.update("auditLogs", l.id, { after: v }, user, { module: "audit" }); D.audit(user, "audit-edit", "audit", l.id, l.after, v); } }, className: "text-[11px] uppercase text-gold-soft hover:underline", children: "Edit" }),
                g.jsx("button", { onClick: () => { if (confirm("Delete this audit entry? A protected security record of this deletion is written automatically.")) { D.audit(user, "audit-delete", "audit", l.id, l.after, null); D.remove("auditLogs", l.id, user, { module: "audit" }); } }, className: "text-[11px] uppercase text-rose-300 hover:underline", children: "Delete" }),
              ] }) : null },
          ] }) }),
      user?.role === "super_admin" && D.sampleCount() > 0 && g.jsx(U.Panel, { title: "Sample transactions", subtitle: "Seeded inquiries, quotations, bookings, invoices, payments and itineraries used while the system was being built", children: g.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-4", children: [
          g.jsxs("p", { className: "max-w-2xl text-[13px] leading-relaxed text-ivory/70", children: [D.sampleCount(), " sample transaction records are still in the database. Remove them before go-live so the dashboard, reports and guest lists contain only real business. Product Master, suppliers, destinations, users and CMS content are kept."] }),
          g.jsx(U.Btn, { variant: "danger", onClick: () => { if (confirm("Permanently remove all seeded sample transactions? This is recorded in the audit log.")) { const c = D.purgeSampleTransactions(user); alert("Removed: " + Object.entries(c).map(([k, v]) => v + " " + k).join(", ")); } }, children: "Remove sample transactions" }),
        ] }) }),
      g.jsx(U.Panel, { title: "Protected security log", subtitle: "Records every change made to the audit log itself — append-only", pad: false, children: g.jsx(U.DataTable, { pageSize: 8, searchable: false, rows: data.settings.securityLog || [], empty: "No administrative changes to audit records.", columns: [
            { key: "at", label: "Timestamp", render: (l) => D.fmtDateTime(l.at) },
            { key: "actor", label: "User" },
            { key: "action", label: "Action", render: (l) => g.jsx(U.Badge, { tone: "red", children: l.action }) },
            { key: "recordId", label: "Entry" },
            { key: "before", label: "Was" },
          ] }) }),
    ] });
}

/* ========================== SUPPLIER PORTAL ======================= */
export function SupplierPortal({ user }) {
  const data = U.useDB();
  const me = data.suppliers.find((s) => s.name.toLowerCase().includes((user?.name || "").toLowerCase().split(" ")[0])) || data.suppliers[0];
  const mine = data.products.filter((p) => p.supplierId === me?.id);
  const myBookings = data.bookings.filter((b) => (b.lines || []).some((l) => mine.some((p) => p.slug === l.slug)));
  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsx(U.Panel, { title: "Supplier portal", subtitle: "Restricted view — your profile, your products, your confirmed allocations", children: g.jsxs("div", { className: "grid gap-4 sm:grid-cols-3", children: [
            g.jsxs("div", { className: "border border-line px-4 py-3", children: [g.jsx("p", { className: "eyebrow", children: "Supplier" }), g.jsx("p", { className: "font-display text-lg text-ivory", children: me?.name })] }),
            g.jsxs("div", { className: "border border-line px-4 py-3", children: [g.jsx("p", { className: "eyebrow", children: "Products listed" }), g.jsx("p", { className: "font-display text-lg text-gold-soft", children: mine.length })] }),
            g.jsxs("div", { className: "border border-line px-4 py-3", children: [g.jsx("p", { className: "eyebrow", children: "Payment terms" }), g.jsx("p", { className: "text-[13px] text-ivory", children: me?.paymentTerms })] }),
          ] }) }),
      g.jsx(U.Panel, { title: "Your confirmed allocations", subtitle: "Guest names, dates and status only — no house margin is shared", pad: false, children: g.jsx(U.DataTable, { pageSize: 10, rows: myBookings, columns: [
            { key: "bcn", label: "Reference" }, { key: "customerName", label: "Guest" },
            { key: "arrival", label: "Arrival", render: (b) => D.fmtDate(b.arrival) },
            { key: "departure", label: "Departure", render: (b) => D.fmtDate(b.departure) },
            { key: "guests", label: "Pax" },
            { key: "supplierStatus", label: "Confirmation", render: (b) => g.jsx(U.Badge, { children: b.supplierStatus }) },
          ], onRowClick: (b) => { const v = prompt("Update supplier confirmation for " + b.bcn, b.supplierStatus); if (v) D.update("bookings", b.id, { supplierStatus: v }, user, { module: "supplier-portal" }); } }) }),
      g.jsx(SupplierInventoryPanel, { user, products: mine }),
      g.jsx(U.Panel, { title: "Your products & net rates", subtitle: "Update a net rate here and the house selling price recalculates", pad: false, children: g.jsx(U.DataTable, { pageSize: 10, rows: mine, columns: [
            { key: "name", label: "Product" },
            { key: "netRate", label: "Net rate", render: (p) => D.money(p.netRate) },
            { key: "unit", label: "Unit" },
            { key: "status", label: "Status", render: (p) => g.jsx(U.Badge, { children: p.status }) },
          ], onRowClick: (p) => { const v = prompt("New net rate for " + p.name, p.netRate); if (v !== null && !isNaN(Number(v))) D.update("products", p.id, { netRate: Number(v), markupPct: Math.round(((p.sellingRate - Number(v)) / Number(v)) * 100) }, user, { module: "supplier-portal" }); } }) }),
    ] });
}

/* ========================= CUSTOMER ACCOUNT ======================= */
export function CustomerAccount({ user }) {
  const data = U.useDB();
  const [planDays, setPlanDays] = useState(() => [{ date: D.addDays(D.today(), 45), title: "Arrival in Bali", items: [] }]);
  const [planTitle, setPlanTitle] = useState("My Bali journey");
  const [planRef, setPlanRef] = useState(null);
  const [sent, setSent] = useState("");
  /* only this guest's own records — never fall back to another customer */
  const me = data.customers.find((c) => (c.email || "").toLowerCase() === (user?.email || "").toLowerCase()) || null;
  if (!me) return g.jsx(U.Panel, { title: "Welcome, " + (user?.name || "guest"), subtitle: user?.email, children: g.jsxs("div", { className: "space-y-3 text-[14px] text-ivory/75", children: [g.jsx("p", { children: "You have no vacation requests or bookings yet." }), g.jsx(U.Btn, { variant: "solid", onClick: () => bridge.navigate("/builder"), children: "Start your vacation builder" })] }) });
  const bookings = data.bookings.filter((b) => b.customerId === me?.id);
  const invoices = data.invoices.filter((i) => i.customerId === me?.id);
  const itineraries = data.itineraries.filter((i) => i.customerId === me?.id);
  const plans = data.vacationPlans.filter((p) => p.customerId === me?.id);

  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsx(U.Panel, { title: "Welcome back", subtitle: "Your journeys, documents and plans — nothing internal is shown here", children: g.jsxs("div", { className: "grid gap-4 sm:grid-cols-4", children: [
            g.jsxs("div", { className: "border border-line px-4 py-3", children: [g.jsx("p", { className: "eyebrow", children: "Guest" }), g.jsx("p", { className: "font-display text-lg text-ivory", children: me?.name })] }),
            g.jsxs("div", { className: "border border-line px-4 py-3", children: [g.jsx("p", { className: "eyebrow", children: "Bookings" }), g.jsx("p", { className: "font-display text-lg text-gold-soft", children: bookings.length })] }),
            g.jsxs("div", { className: "border border-line px-4 py-3", children: [g.jsx("p", { className: "eyebrow", children: "Balance" }), g.jsx("p", { className: "font-display text-lg text-amber-300", children: D.money(invoices.reduce((s, i) => s + i.balance, 0)) })] }),
            g.jsxs("div", { className: "border border-line px-4 py-3", children: [g.jsx("p", { className: "eyebrow", children: "Upcoming" }), g.jsx("p", { className: "text-[13px] text-ivory", children: bookings.filter((b) => b.arrival >= D.today() && b.status !== "Cancelled").length })] }),
          ] }) }),
      g.jsx(GuestRequests, { user, me }),
      g.jsx(U.Panel, { title: "Your bookings", pad: false, children: g.jsx(U.DataTable, { pageSize: 8, rows: bookings, columns: [
            { key: "bcn", label: "Booking" }, { key: "title", label: "Trip" },
            { key: "arrival", label: "Arrival", render: (b) => D.fmtDate(b.arrival) },
            { key: "total", label: "Total", render: (b) => D.money(b.total) },
            { key: "balance", label: "Balance", render: (b) => D.money(b.balance) },
            { key: "status", label: "Status", render: (b) => g.jsx(U.Badge, { children: b.status }) },
          ], onRowClick: (b) => { const v = prompt("Request a change to " + b.bcn + " — describe what you need"); if (v) D.insert("inquiries", { id: D.nextNumber("INQ-", "inqSeq"), customerId: me.id, customerName: me.name, channel: "Guest portal", destination: (b.lines?.[0] && D.productOf(b.lines[0].slug)?.destination) || "Bali", guests: b.guests, nights: b.nights, arrival: b.arrival, departure: b.departure, brief: "Change request on " + b.bcn + ": " + v, status: "New", ownerId: "USR-002", createdAt: new Date().toISOString(), timeline: [] }, user, { module: "account" }); } }) }),
      g.jsx(U.Panel, { title: "Your itineraries", pad: false, actions: [
          g.jsx(U.Btn, { size: "sm", variant: "subtle", disabled: !itineraries.length, onClick: () => printItinerary(itineraries[0], data), children: "Download PDF" }),
        ], children: g.jsx(U.DataTable, { pageSize: 8, rows: itineraries, columns: [
            { key: "id", label: "Itinerary" }, { key: "title", label: "Trip" },
            { key: "arrival", label: "Arrival", render: (i) => D.fmtDate(i.arrival) },
            { key: "days", label: "Days", render: (i) => (i.days || []).length },
            { key: "status", label: "Status", render: (i) => g.jsx(U.Badge, { children: i.status }) },
          ] }) }),
      g.jsx(U.Panel, { title: planRef ? "Your plan " + planRef : "Plan your days", subtitle: "Add as many days and experiences as you like — your concierge prices and confirms everything", actions: [
          g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => printDayPlan(planTitle, { kind: "My vacation plan", guest: me?.name }, planDays), children: "PDF" }),
          planRef && g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => { setPlanRef(null); setPlanTitle("My Bali journey"); setPlanDays([{ date: D.addDays(D.today(), 45), title: "Arrival in Bali", items: [] }]); }, children: "New plan" }),
        ], children: g.jsxs("div", { className: "space-y-4", children: [
          g.jsx(U.Field, { label: "Plan title", value: planTitle, onChange: setPlanTitle }),
          g.jsx(DayPlanner, { days: planDays, setDays: setPlanDays, mode: "guest" }),
          g.jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [
              g.jsx(U.Btn, { variant: "solid", disabled: !planDays.some((d) => d.items?.length), onClick: () => {
                  const total = planDays.reduce((s, d) => s + (d.items || []).reduce((t, i) => t + D.lineTotals(i).sell, 0), 0);
                  if (planRef) D.update("vacationPlans", planRef, { title: planTitle, dayPlan: planDays, days: planDays.length, total, status: "Change requested", updatedAt: Date.now() }, user, { module: "account" });
                  const id = planRef || D.insert("vacationPlans", { id: D.nextNumber("VPL-", "vplSeq", 4), customerId: me.id, customerName: me.name, title: planTitle, dayPlan: planDays, days: planDays.length, total, guests: 2, status: "Submitted by guest", source: "guest", updatedAt: Date.now() }, user, { module: "account" }).id;
                  D.insert("inquiries", { id: D.nextNumber("INQ-", "inqSeq"), customerId: me.id, customerName: me.name, channel: "Guest portal", destination: "Bali", guests: 2, nights: Math.max(1, planDays.length - 1), arrival: planDays[0].date, departure: planDays[planDays.length - 1].date, brief: (planRef ? "Change request on " : "Guest-built plan ") + id + " · " + planTitle, status: "New", ownerId: "USR-002", createdAt: new Date().toISOString(), timeline: [] }, user, { module: "account" });
                  setPlanRef(id); setSent("Sent to your concierge as " + id + ". You'll receive a priced quotation shortly.");
                }, children: planRef ? "Send changes to concierge" : "Send plan to concierge" }),
              sent && g.jsx("span", { className: "text-[12px] text-emerald-300", children: sent }),
            ] }),
        ] }) }),
      g.jsx(U.Panel, { title: "Your vacation plans", subtitle: "Shared by your concierge or built by you — click to open", pad: false, children: g.jsx(U.DataTable, { pageSize: 8, rows: plans, empty: "No plans yet.", columns: [
            { key: "title", label: "Plan" }, { key: "days", label: "Days" },
            { key: "status", label: "Status", render: (p) => g.jsx(U.Badge, { children: p.status }) },
            { key: "req", label: "", sortable: false, render: () => g.jsx("span", { className: "text-[11px] uppercase tracking-wide text-gold-soft/70", children: "Open & edit →" }) },
          ], onRowClick: (p) => {
            const q = p.quoteId && data.quotations.find((x) => x.id === p.quoteId);
            const src = p.dayPlan?.length ? p.dayPlan : q?.dayPlan?.length ? q.dayPlan : [{ date: q?.arrival || D.addDays(D.today(), 45), title: p.title, items: (q?.lines || []).map((l) => ({ ...l, time: "", duration: "", note: "" })) }];
            setPlanRef(p.id); setPlanTitle(p.title || "My plan"); setPlanDays(JSON.parse(JSON.stringify(src))); setSent("");
            window.scrollTo?.({ top: 0, behavior: "smooth" });
          } }) }),
      g.jsx(U.Panel, { title: "Invoices & payments", pad: false, children: g.jsx(U.DataTable, { pageSize: 8, rows: invoices, columns: [
            { key: "id", label: "Invoice" }, { key: "bcn", label: "Booking" },
            { key: "total", label: "Total", render: (i) => D.money(i.total) },
            { key: "amountPaid", label: "Paid", render: (i) => D.money(i.amountPaid) },
            { key: "balance", label: "Balance", render: (i) => D.money(i.balance) },
            { key: "dueDate", label: "Due", render: (i) => D.fmtDate(i.dueDate) },
          ] }) }),
    ] });
}
