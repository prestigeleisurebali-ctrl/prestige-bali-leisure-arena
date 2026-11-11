/* ==================================================================
   CMS — WEBSITE CONTENT · MENUS · VACATION BUILDER · LOGO & CONTACT
   All edits go into the CMS draft and reach the customer website when
   the editor presses "Publish changes".
   ================================================================== */
import * as React from "react";
import * as jsxrt from "react/jsx-runtime";
import * as D from "./db.js";
import * as U from "./ui.js";
import { bridge } from "./bridge.js";
import { CONTENT_REGISTRY } from "./contentRegistry.js";
import { DEFAULT_CATS, compileCats, BUILDER_TEXTS } from "./siteBuilder.js";
import { MediaPicker } from "./mediaUI.js";

const g = jsxrt;
const { useState, useMemo } = React;
const inp = "w-full border border-ivory/20 bg-ink/40 px-2.5 py-1.5 text-[12px] text-ivory placeholder:text-ivory/30 outline-none focus:border-gold";
const clone = (x) => JSON.parse(JSON.stringify(x ?? null));
const PAGE_ROUTE = { Home: "/", Stays: "/stays", Marketplace: "/marketplace", "Product page": "/marketplace/samudra-pavilion", About: "/about", Contact: "/contact", "Sign in": "/login", "Header & menu": "/", Footer: "/", "Not found page": "/page-not-found", "Shared sections": "/" };

