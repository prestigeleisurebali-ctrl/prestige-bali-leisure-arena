/* ==================================================================
   WEBSITE MANAGEMENT — CORE
   ------------------------------------------------------------------
   One CMS store with two copies:
     DB.cms       LIVE — what the public website shows
     DB.cmsDraft  DRAFT — what editors work on

   Save draft ........ writes DB.cmsDraft only (live site unchanged)
   Preview ........... the website renders DB.cmsDraft when opened with
                       ?pblPreview=1 (new tab or device preview frame)
   Publish ........... DB.cms ← draft; previous live copy kept in
                       DB.cmsVersions (restorable)
   Publish / unpublish / delete item ... applies one page, article,
                       banner or destination immediately

   Media (DB.media) holds uploaded images once; content refers to them
   as "media:<id>", so replacing a file updates every place it is used.
   ================================================================== */
import * as D from "./db.js";
import { NEW_SITE_CATS } from "./categoryExpansion.js";

const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const DB = () => D.db();
const uid = (p) => p + "-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();

/* --------------------------- preview mode ------------------------- */
export function isPreview() {
  try {
    if (typeof location !== "undefined" && /(^|[?&])pblPreview=1/.test(location.search || "")) return true;
    if (typeof location !== "undefined" && /[?&]pblPreview=1/.test(location.hash || "")) return true;
  } catch {}
  return false;
}
/** the CMS copy the public website renders */
export function siteCms() {
  const db = DB();
  return isPreview() && db.cmsDraft ? db.cmsDraft : db.cms;
}
export function draft() {
  const db = DB();
  if (!db.cmsDraft) db.cmsDraft = clone(db.cms);
  return db.cmsDraft;
}
export const live = () => DB().cms;

/* --------------------------- permissions -------------------------- */
const DESIGN_KEYS = new Set(["design", "settings"]);
function assert(actor, action, key) {
  const mod = DESIGN_KEYS.has(key) ? "cms-design" : "cms";
  if (!D.can(actor, action, mod)) throw new D.PermissionError(`Your role is not permitted to ${action === "approve" ? "publish" : action} website ${DESIGN_KEYS.has(key) ? "design & settings" : "content"}.`);
}
export const canCms = (actor, action, key) => D.can(actor, action, DESIGN_KEYS.has(key) ? "cms-design" : "cms");

/* ------------------------------ draft ----------------------------- */
const SECTION_LABELS = {
  home: "Homepage hero", homeLayout: "Homepage sections", content: "Website content", images: "Website images", hidden: "Hidden content",
  nav: "Header menu", footerMenus: "Footer menus", footer: "Contact details", footerExtra: "Footer", logo: "Logo",
  seo: "SEO", seoPages: "Page SEO", announcement: "Announcement bar", testimonials: "Testimonials", testimonialsOnSite: "Testimonials",
  blog: "Blog & articles", builder: "Vacation builder", pages: "Pages", builtinPages: "Built-in pages", banners: "Banners & promotions",
  destinationsSite: "Destinations", siteCategories: "Categories", productDisplay: "Product display", design: "Typography & design", settings: "Website settings",
};
export const sectionLabel = (k) => SECTION_LABELS[k] || k;

