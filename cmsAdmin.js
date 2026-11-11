/* ==================================================================
   WEBSITE MANAGEMENT — backend
   17 sections over one CMS store. Every section: Save draft · Preview
   · Publish; items (pages, articles, banners, destinations) also have
   Publish · Unpublish · Delete. All actions are audited.
   ================================================================== */
import * as React from "react";
import * as jsxrt from "react/jsx-runtime";
import * as D from "./db.js";
import * as C from "./cmsCore.js";
import * as U from "./ui.js";
import { bridge, drillTo } from "./bridge.js";
import { MediaPicker, MediaList, RichEditor, DevicePreview, openPreview, fmtBytes } from "./mediaUI.js";
import { ContentEditor, MenuEditor, BuilderEditor, BrandEditor, TestimonialsEditor, LinkRows } from "./cmsUI.js";
import { HOME_SECTIONS } from "./homeSections.js";
import { CONTENT_REGISTRY } from "./contentRegistry.js";

const g = jsxrt;
const { useState, useMemo } = React;
const h = (t, p, ...c) => g.jsx(t, { ...(p || {}), children: c.length === 0 ? p && p.children : c.length === 1 ? c[0] : c });
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const inp = "w-full border border-ivory/20 bg-ink/40 px-2.5 py-1.5 text-[12px] text-ivory placeholder:text-ivory/30 outline-none focus:border-gold";
const F = (p) => g.jsx(U.Field, p);
const lines = (v) => (Array.isArray(v) ? v.join("\n") : v || "");
const toLines = (v) => String(v || "").split("\n").map((x) => x.trim()).filter(Boolean);
const list = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);

export const WM_MENU = [
  ["wm-overview", "Website overview"], ["wm-home", "Homepage management"], ["wm-logo", "Logo"], ["wm-nav", "Header & navigation"], ["wm-pages", "Pages management"],
  ["wm-categories", "Categories & subcategories"], ["wm-products", "Product display"], ["wm-media", "Image & media library"], ["wm-design", "Typography & design"],
  ["wm-content", "Content & descriptions"], ["wm-banners", "Banners & promotions"], ["wm-destinations", "Destination management"], ["wm-blog", "Blog & articles"],
  ["wm-testimonials", "Testimonials & reviews"], ["wm-footer", "Footer management"], ["wm-seo", "SEO management"], ["wm-settings", "Website settings"], ["wm-publish", "Preview & publish"],
];
const SECTION_KEY = { "wm-design": "design", "wm-settings": "settings" };

/* --------------------------- working copy -------------------------- */
function useWorking(keys) {
  U.useDB();
  const src = () => Object.fromEntries(keys.map((k) => [k, clone(C.draft()[k])]));
  const [w, setW] = useState(src);
  const dirty = JSON.stringify(w) !== JSON.stringify(src());
  return [w, setW, dirty, () => setW(src())];
}
function SaveBar({ user, dirty, onSave, onReset, route, section = "content", extra }) {
  const can = C.canCms(user, "edit", section);
  return h("div", { className: U.cx("sticky top-[58px] z-20 flex flex-wrap items-center justify-between gap-3 border px-4 py-3 backdrop-blur", dirty ? "border-gold/60 bg-[#151d14]/95" : "border-line bg-[#0b1412]/95") },
    h("p", { className: "text-[12px] text-ivory/65" }, dirty ? "Unsaved changes in this section." : "No unsaved changes here.", " ", h("span", { className: "text-ivory/40" }, "Saving a draft never changes the live website.")),
    h("div", { className: "flex flex-wrap gap-2" },
      extra,
      dirty && h(U.Btn, { size: "sm", variant: "subtle", onClick: onReset }, "Undo changes"),
      route && h(U.Btn, { size: "sm", onClick: () => { if (dirty && can) onSave(); openPreview(route); } }, "Preview"),
      h(U.Btn, { size: "sm", variant: "dark", disabled: !dirty || !can, onClick: onSave }, "Save draft")));
}
function StateBadge({ coll, id }) {
  const s = C.itemState(coll, id);
  return h(U.Badge, { tone: s === "published" ? "green" : s === "changes" ? "amber" : "neutral" }, s === "changes" ? "unpublished changes" : s);
}
function ItemActions({ user, coll, item, route, onEdit, onDuplicate }) {
  const st = C.itemState(coll, item.id);
  const live = ((C.live()[coll] || []).find((x) => x.id === item.id) || {}).status === "published";
  const run = (fn) => { try { fn(); } catch (e) { alert(e.message); } };
  return h("span", { className: "flex flex-wrap justify-end gap-1.5" },
    h(U.Btn, { size: "sm", onClick: onEdit }, "Edit"),
    route && h(U.Btn, { size: "sm", variant: "subtle", onClick: () => openPreview(route) }, "Preview"),
    onDuplicate && C.canCms(user, "add", coll) && h(U.Btn, { size: "sm", variant: "subtle", onClick: onDuplicate }, "Duplicate"),
    C.canCms(user, "approve", coll) && st !== "published" && h(U.Btn, { size: "sm", variant: "solid", onClick: () => run(() => C.publishItem(coll, item.id, user)) }, "Publish"),
    C.canCms(user, "approve", coll) && live && h(U.Btn, { size: "sm", variant: "subtle", onClick: () => confirm("Remove “" + (item.title || item.name) + "” from the website? The record is kept.") && run(() => C.unpublishItem(coll, item.id, user)) }, "Unpublish"),
    C.canCms(user, "delete", coll) && h(U.Btn, { size: "sm", variant: "danger", onClick: () => confirm("Delete “" + (item.title || item.name) + "” permanently?") && run(() => C.deleteItem(coll, item.id, user)) }, "Delete"));
}