/* ========================= WEBSITE CONTENT ======================== */
export function ContentEditor({ draft, setDraft, initialGroup, user }) {
  const groups = useMemo(() => [...new Set(CONTENT_REGISTRY.map((r) => r.group))], []);
  const [group, setGroup] = useState(initialGroup && groups.includes(initialGroup) ? initialGroup : "Home");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const content = draft.content || {}, images = draft.images || {}, hidden = draft.hidden || {};
  const isEdited = (r) => (r.kind === "image" ? !!images[r.key] : !!content[r.key]) || !!hidden[r.key];
  const rows = CONTENT_REGISTRY.filter((r) => (group === "all" || r.group === group) && (filter === "all" || (filter === "edited" ? isEdited(r) : filter === "images" ? r.kind === "image" : !!hidden[r.key])) && (!q || (r.def + " " + (content[r.key] || "") + " " + r.key).toLowerCase().includes(q.toLowerCase())));
  const PER = 25, pages = Math.max(1, Math.ceil(rows.length / PER)), pg = Math.min(page, pages - 1);
  const setMap = (name, key, val) => { const m = { ...(draft[name] || {}) }; if (val === undefined || val === "" || val === false) delete m[key]; else m[key] = val; setDraft({ ...draft, [name]: m }); };
  const reset = (key) => { const c = { ...content }, im = { ...images }, h = { ...hidden }; delete c[key]; delete im[key]; delete h[key]; setDraft({ ...draft, content: c, images: im, hidden: h }); };
  const edited = CONTENT_REGISTRY.filter(isEdited).length;
  return g.jsx(U.Panel, { title: "Website content", subtitle: `Every text and image on the customer website — ${CONTENT_REGISTRY.length} items across ${groups.length} pages. Leave a field empty to keep the original.`, actions: [
      g.jsxs("span", { className: "text-[11px] text-ivory/50", children: [edited, " edited"] }, "n"),
      g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => bridge.navigate(PAGE_ROUTE[group] || "/"), children: "View page" }, "v"),
    ], children: g.jsxs("div", { className: "space-y-4", children: [
      g.jsxs("div", { className: "flex flex-wrap gap-1", children: [
          ["all", ...groups].map((gr) => g.jsxs("button", { onClick: () => { setGroup(gr); setPage(0); }, className: U.cx("rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]", group === gr ? "border-gold bg-gold/15 text-gold-soft" : "border-ivory/20 text-ivory/60 hover:text-ivory"), children: [gr === "all" ? "All pages" : gr, " ", g.jsx("span", { className: "text-ivory/40", children: gr === "all" ? CONTENT_REGISTRY.length : CONTENT_REGISTRY.filter((r) => r.group === gr).length })] }, gr)),
        ] }),
      g.jsxs("div", { className: "flex flex-wrap gap-2", children: [
          g.jsx("input", { value: q, onChange: (e) => { setQ(e.target.value); setPage(0); }, placeholder: "Search the text on the website…", className: U.cx(inp, "max-w-sm py-2") }),
          g.jsx("select", { value: filter, onChange: (e) => { setFilter(e.target.value); setPage(0); }, className: U.cx(inp, "w-auto py-2"), children: [["all", "All items"], ["edited", "Edited only"], ["images", "Images"], ["hidden", "Hidden"]].map(([v, l]) => g.jsx("option", { value: v, children: l }, v)) }),
          g.jsxs("span", { className: "self-center text-[11px] text-ivory/45", children: [rows.length, " items"] }),
        ] }),
      g.jsx("div", { className: "divide-y divide-line/60 border border-line", children: rows.slice(pg * PER, pg * PER + PER).map((r) => {
          const ed = isEdited(r);
          return g.jsxs("div", { className: "grid gap-3 px-4 py-3 md:grid-cols-[180px_1fr_auto]", children: [
              g.jsxs("div", { children: [
                  g.jsx("p", { className: "text-[11px] font-medium text-ivory/80", children: r.group }),
                  g.jsxs("p", { className: "text-[10px] text-ivory/40", children: [r.kind === "image" ? "Image" : r.prop === "children" ? "Text" : r.prop, " · ", r.key] }),
                  g.jsx(U.Badge, { tone: hidden[r.key] ? "red" : ed ? "gold" : "neutral", children: hidden[r.key] ? "hidden" : ed ? "edited" : "original" }),
                ] }),
              r.kind === "image" ? g.jsxs("div", { className: "flex flex-wrap items-start gap-4", children: [
                  g.jsxs("div", { children: [g.jsx("p", { className: "mb-1 text-[10px] uppercase tracking-[0.14em] text-ivory/40", children: "Original" }), g.jsx("img", { src: r.def, alt: "", className: "h-20 w-28 border border-line object-cover" })] }),
                  g.jsxs("div", { children: [g.jsx("p", { className: "mb-1 text-[10px] uppercase tracking-[0.14em] text-ivory/40", children: "Replacement" }), g.jsx(MediaPicker, { value: images[r.key] || "", onChange: (v) => setMap("images", r.key, v), user, hint: "Replaces this photo on the website" })] }),
                ] })
                : g.jsxs("div", { className: "space-y-1.5", children: [
                    g.jsx("p", { className: "text-[12px] leading-relaxed text-ivory/45", children: r.def }),
                    r.def.length > 70 ? g.jsx("textarea", { rows: 3, value: content[r.key] || "", placeholder: "Leave empty to keep the original", onChange: (e) => setMap("content", r.key, e.target.value), className: inp })
                      : g.jsx("input", { value: content[r.key] || "", placeholder: "Leave empty to keep the original", onChange: (e) => setMap("content", r.key, e.target.value), className: inp }),
                  ] }),
              g.jsxs("div", { className: "flex flex-col items-end gap-2", children: [
                  r.kind !== "image" && g.jsx(U.Field, { label: "Hide", type: "checkbox", value: !!hidden[r.key], onChange: (v) => setMap("hidden", r.key, v) }),
                  ed && g.jsx("button", { onClick: () => reset(r.key), className: "text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-soft hover:underline", children: "Reset" }),
                ] }),
            ] }, r.key);
        }) }),
      pages > 1 && g.jsxs("div", { className: "flex items-center justify-end gap-2", children: [g.jsx(U.Btn, { size: "sm", disabled: pg === 0, onClick: () => setPage(pg - 1), children: "Prev" }), g.jsxs("span", { className: "text-[11px] text-ivory/50", children: [pg + 1, " / ", pages] }), g.jsx(U.Btn, { size: "sm", disabled: pg >= pages - 1, onClick: () => setPage(pg + 1), children: "Next" })] }),
      g.jsx("p", { className: "text-[11px] text-ivory/40", children: "Product names, photos, prices and descriptions are managed in Product Master; destinations in Destinations; the homepage hero in the Homepage tab." }),
    ] }) });
}

