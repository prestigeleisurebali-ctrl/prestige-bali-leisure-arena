/* ==================================================================
   PUBLIC WEBSITE — CMS-RENDERED CONTENT
   Custom pages, homepage sections, banners, journal, destinations,
   category landings, footer extras and the maintenance screen — all in
   the site's existing visual language and read from the published CMS
   (or the draft, in preview).
   ================================================================== */
import * as React from "react";
import * as jsxrt from "react/jsx-runtime";
import DOMPurify from "dompurify";
import * as D from "./db.js";
import * as C from "./cmsCore.js";
import { bridge } from "./bridge.js";

const g = jsxrt;
const { useState } = React;
const cx = (...a) => a.filter(Boolean).join(" ");
const wrap = "mx-auto w-full max-w-[1360px] px-5 md:px-8";
const Link = (p) => g.jsx(bridge.Link, p);
const Btn = (p) => (bridge.Button ? g.jsx(bridge.Button, p) : g.jsx("a", { href: "#" + (p.to || "/"), children: p.children }));
const Zoom = ({ src, alt, gal, className, children }) => (bridge.Zoom ? g.jsx(bridge.Zoom, { src, alt, gallery: gal, className, children }) : g.jsx("div", { className, children }));
const isExternal = (to) => /^(https?:|mailto:|tel:)/.test(to || "");