export function saveDraft(patch, actor, section = Object.keys(patch)[0]) {
  assert(actor, "edit", section);
  const d = draft();
  Object.entries(patch).forEach(([k, v]) => { d[k] = clone(v); });
  const db = DB();
  db.cmsMeta = db.cmsMeta || {};
  db.cmsMeta.draftUpdatedAt = Date.now();
  db.cmsMeta.draftBy = actor?.name || "";
  D.audit(actor, "save-draft", "cms", sectionLabel(section), null, Object.keys(patch).map(sectionLabel).join(", "));
  D.commit("cms-draft");
}
/** sections where draft and live differ */
export function changes() {
  const d = draft(), l = live() || {};
  const keys = new Set([...Object.keys(d), ...Object.keys(l)]);
  return [...keys].filter((k) => JSON.stringify(d[k] ?? null) !== JSON.stringify(l[k] ?? null)).map((k) => ({ key: k, label: sectionLabel(k) }));
}
function snapshot(actor, note) {
  const db = DB();
  db.cmsVersions = db.cmsVersions || [];
  db.cmsVersions.unshift({ id: uid("VER"), at: Date.now(), by: actor?.name || "system", note, cms: clone(db.cms) });
  if (db.cmsVersions.length > 20) db.cmsVersions.length = 20;
}
export function publishAll(actor, note = "") {
  assert(actor, "approve", "content");
  const ch = changes();
  if (ch.some((c) => DESIGN_KEYS.has(c.key))) assert(actor, "approve", "design");
  const issues = designIssues(draft().design);
  if (issues.blocking.length) throw new Error("Publishing blocked — the design would make text hard to read:\n" + issues.blocking.join("\n"));
  snapshot(actor, note || "Before publish: " + ch.map((c) => c.label).join(", "));
  DB().cms = clone(draft());
  DB().cmsMeta = { ...(DB().cmsMeta || {}), publishedAt: Date.now(), publishedBy: actor?.name || "" };
  D.audit(actor, "publish", "cms", "website", null, ch.map((c) => c.label).join(", ") || "no changes");
  D.commit("cms-publish");
  return ch;
}
export function discardDraft(actor) {
  assert(actor, "edit", "content");
  DB().cmsDraft = clone(live());
  D.audit(actor, "discard-draft", "cms", "website", null, "Draft reset to the live website");
  D.commit("cms-draft");
}
export function restoreVersion(id, actor) {
  assert(actor, "edit", "content");
  const v = (DB().cmsVersions || []).find((x) => x.id === id);
  if (!v) throw new Error("Version not found.");
  DB().cmsDraft = clone(v.cms);
  D.audit(actor, "restore-version", "cms", id, null, "Version from " + new Date(v.at).toLocaleString("en-GB") + " loaded into the draft");
  D.commit("cms-draft");
}

/* ------------------------- item collections ----------------------- */
/* pages · blog · banners · destinationsSite : arrays of { id, status } */
const COLL_LABEL = { pages: "page", blog: "article", banners: "banner", destinationsSite: "destination" };
export function saveItem(coll, item, actor) {
  assert(actor, "edit", coll);
  const d = draft();
  const list = Array.isArray(d[coll]) ? d[coll] : (d[coll] = []);
  const rec = { ...clone(item), id: item.id || uid(coll.slice(0, 3).toUpperCase()), updatedAt: Date.now(), updatedBy: actor?.name || "" };
  if (!rec.status) rec.status = "draft";
  const i = list.findIndex((x) => x.id === rec.id);
  if (i >= 0) list[i] = rec; else list.unshift(rec);
  D.audit(actor, i >= 0 ? "edit" : "add", "cms", COLL_LABEL[coll] + " " + (rec.title || rec.name || rec.id), null, "Saved as draft");
  D.commit("cms-draft");
  return rec;
}
function upsertLive(coll, rec) {
  const l = live();
  const list = Array.isArray(l[coll]) ? l[coll] : (l[coll] = []);
  const i = list.findIndex((x) => x.id === rec.id);
  if (i >= 0) list[i] = clone(rec); else list.unshift(clone(rec));
}
export function publishItem(coll, id, actor) {
  assert(actor, "approve", coll);
  const d = draft();
  const rec = (d[coll] || []).find((x) => x.id === id);
  if (!rec) throw new Error("Save it first.");
  snapshot(actor, "Before publishing " + COLL_LABEL[coll] + " " + (rec.title || rec.name || id));
  rec.status = "published";
  rec.publishedAt = rec.publishedAt || Date.now();
  upsertLive(coll, rec);
  D.audit(actor, "publish", "cms", COLL_LABEL[coll] + " " + (rec.title || rec.name || id), null, "Published to the website");
  D.commit("cms-publish");
}
export function unpublishItem(coll, id, actor) {
  assert(actor, "approve", coll);
  [draft(), live()].forEach((c) => { const r = (c[coll] || []).find((x) => x.id === id); if (r) r.status = "draft"; });
  D.audit(actor, "unpublish", "cms", COLL_LABEL[coll] + " " + id, null, "Removed from the website (record kept)");
  D.commit("cms-publish");
}
export function deleteItem(coll, id, actor) {
  assert(actor, "delete", coll);
  snapshot(actor, "Before deleting " + COLL_LABEL[coll] + " " + id);
  [draft(), live()].forEach((c) => { if (Array.isArray(c[coll])) c[coll] = c[coll].filter((x) => x.id !== id); });
  D.audit(actor, "delete", "cms", COLL_LABEL[coll] + " " + id, null, "Deleted");
  D.commit("cms-publish");
}
export const itemState = (coll, id) => {
  const d = (draft()[coll] || []).find((x) => x.id === id), l = (live()[coll] || []).find((x) => x.id === id);
  if (!l || l.status !== "published") return d?.status === "published" ? "changes" : "draft";
  return JSON.stringify({ ...d, updatedAt: 0, updatedBy: 0 }) === JSON.stringify({ ...l, updatedAt: 0, updatedBy: 0 }) ? "published" : "changes";
};
export const slugify = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