/* ============================== MENUS ============================= */
const LINKS = ["/", "/about", "/stays", "/marketplace", "/builder", "/contact", "/account", "/journal", "/destinations", "/marketplace?category=adventure", "/marketplace?category=experience", "/marketplace?category=dining", "/marketplace?category=wellness", "/marketplace?category=transportation", "/stays?sub=private-villa"];
export function LinkRows({ items, onChange, depth = 0 }) {
  const [drag, setDrag] = useState(null);
  const set = (i, patch) => onChange(items.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const moveTo = (i, j) => { if (j < 0 || j >= items.length || i === j) return; const n = [...items]; const [x] = n.splice(i, 1); n.splice(j, 0, x); onChange(n); };
  const chk = (it, i, k, label) => g.jsxs("label", { className: "flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-ivory/55", children: [g.jsx("input", { type: "checkbox", checked: !!it[k], onChange: (e) => set(i, { [k]: e.target.checked }), className: "accent-[#b08d57]" }), label] }, k);
  return g.jsxs("div", { className: "space-y-2", children: [
      items.map((it, i) => g.jsxs("div", { draggable: true, onDragStart: (e) => { e.stopPropagation(); setDrag(i); }, onDragOver: (e) => e.preventDefault(), onDrop: (e) => { e.stopPropagation(); if (drag !== null) moveTo(drag, i); setDrag(null); }, className: U.cx("border p-3", depth ? "bg-ink/30" : "bg-surface", it.hidden ? "border-line/50 opacity-60" : "border-line", drag === i && "border-gold"), children: [
          g.jsxs("div", { className: "grid items-center gap-2 md:grid-cols-[auto_1fr_1fr_auto]", children: [
              g.jsxs("span", { className: "flex items-center gap-1", children: [g.jsx("span", { className: "cursor-grab px-1 text-ivory/40", title: "Drag to reorder", children: "⋮⋮" }), g.jsx("button", { onClick: () => moveTo(i, i - 1), disabled: i === 0, className: "px-1 text-ivory/50 hover:text-ivory disabled:opacity-30", "aria-label": "Move up", children: "↑" }), g.jsx("button", { onClick: () => moveTo(i, i + 1), disabled: i === items.length - 1, className: "px-1 text-ivory/50 hover:text-ivory disabled:opacity-30", "aria-label": "Move down", children: "↓" })] }),
              g.jsx("input", { value: it.label || "", onChange: (e) => set(i, { label: e.target.value }), placeholder: "Menu label", className: inp }),
              g.jsx("input", { value: it.to || "", list: "pbl-links", onChange: (e) => set(i, { to: e.target.value }), placeholder: "Page (/builder) or web address (https://…)", className: inp }),
              g.jsxs("span", { className: "flex gap-3", children: [
                  depth === 0 && !it.drops && !it.auto && g.jsx("button", { onClick: () => set(i, { drops: [{ label: "", to: "" }] }), className: "text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-soft hover:underline", children: "+ Dropdown" }),
                  g.jsx("button", { onClick: () => confirm("Delete “" + (it.label || "this item") + "”" + (it.drops?.length ? " and its " + it.drops.length + " dropdown links" : "") + "?") && onChange(items.filter((_, k) => k !== i)), className: "text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-300 hover:underline", children: "Delete" }),
                ] }),
            ] }),
          g.jsxs("div", { className: "mt-2 flex flex-wrap items-center gap-4", children: [
              chk(it, i, "hidden", "Hidden"), chk(it, i, "hideDesktop", "Hide on desktop"), chk(it, i, "hideMobile", "Hide on mobile"),
              /^https?:/.test(it.to || "") && g.jsx("span", { className: "text-[10px] text-ivory/40", children: "external — opens in a new tab" }),
              depth === 0 && g.jsxs("label", { className: "flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-ivory/55", children: ["Dropdown", g.jsxs("select", { value: it.auto || (it.drops ? "manual" : "none"), onChange: (e) => { const v = e.target.value; set(i, v === "none" ? { auto: undefined, drops: undefined } : v === "manual" ? { auto: undefined, drops: it.drops || [{ label: "", to: "" }] } : { auto: v, drops: undefined }); }, className: "border border-ivory/20 bg-ink/40 px-1.5 py-0.5 text-[11px] text-ivory", children: [g.jsx("option", { value: "none", children: "None" }), g.jsx("option", { value: "manual", children: "Links I choose" }), g.jsx("option", { value: "categories", children: "Auto: website categories" }), g.jsx("option", { value: "destinations", children: "Auto: published destinations" })] })] }),
            ] }),
          depth === 0 && it.auto && g.jsx("p", { className: "mt-2 text-[11px] text-ivory/45", children: "Dropdown fills itself from " + (it.auto === "categories" ? "the website categories" : "published destination pages") + " — always up to date." }),
          depth === 0 && it.drops && !it.auto && g.jsxs("div", { className: "mt-3 border-l-2 border-gold/40 pl-4", children: [
              g.jsxs("p", { className: "mb-2 text-[10px] uppercase tracking-[0.14em] text-ivory/45", children: ["Dropdown · ", it.drops.length, " links"] }),
              g.jsx(LinkRows, { items: it.drops, depth: 1, onChange: (drops) => set(i, { drops }) }),
            ] }),
        ] }, i)),
      g.jsx(U.Btn, { size: "sm", onClick: () => onChange([...items, { label: "", to: "" }]), children: depth ? "+ Add link" : "+ Add menu item" }),
    ] });
}
export function MenuEditor({ draft, setDraft, headerOnly }) {
  const nav = Array.isArray(draft.nav) && draft.nav.length ? draft.nav : clone(bridge.defaultNav || []);
  const fm = draft.footerMenus || {};
  const explore = Array.isArray(fm.explore) && fm.explore.length ? fm.explore : clone(bridge.defaultFooterMenus?.explore || []);
  const company = Array.isArray(fm.company) && fm.company.length ? fm.company : clone(bridge.defaultFooterMenus?.company || []);
  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsx("datalist", { id: "pbl-links", children: LINKS.map((l) => g.jsx("option", { value: l }, l)) }),
      g.jsx(U.Panel, { title: "Header menu", subtitle: "Main navigation and its dropdowns — used on desktop and mobile. Add a “Vacation builder” item linking to /builder, rename, reorder or delete anything.", actions: [g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => confirm("Restore the original header menu?") && setDraft({ ...draft, nav: null }), children: "Restore original" }, "r")],
        children: g.jsx(LinkRows, { items: nav, onChange: (items) => setDraft({ ...draft, nav: items }) }) }),
      !headerOnly && g.jsxs("div", { className: "grid gap-5 lg:grid-cols-2", children: [
          g.jsx(U.Panel, { title: "Footer · Explore", actions: [g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => setDraft({ ...draft, footerMenus: { ...fm, explore: null } }), children: "Restore" }, "r")], children: g.jsx(LinkRows, { items: explore, depth: 1, onChange: (items) => setDraft({ ...draft, footerMenus: { ...fm, explore: items } }) }) }),
          g.jsx(U.Panel, { title: "Footer · Company", actions: [g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => setDraft({ ...draft, footerMenus: { ...fm, company: null } }), children: "Restore" }, "r")], children: g.jsx(LinkRows, { items: company, depth: 1, onChange: (items) => setDraft({ ...draft, footerMenus: { ...fm, company: items } }) }) }),
        ] }),
      g.jsx("p", { className: "text-[11px] text-ivory/45", children: "The header buttons (“My itinerary”, “Admin”) and every other label are in Website content → Header & menu." }),
    ] });
}