/* ----------------------------- rich text -------------------------- */
const ALLOWED = { ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "u", "h2", "h3", "h4", "ul", "ol", "li", "a", "blockquote"], ALLOWED_ATTR: ["href", "target", "rel"] };
const escapeHtml = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export function sanitize(html) {
  if (!html) return "";
  if (DOMPurify.isSupported && typeof window !== "undefined" && window.document && window.document.createElement && DOMPurify.sanitize) {
    const out = DOMPurify.sanitize(html, ALLOWED);
    return String(out).replace(/<a /g, '<a rel="noopener noreferrer" ');
  }
  /* no DOM available: show the text safely */
  return String(html).replace(/<\/(p|h2|h3|h4|li|blockquote)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").split("\n").filter((x) => x.trim()).map((x) => "<p>" + escapeHtml(x) + "</p>").join("");
}
export const RichText = ({ html, className }) => (html ? g.jsx("div", { className: cx("pbl-rich", className), dangerouslySetInnerHTML: { __html: sanitize(html) } }) : null);

function Pic({ src, mobile, alt, className, eager }) {
  const s = C.resolve(src), m = C.resolve(mobile || src, "mobile");
  if (!s) return null;
  return g.jsxs("picture", { className: "contents", children: [m && m !== s ? g.jsx("source", { media: "(max-width: 767px)", srcSet: m }) : null, g.jsx("img", { src: s, alt: alt || C.altOf(src) || "", loading: eager ? "eager" : "lazy", decoding: "async", className })] });
}
function Cta({ label, to, variant = "gold" }) {
  if (!label) return null;
  if (isExternal(to)) return g.jsx("a", { href: to, target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center justify-center gap-3 rounded-full border border-gold bg-gold px-8 py-3.5 text-[12px] font-semibold uppercase tracking-[0.22em] text-deep transition-colors hover:bg-gold-soft", children: label });
  return g.jsx(Btn, { to: to || "/", variant, children: label });
}
const Head = ({ eyebrow, title, intro, center }) => (eyebrow || title || intro ? g.jsxs("div", { className: cx("max-w-3xl", center && "mx-auto text-center"), children: [
    eyebrow && g.jsx("p", { className: "eyebrow", children: eyebrow }),
    title && g.jsx("h2", { className: "serif mt-4 font-semibold text-ivory", style: { fontSize: "clamp(2.1rem, 4.4vw, 3.4rem)", lineHeight: 1.04 }, children: title }),
    intro && g.jsx("p", { className: cx("mt-5 text-[15px] leading-relaxed text-stone", center && "mx-auto max-w-2xl"), children: intro }),
  ] }) : null);

/* -------------------------- product cards ------------------------- */
const sellable = (p) => p && p.status === "live" && p.published !== false && (Number(p.sellingRate) > 0 || p.priceOnRequest) && p.verification !== "pending" && !C.productDisplay().hidden.includes(p.slug);
function ProductCard({ p }) {
  const img = C.resolve(p.images?.[0]?.url || "");
  const badge = C.productDisplay().badges[p.slug];
  return g.jsx(Link, { to: "/marketplace/" + p.slug, className: "group block", children: g.jsxs("article", { className: "flex h-full flex-col border border-ivory/20 bg-surface transition-colors hover:border-gold/60", children: [
      g.jsxs("div", { className: "relative aspect-[4/3] overflow-hidden bg-ink", children: [img && g.jsx("img", { src: img, alt: p.name, loading: "lazy", className: "h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" }), badge && g.jsx("span", { className: "absolute left-4 top-4 bg-gold px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-deep", children: badge })] }),
      g.jsxs("div", { className: "flex flex-1 flex-col p-5", children: [
          g.jsx("p", { className: "text-[10px] uppercase tracking-[0.22em] text-stone", children: [p.destination, p.subcategory].filter(Boolean).join(" · ") }),
          g.jsx("h3", { className: "serif mt-1.5 text-xl font-semibold leading-snug text-ivory", children: p.name }),
          g.jsx("p", { className: "mt-auto pt-4 text-sm text-stone", children: p.priceOnRequest && !(Number(p.sellingRate) > 0) ? "Price on request" : g.jsxs("span", { children: [g.jsx("span", { className: "serif text-[20px] font-semibold text-ivory", children: D.money(p.sellingRate) }), " ", g.jsxs("span", { className: "text-[11px] uppercase tracking-wider", children: ["/ ", p.unit] })] }) }),
        ] }),
    ] }) });
}
export function productsFor(block) {
  const all = D.db().products.filter(sellable);
  let list = block.mode === "selected" ? (block.slugs || []).map((s) => all.find((p) => p.slug === s)).filter(Boolean) : all.filter((p) => (!block.category || C.categoryMatch({ ...p, category: p.category }, block.category)) && (!block.destination || (p.destination || "").toLowerCase().includes(block.destination.toLowerCase())));
  const feat = C.productDisplay().featured;
  if (block.mode !== "selected") list = list.sort((a, b) => (feat.includes(b.slug) ? 1 : 0) - (feat.includes(a.slug) ? 1 : 0));
  return list.slice(0, Math.max(1, Math.min(24, Number(block.limit) || 6)));
}
const viewable = (x) => x && (x.status === "published" || C.isPreview());
function publishedDestinations() { return (C.siteCms().destinationsSite || []).filter((d) => d.status === "published").sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }
function DestCard({ d }) {
  return g.jsx(Link, { to: "/destination/" + d.slug, className: "group block", children: g.jsxs("article", { className: "relative aspect-[4/5] overflow-hidden border border-ivory/15 bg-ink", children: [
      g.jsx(Pic, { src: d.heroImage, alt: d.name, className: "h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" }),
      g.jsx("div", { className: "absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/20 to-transparent" }),
      g.jsxs("div", { className: "absolute inset-x-0 bottom-0 p-6", children: [g.jsx("h3", { className: "serif text-3xl font-semibold text-ivory", children: d.name }), d.tagline && g.jsx("p", { className: "mt-1 text-[13px] text-ivory/75", children: d.tagline })] }),
    ] }) });
}

/* ------------------------------ blocks ---------------------------- */
export function Block({ b }) {
  if (!b || b.hidden) return null;
  const pad = cx("pbl-block", b.background === "surface" ? "bg-surface" : b.background === "cream" ? "bg-cream/60" : "", "py-16 md:py-24");
  switch (b.type) {
    case "hero":
      return g.jsxs("section", { className: "relative flex min-h-[70vh] items-end overflow-hidden", children: [
          g.jsxs("div", { className: "absolute inset-0", children: [g.jsx(Pic, { src: b.image, mobile: b.imageMobile, alt: b.title, eager: true, className: "h-full w-full object-cover" }), g.jsx("div", { className: "absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/40 to-ink/30" }), Number(b.overlay) > 0 && g.jsx("div", { className: "absolute inset-0", style: { background: "rgba(6,12,10," + Number(b.overlay) / 100 + ")" } })] }),
          g.jsxs("div", { className: cx("pbl-block relative pb-16 pt-40 md:pb-20", wrap), children: [
              b.eyebrow && g.jsx("p", { className: "eyebrow", children: b.eyebrow }),
              g.jsx("h1", { className: "font-hero mt-5 max-w-4xl font-medium text-ivory", style: { fontSize: "clamp(2.6rem, 6vw, 5rem)", lineHeight: 1.04 }, children: b.title }),
              b.text && g.jsx("p", { className: "mt-5 max-w-xl text-[15px] leading-relaxed text-ivory/80 md:text-base", children: b.text }),
              b.buttonLabel && g.jsx("div", { className: "mt-8", children: g.jsx(Cta, { label: b.buttonLabel, to: b.buttonLink }) }),
            ] }),
        ] });
    case "text":
      return g.jsx("section", { className: pad, children: g.jsxs("div", { className: cx(wrap, "max-w-[900px]"), children: [g.jsx(Head, { eyebrow: b.eyebrow, title: b.title }), g.jsx(RichText, { html: b.html, className: b.title ? "mt-6" : "" }), b.buttonLabel && g.jsx("div", { className: "mt-8", children: g.jsx(Cta, { label: b.buttonLabel, to: b.buttonLink, variant: "outline" }) })] }) });
    case "imageText":
      return g.jsx("section", { className: pad, children: g.jsxs("div", { className: cx(wrap, "grid items-center gap-10 md:grid-cols-2 md:gap-16"), children: [
          g.jsx("div", { className: cx("overflow-hidden bg-ink", b.imageSide === "right" && "md:order-2"), children: g.jsx(Zoom, { src: C.resolve(b.image), alt: b.title, gal: [C.resolve(b.image)], className: "block", children: g.jsx(Pic, { src: b.image, alt: b.title, className: "aspect-[4/3] w-full object-cover" }) }) }),
          g.jsxs("div", { children: [g.jsx(Head, { eyebrow: b.eyebrow, title: b.title }), g.jsx(RichText, { html: b.html, className: "mt-6" }), b.buttonLabel && g.jsx("div", { className: "mt-8", children: g.jsx(Cta, { label: b.buttonLabel, to: b.buttonLink }) })] }),
        ] }) });
    case "gallery": {
      const imgs = (b.images || []).map((x) => C.resolve(x)).filter(Boolean);
      if (!imgs.length) return null;
      return g.jsx("section", { className: pad, children: g.jsxs("div", { className: wrap, children: [g.jsx(Head, { eyebrow: b.eyebrow, title: b.title, center: true }), g.jsx("div", { className: "mt-10 grid grid-cols-2 gap-3 md:grid-cols-3", children: imgs.map((u, i) => g.jsx(Zoom, { src: u, alt: b.title || "", gal: imgs, className: "block overflow-hidden bg-ink", children: g.jsx("img", { src: u, alt: C.altOf(b.images[i]) || b.title || "", loading: "lazy", className: "aspect-square w-full object-cover transition-transform duration-700 hover:scale-105" }) }, i)) })] }) });
    }
    case "products": {
      const list = productsFor(b);
      if (!list.length) return null;
      return g.jsx("section", { className: pad, children: g.jsxs("div", { className: wrap, children: [g.jsx(Head, { eyebrow: b.eyebrow, title: b.title, intro: b.intro }), g.jsx("div", { className: "mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3", children: list.map((p) => g.jsx(ProductCard, { p }, p.slug)) }), b.buttonLabel && g.jsx("div", { className: "mt-10", children: g.jsx(Cta, { label: b.buttonLabel, to: b.buttonLink || "/marketplace", variant: "outline" }) })] }) });
    }
    case "destinations": {
      const all = publishedDestinations();
      const list = b.ids && b.ids.length ? b.ids.map((id) => all.find((d) => d.id === id)).filter(Boolean) : all.slice(0, Number(b.limit) || 6);
      if (!list.length) return null;
      return g.jsx("section", { className: pad, children: g.jsxs("div", { className: wrap, children: [g.jsx(Head, { eyebrow: b.eyebrow, title: b.title, intro: b.intro }), g.jsx("div", { className: "mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3", children: list.map((d) => g.jsx(DestCard, { d }, d.id)) }), g.jsx("div", { className: "mt-10", children: g.jsx(Cta, { label: b.buttonLabel || "All destinations", to: "/destinations", variant: "outline" }) })] }) });
    }
    case "categories": {
      const cats = C.siteCategories().filter((c) => c.visible !== false && (!b.featuredOnly || c.featured));
      if (!cats.length) return null;
      return g.jsx("section", { className: pad, children: g.jsxs("div", { className: wrap, children: [g.jsx(Head, { eyebrow: b.eyebrow, title: b.title, intro: b.intro }), g.jsx("div", { className: "mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4", children: cats.map((c) => g.jsx(Link, { to: "/marketplace?category=" + c.id, className: "group block", children: g.jsxs("div", { className: "relative h-full overflow-hidden border border-ivory/20 bg-surface p-6 transition-colors hover:border-gold/60", children: [
          c.image && g.jsx(Pic, { src: c.image, alt: c.label, className: "absolute inset-0 h-full w-full object-cover opacity-30 transition-opacity group-hover:opacity-45" }),
          g.jsxs("div", { className: "relative", children: [c.icon && g.jsx("span", { className: "text-2xl text-gold", children: c.icon }), g.jsx("h3", { className: "serif mt-2 text-2xl font-semibold text-ivory", children: c.label }), c.description && g.jsx("p", { className: "mt-2 text-[13px] leading-relaxed text-stone", children: c.description })] }),
        ] }) }, c.id)) })] }) });
    }
    case "cta":
      return g.jsxs("section", { className: "pbl-block relative overflow-hidden py-20 md:py-28", children: [
          b.image ? g.jsxs("div", { className: "absolute inset-0", children: [g.jsx(Pic, { src: b.image, alt: "", className: "h-full w-full object-cover" }), g.jsx("div", { className: "absolute inset-0 bg-ink/70" })] }) : g.jsx("div", { className: "absolute inset-0 bg-cream/60" }),
          g.jsxs("div", { className: cx(wrap, "relative text-center"), children: [g.jsx(Head, { eyebrow: b.eyebrow, title: b.title, intro: b.text, center: true }), b.buttonLabel && g.jsx("div", { className: "mt-8", children: g.jsx(Cta, { label: b.buttonLabel, to: b.buttonLink }) })] }),
        ] });
    case "video": {
      const u = C.resolve(b.url) || "";
      const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/.exec(u);
      const vm = /vimeo\.com\/(\d+)/.exec(u);
      const embed = yt ? "https://www.youtube-nocookie.com/embed/" + yt[1] : vm ? "https://player.vimeo.com/video/" + vm[1] : "";
      if (!u) return null;
      return g.jsx("section", { className: pad, children: g.jsxs("div", { className: wrap, children: [g.jsx(Head, { eyebrow: b.eyebrow, title: b.title, center: true }), g.jsx("div", { className: "mx-auto mt-10 aspect-video max-w-5xl overflow-hidden border border-ivory/15 bg-ink", children: embed ? g.jsx("iframe", { src: embed, title: b.title || "Video", allow: "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture", allowFullScreen: true, loading: "lazy", className: "h-full w-full" }) : g.jsx("video", { src: u, controls: true, playsInline: true, preload: "metadata", className: "h-full w-full object-cover" }) })] }) });
    }
    case "faq":
      return g.jsx("section", { className: pad, children: g.jsxs("div", { className: cx(wrap, "max-w-[900px]"), children: [g.jsx(Head, { eyebrow: b.eyebrow, title: b.title }), g.jsx("div", { className: "mt-8 divide-y divide-ivory/15 border-y border-ivory/15", children: (b.items || []).filter((x) => x.q).map((x, i) => g.jsxs("details", { className: "group py-5", children: [g.jsxs("summary", { className: "flex cursor-pointer list-none items-center justify-between gap-4 serif text-xl text-ivory", children: [x.q, g.jsx("span", { className: "text-gold transition-transform group-open:rotate-45", children: "+" })] }), g.jsx(RichText, { html: x.a, className: "mt-3" })] }, i)) })] }) });
    case "newsletter":
      return g.jsx("section", { className: pad, children: g.jsx("div", { className: cx(wrap, "max-w-[760px] text-center"), children: g.jsx(Newsletter, { title: b.title, text: b.text, center: true }) }) });
    default:
      return null;
  }
}
export const Blocks = ({ blocks }) => g.jsx(g.Fragment, { children: (blocks || []).map((b, i) => g.jsx(Block, { b }, b.id || i)) });

/* ----------------------------- newsletter ------------------------- */
export function Newsletter({ title, text, center }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setState("Please enter a valid email address.");
    const db = D.db();
    db.subscribers = db.subscribers || [];
    if (!db.subscribers.some((x) => x.email === email.trim().toLowerCase())) db.subscribers.unshift({ email: email.trim().toLowerCase(), at: Date.now(), source: (typeof location !== "undefined" && location.hash) || "" });
    D.commit("subscriber");
    try { const W = await import("./workflow.js"); W.notify("newsletter_signup", { email: email.trim().toLowerCase() }); } catch {}
    setState("ok");
  };
  return g.jsxs("div", { children: [
      g.jsx("h2", { className: "serif font-semibold text-ivory", style: { fontSize: "clamp(1.9rem, 3.6vw, 2.8rem)", lineHeight: 1.08 }, children: title || "Letters from the island" }),
      text && g.jsx("p", { className: "mt-4 text-[15px] leading-relaxed text-stone", children: text }),
      state === "ok" ? g.jsx("p", { className: "mt-6 text-[14px] text-emerald-300", children: "Thank you — you're on the list." }) : g.jsxs("form", { onSubmit: submit, className: cx("mt-6 flex flex-col gap-3 sm:flex-row", center && "mx-auto max-w-lg"), children: [
          g.jsx("input", { type: "email", required: true, value: email, onChange: (e) => { setEmail(e.target.value); setState(""); }, placeholder: "Your email address", "aria-label": "Email address", className: "flex-1 border border-ivory/30 bg-transparent px-4 py-3.5 text-[14px] text-ivory outline-none placeholder:text-stone/60 focus:border-gold" }),
          g.jsx("button", { type: "submit", className: "border border-gold bg-gold px-7 py-3.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-deep hover:bg-gold-soft", children: "Subscribe" }),
        ] }),
      state && state !== "ok" && g.jsx("p", { className: "mt-2 text-[12px] text-rose-300", children: state }),
    ] });
}

/* ------------------------------ banners --------------------------- */
export function PromoBanners({ placement }) {
  const list = C.activeBanners(placement);
  if (!list.length) return null;
  return g.jsx("section", { className: cx("py-8", placement === "home-bottom" && "pb-20"), children: g.jsx("div", { className: cx(wrap, "grid gap-4", list.length > 1 && "md:grid-cols-2"), children: list.map((b) => g.jsxs("article", { className: "relative min-h-[220px] overflow-hidden border border-gold/40 bg-surface", children: [
      b.imageDesktop && g.jsxs("div", { className: "absolute inset-0", children: [g.jsx(Pic, { src: b.imageDesktop, mobile: b.imageMobile, alt: b.title, className: "h-full w-full object-cover" }), g.jsx("div", { className: "absolute inset-0 bg-gradient-to-r from-ink/90 via-ink/60 to-ink/20" })] }),
      g.jsxs("div", { className: "pbl-block relative flex h-full flex-col justify-end p-7 md:p-9", children: [
          b.eyebrow && g.jsx("p", { className: "eyebrow", children: b.eyebrow }),
          g.jsx("h3", { className: "serif mt-2 text-3xl font-semibold text-ivory", children: b.title }),
          b.text && g.jsx("p", { className: "mt-2 max-w-lg text-[14px] leading-relaxed text-ivory/80", children: b.text }),
          b.buttonLabel && g.jsx("div", { className: "mt-5", children: g.jsx(Cta, { label: b.buttonLabel, to: b.buttonLink }) }),
        ] }),
    ] }, b.id)) }) });
}
export function announcementText(fallback) {
  const bar = C.activeBanners("bar")[0];
  return bar ? bar.title + (bar.text ? " — " + bar.text : "") : fallback;
}

/* ------------------------------ homepage -------------------------- */
export function CmsHome({ builtins, order }) {
  const layout = C.siteCms().homeLayout;
  const rows = Array.isArray(layout) && layout.length ? layout : order.map((id) => ({ id, type: "builtin", visible: true }));
  const out = [];
  rows.forEach((r, i) => {
    if (r.visible === false) return;
    if (r.type === "builtin" && builtins[r.id]) out.push(g.jsx(builtins[r.id], {}, r.id));
    if (r.type === "custom" && r.block) out.push(g.jsx(Block, { b: r.block }, r.id));
    if (i === 0) out.push(g.jsx(PromoBanners, { placement: "home-top" }, "banners-top"));
  });
  out.push(g.jsx(PromoBanners, { placement: "home-bottom" }, "banners-bottom"));
  return g.jsx(g.Fragment, { children: out });
}

/* ------------------------------ pages ----------------------------- */
const pageShell = (children) => g.jsx("div", { className: "pb-8", children });
export function NotFound() {
  return g.jsx("div", { className: "flex min-h-[70vh] flex-col items-start justify-center px-5 pt-28 md:px-8", children: g.jsxs("div", { className: "mx-auto w-full max-w-[1360px]", children: [
      g.jsx("p", { className: "eyebrow", children: "Lost between regions" }),
      g.jsx("h1", { className: "serif mt-4 font-semibold text-ivory", style: { fontSize: "clamp(2.6rem, 6vw, 4.6rem)" }, children: "This page is not on the map." }),
      g.jsxs("div", { className: "mt-9 flex gap-4", children: [g.jsx(Btn, { to: "/", children: "Back to the start" }), g.jsx(Btn, { to: "/marketplace", variant: "outline", children: "Open the marketplace" })] }),
    ] }) });
}
export function CustomPage({ slug }) {
  const p = (C.siteCms().pages || []).find((x) => x.slug === slug && viewable(x));
  if (!p) return g.jsx(NotFound, {});
  const blocks = p.blocks || [];
  const hasHero = blocks[0] && blocks[0].type === "hero";
  return pageShell([
    !hasHero && g.jsx("div", { className: cx(wrap, "pt-36 md:pt-40"), children: g.jsx(Head, { eyebrow: p.eyebrow, title: p.title, intro: p.intro }) }, "head"),
    g.jsx(Blocks, { blocks }, "blocks"),
  ]);
}
export function JournalList() {
  const posts = (C.siteCms().blog || []).filter((p) => p.status === "published" && p.slug).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const [cat, setCat] = useState("all");
  const cats = [...new Set(posts.flatMap((p) => p.categories || []))];
  const shown = posts.filter((p) => cat === "all" || (p.categories || []).includes(cat));
  return g.jsxs("div", { className: cx(wrap, "pb-24 pt-36 md:pt-40"), children: [
      g.jsx(Head, { eyebrow: "Journal", title: "Notes from the island", intro: "Travel and wellness writing from the Prestige Bali Leisure desk." }),
      cats.length > 1 && g.jsx("div", { className: "mt-8 flex flex-wrap gap-2", children: ["all", ...cats].map((c) => g.jsx("button", { onClick: () => setCat(c), className: cx("border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em]", cat === c ? "border-gold bg-gold text-deep" : "border-ivory/25 text-stone hover:border-gold"), children: c === "all" ? "All" : c }, c)) }),
      shown.length ? g.jsx("div", { className: "mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3", children: shown.map((p) => g.jsx(Link, { to: "/journal/" + p.slug, className: "group block", children: g.jsxs("article", { className: "flex h-full flex-col border border-ivory/20 bg-surface transition-colors hover:border-gold/60", children: [
          p.image && g.jsx("div", { className: "aspect-[16/10] overflow-hidden bg-ink", children: g.jsx(Pic, { src: p.image, alt: p.title, className: "h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" }) }),
          g.jsxs("div", { className: "flex flex-1 flex-col p-6", children: [g.jsx("p", { className: "text-[10px] uppercase tracking-[0.22em] text-stone", children: [p.date ? D.fmtDate(p.date) : "", (p.categories || [])[0]].filter(Boolean).join(" · ") }), g.jsx("h3", { className: "serif mt-2 text-2xl font-semibold leading-snug text-ivory", children: p.title }), p.excerpt && g.jsx("p", { className: "mt-3 text-[14px] leading-relaxed text-stone", children: p.excerpt })] }),
        ] }) }, p.id)) }) : g.jsx("p", { className: "mt-10 text-[15px] text-stone", children: "New articles are on their way." }),
    ] });
}
export function JournalPost({ slug }) {
  const p = (C.siteCms().blog || []).find((x) => x.slug === slug && viewable(x));
  if (!p) return g.jsx(NotFound, {});
  return g.jsxs("article", { className: "pb-24", children: [
      p.image && g.jsxs("div", { className: "relative h-[55vh] min-h-[360px] overflow-hidden", children: [g.jsx(Pic, { src: p.image, alt: p.title, eager: true, className: "h-full w-full object-cover" }), g.jsx("div", { className: "absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-ink/20" })] }),
      g.jsxs("div", { className: cx(wrap, "max-w-[820px]", p.image ? "-mt-32 relative" : "pt-36"), children: [
          g.jsx(Link, { to: "/journal", className: "text-[11px] uppercase tracking-[0.2em] text-gold-soft hover:text-ivory", children: "← Journal" }),
          g.jsx("h1", { className: "serif mt-4 font-semibold text-ivory", style: { fontSize: "clamp(2.4rem, 5vw, 3.8rem)", lineHeight: 1.05 }, children: p.title }),
          g.jsx("p", { className: "mt-4 text-[12px] uppercase tracking-[0.2em] text-stone", children: [p.date && D.fmtDate(p.date), p.author && "By " + p.author, ...(p.categories || [])].filter(Boolean).join(" · ") }),
          p.excerpt && g.jsx("p", { className: "mt-8 serif text-[21px] leading-relaxed text-ivory/90", children: p.excerpt }),
          g.jsx(RichText, { html: p.content, className: "mt-8" }),
          (p.tags || []).length > 0 && g.jsx("div", { className: "mt-10 flex flex-wrap gap-2", children: p.tags.map((t) => g.jsx("span", { className: "border border-ivory/20 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-stone", children: "#" + t }, t)) }),
        ] }),
    ] });
}
export function DestinationsList() {
  const list = publishedDestinations();
  return g.jsxs("div", { className: cx(wrap, "pb-24 pt-36 md:pt-40"), children: [
      g.jsx(Head, { eyebrow: "Destinations", title: "Where the island takes you", intro: "Choose a region to see where to stay, what to do and how our concierge arranges it." }),
      list.length ? g.jsx("div", { className: "mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3", children: list.map((d) => g.jsx(DestCard, { d }, d.id)) }) : g.jsx("p", { className: "mt-10 text-stone", children: "Destinations are being prepared." }),
    ] });
}
export function DestinationPage({ slug }) {
  const d = (C.siteCms().destinationsSite || []).find((x) => x.slug === slug && viewable(x));
  if (!d) return g.jsx(NotFound, {});
  const imgs = (d.gallery || []).map((x) => C.resolve(x)).filter(Boolean);
  const name = (d.name || "").toLowerCase();
  const all = D.db().products.filter(sellable);
  const related = [...new Set([...(d.relatedProducts || []), ...(d.autoProducts === false ? [] : all.filter((p) => (p.destination || "").toLowerCase() === name).map((p) => p.slug))])].map((s) => all.find((p) => p.slug === s)).filter(Boolean).slice(0, 9);
  const cats = C.siteCategories().filter((c) => (d.relatedCategories || []).includes(c.id) && c.visible !== false);
  return g.jsxs("div", { className: "pb-24", children: [
      g.jsxs("section", { className: "relative flex min-h-[72vh] items-end overflow-hidden", children: [
          g.jsxs("div", { className: "absolute inset-0", children: [g.jsx(Pic, { src: d.heroImage, alt: d.name, eager: true, className: "kenburns h-full w-full object-cover" }), g.jsx("div", { className: "absolute inset-0 bg-gradient-to-t from-ink/95 via-ink/40 to-ink/30" })] }),
          g.jsxs("div", { className: cx(wrap, "relative pb-16 pt-40"), children: [g.jsx(Link, { to: "/destinations", className: "text-[11px] uppercase tracking-[0.2em] text-gold-soft hover:text-ivory", children: "← Destinations" }), g.jsx("h1", { className: "font-hero mt-4 font-medium text-ivory", style: { fontSize: "clamp(3rem, 7vw, 6rem)", lineHeight: 1 }, children: d.name }), d.tagline && g.jsx("p", { className: "mt-4 max-w-xl text-[16px] text-ivory/80", children: d.tagline })] }),
        ] }),
      g.jsx("section", { className: "py-16 md:py-20", children: g.jsxs("div", { className: cx(wrap, "grid gap-12 lg:grid-cols-[1.4fr_1fr]"), children: [
          g.jsx(RichText, { html: d.description }),
          g.jsxs("aside", { className: "space-y-6", children: [
              (d.highlights || []).filter(Boolean).length > 0 && g.jsxs("div", { className: "border border-ivory/20 bg-surface p-6", children: [g.jsx("p", { className: "eyebrow mb-4", children: "Highlights" }), g.jsx("ul", { className: "space-y-2 text-[14px] text-ivory/85", children: d.highlights.filter(Boolean).map((h, i) => g.jsxs("li", { className: "flex gap-3", children: [g.jsx("span", { className: "text-gold", children: "✦" }), h] }, i)) })] }),
              (d.location || d.mapQuery) && g.jsxs("div", { className: "border border-ivory/20 bg-surface p-6", children: [g.jsx("p", { className: "eyebrow mb-3", children: "Location" }), d.location && g.jsx("p", { className: "text-[14px] text-ivory/85", children: d.location }), g.jsx("a", { href: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(d.mapQuery || d.location || d.name), target: "_blank", rel: "noopener noreferrer", className: "mt-3 inline-block text-[11px] uppercase tracking-[0.2em] text-gold-soft hover:text-ivory", children: "Open in Google Maps →" })] }),
              cats.length > 0 && g.jsxs("div", { children: [g.jsx("p", { className: "eyebrow mb-3", children: "Explore" }), g.jsx("div", { className: "flex flex-wrap gap-2", children: cats.map((c) => g.jsx(Link, { to: "/marketplace?category=" + c.id + "&region=" + encodeURIComponent(d.name), className: "border border-ivory/25 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ivory/85 hover:border-gold", children: c.label }, c.id)) })] }),
              g.jsx(Btn, { to: "/builder", variant: "gold", children: "Plan " + d.name + " in the vacation builder" }),
            ] }),
        ] }) }),
      imgs.length > 0 && g.jsx("section", { className: "pb-16", children: g.jsx("div", { className: cx(wrap, "grid grid-cols-2 gap-3 md:grid-cols-4"), children: imgs.map((u, i) => g.jsx(Zoom, { src: u, alt: d.name, gal: imgs, className: "block overflow-hidden bg-ink", children: g.jsx("img", { src: u, alt: C.altOf(d.gallery[i]) || d.name, loading: "lazy", className: "aspect-square w-full object-cover" }) }, i)) }) }),
      related.length > 0 && g.jsx("section", { className: "py-10", children: g.jsxs("div", { className: wrap, children: [g.jsx(Head, { eyebrow: "In " + d.name, title: "Stay, dine and explore" }), g.jsx("div", { className: "mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3", children: related.map((p) => g.jsx(ProductCard, { p }, p.slug)) })] }) }),
    ] });
}

/* ----------------------- category landing banner ------------------ */
export function CategoryLanding({ id }) {
  if (!id || id === "all") return null;
  const c = C.siteCategories().find((x) => x.id === id);
  if (!c || !(c.headline || c.description || c.image)) return null;
  return g.jsxs("div", { className: "relative mb-12 overflow-hidden border border-ivory/20 bg-surface", children: [
      c.image && g.jsxs("div", { className: "absolute inset-0", children: [g.jsx(Pic, { src: c.image, alt: c.label, className: "h-full w-full object-cover" }), g.jsx("div", { className: "absolute inset-0 bg-gradient-to-r from-ink/95 via-ink/70 to-ink/30" })] }),
      g.jsxs("div", { className: "relative max-w-2xl p-8 md:p-12", children: [c.icon && g.jsx("span", { className: "text-2xl text-gold", children: c.icon }), g.jsx("h2", { className: "serif mt-2 text-4xl font-semibold text-ivory", children: c.headline || c.label }), c.description && g.jsx("p", { className: "mt-3 text-[15px] leading-relaxed text-ivory/80", children: c.description })] }),
    ] });
}

/* ---------------------------- footer extras ----------------------- */
const SOCIAL = [["instagram", "Instagram"], ["facebook", "Facebook"], ["tiktok", "TikTok"], ["youtube", "YouTube"], ["linkedin", "LinkedIn"], ["pinterest", "Pinterest"]];
export function FooterExtras() {
  const c = C.siteCms();
  const fx = c.footerExtra || {};
  const socials = SOCIAL.filter(([k]) => fx.socials && fx.socials[k]);
  const phone = (c.footer && c.footer.phone) || "";
  const wa = fx.whatsapp !== false && phone ? "https://wa.me/" + phone.replace(/\D/g, "") : "";
  const legal = (fx.legal || []).filter((l) => l.label && l.to && !l.hidden);
  const nl = fx.newsletter || {};
  if (!socials.length && !legal.length && !nl.enabled && !fx.whatsappShow) return null;
  return g.jsxs("div", { className: "mt-12 grid gap-8 border-t border-ivory/15 pt-10 md:grid-cols-2", children: [
      g.jsxs("div", { className: "space-y-4", children: [
          (socials.length > 0 || (fx.whatsappShow && wa)) && g.jsxs("div", { className: "flex flex-wrap gap-x-6 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.2em]", children: [socials.map(([k, l]) => g.jsx("a", { href: fx.socials[k], target: "_blank", rel: "noopener noreferrer", className: "link-sweep text-ivory/75 hover:text-ivory", children: l }, k)), fx.whatsappShow && wa && g.jsx("a", { href: wa, target: "_blank", rel: "noopener noreferrer", className: "link-sweep text-gold-soft hover:text-ivory", children: "WhatsApp" })] }),
          legal.length > 0 && g.jsx("div", { className: "flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-ivory/55", children: legal.map((l, i) => (isExternal(l.to) ? g.jsx("a", { href: l.to, target: "_blank", rel: "noopener noreferrer", className: "hover:text-ivory", children: l.label }, i) : g.jsx(Link, { to: l.to, className: "hover:text-ivory", children: l.label }, i))) }),
        ] }),
      nl.enabled && g.jsx(Newsletter, { title: nl.title || "Letters from the island", text: nl.text }),
    ] });
}

/* ------------------------------ maintenance ----------------------- */
export function maintenanceOn(user) {
  const m = (C.siteCms().settings || {}).maintenance;
  return !!(m && m.on && !(user && user.role && user.role !== "customer"));
}
export function Maintenance() {
  const s = C.siteCms().settings || {};
  const Logo = bridge.Logo;
  return g.jsx("div", { className: "grain flex min-h-screen flex-col items-center justify-center bg-deep px-6 text-center", children: g.jsxs("div", { className: "max-w-xl", children: [Logo && g.jsx(Logo, {}), g.jsx("h1", { className: "serif mt-10 text-4xl font-semibold text-ivory", children: (s.maintenance && s.maintenance.title) || "We'll be back shortly" }), g.jsx("p", { className: "mt-4 text-[15px] leading-relaxed text-stone", children: (s.maintenance && s.maintenance.message) || "Our website is being updated. For bookings, please contact our concierge desk." }), (C.siteCms().footer || {}).email && g.jsx("a", { href: "mailto:" + C.siteCms().footer.email, className: "mt-6 inline-block text-gold-soft underline", children: C.siteCms().footer.email })] }) });
}
export function PreviewRibbon() {
  if (!C.isPreview()) return null;
  return g.jsx("div", { className: "fixed bottom-4 left-1/2 z-[95] -translate-x-1/2 border border-gold bg-ink/95 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-soft shadow-lift", children: "Preview — unpublished draft · not visible to guests" });
}