/* ------------------------------ media ----------------------------- */
const mediaList = () => (Array.isArray(DB().media) ? DB().media : (DB().media = []));
export const media = () => mediaList();
export const isRef = (v) => typeof v === "string" && v.startsWith("media:");
export function resolve(v, variant) {
  if (!isRef(v)) return v || "";
  const m = mediaList().find((x) => x.id === v.slice(6));
  if (!m) return "";
  return (variant === "mobile" && m.mobile) || m.url || "";
}
export const altOf = (v) => (isRef(v) ? mediaList().find((x) => x.id === v.slice(6))?.alt || "" : "");
function readFile(file) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); }); }
function scaleImage(dataUrl, maxDim, quality) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      res({ url: c.toDataURL("image/jpeg", quality), w: c.width, h: c.height, ow: img.width, oh: img.height });
    };
    img.onerror = rej;
    img.src = dataUrl;
  });
}
/** optimise an uploaded image: desktop ≤1920 px and a mobile copy ≤900 px */
export async function optimiseFile(file) {
  const raw = await readFile(file);
  if (/^image\/(svg|gif)/.test(file.type)) return { url: raw, mobile: "", w: 0, h: 0 };
  const desk = await scaleImage(raw, 1920, 0.74);
  const mob = Math.max(desk.w, desk.h) > 900 ? await scaleImage(raw, 900, 0.7) : null;
  return { url: desk.url, mobile: mob?.url || "", w: desk.w, h: desk.h, original: desk.ow + "×" + desk.oh };
}
export async function uploadMedia(files, { folder = "General" } = {}, actor) {
  assert(actor, "add", "media");
  const out = [];
  for (const f of files) {
    if (!/^image\//.test(f.type)) throw new Error(f.name + " is not an image. Add videos with a link (YouTube, Vimeo or an MP4 address).");
    const o = await optimiseFile(f);
    const rec = { id: uid("MED"), type: "image", name: f.name.replace(/\.[a-z0-9]+$/i, ""), folder, alt: "", description: "", url: o.url, mobile: o.mobile, w: o.w, h: o.h, original: o.original || "", size: Math.round((o.url.length + (o.mobile || "").length) * 0.75), createdAt: Date.now(), by: actor?.name || "" };
    mediaList().unshift(rec);
    out.push(rec);
  }
  D.audit(actor, "add", "cms", "media", null, out.length + " image(s) uploaded to " + folder);
  D.commit("media");
  return out;
}
export function addMediaUrl({ url, type = "image", name, folder = "General", alt = "" }, actor) {
  assert(actor, "add", "media");
  if (!/^https?:\/\//.test(url || "")) throw new Error("Enter a full https:// address.");
  const rec = { id: uid("MED"), type, name: name || url.split("/").pop().split("?")[0].slice(0, 60), folder, alt, description: "", url, mobile: "", external: true, createdAt: Date.now(), by: actor?.name || "" };
  mediaList().unshift(rec);
  D.audit(actor, "add", "cms", "media", null, (type === "video" ? "Video" : "Image") + " link added");
  D.commit("media");
  return rec;
}
export function updateMedia(id, patch, actor) {
  assert(actor, "edit", "media");
  const m = mediaList().find((x) => x.id === id);
  if (!m) return;
  ["name", "folder", "alt", "description"].forEach((k) => { if (patch[k] !== undefined) m[k] = patch[k]; });
  D.audit(actor, "edit", "cms", "media " + m.name, null, "Details updated");
  D.commit("media");
}
/** replace the file but keep the id: every page using it updates */
export async function replaceMedia(id, file, actor) {
  assert(actor, "edit", "media");
  const m = mediaList().find((x) => x.id === id);
  if (!m) return;
  const o = await optimiseFile(file);
  Object.assign(m, { url: o.url, mobile: o.mobile, w: o.w, h: o.h, original: o.original || "", size: Math.round((o.url.length + (o.mobile || "").length) * 0.75), replacedAt: Date.now(), external: false });
  D.audit(actor, "edit", "cms", "media " + m.name, null, "File replaced — all usages updated");
  D.commit("media");
}
export function mediaUsage(id) {
  const ref = "media:" + id;
  const db = DB();
  const places = [];
  const scan = (obj, where) => { const s = JSON.stringify(obj || {}); if (s.includes(ref)) places.push(where); };
  scan(db.cms, "Live website");
  scan(db.cmsDraft, "Draft");
  (db.products || []).forEach((p) => { if (JSON.stringify(p.images || []).includes(ref)) places.push("Product: " + p.name); });
  return [...new Set(places)];
}
export function deleteMedia(id, actor) {
  assert(actor, "delete", "media");
  const used = mediaUsage(id);
  if (used.some((u) => u === "Live website")) throw new Error("This image is on the live website. Replace it there first, then publish.");
  DB().media = mediaList().filter((x) => x.id !== id);
  D.audit(actor, "delete", "cms", "media " + id, null, used.length ? "Deleted (was used in: " + used.join(", ") + ")" : "Deleted");
  D.commit("media");
}
export function storageInfo() {
  let used = 0;
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); used += (k.length + (localStorage.getItem(k) || "").length); } } catch {}
  return { used, quota: 5_000_000, error: D.saveStatus ? D.saveStatus() : null };
}
/* move images stored inline (older uploads) into the media library */
export function migrateInlineImages() {
  const db = DB();
  if (db.meta?.cmsMediaV1) return;
  let n = 0;
  const visit = (o) => {
    if (!o || typeof o !== "object") return;
    Object.keys(o).forEach((k) => {
      const v = o[k];
      if (typeof v === "string" && v.startsWith("data:image") && v.length > 2000) {
        const rec = { id: uid("MED"), type: "image", name: "Uploaded image " + (++n), folder: "Imported", alt: "", description: "", url: v, mobile: "", createdAt: Date.now(), by: "migration" };
        mediaList().push(rec);
        o[k] = "media:" + rec.id;
      } else if (v && typeof v === "object") visit(v);
    });
  };
  visit(db.cms);
  if (db.cmsDraft) visit(db.cmsDraft);
  db.meta.cmsMediaV1 = true;
}