/* ========================== VACATION BUILDER ====================== */
const TEXT_LABELS = {
  pageTitle: "Page title", pageIntro: "Introduction", pageIntroStrong: "Introduction — highlighted sentence",
  step1: "Step 1 name", step1Sub: "Step 1 short label", step1Intro: "Step 1 introduction",
  step2: "Step 2 name", step2Sub: "Step 2 short label", step2Intro: "Step 2 introduction",
  step3: "Step 3 name", step3Sub: "Step 3 short label", step3Intro: "Step 3 introduction",
  addProduct: "Add product button", addAnother: "Add another product button", save: "Save button", submit: "Submit button",
  groupAccommodation: "Day section · accommodation", groupTransport: "Day section · transportation", groupExp: "Day section · activities", groupDining: "Day section · dining", groupWellness: "Day section · wellness", groupOther: "Day section · other",
  taxLabel: "Tax line label", estimateNote: "Estimate note", consent: "Submission consent text", submittedTitle: "Confirmation heading",
};
const splitList = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
export function BuilderEditor({ draft, setDraft }) {
  const data = U.useDB();
  const b = draft.builder || {};
  const cats = Array.isArray(b.categories) && b.categories.length ? b.categories : clone(DEFAULT_CATS);
  const setCats = (list) => setDraft({ ...draft, builder: { ...b, categories: list } });
  const setCat = (i, patch) => setCats(cats.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const move = (i, d) => { const n = [...cats]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setCats(n); };
  const texts = b.texts || {};
  const setText = (k, v) => { const t = { ...texts }; if (v === "" || v === undefined) delete t[k]; else t[k] = v; setDraft({ ...draft, builder: { ...b, texts: t } }); };
  const sellable = useMemo(() => data.products.filter((p) => p.status === "live" && p.published !== false && Number(p.sellingRate) > 0 && p.verification !== "pending"), [data.products.length]);
  const compiled = compileCats(cats);
  const count = (id) => { const c = compiled.find((x) => x.id === id); return c ? sellable.filter(c.match).length : 0; };
  const unreachable = sellable.filter((p) => !compiled.some((c) => c.match(p))).length;
  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsx(U.Panel, { title: "Vacation builder · Add Product menu", subtitle: "The categories guests see when they press “+ Add product”. Each pulls products from Product Master. Add, rename, reorder, hide or delete categories.", actions: [
          g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => bridge.navigate("/builder"), children: "View builder" }, "v"),
          g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => confirm("Restore the original categories?") && setDraft({ ...draft, builder: { ...b, categories: null } }), children: "Restore original" }, "r"),
        ], children: g.jsxs("div", { className: "space-y-3", children: [
          unreachable > 0 && g.jsxs("p", { className: "border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200", children: [unreachable, " bookable products are not in any visible category — guests can't find them. Add a category for them or turn on “Catch-all”."] }),
          cats.map((c, i) => g.jsxs("div", { className: U.cx("border p-4", c.visible === false ? "border-line/50 opacity-60" : "border-line"), children: [
              g.jsxs("div", { className: "grid items-center gap-2 md:grid-cols-[auto_56px_1fr_auto]", children: [
                  g.jsxs("span", { className: "flex gap-1", children: [g.jsx("button", { onClick: () => move(i, -1), disabled: i === 0, className: "px-1 text-ivory/50 hover:text-ivory disabled:opacity-30", children: "↑" }), g.jsx("button", { onClick: () => move(i, 1), disabled: i === cats.length - 1, className: "px-1 text-ivory/50 hover:text-ivory disabled:opacity-30", children: "↓" })] }),
                  g.jsx("input", { value: c.icon || "", onChange: (e) => setCat(i, { icon: e.target.value }), "aria-label": "Icon", className: U.cx(inp, "text-center") }),
                  g.jsx("input", { value: c.label || "", onChange: (e) => setCat(i, { label: e.target.value }), placeholder: "Category name shown to guests", className: U.cx(inp, "text-[13px]") }),
                  g.jsxs("span", { className: "flex items-center gap-3", children: [
                      g.jsx(U.Badge, { tone: count(c.id) ? "green" : "amber", children: count(c.id) + " products" }),
                      g.jsx(U.Field, { label: "Visible", type: "checkbox", value: c.visible !== false, onChange: (v) => setCat(i, { visible: v }) }),
                      g.jsx("button", { onClick: () => confirm("Delete the category “" + c.label + "”?") && setCats(cats.filter((_, k) => k !== i)), className: "text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-300 hover:underline", children: "Delete" }),
                    ] }),
                ] }),
              g.jsxs("div", { className: "mt-3 grid gap-3 md:grid-cols-2", children: [
                  g.jsxs("div", { children: [
                      g.jsx("p", { className: "mb-1 text-[10px] uppercase tracking-[0.14em] text-ivory/45", children: "Product Master categories" }),
                      g.jsx("div", { className: "flex flex-wrap gap-1", children: data.categories.map((dc) => { const on = (c.categoryIds || []).includes(dc.id); return g.jsx("button", { disabled: c.catchAll, onClick: () => setCat(i, { categoryIds: on ? c.categoryIds.filter((x) => x !== dc.id) : [...(c.categoryIds || []), dc.id] }), className: U.cx("rounded-full border px-2.5 py-1 text-[10px]", on ? "border-gold bg-gold/15 text-gold-soft" : "border-ivory/20 text-ivory/55", c.catchAll && "opacity-40"), children: dc.name }, dc.id); }) }),
                      g.jsx("div", { className: "mt-2", children: g.jsx(U.Field, { label: "Catch-all — show every product no other category shows", type: "checkbox", value: !!c.catchAll, onChange: (v) => setCat(i, { catchAll: v }) }) }),
                    ] }),
                  !c.catchAll && g.jsxs("div", { className: "grid gap-2 sm:grid-cols-2", children: [
                      g.jsx(U.Field, { label: "Only these sub-categories", value: (c.subcategories || []).join(", "), placeholder: "e.g. Beach Club", onChange: (v) => setCat(i, { subcategories: splitList(v) }) }),
                      g.jsx(U.Field, { label: "…or names containing", value: c.keywords || "", placeholder: "e.g. airport, transfer", onChange: (v) => setCat(i, { keywords: v }) }),
                      g.jsx(U.Field, { label: "Exclude sub-categories", value: (c.excludeSubcategories || []).join(", "), onChange: (v) => setCat(i, { excludeSubcategories: splitList(v) }) }),
                      g.jsx(U.Field, { label: "Exclude names containing", value: c.excludeKeywords || "", onChange: (v) => setCat(i, { excludeKeywords: v }) }),
                    ] }),
                ] }),
            ] }, c.id || i)),
          g.jsx(U.Btn, { size: "sm", onClick: () => setCats([...cats, { id: "cat" + Date.now().toString(36), label: "New category", icon: "✦", categoryIds: [], visible: true }]), children: "+ Add category" }),
        ] }) }),
      g.jsx(U.Panel, { title: "Vacation builder · wording", subtitle: "Every heading, button and message in the guest's vacation builder. Leave empty to keep the original.", children: g.jsxs("div", { className: "space-y-3", children: [
          g.jsx(U.Field, { label: "Custom requests on each day", type: "select", value: texts.customRequests || "on", onChange: (v) => setText("customRequests", v === "on" ? "" : v), options: [{ value: "on", label: "Allowed" }, { value: "off", label: "Hidden" }] }),
          g.jsx("div", { className: "grid gap-3 md:grid-cols-2", children: Object.entries(TEXT_LABELS).map(([k, label]) => g.jsxs("div", { children: [
              g.jsx("p", { className: "mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ivory/55", children: label }),
              BUILDER_TEXTS[k].length > 70 ? g.jsx("textarea", { rows: 3, value: texts[k] || "", placeholder: BUILDER_TEXTS[k], onChange: (e) => setText(k, e.target.value), className: inp }) : g.jsx("input", { value: texts[k] || "", placeholder: BUILDER_TEXTS[k], onChange: (e) => setText(k, e.target.value), className: inp }),
            ] }, k)) }),
        ] }) }),
    ] });
}