/* ------------------------------ blocks ----------------------------- */
const BLOCKS = {
  hero: { label: "Hero banner", make: () => ({ type: "hero", eyebrow: "", title: "New headline", text: "", image: "", imageMobile: "", overlay: 25, buttonLabel: "", buttonLink: "/builder" }) },
  text: { label: "Text section", make: () => ({ type: "text", eyebrow: "", title: "", html: "" }) },
  imageText: { label: "Image + text", make: () => ({ type: "imageText", eyebrow: "", title: "", html: "", image: "", imageSide: "left", buttonLabel: "", buttonLink: "" }) },
  gallery: { label: "Photo gallery", make: () => ({ type: "gallery", title: "", images: [] }) },
  products: { label: "Products from Product Master", make: () => ({ type: "products", eyebrow: "", title: "Featured experiences", mode: "category", category: "", destination: "", slugs: [], limit: 6 }) },
  destinations: { label: "Featured destinations", make: () => ({ type: "destinations", eyebrow: "Destinations", title: "Where to go", ids: [], limit: 6 }) },
  categories: { label: "Category cards", make: () => ({ type: "categories", eyebrow: "", title: "Explore by category", featuredOnly: false }) },
  cta: { label: "Call to action / special offer", make: () => ({ type: "cta", eyebrow: "", title: "Plan your private Bali", text: "", image: "", buttonLabel: "Start the vacation builder", buttonLink: "/builder" }) },
  video: { label: "Video", make: () => ({ type: "video", title: "", url: "" }) },
  faq: { label: "Questions & answers", make: () => ({ type: "faq", title: "Questions, answered", items: [{ q: "", a: "" }] }) },
  newsletter: { label: "Newsletter signup", make: () => ({ type: "newsletter", title: "Letters from the island", text: "" }) },
};
function ProductPicker({ value = [], onChange }) {
  const [q, setQ] = useState("");
  const all = D.db().products.filter((p) => p.status === "live" && p.published !== false);
  const hits = q.length > 1 ? all.filter((p) => (p.name + " " + p.destination).toLowerCase().includes(q.toLowerCase()) && !value.includes(p.slug)).slice(0, 8) : [];
  return h("div", { className: "space-y-2" },
    h("div", { className: "flex flex-wrap gap-1.5" }, value.map((s) => h("span", { key: s, className: "flex items-center gap-1 border border-gold/40 px-2 py-1 text-[11px] text-ivory" }, D.productOf(s)?.name || s, h("button", { onClick: () => onChange(value.filter((x) => x !== s)), className: "text-rose-300" }, "×")))),
    h("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search Product Master to add…", className: inp }),
    hits.length > 0 && h("div", { className: "border border-line" }, hits.map((p) => h("button", { key: p.slug, onClick: () => { onChange([...value, p.slug]); setQ(""); }, className: "block w-full px-3 py-1.5 text-left text-[12px] text-ivory/80 hover:bg-ivory/5" }, p.name, h("span", { className: "text-ivory/40" }, " · " + p.destination)))));
}
function BlockFields({ b, set, user }) {
  const s = (k) => (v) => set({ ...b, [k]: v });
  const common = [F({ label: "Small heading (eyebrow)", value: b.eyebrow, onChange: s("eyebrow") }), F({ label: "Heading", value: b.title, onChange: s("title") })];
  const btn = [F({ label: "Button label", value: b.buttonLabel, onChange: s("buttonLabel") }), F({ label: "Button link", value: b.buttonLink, placeholder: "/builder or https://…", onChange: s("buttonLink") })];
  const bg = F({ label: "Background", type: "select", value: b.background || "", onChange: s("background"), options: [{ value: "", label: "Page background" }, { value: "surface", label: "Panel" }, { value: "cream", label: "Soft green" }] });
  const grid = (...c) => h("div", { className: "grid gap-3 md:grid-cols-2" }, ...c);
  switch (b.type) {
    case "hero": return h("div", { className: "space-y-3" }, grid(...common), F({ label: "Text", type: "textarea", rows: 2, value: b.text, onChange: s("text") }), grid(...btn), grid(h(MediaPicker, { label: "Image (desktop)", value: b.image, onChange: s("image"), user }), h(MediaPicker, { label: "Image (mobile, optional)", value: b.imageMobile, onChange: s("imageMobile"), user })), F({ label: "Dark overlay % (readability)", type: "number", min: 0, max: 80, value: b.overlay ?? 25, onChange: s("overlay") }));
    case "text": return h("div", { className: "space-y-3" }, grid(...common), h(RichEditor, { value: b.html, onChange: s("html") }), grid(...btn), bg);
    case "imageText": return h("div", { className: "space-y-3" }, grid(...common), h(RichEditor, { value: b.html, onChange: s("html") }), grid(h(MediaPicker, { label: "Image", value: b.image, onChange: s("image"), user }), F({ label: "Image side", type: "select", value: b.imageSide, onChange: s("imageSide"), options: [{ value: "left", label: "Left" }, { value: "right", label: "Right" }] })), grid(...btn), bg);
    case "gallery": return h("div", { className: "space-y-3" }, grid(...common), h(MediaList, { label: "Photos (click opens a larger view on the website)", value: b.images || [], onChange: s("images"), user }), bg);
    case "products": return h("div", { className: "space-y-3" }, grid(...common), F({ label: "Introduction", value: b.intro, onChange: s("intro") }),
      grid(F({ label: "Choose products by", type: "select", value: b.mode, onChange: s("mode"), options: [{ value: "category", label: "Category / destination (updates automatically)" }, { value: "selected", label: "Hand-picked products" }] }), F({ label: "How many", type: "number", min: 1, max: 24, value: b.limit, onChange: s("limit") })),
      b.mode === "selected" ? h(ProductPicker, { value: b.slugs, onChange: s("slugs") }) : grid(F({ label: "Category", type: "select", value: b.category, onChange: s("category"), options: [{ value: "", label: "All categories" }, ...C.siteCategories().map((c) => ({ value: c.id, label: c.label }))] }), F({ label: "Destination contains", value: b.destination, placeholder: "e.g. Ubud", onChange: s("destination") })), grid(...btn), bg);
    case "destinations": { const ds = C.draft().destinationsSite || []; return h("div", { className: "space-y-3" }, grid(...common), h("p", { className: "text-[11px] text-ivory/50" }, "Pick destinations, or leave none selected to show all published destinations."), h("div", { className: "flex flex-wrap gap-1.5" }, ds.map((d) => { const on = (b.ids || []).includes(d.id); return h("button", { key: d.id, onClick: () => set({ ...b, ids: on ? b.ids.filter((x) => x !== d.id) : [...(b.ids || []), d.id] }), className: U.cx("rounded-full border px-3 py-1 text-[11px]", on ? "border-gold bg-gold/15 text-gold-soft" : "border-ivory/20 text-ivory/60") }, d.name); })), bg); }
    case "categories": return h("div", { className: "space-y-3" }, grid(...common), F({ label: "Introduction", value: b.intro, onChange: s("intro") }), F({ label: "Show featured categories only", type: "checkbox", value: b.featuredOnly, onChange: s("featuredOnly") }), bg);
    case "cta": return h("div", { className: "space-y-3" }, grid(...common), F({ label: "Text", type: "textarea", rows: 2, value: b.text, onChange: s("text") }), grid(...btn), h(MediaPicker, { label: "Background image", value: b.image, onChange: s("image"), user }));
    case "video": return h("div", { className: "space-y-3" }, grid(...common), h(MediaPicker, { label: "Video", type: "video", value: b.url, onChange: s("url"), user, hint: "YouTube, Vimeo or an MP4 link" }), bg);
    case "faq": return h("div", { className: "space-y-3" }, grid(...common), (b.items || []).map((x, i) => h("div", { key: i, className: "space-y-2 border border-line p-3" }, F({ label: "Question " + (i + 1), value: x.q, onChange: (v) => set({ ...b, items: b.items.map((y, k) => (k === i ? { ...y, q: v } : y)) }) }), h(RichEditor, { value: x.a, minHeight: 70, onChange: (v) => set({ ...b, items: b.items.map((y, k) => (k === i ? { ...y, a: v } : y)) }) }), h("button", { onClick: () => set({ ...b, items: b.items.filter((_, k) => k !== i) }), className: "text-[10px] uppercase text-rose-300" }, "Remove question"))), h(U.Btn, { size: "sm", onClick: () => set({ ...b, items: [...(b.items || []), { q: "", a: "" }] }) }, "+ Question"), bg);
    case "newsletter": return h("div", { className: "space-y-3" }, F({ label: "Heading", value: b.title, onChange: s("title") }), F({ label: "Text", value: b.text, onChange: s("text") }), h("p", { className: "text-[11px] text-ivory/45" }, "Sign-ups are emailed to your team (Email & notifications) and listed in Website settings."), bg);
    default: return null;
  }
}
function BlockList({ blocks = [], onChange, user }) {
  const [open, setOpen] = useState(null);
  const [add, setAdd] = useState("text");
  const move = (i, d) => { const n = [...blocks]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  return h("div", { className: "space-y-2" },
    blocks.map((b, i) => h("div", { key: b.id || i, className: U.cx("border", b.hidden ? "border-line/50 opacity-60" : "border-line") },
      h("div", { className: "flex flex-wrap items-center gap-2 px-3 py-2" },
        h("span", { className: "flex gap-1" }, h("button", { onClick: () => move(i, -1), disabled: i === 0, className: "px-1 text-ivory/50 hover:text-ivory disabled:opacity-30" }, "↑"), h("button", { onClick: () => move(i, 1), disabled: i === blocks.length - 1, className: "px-1 text-ivory/50 hover:text-ivory disabled:opacity-30" }, "↓")),
        h(U.Badge, { tone: "neutral" }, BLOCKS[b.type]?.label || b.type),
        h("span", { className: "flex-1 truncate text-[12px] text-ivory/80" }, b.title || ""),
        h("button", { onClick: () => onChange(blocks.map((x, k) => (k === i ? { ...x, hidden: !x.hidden } : x))), className: "text-[10px] font-semibold uppercase tracking-[0.12em] text-ivory/60 hover:text-ivory" }, b.hidden ? "Show" : "Hide"),
        h("button", { onClick: () => setOpen(open === i ? null : i), className: "text-[10px] font-semibold uppercase tracking-[0.12em] text-gold-soft" }, open === i ? "Close" : "Edit"),
        h("button", { onClick: () => confirm("Delete this " + (BLOCKS[b.type]?.label || "section") + "?") && onChange(blocks.filter((_, k) => k !== i)), className: "text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-300" }, "Delete")),
      open === i && h("div", { className: "border-t border-line p-3" }, h(BlockFields, { b, user, set: (nb) => onChange(blocks.map((x, k) => (k === i ? nb : x))) })))),
    h("div", { className: "flex flex-wrap gap-2 pt-1" }, h("select", { value: add, onChange: (e) => setAdd(e.target.value), className: U.cx(inp, "w-auto py-2") }, Object.entries(BLOCKS).map(([k, v]) => h("option", { key: k, value: k }, v.label))), h(U.Btn, { size: "sm", onClick: () => { onChange([...blocks, { ...BLOCKS[add].make(), id: C.cid("BLK") }]); setOpen(blocks.length); } }, "+ Add section")));
}


/* ================================ LOGO ============================= */
const LOGO_DEFAULT = { wordmark: "PRESTIGE", tagline: "Leisures and Wellness", image: "" };
function LogoPreview({ logo, where }) {
  const src = C.resolve(logo.image);
  const inner = src
    ? g.jsx("img", { src, alt: logo.wordmark || "Logo", className: "h-9 w-auto max-w-[200px] object-contain" })
    : g.jsxs("span", { className: "inline-flex items-center gap-2.5 text-teal", children: [
        g.jsx("svg", { viewBox: "0 0 48 48", className: "h-8 w-8", "aria-hidden": true, children: [
          g.jsx("path", { d: "M5 41c9-3 15-12 18-24", stroke: "currentColor", strokeWidth: "2.6", fill: "none", strokeLinecap: "round" }),
          g.jsx("path", { d: "M11 45c8-2 14-9 17-19", stroke: "currentColor", strokeWidth: "1.7", fill: "none", strokeLinecap: "round", opacity: "0.6" }),
          g.jsx("path", { d: "M34 5.5l3 8.6 9 .3-7 6 2.2 8.8L34 24.6l-7.2 4.6 2.2-8.8-7-6 9-.3z", fill: "currentColor" }),
        ] }),
        g.jsxs("span", { className: "leading-none", children: [
          g.jsx("span", { className: "font-lux block text-[17px] font-medium tracking-[0.34em] text-ivory", children: logo.wordmark || "PRESTIGE" }),
          g.jsx("span", { className: "mt-1 block text-[7px] uppercase tracking-[0.4em] text-stone", children: logo.tagline || "" }),
        ] }),
      ] });
  return g.jsxs("div", { className: "border border-line bg-surface px-5 py-4", children: [
      g.jsx("p", { className: "mb-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-ivory/40", children: where }),
      inner,
    ] });
}
function LogoSection({ user }) {
  const [w, setW, dirty, reset] = useWorking(["logo"]);
  const logo = { ...LOGO_DEFAULT, ...(w.logo || {}) };
  const set = (patch) => setW({ ...w, logo: { ...logo, ...patch } });
  const can = C.canCms(user, "edit", "logo");
  const fields = h("div", { className: "space-y-4" },
    h("div", { className: "grid gap-3 md:grid-cols-2" },
      F({ label: "Wordmark", disabled: !can, value: logo.wordmark, placeholder: "PRESTIGE", onChange: (v) => set({ wordmark: v }) }),
      F({ label: "Tagline", disabled: !can, value: logo.tagline, placeholder: "Leisures and Wellness", onChange: (v) => set({ tagline: v }) })),
    h(MediaPicker, { label: "Logo image (PNG with transparency works best)", value: logo.image, onChange: (v) => set({ image: v }), user, disabled: !can, hint: "Replaces the wordmark + mark. Remove it to go back to the text logo." }),
    h("div", { className: "flex flex-wrap gap-2" },
      logo.image && h(U.Btn, { size: "sm", variant: "danger", disabled: !can, onClick: () => confirm("Remove the logo image? The star mark and wordmark will be used.") && set({ image: "" }) }, "Delete image"),
      (w.logo && (w.logo.image || w.logo.wordmark || w.logo.tagline)) && h(U.Btn, { size: "sm", variant: "subtle", disabled: !can, onClick: () => confirm("Reset the logo to the original Prestige mark and wordmark?") && setW({ ...w, logo: {} }) }, "Reset to original"),
      h(U.Btn, { size: "sm", variant: "subtle", onClick: () => openPreview("/") }, "Preview website")),
    h("p", { className: "text-[11px] leading-relaxed text-ivory/45" }, "The favicon (browser tab icon) is set separately in Website settings."));
  const previews = h("div", { className: "space-y-3" },
    h("p", { className: "text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/55" }, "Live preview"),
    h("div", { className: "border border-line bg-[#101b17] px-5 py-4" }, h(LogoPreview, { logo, where: "Website header" })),
    h("div", { className: "border border-line bg-[#0a120f] px-5 py-4" }, h(LogoPreview, { logo, where: "Website footer" })),
    h("div", { className: "flex justify-center border border-line bg-[#0b1412] px-5 py-8" }, h(LogoPreview, { logo, where: "Guest sign-in page" })));
  const panel = h(U.Panel, { title: "Logo", subtitle: "Appears in the website header, footer and the guest sign-in page. An uploaded image replaces the wordmark; without one, the star mark and wordmark are used." },
    h("div", { className: "grid gap-6 lg:grid-cols-[1fr_380px]" }, fields, previews));
  return h("div", { className: "space-y-5" },
    h(SaveBar, { user, dirty, onSave: () => C.saveDraft({ logo: w.logo }, user, "logo"), onReset: reset, route: "/" }),
    panel);
}
/* ============================ SECTIONS ============================= */
function Overview({ user }) {
  const data = U.useDB();
  const ch = C.changes();
  const d = C.draft(), l = C.live();
  const st = C.storageInfo();
  const pub = (x) => (x || []).filter((i) => i.status === "published").length;
  const card = (label, value, sub, to) => h("button", { key: label, onClick: () => to && drillTo(to), className: "border border-line bg-surface p-4 text-left hover:border-gold/50" }, h("p", { className: "text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/45" }, label), h("p", { className: "mt-1.5 font-display text-2xl text-ivory" }, value), h("p", { className: "text-[11px] text-ivory/50" }, sub));
  return h("div", { className: "space-y-5" },
    st.error && h("p", { className: "border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-200" }, st.error.message),
    h("div", { className: "grid gap-3 sm:grid-cols-2 xl:grid-cols-4" },
      card("Unpublished changes", ch.length, ch.length ? ch.map((c) => c.label).join(", ") : "Draft matches the live website", "wm-publish"),
      card("Last published", data.cmsMeta?.publishedAt ? D.fmtDateTime(data.cmsMeta.publishedAt) : "—", data.cmsMeta?.publishedBy || "", "wm-publish"),
      card("Pages", pub(l.pages) + " live", (d.pages || []).length + " in total", "wm-pages"),
      card("Articles", pub(l.blog) + " live", (d.blog || []).length + " in total", "wm-blog"),
      card("Destinations", pub(l.destinationsSite) + " live", (d.destinationsSite || []).length + " pages · " + data.destinations.length + " in the database", "wm-destinations"),
      card("Active promotions", C.activeBanners("home-top").length + C.activeBanners("home-bottom").length + C.activeBanners("marketplace").length + C.activeBanners("bar").length, (d.banners || []).length + " banners", "wm-banners"),
      card("Media library", C.media().length + " files", fmtBytes(C.media().reduce((s, m) => s + (m.size || 0), 0)), "wm-media"),
      card("Browser storage", Math.round((st.used / st.quota) * 100) + "%", fmtBytes(st.used * 2) + " of about 10 MB", "wm-media")),
    h(U.Panel, { title: "Website Management", subtitle: "Every published change appears on the public website automatically. Drafts are only visible in preview." },
      h("div", { className: "grid gap-2 sm:grid-cols-2 lg:grid-cols-3" }, WM_MENU.filter(([k]) => k !== "wm-overview" && D.can(user, "view", k)).map(([k, label]) => h("button", { key: k, onClick: () => drillTo(k), className: "border border-line px-4 py-3 text-left text-[13px] text-ivory/80 hover:border-gold/50 hover:text-ivory" }, label, " →")))),
    h("p", { className: "border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-[12px] leading-relaxed text-amber-200" }, "Where published content lives: this system stores everything in the browser, so the live website updates on this device. To show the same content to every visitor on every device, connect a hosted database (for example Supabase) — the CMS is built on one content store so it can be moved without changes. Until then, use Website settings → Export / Import to move content between devices."));
}

function Homepage({ user }) {
  const [w, setW, dirty, reset] = useWorking(["home", "homeLayout"]);
  const hero = (w.home && w.home.hero) || {};
  const setHero = (patch) => setW({ ...w, home: { ...(w.home || {}), hero: { ...hero, ...patch } } });
  const layout = Array.isArray(w.homeLayout) && w.homeLayout.length ? w.homeLayout : HOME_SECTIONS.map((s) => ({ id: s.id, type: "builtin", visible: true }));
  const setLayout = (l) => setW({ ...w, homeLayout: l });
  const [drag, setDrag] = useState(null);
  const [open, setOpen] = useState(null);
  const [add, setAdd] = useState("cta");
  const move = (i, j) => { if (j < 0 || j >= layout.length) return; const n = [...layout]; const [x] = n.splice(i, 1); n.splice(j, 0, x); setLayout(n); };
  const label = (r) => (r.type === "builtin" ? HOME_SECTIONS.find((s) => s.id === r.id)?.label || r.id : (r.block?.title || BLOCKS[r.block?.type]?.label || "Custom section"));
  const save = () => { C.saveDraft({ home: w.home, homeLayout: w.homeLayout }, user, "homeLayout"); };
  return h("div", { className: "space-y-5" },
    h(SaveBar, { user, dirty, onSave: save, onReset: reset, route: "/" }),
    h(U.Panel, { title: "Hero banner", subtitle: "Main image or video, headline and introduction at the top of the homepage" },
      h("div", { className: "space-y-4" },
        h("div", { className: "grid gap-4 md:grid-cols-3" }, h(MediaPicker, { label: "Desktop image", value: hero.image, onChange: (v) => setHero({ image: v }), user }), h(MediaPicker, { label: "Mobile image", value: hero.imageMobile, onChange: (v) => setHero({ imageMobile: v }), user }), h(MediaPicker, { label: "Background video (optional)", type: "video", value: hero.video, onChange: (v) => setHero({ video: v }), user, hint: "MP4 link — plays muted on loop" })),
        h("div", { className: "grid gap-3 md:grid-cols-2" }, F({ label: "Rating line / eyebrow", value: hero.eyebrow, onChange: (v) => setHero({ eyebrow: v }) }), F({ label: "Headline", value: hero.title, onChange: (v) => setHero({ title: v }) }), F({ label: "Image description (alt text)", value: hero.alt, onChange: (v) => setHero({ alt: v }) }), F({ label: "Dark overlay % — " + (hero.overlay ?? 25), type: "range", min: 0, max: 80, step: 5, value: hero.overlay ?? 25, onChange: (v) => setHero({ overlay: Number(v) }) })),
        F({ label: "Introduction", type: "textarea", rows: 2, value: hero.body, onChange: (v) => setHero({ body: v }) }),
        h("p", { className: "text-[11px] text-ivory/45" }, "Hero button texts are in Content & descriptions → Home."))),
    h(U.Panel, { title: "Homepage sections", subtitle: "Drag to reorder, show or hide, edit or delete. Add new sections — offers, products, destinations, galleries, newsletter — without code." },
      h("div", { className: "space-y-2" },
        layout.map((r, i) => h("div", { key: r.id, draggable: true, onDragStart: () => setDrag(i), onDragOver: (e) => e.preventDefault(), onDrop: () => { if (drag !== null) move(drag, i); setDrag(null); }, className: U.cx("border", r.visible === false ? "border-line/50 opacity-60" : "border-line", drag === i && "border-gold") },
          h("div", { className: "flex flex-wrap items-center gap-2 px-3 py-2.5" },
            h("span", { className: "cursor-grab text-ivory/40", title: "Drag to reorder" }, "⋮⋮"),
            h("span", { className: "flex gap-1" }, h("button", { onClick: () => move(i, i - 1), className: "px-1 text-ivory/50 hover:text-ivory" }, "↑"), h("button", { onClick: () => move(i, i + 1), className: "px-1 text-ivory/50 hover:text-ivory" }, "↓")),
            h("span", { className: "w-6 text-[11px] text-ivory/40" }, i + 1),
            h("span", { className: "flex-1 text-[13px] text-ivory" }, label(r)),
            h(U.Badge, { tone: r.type === "builtin" ? "neutral" : "blue" }, r.type === "builtin" ? "built-in" : BLOCKS[r.block?.type]?.label || "custom"),
            h("button", { onClick: () => setLayout(layout.map((x, k) => (k === i ? { ...x, visible: x.visible === false } : x))), className: "text-[10px] font-semibold uppercase tracking-[0.12em] text-ivory/65 hover:text-ivory" }, r.visible === false ? "Show" : "Hide"),
            r.type === "builtin" ? h("button", { onClick: () => drillTo("wm-content", { group: r.id === "VR" ? "Home" : "Home" }), className: "text-[10px] font-semibold uppercase tracking-[0.12em] text-gold-soft" }, "Edit texts") : h("button", { onClick: () => setOpen(open === r.id ? null : r.id), className: "text-[10px] font-semibold uppercase tracking-[0.12em] text-gold-soft" }, open === r.id ? "Close" : "Edit"),
            r.type === "custom" && h("button", { onClick: () => confirm("Delete this section from the homepage?") && setLayout(layout.filter((_, k) => k !== i)), className: "text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-300" }, "Delete")),
          open === r.id && r.type === "custom" && h("div", { className: "border-t border-line p-3" }, h(BlockFields, { b: r.block, user, set: (nb) => setLayout(layout.map((x, k) => (k === i ? { ...x, block: nb } : x))) })))),
        h("div", { className: "flex flex-wrap items-center gap-2 pt-2" }, h("select", { value: add, onChange: (e) => setAdd(e.target.value), className: U.cx(inp, "w-auto py-2") }, Object.entries(BLOCKS).filter(([k]) => k !== "hero").map(([k, v]) => h("option", { key: k, value: k }, v.label))), h(U.Btn, { size: "sm", variant: "solid", onClick: () => { const id = C.cid("SEC"); setLayout([...layout.slice(0, 1), { id, type: "custom", visible: true, block: { ...BLOCKS[add].make(), id } }, ...layout.slice(1)]); setOpen(id); } }, "+ Add section"), h("span", { className: "text-[11px] text-ivory/45" }, "New sections are added below the hero — drag them into place."),
          Array.isArray(w.homeLayout) && h(U.Btn, { size: "sm", variant: "subtle", onClick: () => confirm("Restore the original homepage order? Custom sections are removed.") && setLayout(null) }, "Restore original order")))));
}

function Navigation({ user }) {
  const [w, setW, dirty, reset] = useWorking(["nav", "footerMenus"]);
  return h("div", { className: "space-y-5" }, h(SaveBar, { user, dirty, onSave: () => C.saveDraft({ nav: w.nav, footerMenus: w.footerMenus }, user, "nav"), onReset: reset, route: "/" }), h(MenuEditor, { draft: w, setDraft: setW, headerOnly: true }));
}

const BUILTIN_PAGES = [["/", "Home"], ["/about", "About us"], ["/stays", "Accommodation (Stays)"], ["/marketplace", "Marketplace — experiences, dining, wellness, transport, yachts"], ["/builder", "Vacation builder"], ["/contact", "Contact us"], ["/journal", "Journal (blog)"], ["/destinations", "Destinations"]];
const PAGE_TEMPLATES = {
  blank: { label: "Blank page", blocks: () => [] },
  standard: { label: "Standard page — banner + text", blocks: () => [BLOCKS.hero.make(), BLOCKS.text.make()] },
  landing: { label: "Landing page — banner, story, products, offer", blocks: () => [BLOCKS.hero.make(), BLOCKS.imageText.make(), BLOCKS.products.make(), BLOCKS.cta.make()] },
  service: { label: "Service page — e.g. Airport transfers, Concierge", blocks: () => [BLOCKS.hero.make(), BLOCKS.text.make(), { ...BLOCKS.products.make(), title: "Book this service" }, BLOCKS.faq.make()] },
  legal: { label: "Legal page — Privacy policy, Terms", blocks: () => [{ ...BLOCKS.text.make(), title: "", html: "" }] },
};
function PageEditor({ user, item, onClose }) {
  const [p, setP] = useState(() => clone(item));
  const s = (k) => (v) => setP({ ...p, [k]: v });
  const taken = (C.draft().pages || []).some((x) => x.slug === p.slug && x.id !== p.id);
  const save = () => { if (!p.title) return alert("Give the page a title."); if (!p.slug) return alert("Give the page a web address (slug)."); if (taken) return alert("Another page already uses /p/" + p.slug); const r = C.saveItem("pages", p, user); setP(r); return r; };
  return h(U.Modal, { open: true, onClose, wide: true, title: (item.id ? "Edit page" : "New page") + (p.title ? " · " + p.title : ""), footer: [
      h(U.Btn, { key: "c", size: "sm", onClick: onClose }, "Close"),
      h(U.Btn, { key: "p", size: "sm", onClick: () => { if (save()) openPreview("/p/" + p.slug); } }, "Save & preview"),
      C.canCms(user, "approve", "pages") && h(U.Btn, { key: "pub", size: "sm", variant: "solid", onClick: () => { const r = save(); if (r) { try { C.publishItem("pages", r.id, user); onClose(); } catch (e) { alert(e.message); } } } }, "Save & publish"),
      h(U.Btn, { key: "s", size: "sm", variant: "dark", onClick: () => save() }, "Save draft")] },
    h("div", { className: "space-y-4" },
      h("div", { className: "grid gap-3 md:grid-cols-2" }, F({ label: "Page title", value: p.title, onChange: (v) => setP({ ...p, title: v, slug: item.slug || p.slugTouched ? p.slug : C.slugify(v) }) }), F({ label: "Web address", value: p.slug, onChange: (v) => setP({ ...p, slug: C.slugify(v), slugTouched: true }), hint: "/p/" + (p.slug || "…") + (taken ? " — already used" : "") }), F({ label: "Small heading (when the page has no banner)", value: p.eyebrow, onChange: s("eyebrow") }), F({ label: "Introduction (when the page has no banner)", value: p.intro, onChange: s("intro") })),
      h("p", { className: "eyebrow" }, "Page sections"),
      h(BlockList, { blocks: p.blocks || [], onChange: s("blocks"), user }),
      h(SeoFields, { seo: p.seo || {}, onChange: s("seo"), fallbackTitle: p.title, user })));
}
function Pages({ user }) {
  U.useDB();
  const [w, setW, dirty, reset] = useWorking(["builtinPages"]);
  const [edit, setEdit] = useState(null);
  const [tpl, setTpl] = useState("standard");
  const pages = C.draft().pages || [];
  const bp = w.builtinPages || {};
  return h("div", { className: "space-y-5" },
    h(SaveBar, { user, dirty, onSave: () => C.saveDraft({ builtinPages: w.builtinPages }, user, "builtinPages"), onReset: reset, route: "/" }),
    h(U.Panel, { title: "Website pages", subtitle: "Create new pages from templates, edit, duplicate, publish, unpublish or delete them", pad: false, actions: [
        h("select", { key: "t", value: tpl, onChange: (e) => setTpl(e.target.value), className: U.cx(inp, "w-auto py-2") }, Object.entries(PAGE_TEMPLATES).map(([k, v]) => h("option", { key: k, value: k }, v.label))),
        C.canCms(user, "add", "pages") && h(U.Btn, { key: "n", size: "sm", variant: "solid", onClick: () => setEdit({ title: "", slug: "", status: "draft", blocks: PAGE_TEMPLATES[tpl].blocks().map((b) => ({ ...b, id: C.cid("BLK") })), seo: {} }) }, "+ New page")] },
      h(U.DataTable, { pageSize: 12, rows: pages, empty: "No custom pages yet — choose a template and create one.", columns: [
        { key: "title", label: "Page", render: (p) => h("span", null, h("span", { className: "block text-ivory" }, p.title), h("span", { className: "text-[11px] text-ivory/45" }, "/p/" + p.slug)) },
        { key: "blocks", label: "Sections", render: (p) => (p.blocks || []).length },
        { key: "status", label: "Status", render: (p) => h(StateBadge, { coll: "pages", id: p.id }) },
        { key: "updatedAt", label: "Updated", render: (p) => (p.updatedAt ? D.fmtDateTime(p.updatedAt) + " · " + (p.updatedBy || "") : "—") },
        { key: "x", label: "", sortable: false, render: (p) => h(ItemActions, { user, coll: "pages", item: p, route: "/p/" + p.slug, onEdit: () => setEdit(p), onDuplicate: () => C.saveItem("pages", { ...clone(p), id: undefined, title: p.title + " (copy)", slug: p.slug + "-copy", status: "draft", publishedAt: undefined }, user) }) },
      ] })),
    h(U.Panel, { title: "Built-in pages", subtitle: "Unpublish to hide a page from visitors (shows “not found”); its content is kept. Texts are edited in Content & descriptions." },
      h("div", { className: "divide-y divide-line/60 border border-line" }, BUILTIN_PAGES.map(([path, label]) => h("div", { key: path, className: "flex flex-wrap items-center gap-3 px-4 py-2.5" },
        h("span", { className: "flex-1 text-[13px] text-ivory" }, label, h("span", { className: "ml-2 text-[11px] text-ivory/40" }, path)),
        h(U.Badge, { tone: (bp[path] || {}).hidden ? "red" : "green" }, (bp[path] || {}).hidden ? "unpublished" : "published"),
        path !== "/" && h(U.Btn, { size: "sm", variant: "subtle", onClick: () => setW({ ...w, builtinPages: { ...bp, [path]: { ...(bp[path] || {}), hidden: !(bp[path] || {}).hidden } } }) }, (bp[path] || {}).hidden ? "Publish" : "Unpublish"),
        h(U.Btn, { size: "sm", variant: "subtle", onClick: () => drillTo("wm-seo", { path }) }, "SEO"),
        h(U.Btn, { size: "sm", variant: "subtle", onClick: () => openPreview(path) }, "Preview"))))),
    edit && h(PageEditor, { user, item: edit, onClose: () => setEdit(null) }));
}

function Categories({ user }) {
  const data = U.useDB();
  const [w, setW, dirty, reset] = useWorking(["siteCategories"]);
  const cats = Array.isArray(w.siteCategories) && w.siteCategories.length ? w.siteCategories : clone(C.LEGACY_CATS).map((c, i) => ({ ...c, order: i, visible: true }));
  const setCats = (l) => setW({ ...w, siteCategories: l.map((c, i) => ({ ...c, order: i })) });
  const set = (i, patch) => setCats(cats.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const move = (i, d) => { const n = [...cats]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setCats(n); };
  const [open, setOpen] = useState(null);
  const [assign, setAssign] = useState({ q: "", slugs: [], categoryId: "", sub: "" });
  const sellable = data.products.filter((p) => p.status === "live" && p.published !== false);
  const count = (c) => sellable.filter((p) => C.categoryMatch({ ...p, category: p.category || D.SITE_CATEGORY[p.categoryId] }, c.id)).length;
  const pmCat = data.categories.find((c) => c.id === assign.categoryId);
  const canProducts = D.can(user, "edit", "products");
  return h("div", { className: "space-y-5" },
    h(SaveBar, { user, dirty, onSave: () => C.saveDraft({ siteCategories: cats }, user, "siteCategories"), onReset: reset, route: "/marketplace" }),
    h(U.Panel, { title: "Website categories", subtitle: "The categories on the marketplace, in menus set to auto-fill, and in category sections. Each draws its products from Product Master — no duplicate records.", actions: [h(U.Btn, { key: "a", size: "sm", variant: "solid", onClick: () => { setCats([...cats, { id: "cat-" + Date.now().toString(36), label: "New category", icon: "✦", categoryIds: [], visible: true }]); setOpen(cats.length); } }, "+ Add category")] },
      h("div", { className: "space-y-2" }, cats.map((c, i) => h("div", { key: c.id, className: U.cx("border", c.visible === false ? "border-line/50 opacity-60" : "border-line") },
        h("div", { className: "flex flex-wrap items-center gap-2 px-3 py-2.5" },
          h("span", { className: "flex gap-1" }, h("button", { onClick: () => move(i, -1), className: "px-1 text-ivory/50 hover:text-ivory" }, "↑"), h("button", { onClick: () => move(i, 1), className: "px-1 text-ivory/50 hover:text-ivory" }, "↓")),
          h("span", { className: "w-6 text-center text-gold" }, c.icon || ""),
          h("span", { className: "flex-1 text-[13px] text-ivory" }, c.label, c.featured && h("span", { className: "ml-2 text-[10px] uppercase text-gold-soft" }, "featured")),
          h(U.Badge, { tone: count(c) ? "green" : "amber" }, count(c) + " products"),
          h("button", { onClick: () => set(i, { visible: c.visible === false }), className: "text-[10px] font-semibold uppercase tracking-[0.12em] text-ivory/65" }, c.visible === false ? "Show" : "Hide"),
          h("button", { onClick: () => setOpen(open === i ? null : i), className: "text-[10px] font-semibold uppercase tracking-[0.12em] text-gold-soft" }, open === i ? "Close" : "Edit"),
          h("button", { onClick: () => openPreview("/marketplace?category=" + c.id), className: "text-[10px] font-semibold uppercase tracking-[0.12em] text-ivory/65" }, "Landing page"),
          h("button", { onClick: () => confirm("Delete the category “" + c.label + "” from the website? Products are not affected.") && setCats(cats.filter((_, k) => k !== i)), className: "text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-300" }, "Delete")),
        open === i && h("div", { className: "space-y-3 border-t border-line p-4" },
          h("div", { className: "grid gap-3 md:grid-cols-[80px_1fr_1fr]" }, F({ label: "Icon", value: c.icon, onChange: (v) => set(i, { icon: v }) }), F({ label: "Name", value: c.label, onChange: (v) => set(i, { label: v }) }), F({ label: "Landing page headline", value: c.headline, onChange: (v) => set(i, { headline: v }) })),
          F({ label: "Description", type: "textarea", rows: 2, value: c.description, onChange: (v) => set(i, { description: v }) }),
          h("div", { className: "grid gap-4 md:grid-cols-2" }, h(MediaPicker, { label: "Category image", value: c.image, onChange: (v) => set(i, { image: v }), user }), h("div", { className: "space-y-2" }, F({ label: "Featured (category cards, “featured only”)", type: "checkbox", value: !!c.featured, onChange: (v) => set(i, { featured: v }) }))),
          h("div", null, h("p", { className: "mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/55" }, "Products from these Product Master categories"), h("div", { className: "flex flex-wrap gap-1.5" }, data.categories.map((pc) => { const on = (c.categoryIds || []).includes(pc.id); return h("button", { key: pc.id, onClick: () => set(i, { categoryIds: on ? c.categoryIds.filter((x) => x !== pc.id) : [...(c.categoryIds || []), pc.id] }), className: U.cx("rounded-full border px-2.5 py-1 text-[11px]", on ? "border-gold bg-gold/15 text-gold-soft" : "border-ivory/20 text-ivory/55") }, pc.name); })), h("p", { className: "mt-1 text-[11px] text-ivory/40" }, (c.categoryIds || []).length ? "" : c.legacy ? "None selected — uses the website's original “" + c.legacy + "” grouping." : "Select at least one so the category shows products."))))),
      Array.isArray(w.siteCategories) && h("div", { className: "pt-3" }, h(U.Btn, { size: "sm", variant: "subtle", onClick: () => confirm("Restore the original website categories?") && setW({ ...w, siteCategories: null }) }, "Restore original categories"))),
    h(U.Panel, { title: "Product Master categories & sub-categories", subtitle: "The categories products are filed under. Add, rename or delete them, and manage sub-categories, in Catalogue & categories.", actions: [h(U.Btn, { key: "c", size: "sm", onClick: () => drillTo("catalogue") }, "Open Catalogue & categories")] },
      h("div", { className: "flex flex-wrap gap-2" }, data.categories.map((c) => h("span", { key: c.id, className: "border border-line px-3 py-1.5 text-[12px] text-ivory/80" }, c.name, h("span", { className: "text-ivory/40" }, " · " + (c.subs || []).length + " sub · " + data.products.filter((p) => p.categoryId === c.id).length + " products"))))),
    h(U.Panel, { title: "Assign products to a category", subtitle: canProducts ? "Moves products in Product Master — applies immediately and is recorded in the audit log." : "Needs Product Master edit permission." },
      h("div", { className: "space-y-3" },
        h(ProductPicker, { value: assign.slugs, onChange: (v) => setAssign({ ...assign, slugs: v }) }),
        h("div", { className: "grid gap-3 md:grid-cols-3" }, F({ label: "Product Master category", type: "select", value: assign.categoryId, onChange: (v) => setAssign({ ...assign, categoryId: v, sub: "" }), options: [{ value: "", label: "Choose…" }, ...data.categories.map((c) => ({ value: c.id, label: c.name }))] }), F({ label: "Sub-category", type: "select", value: assign.sub, onChange: (v) => setAssign({ ...assign, sub: v }), options: [{ value: "", label: "Keep current" }, ...((pmCat && pmCat.subs) || []).map((x) => ({ value: x, label: x }))] }),
          h("div", { className: "self-end" }, h(U.Btn, { variant: "solid", disabled: !canProducts || !assign.slugs.length || !assign.categoryId, onClick: () => { assign.slugs.forEach((sl) => { const p = D.productOf(sl); if (p) D.update("products", p.id, { categoryId: assign.categoryId, category: D.SITE_CATEGORY[assign.categoryId] || p.category, ...(assign.sub ? { subcategory: assign.sub } : {}) }, user, { module: "products" }); }); alert(assign.slugs.length + " product(s) moved."); setAssign({ q: "", slugs: [], categoryId: "", sub: "" }); } }, "Assign")))))));
}

function ProductDisplay({ user }) {
  const data = U.useDB();
  const [w, setW, dirty, reset] = useWorking(["productDisplay"]);
  const pd = w.productDisplay || {};
  const set = (patch) => setW({ ...w, productDisplay: { featured: [], hidden: [], badges: {}, ...pd, ...patch } });
  const [q, setQ] = useState("");
  const [only, setOnly] = useState("all");
  const live = data.products.filter((p) => p.status === "live" && p.published !== false && (Number(p.sellingRate) > 0 || p.priceOnRequest) && p.verification !== "pending");
  const rows = live.filter((p) => (!q || (p.name + " " + p.destination).toLowerCase().includes(q.toLowerCase())) && (only === "all" || (only === "featured" ? (pd.featured || []).includes(p.slug) : only === "hidden" ? (pd.hidden || []).includes(p.slug) : (pd.badges || {})[p.slug])));
  const toggle = (k, slug) => { const l = pd[k] || []; set({ [k]: l.includes(slug) ? l.filter((x) => x !== slug) : [...l, slug] }); };
  return h("div", { className: "space-y-5" },
    h(SaveBar, { user, dirty, onSave: () => C.saveDraft({ productDisplay: w.productDisplay }, user, "productDisplay"), onReset: reset, route: "/marketplace" }),
    h(U.Panel, { title: "Product display", subtitle: "Featured products show first in the marketplace and stays; hidden products disappear from the website (they stay bookable in the backend); badges appear on product cards. Product details, prices and photos are edited in Product Master.", pad: false, actions: [
        h("input", { key: "q", value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search products…", className: U.cx(inp, "w-56 py-2") }),
        h("select", { key: "o", value: only, onChange: (e) => setOnly(e.target.value), className: U.cx(inp, "w-auto py-2") }, [["all", "All on website"], ["featured", "Featured"], ["hidden", "Hidden"], ["badges", "With badge"]].map(([v, l]) => h("option", { key: v, value: v }, l)))] },
      h(U.DataTable, { pageSize: 15, searchable: false, rows: rows.map((p) => ({ ...p, id: p.slug })), columns: [
        { key: "name", label: "Product", render: (p) => h("span", null, h("span", { className: "block text-ivory" }, p.name), h("span", { className: "text-[11px] text-ivory/45" }, (data.categories.find((c) => c.id === p.categoryId) || {}).name + " · " + p.destination)) },
        { key: "f", label: "Featured", sortable: false, render: (p) => F({ label: "", type: "checkbox", value: (pd.featured || []).includes(p.slug), onChange: () => toggle("featured", p.slug) }) },
        { key: "h", label: "Hidden", sortable: false, render: (p) => F({ label: "", type: "checkbox", value: (pd.hidden || []).includes(p.slug), onChange: () => toggle("hidden", p.slug) }) },
        { key: "b", label: "Badge", sortable: false, render: (p) => h("input", { value: (pd.badges || {})[p.slug] || "", placeholder: "e.g. New", onChange: (e) => { const b = { ...(pd.badges || {}) }; if (e.target.value) b[p.slug] = e.target.value.slice(0, 24); else delete b[p.slug]; set({ badges: b }); }, className: U.cx(inp, "w-32") }) },
        { key: "e", label: "", sortable: false, render: (p) => h(U.Btn, { size: "sm", variant: "subtle", onClick: () => drillTo("products", { q: p.name }) }, "Product Master") },
      ] })),
    h("p", { className: "text-[11px] text-ivory/45" }, "To feature products on the homepage, add a “Products from Product Master” section in Homepage management."));
}

function MediaLibrary({ user }) {
  U.useDB();
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("all");
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState("");
  const [newFolder, setNewFolder] = useState("General");
  const [url, setUrl] = useState("");
  const all = C.media();
  const folders = [...new Set(all.map((m) => m.folder))];
  const rows = all.filter((m) => (folder === "all" || m.folder === folder) && (!q || (m.name + " " + m.alt + " " + m.description + " " + m.folder).toLowerCase().includes(q.toLowerCase())));
  const m = sel && all.find((x) => x.id === sel);
  const st = C.storageInfo();
  const can = (a) => C.canCms(user, a, "media");
  return h("div", { className: "space-y-5" },
    st.error && h("p", { className: "border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-200" }, st.error.message),
    h(U.Panel, { title: "Image & media library", subtitle: "Upload once, use anywhere. Images are optimised automatically (desktop ≤1920 px, mobile copy ≤900 px). Replacing a file updates every page that uses it.", actions: [
        h("span", { key: "s", className: "text-[11px] text-ivory/50" }, "Storage " + Math.round((st.used / st.quota) * 100) + "% used"),
        can("add") && h("input", { key: "f", value: newFolder, onChange: (e) => setNewFolder(e.target.value), className: U.cx(inp, "w-32 py-2"), title: "Folder for new uploads" }),
        can("add") && h("label", { key: "u", className: "inline-flex cursor-pointer items-center rounded-full border border-gold bg-gold px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink" }, busy || "Upload images", h("input", { type: "file", accept: "image/*", multiple: true, className: "hidden", onChange: async (e) => { const fs = [...e.target.files]; e.target.value = ""; setBusy("Optimising " + fs.length + "…"); try { await C.uploadMedia(fs, { folder: newFolder || "General" }, user); } catch (er) { alert(er.message); } setBusy(""); } }))] },
      h("div", { className: "space-y-4" },
        h("div", { className: "flex flex-wrap gap-2" },
          h("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search media…", className: U.cx(inp, "max-w-xs py-2") }),
          h("select", { value: folder, onChange: (e) => setFolder(e.target.value), className: U.cx(inp, "w-auto py-2") }, h("option", { value: "all" }, "All folders (" + all.length + ")"), folders.map((f) => h("option", { key: f, value: f }, f + " (" + all.filter((x) => x.folder === f).length + ")"))),
          can("add") && h("input", { value: url, onChange: (e) => setUrl(e.target.value), placeholder: "Add a video or image link (https://…)", className: U.cx(inp, "min-w-[240px] flex-1 py-2") }),
          can("add") && h(U.Btn, { size: "sm", disabled: !url, onClick: () => { try { C.addMediaUrl({ url, type: /youtu|vimeo|\.mp4|\.webm/i.test(url) ? "video" : "image", folder: newFolder || "General" }, user); setUrl(""); } catch (e) { alert(e.message); } } }, "Add link")),
        h("div", { className: "grid gap-5 lg:grid-cols-[1fr_320px]" },
          rows.length ? h("div", { className: "grid grid-cols-3 content-start gap-3 sm:grid-cols-4 xl:grid-cols-6" }, rows.map((x) => h("button", { key: x.id, onClick: () => setSel(x.id), className: U.cx("border bg-ink/40 text-left", sel === x.id ? "border-gold" : "border-line hover:border-ivory/40") }, x.type === "video" ? h("div", { className: "grid aspect-square place-items-center text-2xl text-gold" }, "▶") : h("img", { src: x.mobile || x.url, alt: x.alt || "", className: "aspect-square w-full object-cover" }), h("p", { className: "truncate px-2 py-1 text-[10px] text-ivory/70" }, x.name)))) : h("p", { className: "py-10 text-center text-[13px] text-ivory/45" }, "No media yet."),
          m ? h("div", { className: "space-y-3 border border-line p-4" },
            m.type === "video" ? h("p", { className: "text-[12px] text-gold" }, "▶ Video link") : h("img", { src: m.url, alt: m.alt || "", className: "w-full border border-line" }),
            h("p", { className: "text-[11px] text-ivory/45" }, [m.w && m.w + "×" + m.h + " px", m.original && "original " + m.original, m.size && fmtBytes(m.size), m.external && "external link"].filter(Boolean).join(" · ")),
            F({ label: "Name", value: m.name, disabled: !can("edit"), onChange: (v) => C.updateMedia(m.id, { name: v }, user) }),
            F({ label: "Alt text (describes the image for search engines and screen readers)", value: m.alt, disabled: !can("edit"), onChange: (v) => C.updateMedia(m.id, { alt: v }, user) }),
            F({ label: "Description / caption", value: m.description, disabled: !can("edit"), onChange: (v) => C.updateMedia(m.id, { description: v }, user) }),
            F({ label: "Folder", value: m.folder, disabled: !can("edit"), onChange: (v) => C.updateMedia(m.id, { folder: v || "General" }, user) }),
            h("div", null, h("p", { className: "mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/55" }, "Used in"), (() => { const u = C.mediaUsage(m.id); return u.length ? h("ul", { className: "space-y-0.5 text-[12px] text-ivory/75" }, u.map((x) => h("li", { key: x }, "· " + x))) : h("p", { className: "text-[12px] text-ivory/45" }, "Not used yet"); })()),
            h("div", { className: "flex flex-wrap gap-2" },
              m.type !== "video" && can("edit") && h("label", { className: "inline-flex cursor-pointer items-center rounded-full border border-ivory/25 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ivory/85 hover:border-ivory" }, "Replace file", h("input", { type: "file", accept: "image/*", className: "hidden", onChange: async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f && confirm("Replace this image everywhere it is used?")) { try { await C.replaceMedia(m.id, f, user); } catch (er) { alert(er.message); } } } })),
              can("delete") && h(U.Btn, { size: "sm", variant: "danger", onClick: () => { const u = C.mediaUsage(m.id); if (!confirm(u.length ? "This image is used in: " + u.join(", ") + ".\nDelete anyway?" : "Delete this image?")) return; try { C.deleteMedia(m.id, user); setSel(null); } catch (e) { alert(e.message); } } }, "Delete"))) : h("p", { className: "border border-dashed border-line p-6 text-center text-[12px] text-ivory/45" }, "Select a file to rename it, add alt text, move it to a folder, replace or delete it.")))));
}

function Design({ user }) {
  const [w, setW, dirty, reset] = useWorking(["design"]);
  const [v, setV] = useState(0);
  const d = w.design || {};
  const set = (k, patch) => setW({ ...w, design: { ...d, [k]: { ...(d[k] || {}), ...patch } } });
  const col = { ...C.BRAND.colors, ...(d.colors || {}) };
  const fonts = { ...C.BRAND.fonts, ...(d.fonts || {}) };
  const t = d.type || {};
  const issues = C.designIssues(d);
  const can = C.canCms(user, "edit", "design");
  const num = (k, label, [a, b], step = 1) => F({ label: label + " (" + a + "–" + b + ", empty = brand default)", type: "number", min: a, max: b, step, disabled: !can, value: t[k] ?? "", onChange: (x) => set("type", { [k]: x === "" ? "" : Math.min(b, Math.max(a, Number(x))) }) });
  const fontSel = (k, label, opts) => F({ label, type: "select", disabled: !can, value: fonts[k], onChange: (x) => set("fonts", { [k]: x }), options: [...new Set([C.BRAND.fonts[k], ...opts])].map((f) => ({ value: f, label: f + (f === C.BRAND.fonts[k] ? " (brand)" : "") })) });
  return h("div", { className: "space-y-5" },
    h(SaveBar, { user, dirty, section: "design", onSave: () => { C.saveDraft({ design: w.design }, user, "design"); setV(v + 1); }, onReset: reset, route: "/", extra: can && h(U.Btn, { size: "sm", variant: "subtle", onClick: () => confirm("Reset typography and design to the Prestige brand defaults?") && setW({ ...w, design: {} }) }, "Reset to brand") }),
    !can && h("p", { className: "border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200" }, "View only — design settings can be changed by the Super Admin or users granted “cms-design” permission."),
    (issues.blocking.length > 0 || issues.warnings.length > 0) && h("div", { className: U.cx("border px-4 py-3 text-[12px]", issues.blocking.length ? "border-rose-400/40 bg-rose-500/10 text-rose-200" : "border-amber-400/30 bg-amber-500/10 text-amber-200") }, issues.blocking.length ? h("p", { className: "font-semibold" }, "These would make the website hard to read — publishing is blocked until fixed:") : null, [...issues.blocking, ...issues.warnings].map((x) => h("p", { key: x }, "· " + x))),
    h("div", { className: "grid gap-5 xl:grid-cols-2" },
      h(U.Panel, { title: "Typography" }, h("div", { className: "space-y-3" },
        h("div", { className: "grid gap-3 md:grid-cols-2" }, fontSel("hero", "Hero headline font", C.FONT_CHOICES.serif), fontSel("display", "Heading font", C.FONT_CHOICES.serif), fontSel("lux", "Small capitals / eyebrow font", C.FONT_CHOICES.display), fontSel("body", "Body text font", C.FONT_CHOICES.sans)),
        h("div", { className: "grid gap-3 md:grid-cols-3" }, num("h1", "H1 size px", C.DESIGN_LIMITS.h1), num("h2", "H2 size px", C.DESIGN_LIMITS.h2), num("h3", "H3 size px", C.DESIGN_LIMITS.h3)),
        h("div", { className: "grid gap-3 md:grid-cols-3" }, F({ label: "Heading weight", type: "select", disabled: !can, value: t.headingWeight || "", onChange: (x) => set("type", { headingWeight: x }), options: [{ value: "", label: "Brand default" }, ...[400, 500, 600, 700].map((n) => ({ value: String(n), label: String(n) }))] }), num("headingTracking", "Heading letter spacing em", [-0.03, 0.1], 0.005), num("body", "Body size px", C.DESIGN_LIMITS.body)),
        h("div", { className: "grid gap-3 md:grid-cols-3" }, num("line", "Body line height", C.DESIGN_LIMITS.line, 0.05), num("letter", "Body letter spacing em", C.DESIGN_LIMITS.letter, 0.005), F({ label: "Text alignment (CMS sections)", type: "select", disabled: !can, value: t.align || "default", onChange: (x) => set("type", { align: x }), options: [["default", "Default"], ["left", "Left"], ["center", "Centre"]].map(([a, b]) => ({ value: a, label: b })) })))),
      h(U.Panel, { title: "Brand colours" }, h("div", { className: "grid grid-cols-2 gap-3 md:grid-cols-3" }, Object.keys(C.BRAND.colors).map((k) => h("label", { key: k, className: "flex items-center gap-2 border border-line px-2 py-2" }, h("input", { type: "color", disabled: !can, value: col[k], onChange: (e) => set("colors", { [k]: e.target.value }), className: "h-8 w-10 cursor-pointer bg-transparent" }), h("span", { className: "text-[11px]" }, h("span", { className: "block text-ivory/85" }, { gold: "Gold (primary)", "gold-soft": "Gold accent", ivory: "Main text", deep: "Page background", ink: "Darkest tone", surface: "Panels", cream: "Soft green", pine: "Pine (secondary)", stone: "Secondary text", line: "Lines", teal: "Logo teal" }[k] || k), h("span", { className: "text-ivory/40" }, col[k] + (col[k] !== C.BRAND.colors[k] ? " · changed" : ""))))))),
      h(U.Panel, { title: "Buttons, cards & images" }, h("div", { className: "grid gap-3 md:grid-cols-2" },
        F({ label: "Button shape", type: "select", disabled: !can, value: (d.buttons || {}).radius || "pill", onChange: (x) => set("buttons", { radius: x }), options: [["pill", "Pill (brand)"], ["rounded", "Rounded"], ["soft", "Slightly rounded"], ["square", "Square"]].map(([a, b]) => ({ value: a, label: b })) }),
        F({ label: "Button text in capitals", type: "checkbox", disabled: !can, value: (d.buttons || {}).uppercase !== false, onChange: (x) => set("buttons", { uppercase: x }) }),
        F({ label: "Card corner radius px (empty = brand)", type: "number", min: 0, max: 32, disabled: !can, value: (d.cards || {}).radius ?? "", onChange: (x) => set("cards", { radius: x === "" ? "" : Math.min(32, Math.max(0, Number(x))) }) }),
        F({ label: "Image corner radius px", type: "number", min: 0, max: 32, disabled: !can, value: (d.images || {}).radius ?? 0, onChange: (x) => set("images", { radius: Math.min(32, Math.max(0, Number(x) || 0)) }) }),
        F({ label: "Slow zoom on hero images", type: "checkbox", disabled: !can, value: (d.images || {}).heroMotion !== false, onChange: (x) => set("images", { heroMotion: x }) }),
        F({ label: "Subtle film-grain texture", type: "checkbox", disabled: !can, value: (d.images || {}).grain !== false, onChange: (x) => set("images", { grain: x }) }))),
      h(U.Panel, { title: "Section backgrounds" }, h("p", { className: "text-[12px] leading-relaxed text-ivory/60" }, "Page and panel backgrounds follow the “Page background” and “Panels” colours. Each CMS section can also choose its own background (page, panel or soft green) in its editor."))),
    h(U.Panel, { title: "Device preview", subtitle: "Desktop, tablet and mobile — shows the saved draft" }, h(DevicePreview, { route: "/", version: v })));
}

function Content({ user, params }) {
  const [w, setW, dirty, reset] = useWorking(["content", "images", "hidden"]);
  return h("div", { className: "space-y-5" }, h(SaveBar, { user, dirty, onSave: () => C.saveDraft({ content: w.content, images: w.images, hidden: w.hidden }, user, "content"), onReset: reset, route: "/" }), h(ContentEditor, { draft: w, setDraft: setW, initialGroup: params?.group, user }), h("p", { className: "text-[11px] text-ivory/45" }, "Original website texts are edited as plain text so the design stays intact. Pages, articles, destinations, banners and homepage sections created here have a full rich-text editor (headings, bold, lists, links, quotes)."));
}

const PLACEMENTS = [["home-top", "Homepage — below the hero"], ["home-bottom", "Homepage — above the footer"], ["marketplace", "Marketplace — above the listings"], ["bar", "Announcement bar (text only, under the header)"]];
function BannerEditor({ user, item, onClose }) {
  const [b, setB] = useState(() => clone(item));
  const s = (k) => (v) => setB({ ...b, [k]: v });
  const save = () => { if (!b.title) return alert("Add a headline."); if (b.start && b.end && b.end < b.start) return alert("The end date is before the start date."); const r = C.saveItem("banners", b, user); setB(r); return r; };
  return h(U.Modal, { open: true, onClose, wide: true, title: item.id ? "Edit banner" : "New banner", footer: [
      h(U.Btn, { key: "c", size: "sm", onClick: onClose }, "Close"),
      h(U.Btn, { key: "p", size: "sm", onClick: () => { if (save()) openPreview(b.placement === "marketplace" ? "/marketplace" : "/"); } }, "Save & preview"),
      C.canCms(user, "approve", "banners") && h(U.Btn, { key: "pub", size: "sm", variant: "solid", onClick: () => { const r = save(); if (r) { try { C.publishItem("banners", r.id, user); onClose(); } catch (e) { alert(e.message); } } } }, "Save & publish"),
      h(U.Btn, { key: "s", size: "sm", variant: "dark", onClick: () => save() }, "Save draft")] },
    h("div", { className: "space-y-3" },
      h("div", { className: "grid gap-3 md:grid-cols-2" }, F({ label: "Headline", value: b.title, onChange: s("title") }), F({ label: "Small heading", value: b.eyebrow, onChange: s("eyebrow") })),
      F({ label: "Text", type: "textarea", rows: 2, value: b.text, onChange: s("text") }),
      h("div", { className: "grid gap-3 md:grid-cols-2" }, F({ label: "Button label", value: b.buttonLabel, onChange: s("buttonLabel") }), F({ label: "Button link", value: b.buttonLink, placeholder: "/builder, /p/offer or https://…", onChange: s("buttonLink") })),
      h("div", { className: "grid gap-3 md:grid-cols-4" }, F({ label: "Where", type: "select", value: b.placement, onChange: s("placement"), options: PLACEMENTS.map(([a, c]) => ({ value: a, label: c })) }), F({ label: "Starts", type: "date", value: b.start, onChange: s("start") }), F({ label: "Ends", type: "date", value: b.end, onChange: s("end") }), F({ label: "Order", type: "number", value: b.order ?? 0, onChange: s("order") })),
      b.placement !== "bar" && h("div", { className: "grid gap-4 md:grid-cols-2" }, h(MediaPicker, { label: "Desktop image", value: b.imageDesktop, onChange: s("imageDesktop"), user }), h(MediaPicker, { label: "Mobile image", value: b.imageMobile, onChange: s("imageMobile"), user })),
      h("p", { className: "text-[11px] text-ivory/45" }, "Banners appear only while published and between their start and end dates — expired promotions stop showing automatically.")));
}
function Banners({ user }) {
  U.useDB();
  const [edit, setEdit] = useState(null);
  const rows = (C.draft().banners || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const t = D.today();
  const run = (b) => (b.end && b.end < t ? "expired" : b.start && b.start > t ? "scheduled" : "running");
  return h("div", { className: "space-y-5" },
    h(U.Panel, { title: "Banners & promotions", subtitle: "Promotional banners with start and end dates for the homepage, marketplace and announcement bar", pad: false, actions: [C.canCms(user, "add", "banners") && h(U.Btn, { key: "n", size: "sm", variant: "solid", onClick: () => setEdit({ title: "", placement: "home-top", start: t, end: "", order: rows.length, status: "draft" }) }, "+ New banner")] },
      h(U.DataTable, { pageSize: 12, rows, empty: "No banners yet.", columns: [
        { key: "title", label: "Banner", render: (b) => h("span", null, h("span", { className: "block text-ivory" }, b.title), h("span", { className: "text-[11px] text-ivory/45" }, (PLACEMENTS.find((p) => p[0] === b.placement) || [])[1])) },
        { key: "dates", label: "Dates", render: (b) => (b.start ? D.fmtDate(b.start) : "now") + " → " + (b.end ? D.fmtDate(b.end) : "no end") },
        { key: "run", label: "Schedule", render: (b) => h(U.Badge, { tone: run(b) === "running" ? "green" : run(b) === "scheduled" ? "blue" : "red" }, run(b)) },
        { key: "order", label: "Order" },
        { key: "status", label: "Status", render: (b) => h(StateBadge, { coll: "banners", id: b.id }) },
        { key: "x", label: "", sortable: false, render: (b) => h(ItemActions, { user, coll: "banners", item: b, route: b.placement === "marketplace" ? "/marketplace" : "/", onEdit: () => setEdit(b) }) },
      ] })),
    edit && h(BannerEditor, { user, item: edit, onClose: () => setEdit(null) }));
}

function DestinationEditor({ user, item, onClose }) {
  const [d, setD] = useState(() => clone(item));
  const s = (k) => (v) => setD({ ...d, [k]: v });
  const taken = (C.draft().destinationsSite || []).some((x) => x.slug === d.slug && x.id !== d.id);
  const save = () => { if (!d.name) return alert("Add the destination name."); if (taken) return alert("Another destination uses /destination/" + d.slug); const r = C.saveItem("destinationsSite", { ...d, slug: d.slug || C.slugify(d.name) }, user); setD(r); return r; };
  return h(U.Modal, { open: true, onClose, wide: true, title: (item.updatedAt ? "Edit destination · " : "New destination page · ") + (d.name || ""), footer: [
      h(U.Btn, { key: "c", size: "sm", onClick: onClose }, "Close"),
      h(U.Btn, { key: "p", size: "sm", onClick: () => { const r = save(); if (r) openPreview("/destination/" + r.slug); } }, "Save & preview"),
      C.canCms(user, "approve", "destinationsSite") && h(U.Btn, { key: "pub", size: "sm", variant: "solid", onClick: () => { const r = save(); if (r) { try { C.publishItem("destinationsSite", r.id, user); onClose(); } catch (e) { alert(e.message); } } } }, "Save & publish"),
      h(U.Btn, { key: "s", size: "sm", variant: "dark", onClick: () => save() }, "Save draft")] },
    h("div", { className: "space-y-4" },
      h("div", { className: "grid gap-3 md:grid-cols-3" }, F({ label: "Destination name", value: d.name, onChange: (v) => setD({ ...d, name: v, slug: d.slugTouched ? d.slug : C.slugify(v) }) }), F({ label: "Web address", value: d.slug, onChange: (v) => setD({ ...d, slug: C.slugify(v), slugTouched: true }), hint: "/destination/" + (d.slug || "…") + (taken ? " — already used" : "") }), F({ label: "Display order", type: "number", value: d.order ?? 0, onChange: s("order") })),
      F({ label: "Tagline", value: d.tagline, onChange: s("tagline") }),
      h("p", { className: "text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/55" }, "Description"), h(RichEditor, { value: d.description, onChange: s("description") }),
      h("div", { className: "grid gap-3 md:grid-cols-2" }, F({ label: "Highlights & attractions (one per line)", type: "textarea", rows: 5, value: lines(d.highlights), onChange: (v) => setD({ ...d, highlights: toLines(v) }) }), h("div", { className: "space-y-3" }, F({ label: "Location", value: d.location, onChange: s("location") }), F({ label: "Map search (Google Maps)", value: d.mapQuery, placeholder: "e.g. Ubud, Bali", onChange: s("mapQuery") }))),
      h("div", { className: "grid gap-4 md:grid-cols-2" }, h(MediaPicker, { label: "Main image", value: d.heroImage, onChange: s("heroImage"), user }), h(MediaList, { label: "Gallery", value: d.gallery || [], onChange: s("gallery"), user })),
      h("div", null, h("p", { className: "mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/55" }, "Related categories"), h("div", { className: "flex flex-wrap gap-1.5" }, C.siteCategories().map((c) => { const on = (d.relatedCategories || []).includes(c.id); return h("button", { key: c.id, onClick: () => setD({ ...d, relatedCategories: on ? d.relatedCategories.filter((x) => x !== c.id) : [...(d.relatedCategories || []), c.id] }), className: U.cx("rounded-full border px-2.5 py-1 text-[11px]", on ? "border-gold bg-gold/15 text-gold-soft" : "border-ivory/20 text-ivory/55") }, c.label); }))),
      h("div", null, h("p", { className: "mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/55" }, "Related products (Product Master)"), h(ProductPicker, { value: d.relatedProducts || [], onChange: s("relatedProducts") }), F({ label: "Also show every live product whose destination is “" + (d.name || "…") + "”", type: "checkbox", value: d.autoProducts !== false, onChange: s("autoProducts") })),
      h(SeoFields, { seo: d.seo || {}, onChange: s("seo"), fallbackTitle: d.name, user })));
}
function Destinations({ user }) {
  const data = U.useDB();
  const [edit, setEdit] = useState(null);
  const pages = C.draft().destinationsSite || [];
  const fromDb = (x) => ({ destId: x.id, name: x.name, slug: C.slugify(x.name), tagline: x.tagline || "", description: x.content || x.description ? "<p>" + String(x.content || x.description).replace(/[<>&]/g, "") + "</p>" : "", location: x.location || "", mapQuery: x.mapQuery || x.name + ", Bali", heroImage: x.heroImage || "", gallery: (x.gallery || []).slice(0, 6), highlights: [], relatedCategories: [], relatedProducts: [], autoProducts: true, order: pages.length, status: "draft", seo: { title: x.seoTitle || "", description: x.seoDescription || "" } });
  const without = data.destinations.filter((x) => !pages.some((p) => p.destId === x.id));
  return h("div", { className: "space-y-5" },
    h(U.Panel, { title: "Destination pages", subtitle: "Published destinations appear at /destinations, in destination sections and in menus set to auto-fill from destinations", pad: false, actions: [C.canCms(user, "add", "destinationsSite") && h(U.Btn, { key: "n", size: "sm", variant: "solid", onClick: () => setEdit({ name: "", slug: "", status: "draft", order: pages.length, autoProducts: true, highlights: [], gallery: [] }) }, "+ New destination")] },
      h(U.DataTable, { pageSize: 15, rows: pages.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), empty: "No destination pages yet — create one from the destinations below.", columns: [
        { key: "name", label: "Destination", render: (d) => h("span", null, h("span", { className: "block text-ivory" }, d.name), h("span", { className: "text-[11px] text-ivory/45" }, "/destination/" + d.slug)) },
        { key: "order", label: "Order" },
        { key: "rp", label: "Products", sortable: false, render: (d) => (d.relatedProducts || []).length + (d.autoProducts !== false ? " + " + data.products.filter((p) => (p.destination || "").toLowerCase() === (d.name || "").toLowerCase() && p.status === "live").length + " auto" : "") },
        { key: "status", label: "Status", render: (d) => h(StateBadge, { coll: "destinationsSite", id: d.id }) },
        { key: "x", label: "", sortable: false, render: (d) => h(ItemActions, { user, coll: "destinationsSite", item: d, route: "/destination/" + d.slug, onEdit: () => setEdit(d) }) },
      ] })),
    without.length > 0 && h(U.Panel, { title: "Destinations without a website page", subtitle: "From the destination database (also used by Product Master). Create a page to start from their details." },
      h("div", { className: "flex flex-wrap gap-2" }, without.map((x) => h("button", { key: x.id, onClick: () => setEdit(fromDb(x)), className: "border border-line px-3 py-1.5 text-[12px] text-ivory/80 hover:border-gold" }, x.name, " · create page")))),
    edit && h(DestinationEditor, { user, item: edit, onClose: () => setEdit(null) }));
}

function ArticleEditor({ user, item, onClose }) {
  const [a, setA] = useState(() => clone(item));
  const s = (k) => (v) => setA({ ...a, [k]: v });
  const taken = (C.draft().blog || []).some((x) => x.slug === a.slug && x.id !== a.id);
  const save = () => { if (!a.title) return alert("Add a title."); if (!a.slug) return alert("Add a web address."); if (taken) return alert("Another article uses /journal/" + a.slug); const r = C.saveItem("blog", a, user); setA(r); return r; };
  return h(U.Modal, { open: true, onClose, wide: true, title: item.id ? "Edit article" : "New article", footer: [
      h(U.Btn, { key: "c", size: "sm", onClick: onClose }, "Close"),
      h(U.Btn, { key: "p", size: "sm", onClick: () => { if (save()) openPreview("/journal/" + a.slug); } }, "Save & preview"),
      C.canCms(user, "approve", "blog") && h(U.Btn, { key: "pub", size: "sm", variant: "solid", onClick: () => { const r = save(); if (r) { if (!r.content) return alert("Write the article before publishing."); try { C.publishItem("blog", r.id, user); onClose(); } catch (e) { alert(e.message); } } } }, "Save & publish"),
      h(U.Btn, { key: "s", size: "sm", variant: "dark", onClick: () => save() }, "Save draft")] },
    h("div", { className: "space-y-3" },
      h("div", { className: "grid gap-3 md:grid-cols-2" }, F({ label: "Title", value: a.title, onChange: (v) => setA({ ...a, title: v, slug: a.slugTouched || item.slug ? a.slug : C.slugify(v) }) }), F({ label: "Web address", value: a.slug, onChange: (v) => setA({ ...a, slug: C.slugify(v), slugTouched: true }), hint: "/journal/" + (a.slug || "…") + (taken ? " — already used" : "") })),
      h("div", { className: "grid gap-3 md:grid-cols-4" }, F({ label: "Author", value: a.author, onChange: s("author") }), F({ label: "Publication date", type: "date", value: a.date, onChange: s("date") }), F({ label: "Categories (comma separated)", value: (a.categories || []).join(", "), onChange: (v) => setA({ ...a, categories: list(v) }) }), F({ label: "Tags (comma separated)", value: (a.tags || []).join(", "), onChange: (v) => setA({ ...a, tags: list(v) }) })),
      h(MediaPicker, { label: "Main image", value: a.image, onChange: s("image"), user }),
      F({ label: "Summary (shown in listings)", type: "textarea", rows: 2, value: a.excerpt, onChange: s("excerpt") }),
      h("p", { className: "text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/55" }, "Article"), h(RichEditor, { value: a.content, onChange: s("content"), minHeight: 260 }),
      h(SeoFields, { seo: a.seo || {}, onChange: s("seo"), fallbackTitle: a.title, user })));
}
function Blog({ user }) {
  U.useDB();
  const [edit, setEdit] = useState(null);
  const rows = (C.draft().blog || []).slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return h(U.Panel, { title: "Blog & articles", subtitle: "Travel and wellness writing at /journal", pad: false, actions: [C.canCms(user, "add", "blog") && h(U.Btn, { key: "n", size: "sm", variant: "solid", onClick: () => setEdit({ title: "", slug: "", date: D.today(), author: user?.name || "", categories: [], tags: [], status: "draft", content: "", seo: {} }) }, "+ New article")] },
    h(U.DataTable, { pageSize: 12, rows, empty: "No articles yet.", columns: [
      { key: "title", label: "Article", render: (a) => h("span", null, h("span", { className: "block text-ivory" }, a.title), h("span", { className: "text-[11px] text-ivory/45" }, a.slug ? "/journal/" + a.slug : "no web address yet")) },
      { key: "author", label: "Author" }, { key: "date", label: "Date", render: (a) => (a.date ? D.fmtDate(a.date) : "—") },
      { key: "categories", label: "Categories", render: (a) => (a.categories || []).join(", ") || "—" },
      { key: "status", label: "Status", render: (a) => h(StateBadge, { coll: "blog", id: a.id }) },
      { key: "x", label: "", sortable: false, render: (a) => h(ItemActions, { user, coll: "blog", item: a, route: a.slug ? "/journal/" + a.slug : null, onEdit: () => setEdit(a) }) },
    ] }),
    edit && h(ArticleEditor, { user, item: edit, onClose: () => setEdit(null) }));
}

function Testimonials({ user }) {
  const [w, setW, dirty, reset] = useWorking(["testimonials", "testimonialsOnSite"]);
  return h("div", { className: "space-y-5" }, h(SaveBar, { user, dirty, onSave: () => C.saveDraft({ testimonials: w.testimonials, testimonialsOnSite: w.testimonialsOnSite }, user, "testimonials"), onReset: reset, route: "/" }), h(TestimonialsEditor, { draft: w, setDraft: setW }), h(U.Panel, { title: "Google reviews", subtitle: "Reviews synchronised from Google Business Profile are moderated in Reviews & Google.", actions: [h(U.Btn, { key: "r", size: "sm", onClick: () => drillTo("reviews") }, "Open Reviews & Google")] }, h("p", { className: "text-[12px] text-ivory/55" }, "Only reviews you publish there are eligible for the website.")));
}

const SOCIALS = [["instagram", "Instagram"], ["facebook", "Facebook"], ["tiktok", "TikTok"], ["youtube", "YouTube"], ["linkedin", "LinkedIn"], ["pinterest", "Pinterest"]];
function Footer({ user }) {
  const [w, setW, dirty, reset] = useWorking(["logo", "footer", "footerExtra", "footerMenus", "content"]);
  const fx = w.footerExtra || {};
  const setFx = (patch) => setW({ ...w, footerExtra: { ...fx, ...patch } });
  const fm = w.footerMenus || {};
  const descKey = (CONTENT_REGISTRY.find((r) => r.group === "Footer" && /one-stop/i.test(r.def)) || {}).key;
  const copyKey = (CONTENT_REGISTRY.find((r) => r.group === "Footer" && /©/.test(r.def)) || {}).key;
  const ct = (k) => (w.content || {})[k] || "";
  const setCt = (k, v) => { const c = { ...(w.content || {}) }; if (v) c[k] = v; else delete c[k]; setW({ ...w, content: c }); };
  const reg = (k) => (CONTENT_REGISTRY.find((r) => r.key === k) || {}).def || "";
  return h("div", { className: "space-y-5" },
    h(SaveBar, { user, dirty, onSave: () => C.saveDraft({ logo: w.logo, footer: w.footer, footerExtra: w.footerExtra, footerMenus: w.footerMenus, content: w.content }, user, "footerExtra"), onReset: reset, route: "/" }),
    h(U.Panel, { title: "Company" }, h("div", { className: "grid gap-3 md:grid-cols-2" }, descKey && F({ label: "Company description", type: "textarea", rows: 3, value: ct(descKey), placeholder: reg(descKey), onChange: (v) => setCt(descKey, v) }), copyKey && F({ label: "Copyright text", value: ct(copyKey), placeholder: reg(copyKey), onChange: (v) => setCt(copyKey, v) }))),
    h(U.Panel, { title: "Contact details", subtitle: "Used in the header, footer, contact page and guest emails — the logo itself is managed in the Logo area", actions: [h(U.Btn, { key: "l", size: "sm", onClick: () => drillTo("wm-logo") }, "Open Logo area")] },
      h("div", { className: "grid gap-4 md:grid-cols-2" }, [
        F({ label: "Email", value: (w.footer || {}).email || "", placeholder: "sales@prestigebali.com", onChange: (v) => setW({ ...w, footer: { ...(w.footer || {}), email: v } }) }),
        F({ label: "Phone / WhatsApp", value: (w.footer || {}).phone || "", placeholder: "+62 877 6416 1803", onChange: (v) => setW({ ...w, footer: { ...(w.footer || {}), phone: v } }) }),
        F({ label: "Address (one line per row)", type: "textarea", rows: 3, value: lines((w.footer || {}).address), onChange: (v) => setW({ ...w, footer: { ...(w.footer || {}), address: toLines(v) } }) }),
        F({ label: "Opening hours (one line per row)", type: "textarea", rows: 3, value: lines((w.footer || {}).hours), onChange: (v) => setW({ ...w, footer: { ...(w.footer || {}), hours: toLines(v) } }) }),
        F({ label: "Payment link", value: (w.footer || {}).paypal || "", placeholder: "https://paypal.me/prestigebali", onChange: (v) => setW({ ...w, footer: { ...(w.footer || {}), paypal: v } }) }),
      ])),
    h(U.Panel, { title: "Social media & WhatsApp" }, h("div", { className: "grid gap-3 md:grid-cols-3" }, SOCIALS.map(([k, l]) => F({ key: k, label: l + " link", value: (fx.socials || {})[k] || "", placeholder: "https://…", onChange: (v) => setFx({ socials: { ...(fx.socials || {}), [k]: v } }) })), F({ label: "Show a WhatsApp link (uses the phone number)", type: "checkbox", value: !!fx.whatsappShow, onChange: (v) => setFx({ whatsappShow: v }) }))),
    h("div", { className: "grid gap-5 lg:grid-cols-3" },
      h(U.Panel, { title: "Footer · Explore links" }, h(LinkRows, { items: Array.isArray(fm.explore) && fm.explore.length ? fm.explore : clone(bridge.defaultFooterMenus?.explore || []), depth: 1, onChange: (v) => setW({ ...w, footerMenus: { ...fm, explore: v } }) })),
      h(U.Panel, { title: "Footer · Company links" }, h(LinkRows, { items: Array.isArray(fm.company) && fm.company.length ? fm.company : clone(bridge.defaultFooterMenus?.company || []), depth: 1, onChange: (v) => setW({ ...w, footerMenus: { ...fm, company: v } }) })),
      h(U.Panel, { title: "Legal pages" }, h(LinkRows, { items: fx.legal || [], depth: 1, onChange: (v) => setFx({ legal: v }) }), h("p", { className: "mt-2 text-[11px] text-ivory/45" }, "Create Privacy Policy and Terms pages in Pages management (Legal template), then link them here as /p/privacy-policy."))),
    h(U.Panel, { title: "Newsletter" }, h("div", { className: "grid gap-3 md:grid-cols-3" }, F({ label: "Show a newsletter signup in the footer", type: "checkbox", value: !!(fx.newsletter || {}).enabled, onChange: (v) => setFx({ newsletter: { ...(fx.newsletter || {}), enabled: v } }) }), F({ label: "Heading", value: (fx.newsletter || {}).title, onChange: (v) => setFx({ newsletter: { ...(fx.newsletter || {}), title: v } }) }), F({ label: "Text", value: (fx.newsletter || {}).text, onChange: (v) => setFx({ newsletter: { ...(fx.newsletter || {}), text: v } }) }))));
}

function SeoFields({ seo, onChange, fallbackTitle, user }) {
  const s = (k) => (v) => onChange({ ...seo, [k]: v });
  const t = seo.title || "", d = seo.description || "";
  return h("div", { className: "space-y-3 border border-line p-4" },
    h("p", { className: "eyebrow" }, "Search engines & sharing"),
    h("div", { className: "grid gap-3 md:grid-cols-2" }, F({ label: "SEO title (" + t.length + "/60)", value: t, placeholder: fallbackTitle ? fallbackTitle + " — Prestige Bali Leisure" : "", onChange: s("title") }), F({ label: "Focus keywords", value: seo.keywords, placeholder: "private villa Ubud, luxury Bali", onChange: s("keywords") })),
    F({ label: "Meta description (" + d.length + "/160)", type: "textarea", rows: 2, value: d, onChange: s("description") }),
    h("div", { className: "grid gap-3 md:grid-cols-2" }, F({ label: "Social share title (Open Graph)", value: seo.ogTitle, onChange: s("ogTitle") }), F({ label: "Canonical URL (optional)", value: seo.canonical, placeholder: "https://…", onChange: s("canonical") })),
    h("div", { className: "grid gap-3 md:grid-cols-3" }, h(MediaPicker, { label: "Social share image", value: seo.ogImage, onChange: s("ogImage"), user, hint: "Use an image link (https) so other sites can load it" }), F({ label: "Hide from search engines (noindex)", type: "checkbox", value: !!seo.noindex, onChange: s("noindex") }), F({ label: "Include in sitemap", type: "checkbox", value: seo.sitemap !== false, onChange: s("sitemap") })),
    t.length > 60 && h("p", { className: "text-[11px] text-amber-300" }, "Titles longer than about 60 characters are usually shortened in search results."),
    d.length > 160 && h("p", { className: "text-[11px] text-amber-300" }, "Descriptions longer than about 160 characters are usually shortened."));
}
function Seo({ user, params }) {
  const [w, setW, dirty, reset] = useWorking(["seo", "seoPages"]);
  const [open, setOpen] = useState(params?.path || null);
  const sp = w.seoPages || {};
  const d = C.draft();
  const rows = [
    ...BUILTIN_PAGES.map(([p, l]) => ({ id: p, path: p, label: l, kind: "Page", seo: sp[p] || {} })),
    ...(d.pages || []).map((p) => ({ id: p.id, path: "/p/" + p.slug, label: p.title, kind: "Custom page", seo: p.seo || {}, coll: "pages" })),
    ...(d.blog || []).map((p) => ({ id: p.id, path: "/journal/" + p.slug, label: p.title, kind: "Article", seo: p.seo || {}, coll: "blog" })),
    ...(d.destinationsSite || []).map((p) => ({ id: p.id, path: "/destination/" + p.slug, label: p.name, kind: "Destination", seo: p.seo || {}, coll: "destinationsSite" })),
  ];
  const cur = rows.find((r) => r.id === open);
  const downloadSitemap = () => { const base = location.origin + location.pathname; const blob = new Blob([C.sitemapXml(base)], { type: "application/xml" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "sitemap.xml"; a.click(); };
  return h("div", { className: "space-y-5" },
    h(SaveBar, { user, dirty, onSave: () => C.saveDraft({ seo: w.seo, seoPages: w.seoPages }, user, "seo"), onReset: reset, route: "/" }),
    h(U.Panel, { title: "Website defaults", subtitle: "Used when a page has no SEO settings of its own" }, h("div", { className: "space-y-3" }, h("div", { className: "grid gap-3 md:grid-cols-2" }, F({ label: "Default title", value: (w.seo || {}).title, onChange: (v) => setW({ ...w, seo: { ...(w.seo || {}), title: v } }) }), F({ label: "Default keywords", value: (w.seo || {}).keywords, onChange: (v) => setW({ ...w, seo: { ...(w.seo || {}), keywords: v } }) })), F({ label: "Default description", type: "textarea", rows: 2, value: (w.seo || {}).description, onChange: (v) => setW({ ...w, seo: { ...(w.seo || {}), description: v } }) }), h(MediaPicker, { label: "Default social share image", value: (w.seo || {}).ogImage, onChange: (v) => setW({ ...w, seo: { ...(w.seo || {}), ogImage: v } }), user }))),
    h(U.Panel, { title: "Every page", subtitle: "Titles, descriptions, keywords, share image, canonical URL, indexing and sitemap — per page", pad: false, actions: [h(U.Btn, { key: "s", size: "sm", variant: "subtle", onClick: downloadSitemap }, "Download sitemap.xml")] },
      h(U.DataTable, { pageSize: 15, rows, columns: [
        { key: "label", label: "Page", render: (r) => h("span", null, h("span", { className: "block text-ivory" }, r.label), h("span", { className: "text-[11px] text-ivory/45" }, r.kind + " · " + r.path)) },
        { key: "t", label: "SEO title", sortable: false, render: (r) => r.seo.title || h("span", { className: "text-ivory/35" }, "default") },
        { key: "d", label: "Description", sortable: false, render: (r) => (r.seo.description ? r.seo.description.length + " chars" : h("span", { className: "text-amber-300/80" }, "missing")) },
        { key: "i", label: "Indexing", sortable: false, render: (r) => h(U.Badge, { tone: r.seo.noindex ? "red" : "green" }, r.seo.noindex ? "hidden" : "indexed") },
      ], onRowClick: (r) => setOpen(r.id) })),
    cur && h(U.Modal, { open: true, onClose: () => setOpen(null), wide: true, title: "SEO · " + cur.label, footer: [h(U.Btn, { key: "c", size: "sm", onClick: () => setOpen(null) }, cur.coll ? "Close" : "Done")] },
      cur.coll ? h("div", { className: "space-y-3" }, h("p", { className: "text-[12px] text-ivory/60" }, "SEO for this " + cur.kind.toLowerCase() + " is edited in its own editor so it is saved and published with it."), h(U.Btn, { size: "sm", variant: "solid", onClick: () => drillTo(cur.coll === "pages" ? "wm-pages" : cur.coll === "blog" ? "wm-blog" : "wm-destinations") }, "Open editor"))
        : h(SeoFields, { seo: sp[cur.path] || {}, onChange: (v) => setW({ ...w, seoPages: { ...sp, [cur.path]: v } }), fallbackTitle: cur.label, user })),
    h("p", { className: "text-[11px] text-ivory/45" }, "Applied on the live website: page title, meta description and keywords, robots (noindex), Open Graph title/description/image, canonical link and structured data (TravelAgency on pages, Article on journal posts). The website uses # addresses, which search engines index as one page — for full per-page indexing the site would need server hosting with clean URLs."));
}

function Settings({ user }) {
  const data = U.useDB();
  const [w, setW, dirty, reset] = useWorking(["settings"]);
  const st = w.settings || {};
  const set = (patch) => setW({ ...w, settings: { ...st, ...patch } });
  const can = C.canCms(user, "edit", "settings");
  const exportJson = () => { const cms = C.live(); const refs = new Set((JSON.stringify(cms).match(/media:[A-Z0-9-]+/g) || []).map((x) => x.slice(6))); const blob = new Blob([JSON.stringify({ v: 1, exportedAt: new Date().toISOString(), cms, media: C.media().filter((m) => refs.has(m.id)) })], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "prestige-website-content.json"; a.click(); };
  const importJson = async (f) => { try { const j = JSON.parse(await f.text()); if (!j.cms) throw new Error("Not a website content file."); const ids = new Set(C.media().map((m) => m.id)); (j.media || []).forEach((m) => { if (!ids.has(m.id)) C.media().push(m); }); C.saveDraft(Object.fromEntries(Object.entries(j.cms)), user, "settings"); alert("Imported into the draft. Review it in Preview & publish, then publish."); } catch (e) { alert(e.message); } };
  return h("div", { className: "space-y-5" },
    h(SaveBar, { user, dirty, section: "settings", onSave: () => C.saveDraft({ settings: w.settings }, user, "settings"), onReset: reset, route: "/" }),
    !can && h("p", { className: "border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200" }, "View only — website settings are restricted to the Super Admin or users granted “cms-design” permission."),
    h(U.Panel, { title: "Website identity" }, h("div", { className: "grid gap-4 md:grid-cols-3" }, F({ label: "Website name", disabled: !can, value: st.siteName, placeholder: "Prestige Bali Leisure", onChange: (v) => set({ siteName: v }) }), h(MediaPicker, { label: "Favicon (browser tab icon)", disabled: !can, value: st.favicon, onChange: (v) => set({ favicon: v }), user }), h(MediaPicker, { label: "Default social share image", disabled: !can, value: st.ogImage, onChange: (v) => set({ ogImage: v }), user }))),
    h(U.Panel, { title: "Maintenance mode", subtitle: "Shows a holding page to visitors. Staff who are signed in still see the website." }, h("div", { className: "space-y-3" }, F({ label: "Turn on maintenance mode", type: "checkbox", disabled: !can, value: !!(st.maintenance || {}).on, onChange: (v) => set({ maintenance: { ...(st.maintenance || {}), on: v } }) }), h("div", { className: "grid gap-3 md:grid-cols-2" }, F({ label: "Heading", disabled: !can, value: (st.maintenance || {}).title, placeholder: "We'll be back shortly", onChange: (v) => set({ maintenance: { ...(st.maintenance || {}), title: v } }) }), F({ label: "Message", disabled: !can, value: (st.maintenance || {}).message, onChange: (v) => set({ maintenance: { ...(st.maintenance || {}), message: v } }) })))),
    h(U.Panel, { title: "Vacation builder wording & categories", subtitle: "Managed in the vacation builder section" }, h(U.Btn, { size: "sm", onClick: () => drillTo("wm-builder-config") }, "Open vacation builder settings")),
    h(U.Panel, { title: "Newsletter subscribers", subtitle: (data.subscribers || []).length + " collected on this device — each sign-up is also emailed to your team", actions: [h(U.Btn, { key: "e", size: "sm", variant: "subtle", disabled: !(data.subscribers || []).length, onClick: () => U.exportCSV("newsletter-subscribers", (data.subscribers || []).map((s) => ({ Email: s.email, Date: new Date(s.at).toISOString(), Page: s.source }))) }, "Export CSV")] }, h("p", { className: "text-[12px] text-ivory/55" }, (data.subscribers || []).slice(0, 5).map((s) => s.email).join(", ") || "None yet.")),
    h(U.Panel, { title: "Export / import website content", subtitle: "Move the published website content (and the images it uses) to another device or keep a backup. Imports go into the draft for review." }, h("div", { className: "flex flex-wrap gap-2" }, h(U.Btn, { size: "sm", onClick: exportJson }, "Export published content"), can && h("label", { className: "inline-flex cursor-pointer items-center rounded-full border border-ivory/25 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ivory/85 hover:border-ivory" }, "Import into draft", h("input", { type: "file", accept: "application/json,.json", className: "hidden", onChange: (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importJson(f); } })))));
}

function BuilderConfig({ user }) {
  const [w, setW, dirty, reset] = useWorking(["builder"]);
  return h("div", { className: "space-y-5" }, h(SaveBar, { user, dirty, onSave: () => C.saveDraft({ builder: w.builder }, user, "builder"), onReset: reset, route: "/builder" }), h(BuilderEditor, { draft: w, setDraft: setW }));
}

function Publish({ user }) {
  const data = U.useDB();
  const [note, setNote] = useState("");
  const [v, setV] = useState(0);
  const ch = C.changes();
  const issues = C.designIssues(C.draft().design);
  const canPub = C.canCms(user, "approve", "content");
  const cmsLog = (data.auditLogs || []).filter((l) => l.module === "cms").slice(0, 200);
  return h("div", { className: "space-y-5" },
    h(U.Panel, { title: "Unpublished changes", subtitle: ch.length ? "These sections differ from the live website" : "The draft and the live website are identical", actions: [
        h(U.Btn, { key: "p", size: "sm", onClick: () => openPreview("/") }, "Preview website"),
        ch.length > 0 && C.canCms(user, "edit", "content") && h(U.Btn, { key: "d", size: "sm", variant: "danger", onClick: () => confirm("Discard all unpublished changes? The draft returns to the live website.") && C.discardDraft(user) }, "Discard draft")] },
      h("div", { className: "space-y-3" },
        ch.length ? h("div", { className: "flex flex-wrap gap-2" }, ch.map((c) => h(U.Badge, { key: c.key, tone: "amber" }, c.label))) : h("p", { className: "text-[12px] text-ivory/50" }, "Nothing to publish."),
        issues.blocking.length > 0 && h("p", { className: "border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200" }, "Blocked by design contrast: " + issues.blocking.join("; ")),
        ch.length > 0 && h("div", { className: "flex flex-wrap items-end gap-2" }, h("input", { value: note, onChange: (e) => setNote(e.target.value), placeholder: "Note for the version history (optional)", className: U.cx(inp, "min-w-[260px] flex-1 py-2") }), h(U.Btn, { variant: "solid", disabled: !canPub || issues.blocking.length > 0, onClick: () => { if (!confirm("Publish " + ch.length + " section(s) to the live website?")) return; try { C.publishAll(user, note); setNote(""); setV(v + 1); } catch (e) { alert(e.message); } } }, canPub ? "Publish to live website" : "Publishing needs permission")))),
    h(U.Panel, { title: "Preview", subtitle: "Desktop, tablet and mobile" }, h(DevicePreview, { route: "/", version: v + ch.length })),
    h(U.Panel, { title: "Version history", subtitle: "A copy of the live website is kept before every publish. Restoring loads it into the draft so you can review it before publishing.", pad: false }, h(U.DataTable, { pageSize: 10, searchable: false, rows: data.cmsVersions || [], empty: "No versions yet — the first publish creates one.", columns: [
      { key: "at", label: "Saved", render: (x) => D.fmtDateTime(x.at) }, { key: "by", label: "By" }, { key: "note", label: "Note" },
      { key: "r", label: "", sortable: false, render: (x) => C.canCms(user, "edit", "content") && h(U.Btn, { size: "sm", onClick: () => confirm("Load this version into the draft? Current unpublished changes are replaced.") && (C.restoreVersion(x.id, user), alert("Loaded into the draft. Preview it, then publish to make it live.")) }, "Restore to draft") },
    ] })),
    h(U.Panel, { title: "Website activity", subtitle: "Who created, edited, deleted or published website content", pad: false }, h(U.DataTable, { pageSize: 12, rows: cmsLog, columns: [
      { key: "at", label: "When", render: (l) => D.fmtDateTime(l.at) }, { key: "actor", label: "User" }, { key: "role", label: "Role" },
      { key: "action", label: "Action", render: (l) => h(U.Badge, { tone: /publish/.test(l.action) ? "green" : /delete|unpublish|discard/.test(l.action) ? "red" : "neutral" }, l.action) },
      { key: "recordId", label: "Item" }, { key: "after", label: "Detail" },
    ] })));
}

/* ============================== ROOT =============================== */
const VIEWS = { "wm-overview": Overview, "wm-home": Homepage, "wm-logo": LogoSection, "wm-nav": Navigation, "wm-pages": Pages, "wm-categories": Categories, "wm-products": ProductDisplay, "wm-media": MediaLibrary, "wm-design": Design, "wm-content": Content, "wm-banners": Banners, "wm-destinations": Destinations, "wm-blog": Blog, "wm-testimonials": Testimonials, "wm-footer": Footer, "wm-seo": Seo, "wm-settings": Settings, "wm-publish": Publish, "wm-builder-config": BuilderConfig };
export function WebsiteManagement({ user, params, section = "wm-overview" }) {
  U.useDB();
  const View = VIEWS[section] || Overview;
  const ch = C.changes();
  const canPub = C.canCms(user, "approve", "content");
  return h("div", { className: "space-y-5" },
    section !== "wm-publish" && ch.length > 0 && h("div", { className: "flex flex-wrap items-center justify-between gap-3 border border-gold/40 bg-gold/[0.06] px-4 py-2.5" },
      h("p", { className: "text-[12px] text-ivory/75" }, h("b", { className: "text-gold-soft" }, ch.length + " unpublished section" + (ch.length === 1 ? "" : "s") + ": "), ch.map((c) => c.label).join(", ")),
      h("span", { className: "flex gap-2" }, h(U.Btn, { size: "sm", onClick: () => openPreview("/") }, "Preview"), canPub && h(U.Btn, { size: "sm", variant: "solid", onClick: () => drillTo("wm-publish") }, "Review & publish"))),
    h(View, { user, params }));
}
export { SeoFields };