/* ------------------------------ design ---------------------------- */
export const BRAND = {
  colors: { gold: "#b08d57", "gold-soft": "#d2ab6d", ivory: "#f2ecdd", deep: "#060c0a", ink: "#060c0a", surface: "#101b17", cream: "#1f2c28", pine: "#35594e", stone: "#a29b8a", line: "#2a3a33", teal: "#2bb8c9" },
  fonts: { hero: "Bodoni Moda", display: "Playfair Display", lux: "Cinzel", body: "Jost" },
};
export const FONT_CHOICES = {
  serif: ["Bodoni Moda", "Playfair Display", "Cormorant Garamond", "Libre Baskerville", "Lora", "DM Serif Display", "Marcellus"],
  display: ["Cinzel", "Marcellus", "Cormorant SC", "Playfair Display SC"],
  sans: ["Jost", "Inter", "Montserrat", "Poppins", "Nunito Sans", "Raleway"],
};
const LOADED = new Set(["Bodoni Moda", "Playfair Display", "Cinzel", "Jost"]);
export const DESIGN_LIMITS = { h1: [32, 96], h2: [24, 64], h3: [16, 40], body: [13, 19], line: [1.3, 2], letter: [0, 0.08] };
const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = (rgb) => { const a = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
export function contrast(a, b) { const x = hexRgb(a), y = hexRgb(b); if (!x || !y) return 21; const l1 = lum(x), l2 = lum(y); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
export function designIssues(design) {
  const c = { ...BRAND.colors, ...((design && design.colors) || {}) };
  const blocking = [], warnings = [];
  const check = (fg, bg, min, label, block) => { const r = contrast(c[fg], c[bg]); if (r < min) (block ? blocking : warnings).push(`${label}: contrast ${r.toFixed(1)}:1 (needs ${min}:1)`); };
  check("ivory", "deep", 4.5, "Main text on page background", true);
  check("ivory", "surface", 4.5, "Main text on panels", true);
  check("deep", "gold", 3, "Button text on gold buttons", true);
  check("stone", "surface", 3, "Secondary text on panels", false);
  check("gold-soft", "deep", 3, "Gold accents on background", false);
  Object.entries(c).forEach(([k, v]) => { if (!hexRgb(v)) blocking.push(`Colour “${k}” is not a valid #RRGGBB value.`); });
  return { blocking, warnings };
}
const fontStack = (f, kind) => `"${f}", ${kind === "sans" ? "system-ui, sans-serif" : "Georgia, serif"}`;
const clampNum = (v, [a, b]) => Math.min(b, Math.max(a, Number(v)));
export function designCss(design) {
  const d = design || {};
  const col = d.colors || {};
  const f = d.fonts || {};
  const t = d.type || {};
  const r = [];
  const vars = Object.entries(col).filter(([k, v]) => hexRgb(v) && v.toLowerCase() !== BRAND.colors[k]).map(([k, v]) => `--color-${k}:${v};`);
  const fv = [];
  if (f.hero && f.hero !== BRAND.fonts.hero) fv.push(`--font-hero:${fontStack(f.hero)};`);
  if (f.display && f.display !== BRAND.fonts.display) fv.push(`--font-display:${fontStack(f.display)};`);
  if (f.lux && f.lux !== BRAND.fonts.lux) fv.push(`--font-lux:${fontStack(f.lux)};`);
  if (f.body && f.body !== BRAND.fonts.body) fv.push(`--font-body:${fontStack(f.body, "sans")};`);
  if (vars.length || fv.length) r.push(`.pbl-site{${vars.join("")}${fv.join("")}font-family:var(--font-body);background:var(--color-deep);color:var(--color-ivory)}`);
  if (t.h1) r.push(`.pbl-site h1{font-size:clamp(${Math.round(clampNum(t.h1, DESIGN_LIMITS.h1) * 0.55)}px,6.4vw,${clampNum(t.h1, DESIGN_LIMITS.h1)}px)!important}`);
  if (t.h2) r.push(`.pbl-site h2{font-size:clamp(${Math.round(clampNum(t.h2, DESIGN_LIMITS.h2) * 0.6)}px,4.6vw,${clampNum(t.h2, DESIGN_LIMITS.h2)}px)!important}`);
  if (t.h3) r.push(`.pbl-site h3{font-size:${clampNum(t.h3, DESIGN_LIMITS.h3)}px!important}`);
  if (t.headingWeight) r.push(`.pbl-site h1,.pbl-site h2,.pbl-site h3{font-weight:${Number(t.headingWeight)}!important}`);
  if (t.headingTracking !== undefined && t.headingTracking !== "") r.push(`.pbl-site h1,.pbl-site h2{letter-spacing:${Number(t.headingTracking)}em!important}`);
  if (t.body) r.push(`.pbl-site main p,.pbl-site main li,.pbl-site main blockquote{font-size:${clampNum(t.body, DESIGN_LIMITS.body)}px!important}`);
  if (t.line) r.push(`.pbl-site main p,.pbl-site main li{line-height:${clampNum(t.line, DESIGN_LIMITS.line)}!important}`);
  if (t.letter !== undefined && t.letter !== "") r.push(`.pbl-site{letter-spacing:${clampNum(t.letter, DESIGN_LIMITS.letter)}em}`);
  if (t.align && t.align !== "default") r.push(`.pbl-site .pbl-block{text-align:${t.align}}`);
  const b = d.buttons || {};
  const R = { pill: "9999px", rounded: "10px", soft: "4px", square: "0px" };
  if (b.radius && b.radius !== "pill") r.push(`.pbl-site a.rounded-full,.pbl-site button.rounded-full{border-radius:${R[b.radius] || "9999px"}!important}`);
  if (b.uppercase === false) r.push(`.pbl-site a.rounded-full,.pbl-site button.rounded-full{text-transform:none!important;letter-spacing:.04em!important}`);
  const cards = d.cards || {};
  if (cards.radius !== undefined && cards.radius !== "") r.push(`.pbl-site .rounded-2xl{border-radius:${Number(cards.radius)}px!important}`);
  const im = d.images || {};
  if (im.radius) r.push(`.pbl-site main article img,.pbl-site main section img:not(.kenburns){border-radius:${Number(im.radius)}px}`);
  if (im.heroMotion === false) r.push(`.pbl-site .kenburns{animation:none!important}`);
  if (im.grain === false) r.push(`.pbl-site.grain:after{display:none}`);
  return r.join("\n");
}
export function fontLinks(design) {
  const f = (design && design.fonts) || {};
  return [...new Set(Object.values(f).filter((x) => x && !LOADED.has(x)))];
}
export function applyDesign() {
  if (typeof document === "undefined" || !document.head) return;
  const d = siteCms().design;
  let el = document.getElementById("pbl-design");
  if (!el) { el = document.createElement("style"); el.id = "pbl-design"; document.head.appendChild(el); }
  const css = designCss(d);
  if (el.textContent !== css) el.textContent = css;
  fontLinks(d).forEach((fam) => {
    const id = "pbl-font-" + fam.replace(/\W+/g, "-");
    if (document.getElementById(id)) return;
    const l = document.createElement("link");
    l.id = id; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(fam).replace(/%20/g, "+") + ":wght@300;400;500;600;700&display=swap";
    document.head.appendChild(l);
  });
}

/* ------------------------------- SEO ------------------------------ */
function meta(attr, key, content) {
  if (typeof document === "undefined" || !document.head) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!content) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute("content", content);
}
export function seoFor(path) {
  const c = siteCms();
  const g0 = c.seo || {};
  const site = (c.settings && c.settings.siteName) || "Prestige Bali Leisure";
  const page = (c.seoPages || {})[path] || {};
  let ent = null, type = "WebPage";
  const pub = (list) => (list || []).filter((x) => x.status === "published");
  if (path.startsWith("/p/")) ent = pub(c.pages).find((p) => "/p/" + p.slug === path);
  if (path.startsWith("/journal/")) { ent = pub(c.blog).find((p) => "/journal/" + p.slug === path); type = "Article"; }
  if (path.startsWith("/destination/")) ent = pub(c.destinationsSite).find((p) => "/destination/" + p.slug === path);
  const es = (ent && ent.seo) || {};
  const title = es.title || page.title || (ent && (ent.title || ent.name) ? (ent.title || ent.name) + " — " + site : "") || g0.title || site;
  const description = es.description || page.description || (ent && (ent.excerpt || ent.tagline)) || g0.description || "";
  const image = resolve(es.ogImage || page.ogImage || (ent && (ent.image || ent.heroImage || ent.banner)) || g0.ogImage || (c.settings && c.settings.ogImage) || "");
  return { title, description, image: /^https?:/.test(image) ? image : "", keywords: es.keywords || page.keywords || "", canonical: es.canonical || page.canonical || "", noindex: !!(es.noindex || page.noindex), ogTitle: es.ogTitle || page.ogTitle || title, type, ent };
}
export function applySeo(path) {
  if (typeof document === "undefined" || !document.head) return;
  const s = seoFor(path);
  if (s.title) document.title = s.title;
  meta("name", "description", s.description);
  meta("name", "keywords", s.keywords);
  meta("name", "robots", s.noindex || isPreview() ? "noindex,nofollow" : "");
  meta("property", "og:title", s.ogTitle);
  meta("property", "og:description", s.description);
  meta("property", "og:image", s.image);
  meta("property", "og:type", s.type === "Article" ? "article" : "website");
  let can = document.head.querySelector('link[rel="canonical"]');
  if (s.canonical) { if (!can) { can = document.createElement("link"); can.rel = "canonical"; document.head.appendChild(can); } can.href = s.canonical; } else if (can) can.remove();
  const c = siteCms(), f = c.footer || {};
  const ld = s.type === "Article" && s.ent
    ? { "@context": "https://schema.org", "@type": "Article", headline: s.ent.title, datePublished: s.ent.date, author: s.ent.author ? { "@type": "Person", name: s.ent.author } : undefined, image: s.image || undefined }
    : { "@context": "https://schema.org", "@type": "TravelAgency", name: (c.settings && c.settings.siteName) || "Prestige Bali Leisure", email: f.email || undefined, telephone: f.phone || undefined, address: Array.isArray(f.address) && f.address.length ? f.address.join(", ") : undefined };
  let sc = document.getElementById("pbl-ld");
  if (!sc) { sc = document.createElement("script"); sc.type = "application/ld+json"; sc.id = "pbl-ld"; document.head.appendChild(sc); }
  sc.textContent = JSON.stringify(ld);
  const fav = resolve((c.settings && c.settings.favicon) || "");
  if (fav) { let l = document.head.querySelector('link[rel="icon"]'); if (!l) { l = document.createElement("link"); l.rel = "icon"; document.head.appendChild(l); } l.href = fav; }
}
export function sitemapXml(base) {
  const c = live();
  const urls = ["/", "/about", "/stays", "/marketplace", "/builder", "/contact", "/journal", "/destinations"]
    .filter((p) => !((c.builtinPages || {})[p] || {}).hidden && !((c.seoPages || {})[p] || {}).noindex && ((c.seoPages || {})[p] || {}).sitemap !== false)
    .concat((c.pages || []).filter((p) => p.status === "published" && !(p.seo || {}).noindex && (p.seo || {}).sitemap !== false).map((p) => "/p/" + p.slug))
    .concat((c.blog || []).filter((p) => p.status === "published" && p.slug).map((p) => "/journal/" + p.slug))
    .concat((c.destinationsSite || []).filter((p) => p.status === "published").map((p) => "/destination/" + p.slug));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${base}#${u}</loc></url>`).join("\n")}\n</urlset>\n`;
}

/* ---------------------- banners & categories ---------------------- */
export function activeBanners(placement) {
  const t = D.today();
  return (siteCms().banners || []).filter((b) => b.status === "published" && b.placement === placement && (!b.start || b.start <= t) && (!b.end || b.end >= t)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
export const LEGACY_CATS = [
  { id: "stay", label: "Stay", legacy: "Stay" }, { id: "dining", label: "Dining", legacy: "Dining" }, { id: "experience", label: "Experience", legacy: "Experience" },
  { id: "adventure", label: "Adventure", legacy: "Adventure" }, { id: "wellness", label: "Wellness", legacy: "Wellness" }, { id: "transportation", label: "Transportation", legacy: "Transportation" },
  ...NEW_SITE_CATS.map((c, i) => ({ ...c, order: 10 + i })),
  { id: "yacht", label: "Yacht & Boat", categoryIds: ["yacht"], order: 7 },
];
export function siteCategories() {
  const c = siteCms().siteCategories;
  const list = Array.isArray(c) && c.length ? c : LEGACY_CATS;
  return [...new Map(list.map((x) => [x.id, x])).values()].slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
export function categoryMatch(product, id) {
  if (id === "all") return true;
  const cat = siteCategories().find((c) => c.id === id);
  if (!cat) return false;
  if (Array.isArray(cat.categoryIds) && cat.categoryIds.length) return cat.categoryIds.includes(product.categoryId);
  return product.category === cat.legacy;
}
export function productDisplay() {
  const p = siteCms().productDisplay || {};
  return { featured: p.featured || [], hidden: p.hidden || [], badges: p.badges || {}, homeFeatured: p.homeFeatured || [] };
}
export const cid = uid;

/* one-time upgrades of an existing CMS store */
export function migrateCms() {
  const db = DB();
  migrateInlineImages();
  if (!db.meta.cmsBlogV1) {
    /* the starter article has only a summary — keep it as a draft until it is written */
    [db.cms, db.cmsDraft].forEach((c) => (c && c.blog || []).forEach((b) => { if (!b.content && b.status === "published") { b.status = "draft"; b.slug = b.slug || slugify(b.title); } }));
    db.meta.cmsBlogV1 = true;
  }
  if (!db.cmsDraft) db.cmsDraft = clone(db.cms);
}