/* =========================== LOGO & CONTACT ======================= */
export function BrandEditor({ draft, setDraft, user }) {
  const logo = draft.logo || {};
  const f = draft.footer || {};
  const lines = (v) => (Array.isArray(v) ? v.join("\n") : v || "");
  const setLogo = (patch) => setDraft({ ...draft, logo: { ...logo, ...patch } });
  const setF = (patch) => setDraft({ ...draft, footer: { ...f, ...patch } });
  return g.jsxs("div", { className: "space-y-5", children: [
      g.jsx(U.Panel, { title: "Logo", subtitle: "Shown in the website header, footer and sign-in page", children: g.jsxs("div", { className: "grid gap-5 md:grid-cols-2", children: [
          g.jsxs("div", { className: "space-y-3", children: [
              g.jsx(U.Field, { label: "Wordmark", value: logo.wordmark || "", placeholder: "PRESTIGE", onChange: (v) => setLogo({ wordmark: v }) }),
              g.jsx(U.Field, { label: "Tagline", value: logo.tagline || "", placeholder: "Leisures and Wellness", onChange: (v) => setLogo({ tagline: v }) }),
            ] }),
          g.jsxs("div", { children: [g.jsx("p", { className: "mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/55", children: "Logo image (replaces the wordmark)" }), g.jsx(MediaPicker, { value: logo.image || "", onChange: (v) => setLogo({ image: v }), user, hint: "PNG with a transparent background works best" })] }),
        ] }) }),
      g.jsx(U.Panel, { title: "Contact details", subtitle: "Used in the header, footer, contact page and guest emails", children: g.jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [
          g.jsx(U.Field, { label: "Email", value: f.email || "", placeholder: "sales@prestigebali.com", onChange: (v) => setF({ email: v }) }),
          g.jsx(U.Field, { label: "Phone / WhatsApp", value: f.phone || "", placeholder: "+62 877 6416 1803", onChange: (v) => setF({ phone: v }) }),
          g.jsx(U.Field, { label: "Address (one line per row)", type: "textarea", rows: 3, value: lines(f.address), onChange: (v) => setF({ address: v.split("\n").filter((x) => x.trim()) }) }),
          g.jsx(U.Field, { label: "Opening hours (one line per row)", type: "textarea", rows: 3, value: lines(f.hours), onChange: (v) => setF({ hours: v.split("\n").filter((x) => x.trim()) }) }),
          g.jsx(U.Field, { label: "Payment link", value: f.paypal || "", placeholder: "https://paypal.me/prestigebali", onChange: (v) => setF({ paypal: v }) }),
        ] }) }),
    ] });
}

/* ============================ TESTIMONIALS ======================== */
export function TestimonialsEditor({ draft, setDraft }) {
  const list = draft.testimonials || [];
  const set = (i, patch) => setDraft({ ...draft, testimonials: list.map((t, k) => (k === i ? { ...t, ...patch } : t)) });
  const move = (i, d) => { const n = [...list]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setDraft({ ...draft, testimonials: n }); };
  const live = list.filter((t) => t.status === "published").length;
  return g.jsx(U.Panel, { title: "Testimonials", subtitle: "Guest reviews for the homepage “In their words” section", children: g.jsxs("div", { className: "space-y-4", children: [
      g.jsxs("div", { className: U.cx("border px-4 py-3", draft.testimonialsOnSite ? "border-emerald-400/30 bg-emerald-500/10" : "border-line"), children: [
          g.jsx(U.Field, { label: "Show these testimonials on the homepage", type: "checkbox", value: !!draft.testimonialsOnSite, onChange: (v) => setDraft({ ...draft, testimonialsOnSite: v }) }),
          g.jsx("p", { className: "text-[11px] text-ivory/50", children: draft.testimonialsOnSite ? `${live} published testimonial${live === 1 ? "" : "s"} will appear on the homepage.` : "Off: the homepage keeps its built-in testimonials (editable in Website content → Home)." }),
        ] }),
      list.map((t, i) => g.jsxs("div", { className: "space-y-2 border border-line p-4", children: [
          g.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [
              g.jsxs("span", { className: "flex gap-1", children: [g.jsx("button", { onClick: () => move(i, -1), className: "px-1 text-ivory/50 hover:text-ivory", children: "↑" }), g.jsx("button", { onClick: () => move(i, 1), className: "px-1 text-ivory/50 hover:text-ivory", children: "↓" })] }),
              g.jsxs("span", { className: "flex items-center gap-3", children: [
                  g.jsx(U.Field, { label: "Published", type: "checkbox", value: t.status === "published", onChange: (v) => set(i, { status: v ? "published" : "draft" }) }),
                  g.jsx("button", { onClick: () => confirm("Delete this testimonial?") && setDraft({ ...draft, testimonials: list.filter((_, k) => k !== i) }), className: "text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-300 hover:underline", children: "Delete" }),
                ] }),
            ] }),
          g.jsxs("div", { className: "grid gap-2 md:grid-cols-[2fr_1fr_1fr_80px]", children: [
              g.jsx(U.Field, { label: "Headline", value: t.title || "", placeholder: "The best holiday of our lives", onChange: (v) => set(i, { title: v }) }),
              g.jsx(U.Field, { label: "Guest", value: t.author || "", onChange: (v) => set(i, { author: v }) }),
              g.jsx(U.Field, { label: "Country", value: t.country || "", onChange: (v) => set(i, { country: v }) }),
              g.jsx(U.Field, { label: "Rating", type: "number", min: 1, max: 5, value: t.rating ?? 5, onChange: (v) => set(i, { rating: Math.max(1, Math.min(5, Number(v) || 5)) }) }),
            ] }),
          g.jsx(U.Field, { label: "Review", type: "textarea", rows: 3, value: t.text || "", onChange: (v) => set(i, { text: v }) }),
        ] }, t.id || i)),
      g.jsx(U.Btn, { size: "sm", onClick: () => setDraft({ ...draft, testimonials: [...list, { id: "TST-" + Date.now().toString(36), title: "", text: "", author: "", country: "", rating: 5, status: "draft", source: "Direct" }] }), children: "+ Add testimonial" }),
    ] }) });
}
