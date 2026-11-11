/* ==================================================================
   PRESTIGE BALI LEISURE — CENTRALIZED DATABASE
   ------------------------------------------------------------------
   One database for the whole company. The customer website and the
   operations backend both read and write here, so a change made in
   Product Master is immediately visible in the Catalogue, Destination
   pages, Vacation Builder, Quotations, Bookings and the public site.

   Persistence: localStorage ("pbl-ops-v1").
   Reactivity : subscribe()/notify() — components re-render on change.
   Security   : every mutation is permission-checked server-side-style
                (throws) and writes an audit log entry.
   ================================================================== */

import { DRAFT_PRODUCTS, DRAFT_DESTINATIONS, VERIFY_FIELDS } from "./catalogue-drafts.js";
import { ADVENTURES, ADVENTURE_SUBS } from "./adventures.js";
import { NEW_CATEGORIES, SITE_CATEGORY_ADDITIONS } from "./categoryExpansion.js";

let listeners = [];
let version = 0;

const KEY = "pbl-ops-v1";

/* ---------------------------- utilities --------------------------- */
export class PermissionError extends Error {}

const hash = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
};
const pick = (arr, seed) => arr[Math.floor(hash(String(seed)) * arr.length) % arr.length];
const int = (seed, min, max) => min + Math.floor(hash("n" + seed) * (max - min + 1));
const uid = (p) => p + "-" + Math.random().toString(36).slice(2, 8).toUpperCase();
export const money = (n) =>
  "$" + Number(Math.round(Number(n) || 0)).toLocaleString("en-US");
export const money2 = (n) =>
  "$" + Number(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/* Calendar dates are plain "YYYY-MM-DD" strings. They are formatted
   from LOCAL date parts (never toISOString, which converts to UTC and
   shifts the date in timezones ahead of UTC such as Bali, UTC+8). */
const pad2 = (n) => String(n).padStart(2, "0");
export const ymd = (d) => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
export const ym = (d) => d.getFullYear() + "-" + pad2(d.getMonth() + 1);
export const today = () => ymd(new Date());
export const addDays = (iso, n) => {
  const [y, m, dd] = String(iso).slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd + Number(n || 0)));
  return t.getUTCFullYear() + "-" + pad2(t.getUTCMonth() + 1) + "-" + pad2(t.getUTCDate());
};
export const daysBetween = (a, b) => {
  const u = (x) => { const [y, mo, d] = String(x).slice(0, 10).split("-").map(Number); return Date.UTC(y, mo - 1, d); };
  return Math.round((u(b) - u(a)) / 86400000);
};
export const fmtDate = (iso) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
export const fmtDateTime = (ts) =>
  new Date(ts).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const monthKey = (iso) => (iso || "").slice(0, 7);

/* ------------------------------ schema ---------------------------- */
export const CATEGORIES = [
  { id: "accommodation", name: "Accommodation", subs: ["Private Villa", "Hotels", "Resort", "Boutique Retreats", "Residences", "Buyout", "Beach House", "General"] },
  { id: "activities", name: "Activities & Experiences", subs: ["Culture Immersion", "Adventure", "Leisure & Entertainment", "Family", "Celebration & Event"] },
  { id: "adventure", name: "Adventures", subs: ["Trekking & Volcano", "Rafting & Kayaking", "4x4 & Off-road", "Cycling", "Canyoning & Waterfalls", "Zipline & Treetop", "Paragliding", "Horse Riding", "Ocean Adventure"] },
  { id: "attractions", name: "Attractions", subs: ["Temples", "Rice Terraces", "Waterfalls", "Swings & Viewpoints", "Beaches & Viewpoints", "Nature Parks", "Palaces & Gardens", "Cultural Parks", "Wildlife"] },
  { id: "transportation", name: "Transportation", subs: ["Private Chauffeur", "Airport Transfer", "Boat & Island Transfer", "Helicopter"] },
  { id: "wellness", name: "Wellness & Spa", subs: ["Spa & Massage", "Healing", "Retreat Packages", "Beauty & Grooming"] },
  { id: "dining", name: "Dining & Restaurants", subs: ["Fine Dining & Restaurant", "Beach Club", "Private Chef", "Wine & Mixology", "Romantic Dining", "Experience Dining"] },
  { id: "yacht", name: "Yacht & Boat", subs: ["Sunset Charter", "Full-Day Charter", "Dive Charter"] },
  { id: "watersports", name: "Water Sports", subs: ["Water Activities", "Diving", "Surfing", "Rafting", "Water Parks"] },
  { id: "tours", name: "Tours & Excursions", subs: ["Temple Tours", "Island Hopping", "Volcano & Rice Terrace", "Wildlife"] },
  { id: "concierge", name: "Concierge & Special Services", subs: ["Event Production", "Personal Shopping", "Security", "Nanny & Butler"] },
];

export const SITE_CATEGORY = {
  accommodation: "Stay", activities: "Experience", adventure: "Adventure", attractions: "Experience", tours: "Experience",
  watersports: "Experience", concierge: "Experience", transportation: "Transportation",
  wellness: "Wellness", dining: "Dining", yacht: "Yacht & charter",
  family: "Family & Leisure", "yacht-luxury": "Yacht & Luxury Charter", events: "Celebrations & Events",
  culture: "Culture Immersion", premium: "Premium Experiences", classes: "Classes & Workshops",
  "wellness-spa": "Wellness & Spa", "retreat-hosting": "Retreat Hosting", healing: "Healing & Holistic",
  "retreat-packages": "Wellness Retreat Packages", beauty: "Beauty & Grooming",
};
const CATEGORY_OF = {
  Stay: "accommodation", "Private vacation": "activities", Experience: "activities",
  Transportation: "transportation", Wellness: "wellness", Dining: "dining",
  "Yacht & charter": "yacht", Tour: "tours", Concierge: "concierge",
};

/* ------------------------- cancellation rules --------------------- */
export const DEFAULT_CANCELLATION_RULES = [
  { id: "grace", label: "Grace period after confirmation", basis: "confirmation", min: 0, max: 15, charge: 0, unit: "%" },
  { id: "far", label: "More than 120 days before arrival", basis: "arrival", min: 121, max: 9999, charge: 0, unit: "%" },
  { id: "d120-91", label: "120–91 days before arrival", basis: "arrival", min: 91, max: 120, charge: 1, unit: "night" },
  { id: "d90-61", label: "90–61 days before arrival", basis: "arrival", min: 61, max: 90, charge: 30, unit: "%" },
  { id: "d60-31", label: "60–31 days before arrival", basis: "arrival", min: 31, max: 60, charge: 50, unit: "%" },
  { id: "d30-1", label: "30–1 days before arrival", basis: "arrival", min: 1, max: 30, charge: 70, unit: "%" },
  { id: "noshow", label: "Arrival date / no-show", basis: "arrival", min: 0, max: 0, charge: 100, unit: "%" },
];

/* ----------------------------- database --------------------------- */
const blank = () => ({
  meta: { createdAt: Date.now(), seeded: false, siteProductCount: 0 },
  settings: {
    companyName: "Prestige Bali Leisure",
    currency: "USD",
    taxRate: 21,
    defaultMarkupPct: 15,
    depositPct: 30,
    fullPaymentDaysBeforeArrival: 30,
    quoteValidityDays: 14,
    cancellationRules: JSON.parse(JSON.stringify(DEFAULT_CANCELLATION_RULES)),
    securityLog: [],
    holdMinutesWeb: 1440,
    holdHoursStaff: 48,
    holdHoursQuote: 72,
  },
  inventory: {},
  emails: [],
  media: [],
  cmsVersions: [],
  subscribers: [],
  tripDrafts: [],
  accounts: [],
  allocations: [],
  inventoryLog: [],
  inventorySync: [],
  users: [],
  suppliers: [],
  products: [],
  categories: JSON.parse(JSON.stringify(CATEGORIES)),
  destinations: [],
  customers: [],
  inquiries: [],
  quotations: [],
  bookings: [],
  invoices: [],
  payments: [],
  itineraries: [],
  vacationPlans: [],
  auditLogs: [],
  cms: {
    nav: null,
    footer: null,
    home: { hero: null, sections: [] },
    seo: { title: "Prestige Bali Leisure — Luxury Private Vacations in Bali", description: "" },
    announcement: { enabled: false, text: "" },
    testimonials: [],
    blog: [],
  },
  integrations: [],
  reviews: [],
});

let DB = blank();

/* --------------------------- persistence -------------------------- */
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      DB = Object.assign(blank(), parsed);
      DB.settings = Object.assign(blank().settings, parsed.settings || {});
      DB.cms = Object.assign(blank().cms, parsed.cms || {});
      if (!DB.inventory || Array.isArray(DB.inventory)) DB.inventory = {};
      if (!Array.isArray(DB.emails)) DB.emails = [];
    }
  } catch {
    DB = blank();
  }
}
let lastSaveError = null;
export const saveStatus = () => lastSaveError;
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(DB));
    lastSaveError = null;
  } catch (e) {
    lastSaveError = { at: Date.now(), message: /quota/i.test(String(e && (e.name + e.message))) ? "Browser storage is full — the last change could not be saved. Delete unused images in the Media Library." : String(e && e.message || e) };
    console.warn("PBL-DB: persistence failed", e);
  }
}
/* Write hooks let services (inventory) validate and react to record
   changes. "before" hooks may throw to block the write atomically. */
export const hooks = { before: [], after: [] };
export const siteDecorators = [];
const runHooks = (list, coll, prev, next, actor) => list.forEach((h) => h(coll, prev, next, actor));
export function commit(reason) {
  notify(reason);
}

export function subscribe(fn) {
  listeners.push(fn);
  return () => (listeners = listeners.filter((f) => f !== fn));
}
export function getVersion() {
  return version;
}
function notify(reason) {
  republish();
  version++;
  save();
  listeners.forEach((l) => {
    try {
      l(reason, version);
    } catch {}
  });
}
export function resetDatabase() {
  DB = blank();
  DB.meta.seeded = false;
  notify("reset");
}

/* =========================== SEEDING ============================== */
/* The seed is imported from the live site catalogue, so Product Master
   starts as an exact mirror of what the website already sells.        */
const SUPPLIER_TELEPHONE = ["+62 361 5550", "+62 811 3899", "+62 812 4601", "+62 813 7742"];

export function pblSeedFromSite(site) {
  load();
  const firstRun = !DB.meta.seeded;
  const productsChanged = DB.meta.siteProductCount !== site.products.length;

  /* ---- suppliers ---- */
  if (firstRun || productsChanged) {
    const names = new Set(site.suppliers.map((s) => s.name).filter(Boolean));
    site.products.forEach((p) => p.supplier && names.add(p.supplier));
    const existing = new Set(DB.suppliers.map((s) => s.name));
    let i = DB.suppliers.length;
    names.forEach((name) => {
      if (existing.has(name)) return;
      const src = site.suppliers.find((s) => s.name === name) || {};
      i++;
      DB.suppliers.push({
        id: "SUP-" + String(i).padStart(3, "0"),
        name,
        contactPerson: src.contact || "Reservations",
        category: src.sub || "Accommodation",
        region: src.region || "Bali",
        address: src.region || "Bali, Indonesia",
        phone: SUPPLIER_TELEPHONE[i % SUPPLIER_TELEPHONE.length],
        whatsapp: "+62 811 " + (100000 + int("wa" + name, 100000, 999999)),
        email: (name.toLowerCase().replace(/[^a-z]+/g, ".").slice(0, 22) || "info") + "@partner.bali",
        website: "https://" + (name.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 18) || "partner") + ".com",
        contract: "Annual allotment agreement · reviewed each January",
        paymentTerms: pick(["Net 14", "Net 30", "On confirmation", "50% deposit / 50% on arrival"], name),
        bank: "Bank Mandiri · " + name.toUpperCase().slice(0, 12) + " · 1400" + int("bk" + name, 100000, 999999),
        netRates: "Contracted net rates on file",
        notes: src.source || "",
        status: "active",
        restrictedBankAccess: true,
      });
    });
  }

  /* ---- products (Product Master) ---- */
  if (firstRun || productsChanged) {
    const byslug = new Map(DB.products.map((p) => [p.slug, p]));
    site.products.forEach((p, idx) => {
      const sup = DB.suppliers.find((s) => s.name === p.supplier);
      const catId = CATEGORY_OF[p.category] || "activities";
      const cat = DB.categories.find((c) => c.id === catId);
      const master = byslug.get(p.slug);
      const record = {
        id: master?.id || "PRD-" + String(idx + 1).padStart(5, "0"),
        slug: p.slug,
        name: master?.name || p.name,
        productId: master?.productId || "PBL-" + String(idx + 1).padStart(5, "0"),
        category: p.category,
        categoryId: catId,
        subcategory: p.sub || cat?.subs[0] || "General",
        supplierId: sup?.id || "",
        supplier: p.supplier || "",
        destination: p.region || "Bali",
        location: p.region || "Bali",
        description: p.desc || "",
        facilities: [],
        inclusions: [],
        exclusions: [],
        netRate: Number(p.nett ?? Math.round((p.price || 0) * 0.85)),
        sellingRate: Number(p.price ?? 0),
        markupPct: p.price ? Math.round(((p.price - (p.nett ?? p.price * 0.85)) / (p.nett ?? p.price * 0.85)) * 100) : 15,
        unit: p.unit || "night",
        capacity: p.beds ? String(p.beds) : int("cap" + p.slug, 2, 12) + " guests",
        stock: p.stock ?? null,
        operatingHours: "09:00 – 21:00",
        blackoutDates: [],
        cancellationPolicy: "Follows house cancellation schedule",
        status: master?.status || "live",
        published: master?.published ?? true,
        images: master?.images?.length ? master.images : [{ url: p.img || "", caption: p.photoSource || p.name, kind: "main" }],
        internalNotes: master?.internalNotes || "",
        rating: p.rating || 4.85,
      };
      if (master) Object.assign(master, record, { images: master.images });
      else DB.products.push(record);
    });
    DB.meta.siteProductCount = site.products.length;
  }

  /* ---- destinations ---- */
  if (firstRun && !DB.destinations.length) {
    const defs = [
      ["Uluwatu", "Cliffs, temples and the island's best surf.", "The Bukit is limestone and light — a 70-metre drop into the Indian Ocean, a temple at the edge of it, and sand that only appears when the tide leaves."],
      ["Ubud", "Rice terraces, rivers and the cultural heart.", "Ubud is where the island keeps its archive: dance that predates photography, springs that predate the dance, and terraces cut by hand over nine centuries."],
      ["Nusa Penida", "The raw island across the channel.", "Penida does not soften itself for anyone. The cliffs are sheer, the water is cold and impossibly clear, and the mantas arrive on schedule."],
      ["Seminyak", "Beach clubs, boutiques and long sunsets.", "The most polished stretch of the island — beach beds in a row, a sommelier within reach, and the sun going down into the same ocean every evening."],
      ["Canggu", "Surf, rice fields and a slower morning.", "A working surf break, a village that grew around it, and terraces that still run down to the between the villas."],
      ["Sidemen", "The valley Bali kept quiet.", "East of the volcano, Sidemen is terraces and palm groves with Mount Agung filling the window."],
      ["Sanur", "Calm water and the boat gateway.", "A reef-protected shore where the water is flat at dawn, and the boats leave for Penida before the heat."],
      ["Jimbaran", "Fish shacks, big villas and the sunset bay.", "Jimbaran Bay curves north to the airport, the catch comes in at four, and the villas above it are the largest on the island."],
      ["Nusa Dua", "White sand and the conference shore.", "Purpose-built, immaculately kept, and the calmest swimming on the south coast."],
      ["Lombok", "Next island, quieter shores.", "Twenty minutes by air. Rinjani, the Gilis and beaches with nobody on them."],
      ["Thailand", "Beyond Bali — Andaman and Gulf.", "Phuket, Krabi and Samui for guests who want the region."],
      ["Vietnam", "Ha Long to the Mekong Delta.", "An extension destination for multi-country journeys."],
      ["Labuan Bajo", "Komodo, phinisi and dragon coasts.", "The gateway to Komodo National Park and the phinisi fleet."],
    ];
    defs.forEach(([name, tagline, body], i) => {
      const hero = site.products.find((p) => p.destination === name)?.images?.[0]?.url || "";
      DB.destinations.push({
        id: "DST-" + String(i + 1).padStart(3, "0"),
        name,
        tagline,
        description: body,
        content: body + " Our desk holds the villas, the drivers and the tables here — and the people who run them answer their phones.",
        location: name + ", Indonesia",
        mapQuery: name + ", Bali",
        heroImage: hero,
        gallery: site.products.filter((p) => p.destination === name).slice(0, 4).map((p) => p.images[0]?.url).filter(Boolean),
        seoTitle: name + " — Prestige Bali Leisure",
        seoDescription: tagline,
        typography: "serif",
        categories: ["accommodation", "activities", "transportation"],
        productSlugs: site.products.filter((p) => p.destination === name).map((p) => p.slug),
        status: "published",
      });
    });
  }

  /* ---- users & roles ---- */
  if (firstRun && !DB.users.length) {
    DB.users = [
      { id: "USR-001", name: "Nuril Sezhan", email: "nuril@prestigebalileisure.com", role: "super_admin", label: "Super Admin", phone: "+62 811 700 100", status: "active", permissions: { all: true } },
      ...site.users.filter((u) => !DB.users.some((x) => x.email.toLowerCase() === u.email.toLowerCase())).map((u, i) => ({
        id: "USR-" + String(i + 2).padStart(3, "0"),
        name: u.name,
        email: u.email,
        role: u.role === "staff" ? "admin" : u.role,
        label: u.label,
        phone: "+62 811 700 " + (200 + i),
        status: "active",
        permissions: {},
      })),
    ];
  }

  /* ---- CMS defaults ---- */
  if (firstRun) {
    DB.cms.footer = { email: site.contact.email, phone: site.contact.phone, hours: site.contact.hours, paypal: "https://paypal.me/prestigebali" };
    DB.cms.home = {
      hero: { eyebrow: "★ 4.93 verified guest rating", title: "Your entire Bali escape, curated & booked in one place.", body: "", image: "", imageMobile: "", alt: "", overlay: 25 },
      sections: [],
    };
    DB.cms.testimonials = [
      { id: "TST-1", author: "The Whitfield Family", country: "United Kingdom", rating: 5, text: "The best holiday of our lives — flawless concierge, and the villa was better than the photographs.", status: "published", source: "Direct" },
      { id: "TST-2", author: "H. Tanaka", country: "Japan", rating: 5, text: "Transparent pricing and a live itinerary app. Nothing was left to chance.", status: "published", source: "Direct" },
    ];
    DB.cms.blog = [
      { id: "BLG-1", title: "When to come: reading the Balinese calendar", excerpt: "Nyepi, Galungan and what they mean for a private villa stay.", status: "published", date: today() },
    ];
    DB.reviews = [
      { id: "REV-1", source: "Google Business Profile", author: "Amelia R.", rating: 5, text: "Impeccable service from the first email to the airport send-off.", date: today(), status: "published" },
      { id: "REV-2", source: "Google Business Profile", author: "Jonas W.", rating: 5, text: "They rebuilt our itinerary twice without a sigh and refunded a night we did not use.", date: today(), status: "published" },
      { id: "REV-3", source: "Google Business Profile", author: "Priya N.", rating: 4, text: "Beautiful villas. Response times on WhatsApp were excellent.", date: today(), status: "published" },
    ];
    DB.integrations = [
      { id: "INT-1", name: "Lodgify", kind: "PMS / Channel Manager", status: "connected", lastSync: Date.now() - 3600e3, credentials: { apiKey: "ldfy_live_••••••••••" }, webhook: "https://api.prestigebalileisure.com/hooks/lodgify", autoSync: true, notes: "Pulls availability + rates for 24 villas." },
      { id: "INT-2", name: "Airbnb", kind: "OTA", status: "connected", lastSync: Date.now() - 7200e3, credentials: { token: "••••••••••" }, webhook: "https://api.prestigebalileisure.com/hooks/airbnb", autoSync: true, notes: "Listing sync + reservation import." },
      { id: "INT-3", name: "Booking.com", kind: "OTA", status: "disconnected", lastSync: null, credentials: {}, webhook: "https://api.prestigebalileisure.com/hooks/booking", autoSync: false, notes: "Awaiting property key." },
      { id: "INT-4", name: "Stripe", kind: "Payment gateway", status: "connected", lastSync: Date.now() - 600e3, credentials: { secret: "sk_live_••••••••••" }, webhook: "https://api.prestigebalileisure.com/hooks/stripe", autoSync: true, notes: "Cards + virtual accounts." },
      { id: "INT-5", name: "PayPal", kind: "Payment gateway", status: "connected", lastSync: Date.now() - 900e3, credentials: { client: "••••••" }, webhook: "https://api.prestigebalileisure.com/hooks/paypal", autoSync: true, notes: "Official payment rail." },
      { id: "INT-6", name: "Open Exchange Rates", kind: "Currency", status: "connected", lastSync: Date.now() - 86400e3, credentials: { app_id: "••••••" }, webhook: "", autoSync: true, notes: "Daily USD/IDR/AUD/SGD." },
      { id: "INT-7", name: "Google Business Profile", kind: "Google services", status: "connected", lastSync: Date.now() - 43200e3, credentials: { refresh: "••••••" }, webhook: "", autoSync: true, notes: "Reviews + business information." },
      { id: "INT-8", name: "WhatsApp Business Cloud", kind: "Notifications", status: "connected", lastSync: Date.now() - 300e3, credentials: { token: "••••••" }, webhook: "https://api.prestigebalileisure.com/hooks/whatsapp", autoSync: true, notes: "Guest + supplier notifications." },
    ];
  }

  /* ---- customers ---- */
  if (firstRun && !DB.customers.length) {
    const seedC = [
      ["Whitfield Family", "whitfield.family@mail.com", "+44 7700 900123", "United Kingdom", "British", "customer"],
      ["K. Osei", "k.osei@mail.com", "+1 415 555 0188", "United States", "American", "customer"],
      ["Marlowe & Co.", "events@marlowe.co", "+61 2 5550 8877", "Australia", "Australian", "customer"],
      ["H. Tanaka", "h.tanaka@mail.jp", "+81 3 5550 2211", "Japan", "Japanese", "customer"],
      ["Beaumont Wedding", "hello@beaumont.wedding", "+33 1 5550 4412", "France", "French", "customer"],
      ["L. Almeida", "l.almeida@mail.br", "+55 11 5550 7734", "Brazil", "Brazilian", "customer"],
      ["N. Petrova", "n.petrova@mail.ru", "+7 495 555 9021", "Russia", "Russian", "customer"],
      ["S. Chandran", "s.chandran@mail.sg", "+65 6550 3312", "Singapore", "Singaporean", "customer"],
    ];
    DB.customers = seedC.map(([name, email, phone, country, nationality], i) => ({
      id: "CUS-" + String(i + 1).padStart(4, "0"),
      name, email, phone, whatsapp: phone, country, nationality,
      address: "", status: "New", notes: "", tags: [],
      createdAt: Date.now() - int("c" + name, 10, 400) * 86400e3, seed: true,
    }));
  }

  migrate();
  importDrafts();
  importAdventures();
  DB.meta.seeded = true;
  save();
  return { firstRun };
}

/* Schema 3: the expanded category set (A–K) is added once; existing
   categories, products and bookings are untouched. */
function migrateCategories() {
  NEW_CATEGORIES.forEach((c) => {
    const have = DB.categories.find((x) => x.id === c.id);
    if (!have) DB.categories.push({ id: c.id, name: c.name, subs: [...c.subs] });
    else { c.subs.forEach((s) => have.subs.includes(s) || have.subs.push(s)); if (have.name !== c.name) have.name = c.name; }
  });
  Object.entries(SITE_CATEGORY_ADDITIONS).forEach(([legacy, id]) => { SITE_CATEGORY[legacy] = id; });
}
/* Schema 2: guest-movement fields, new categories, sample flags.
   Existing records are preserved; only missing fields are added. */
function migrate() {
  if (!DB.meta.categoriesV3) { migrateCategories(); DB.meta.categoriesV3 = true; }
  if ((DB.meta.schema || 1) >= SCHEMA) return;
  CATEGORIES.forEach((c) => {
    const have = DB.categories.find((x) => x.id === c.id);
    if (!have) DB.categories.push(JSON.parse(JSON.stringify(c)));
    else c.subs.forEach((sub) => have.subs.includes(sub) || have.subs.push(sub));
  });
  const flag = (list, re) => list.forEach((r) => { if (re.test(r.id || "")) r.seed = true; });
  flag(DB.inquiries, /^INQ-10[0-4]\d$/);
  flag(DB.quotations, /^QUO-24[0-4]\d$/);
  flag(DB.bookings, /^BKG-30[0-4]\d$/);
  flag(DB.invoices, /^INV-71[0-4]\d$/);
  flag(DB.itineraries, /^ITI-52[0-4]\d$/);
  flag(DB.payments, /^PAY-R-/);
  flag(DB.vacationPlans, /^VPL-9\d\d$/);
  flag(DB.customers, /^CUS-000[1-8]$/);
  DB.bookings.forEach((b) => {
    const d = OPS_DEFAULTS(b.guests);
    Object.keys(d).forEach((k) => { if (b[k] === undefined) b[k] = d[k]; });
    if (b.discountPct === undefined) b.discountPct = DB.quotations.find((q) => q.id === b.quoteId)?.discountPct || 0;
  });
  DB.vacationPlans.forEach((v) => { if (!Array.isArray(v.dayPlan)) v.dayPlan = []; });
  DB.meta.schema = SCHEMA;
}

/* Verification queue: real venues by name and location, no invented
   commercial data. They stay unpublished until verified. */
function importDrafts() {
  if (DB.meta.draftsV1) return;
  DRAFT_DESTINATIONS.forEach(([name, tagline], i) => {
    if (DB.destinations.some((d) => d.name.toLowerCase() === name.toLowerCase())) return;
    DB.destinations.push({
      id: "DST-" + String(200 + i), name, tagline, description: tagline, content: "",
      location: name + ", Bali, Indonesia", mapQuery: name + ", Bali", heroImage: "", gallery: [],
      seoTitle: name + " — Prestige Bali Leisure", seoDescription: tagline, typography: "serif",
      categories: [], productSlugs: [], status: "draft", verification: "pending",
    });
  });
  const names = new Set(DB.products.map((p) => p.name.toLowerCase()));
  let n = DB.products.length;
  DRAFT_PRODUCTS.forEach(([name, categoryId, subcategory, destination, location, unit, note]) => {
    if (names.has(name.toLowerCase())) return;
    n++;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-pbl";
    DB.products.push({
      id: "PRD-" + String(n).padStart(5, "0"), productId: "PBL-" + String(n).padStart(5, "0"), slug, name,
      category: SITE_CATEGORY[categoryId] || "Experience", categoryId, subcategory,
      supplierId: "", supplier: "To be contracted", destination, location,
      description: note, facilities: [], inclusions: [], exclusions: [], options: [],
      netRate: 0, sellingRate: 0, markupPct: 0, unit, capacity: "", duration: "", stock: null,
      operatingHours: "", blackoutDates: [], cancellationPolicy: "",
      status: "draft", published: false, verification: "pending", verifyPending: [...VERIFY_FIELDS],
      images: [], internalNotes: "Imported to the verification queue. Confirm every commercial field with the operator before publishing.",
      rating: 0,
    });
    const dest = DB.destinations.find((d) => d.name === destination);
    if (dest && !dest.productSlugs.includes(slug)) dest.productSlugs.push(slug);
  });
  DB.meta.draftsV1 = true;
}

/* Adventures range: added once to Product Master (existing data kept).
   Published "Price on request" — no rates are invented. */
function importAdventures() {
  if (DB.meta.adventureV1) return;
  const cat = DB.categories.find((c) => c.id === "adventure");
  if (!cat) DB.categories.splice(Math.max(1, DB.categories.findIndex((c) => c.id === "activities") + 1), 0, { id: "adventure", name: "Adventures", subs: [...ADVENTURE_SUBS] });
  else ADVENTURE_SUBS.forEach((x) => cat.subs.includes(x) || cat.subs.push(x));
  const house = DB.suppliers.find((x) => x.name === "Prestige Bali Leisure");
  ADVENTURES.forEach((a, i) => {
    const fields = {
      category: "Adventure", categoryId: "adventure", subcategory: a.sub, destination: a.destination, location: a.location,
      description: a.desc, unit: a.unit, duration: a.duration || "", capacity: a.capacity || "", images: a.images,
      supplierId: house?.id || "", supplier: "Prestige Bali Leisure",
    };
    const existing = DB.products.find((p) => p.name.toLowerCase() === a.name.toLowerCase());
    if (existing) {
      if (!a.convert) return;
      const priced = Number(existing.sellingRate) > 0 && existing.verification !== "pending";
      Object.assign(existing, fields, priced ? {} : { priceOnRequest: true, sellingRate: 0, netRate: 0, status: "live", published: true, verification: "quote", verifyPending: ["Supplier contract", "Net rate", "Selling rate"] });
      if (!existing.images?.length) existing.images = a.images;
      return;
    }
    const n = String(i + 1).padStart(2, "0");
    DB.products.push({
      id: "PRD-ADV" + n, productId: "PBL-ADV" + n,
      slug: a.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-adv",
      name: a.name, ...fields,
      facilities: [], inclusions: [], exclusions: [], options: [],
      netRate: 0, sellingRate: 0, markupPct: 0, priceOnRequest: true,
      stock: null, operatingHours: "", blackoutDates: [], cancellationPolicy: "",
      status: "live", published: true, verification: "quote", verifyPending: ["Supplier contract", "Net rate", "Selling rate"],
      internalNotes: "Adventures range — sold price on request. Set the operator, net and selling rate once contracted; the website then shows the price.",
      rating: 0,
    });
  });
  DB.meta.adventureV1 = true;
}

/* Super Admin: remove the seeded sample transactions before go-live.
   Product Master, suppliers, destinations, users and CMS are kept. */
export function purgeSampleTransactions(actor) {
  if (actor?.role !== "super_admin") throw new PermissionError("Only the Super Admin can purge sample transactions.");
  const counts = {};
  ["inquiries", "quotations", "bookings", "invoices", "payments", "itineraries", "vacationPlans"].forEach((k) => {
    const before = DB[k].length;
    DB[k] = DB[k].filter((r) => !r.seed);
    counts[k] = before - DB[k].length;
  });
  const used = new Set([...DB.inquiries, ...DB.quotations, ...DB.bookings].map((r) => r.customerId));
  const before = DB.customers.length;
  DB.customers = DB.customers.filter((c) => !c.seed || used.has(c.id));
  counts.customers = before - DB.customers.length;
  audit(actor, "purge", "System", "sample-data", null, counts);
  notify("purge");
  return counts;
}
export const sampleCount = () =>
  ["inquiries", "quotations", "bookings", "invoices", "payments", "itineraries"].reduce((s, k) => s + DB[k].filter((r) => r.seed).length, 0);

const clampPast = (iso) => (iso > today() ? today() : iso);
const SCHEMA = 2;
/* Operational fields a booking carries for guest-movement lists.
   Unknown values stay empty — they are entered by staff, never guessed. */
export const OPS_DEFAULTS = (guests) => ({
  adults: Number(guests) || 2, children: 0, rooms: null, roomDetails: "",
  flightNumber: "", flightDate: "", landingTime: "", departureFlight: "", departureTime: "",
  pickup: "", specialRequests: "", opsNotes: "",
});

/* -------- operational seed: real transactions from real products -- */
export function seedOperations(actor) {
  load();
  if (DB.inquiries.length) return false;
  const live = DB.products.filter((p) => p.status === "live");
  const stays = live.filter((p) => p.categoryId === "accommodation");
  const extras = live.filter((p) => p.categoryId !== "accommodation");
  const names = DB.customers.map((c) => c.name);

  const mk = (n) => {
    const cust = DB.customers[int("c" + n, 0, DB.customers.length - 1)];
    const start = addDays(today(), int("d" + n, -220, 60));
    const nights = int("n" + n, 3, 9);
    const end = addDays(start, nights);
    const villa = stays[int("v" + n, 0, stays.length - 1)];
    const guests = int("g" + n, 2, 10);
    const villaQty = villa.unit === "night" ? nights : 1;
    const lines = [{ slug: villa.slug, name: villa.name, qty: villaQty, unit: villa.unit, net: villa.netRate, sell: villa.sellingRate, categoryId: villa.categoryId }];
    const extraCount = int("e" + n, 2, 4);
    for (let k = 0; k < extraCount; k++) {
      const x = extras[int("x" + n + k, 0, extras.length - 1)];
      if (lines.some((l) => l.slug === x.slug)) continue;
      lines.push({ slug: x.slug, name: x.name, qty: x.unit === "night" ? nights : 1, unit: x.unit, net: x.netRate, sell: x.sellingRate, categoryId: x.categoryId });
    }
    return { cust, start, end, nights, villa, guests, lines };
  };

  const N = 46;
  for (let i = 1; i <= N; i++) {
    const { cust, start, end, nights, villa, guests, lines } = mk(i);
    const net = lines.reduce((s, l) => s + l.net * l.qty, 0);
    const sell = lines.reduce((s, l) => s + l.sell * l.qty, 0);
    const inq = {
      id: "INQ-" + String(1000 + i),
      customerId: cust.id, customerName: cust.name,
      channel: pick(["Website", "WhatsApp", "Referral", "Instagram", "Repeat guest"], i),
      destination: villa.destination, guests, nights,
      arrival: start, departure: end,
      brief: pick(["Family villa week with a chef.", "Anniversary trip, quiet and private.", "Wellness retreat for a small group.", "Wedding blessing, 40 guests.", "First trip to Bali, want the best of it.", "Surf and rest, two families."], i),
      status: pick(["New", "Contacted", "Quoted", "Converted", "Lost"], i + "s"),
      ownerId: pick(["USR-002", "USR-003", "USR-004"], i),
      createdAt: clampPast(addDays(start, -int("lc" + i, 30, 120))) + "T09:00:00.000Z",
      timeline: [], seed: true,
    };
    DB.inquiries.push(inq);

    const quoted = i % 7 !== 0;
    let quote = null;
    if (quoted) {
      quote = {
        id: "QUO-" + String(2400 + i),
        inquiryId: inq.id, customerId: cust.id, customerName: cust.name,
        title: villa.name + " · " + nights + " nights",
        arrival: start, departure: end, nights, guests,
        lines, netTotal: net, sellTotal: sell,
        discountPct: i % 11 === 0 ? 5 : 0,
        taxPct: DB.settings.taxRate,
        tax: Math.round((sell * (1 - (i % 11 === 0 ? 0.05 : 0)) * DB.settings.taxRate) / 100),
        total: Math.round(sell * (1 - (i % 11 === 0 ? 0.05 : 0)) * (1 + DB.settings.taxRate / 100)),
        depositDue: Math.round(Math.round(sell * (1 - (i % 11 === 0 ? 0.05 : 0)) * (1 + DB.settings.taxRate / 100) * (DB.settings.depositPct / 100)) / 100) * 100,
        paymentTerms: "30% deposit on confirmation · balance 30 days before arrival",
        validity: addDays(today(), DB.settings.quoteValidityDays),
        cancellationPolicy: "House cancellation schedule applies",
        status: pick(["Draft", "Sent", "Approved", "Approved", "Declined"], i + "q"),
        createdAt: clampPast(addDays(start, -int("qc" + i, 20, 100))) + "T10:00:00.000Z",
        seed: true,
      };
      DB.quotations.push(quote);
      inq.status = quote.status === "Approved" ? "Converted" : "Quoted";
    }

    if (quote && quote.status === "Approved" && i % 13 !== 0) {
      const bcn = "BCN-" + String(48000 + i);
      const booking = {
        id: "BKG-" + String(3000 + i), bcn, quoteId: quote.id, inquiryId: inq.id,
        customerId: cust.id, customerName: cust.name,
        title: quote.title, arrival: start, departure: end, nights, guests,
        lines, total: quote.total, depositPaid: 0, balance: quote.total,
        dueDate: addDays(start, -DB.settings.fullPaymentDaysBeforeArrival),
        paymentStatus: pick(["Deposit paid", "Part paid", "Unpaid", "Paid in full"], i + "b"),
        supplierStatus: pick(["Confirmed", "Pending", "Confirmed"], i + "ss"),
        status: pick(["Confirmed", "Confirmed", "Completed", "Cancelled"], i + "bs"),
        createdAt: clampPast(addDays(start, -int("bc" + i, 15, 90))) + "T11:00:00.000Z",
        cancelledAt: null, cancellationCharge: 0, cancellationRule: "",
        discountPct: quote.discountPct || 0,
        ...OPS_DEFAULTS(guests), seed: true,
      };
      if (booking.status === "Completed" && booking.departure >= today()) booking.status = "Confirmed";
      if (booking.status === "Confirmed" && booking.departure < today()) booking.status = "Completed";
      if (booking.status === "Cancelled") { booking.cancelledAt = clampPast(addDays(booking.createdAt.slice(0, 10), 10)) + "T12:00:00.000Z"; }
      DB.bookings.push(booking);

      const inv = {
        id: "INV-" + String(7100 + i), bcn, bookingId: booking.id, quoteId: quote.id,
        customerId: cust.id, customerName: cust.name,
        lines, total: quote.total, depositDue: quote.depositDue,
        amountPaid: 0, balance: quote.total,
        issued: booking.createdAt.slice(0, 10), dueDate: booking.dueDate,
        terms: booking.paymentStatus === "Paid in full" ? "Paid in full on confirmation (approved exception)" : "Full payment 30 days before arrival",
        status: "Issued", notes: "", seed: true,
      };
      DB.invoices.push(inv);

      /* payments */
      const plan = booking.paymentStatus === "Paid in full" ? [quote.total]
        : booking.paymentStatus === "Deposit paid" ? [quote.depositDue]
        : booking.paymentStatus === "Part paid" ? [Math.round(quote.depositDue * 0.6)]
        : [];
      let paid = 0;
      plan.forEach((amt, k) => {
        const p = {
          id: "PAY-" + uid("R"), invoiceId: inv.id, bcn, customerId: cust.id, customerName: cust.name,
          amount: amt, method: pick(["PayPal", "Stripe card", "Bank transfer", "Virtual account"], i + "" + k),
          reference: "TXN-" + int("t" + i + k, 100000, 999999),
          date: clampPast(addDays(booking.createdAt.slice(0, 10), k * 3)), status: "Cleared",
          recordedBy: "USR-003", seed: true,
        };
        DB.payments.push(p);
        paid += amt;
      });
      inv.amountPaid = paid; inv.balance = Math.max(0, inv.total - paid);
      inv.status = inv.balance === 0 ? "Paid" : paid > 0 ? "Part paid" : "Overdue";
      booking.depositPaid = paid; booking.balance = Math.max(0, booking.total - paid);

      /* itinerary */
      if (booking.status !== "Cancelled" && i % 3 !== 0) {
        const days = [];
        for (let d = 0; d < nights; d++) {
          const date = addDays(start, d);
          const dayLines = d === 0 ? [lines[0]] : [lines[0], extras[int("i" + i + d, 0, extras.length - 1)]];
          days.push({
            date,
            title: d === 0 ? "Arrival & settle in" : d === nights - 1 ? "Slow morning & departure" : "Day " + (d + 1),
            items: dayLines.map((l) => ({ slug: l.slug, name: l.name, qty: 1, unit: l.unit, sell: l.sell, time: d === 0 ? "14:00" : "10:00", note: "" })),
          });
        }
        DB.itineraries.push({
          id: "ITI-" + String(5200 + i), bcn, bookingId: booking.id, quoteId: quote.id,
          customerId: cust.id, customerName: cust.name, title: quote.title,
          arrival: start, departure: end, guests, days,
          status: "Published", version: 1, updatedAt: Date.now(), seed: true,
        });
      }
    }
  }

  /* vacation plans raised by guests / built by staff */
  DB.vacationPlans = DB.quotations.slice(0, 6).map((q, i) => ({
    id: "VPL-" + String(900 + i), customerId: q.customerId, customerName: q.customerName,
    quoteId: q.id, title: q.title, days: q.lines.length, dayPlan: [], status: pick(["Draft", "Shared", "Change requested", "Approved"], i + "v"),
    updatedAt: Date.now() - i * 86400e3, seed: true,
  }));
  DB.meta.schema = SCHEMA;

  Object.assign(DB.settings, { bcnSeq: 48100, invSeq: 7200, quoSeq: 2500, inqSeq: 1100, itiSeq: 5300, cusSeq: 100, prdSeq: DB.products.length + 1, supSeq: DB.suppliers.length + 1, dstSeq: 100, usrSeq: 100, intSeq: 100 });

  DB.auditLogs.push({
    id: "LOG-seed", at: Date.now(), actor: actor?.name || "system", role: actor?.role || "system",
    action: "seed", module: "System", recordId: "-", before: "", after: N + " operational records generated from Product Master",
  });
  save();
  return true;
}

/* ========================= ACCESS CONTROL ========================= */
export const ROLES = {
  super_admin: { label: "Super Admin", home: "/workspace", modules: "*" },
  admin: { label: "Admin", home: "/workspace", modules: ["dashboard", "calendar", "customers", "bookings", "itineraries", "products", "catalogue", "destinations", "suppliers", "quotations", "inquiries", "builder", "cms", "reviews", "reports"] },
  finance: { label: "Finance", home: "/workspace", modules: ["dashboard", "invoices", "payments", "bookings", "reports", "customers", "calendar"] },
  sales: { label: "Sales", home: "/workspace", modules: ["dashboard", "inquiries", "customers", "builder", "quotations", "bookings", "itineraries", "calendar", "products", "destinations", "reports"] },
  supplier: { label: "Supplier", home: "/supplier", modules: ["supplier-portal"] },
  customer: { label: "Customer", home: "/account", modules: ["account"] },
};

const ACTIONS = ["view", "add", "edit", "delete", "approve", "export"];
const DEFAULT_MATRIX = {
  super_admin: { "*": ACTIONS },
  admin: { dashboard: ["view"], "cms-design": ["view"], requests: ACTIONS, emails: ["view", "add", "edit", "export"], inventory: ACTIONS, arrivals: ACTIONS, inhouse: ACTIONS, departures: ACTIONS, calendar: ACTIONS, customers: ACTIONS, bookings: ACTIONS, itineraries: ACTIONS, products: ["view", "add", "edit"], catalogue: ACTIONS, destinations: ACTIONS, suppliers: ["view", "edit"], quotations: ACTIONS, inquiries: ACTIONS, builder: ACTIONS, cms: ACTIONS, reviews: ["view", "edit", "approve"], reports: ["view", "export"], invoices: ["view"], payments: ["view"] },
  finance: { dashboard: ["view"], requests: ["view"], emails: ["view", "add"], inventory: ["view", "export"], arrivals: ["view", "export"], inhouse: ["view", "export"], departures: ["view", "export"], invoices: ACTIONS, payments: ACTIONS, bookings: ["view", "add", "edit", "approve", "export"], reports: ["view", "export"], customers: ["view", "edit"], calendar: ["view"] },
  sales: { dashboard: ["view"], requests: ACTIONS, emails: ["view", "add"], inventory: ["view"], arrivals: ["view", "export"], inhouse: ["view", "export"], departures: ["view", "export"], inquiries: ACTIONS, customers: ACTIONS, builder: ACTIONS, quotations: ACTIONS, bookings: ["view", "add", "edit"], itineraries: ACTIONS, calendar: ACTIONS, products: ["view"], destinations: ["view"], reports: ["view", "export"] },
  supplier: { "supplier-portal": ["view", "edit", "approve"] },
  customer: { account: ACTIONS },
};

export function userOf(email) {
  return DB.users.find((u) => u.email.toLowerCase() === String(email || "").toLowerCase()) || null;
}
export function can(user, action, moduleKey) {
  if (!user) return false;
  /* Website Management menus share the CMS permissions; design & site settings are separate */
  if (typeof moduleKey === "string" && moduleKey.startsWith("wm-")) moduleKey = moduleKey === "wm-design" || moduleKey === "wm-settings" ? "cms-design" : "cms";
  const u = DB.users.find((x) => x.email.toLowerCase() === user.email?.toLowerCase());
  const role = u?.role || user.role;
  if (role === "super_admin") return true;
  const own = u?.permissions || {};
  if (Array.isArray(own[moduleKey]) && own[moduleKey].includes(action)) return true;
  if (own.all) return true;
  const matrix = DEFAULT_MATRIX[role] || {};
  return (matrix[moduleKey] || []).includes(action);
}
export function assertCan(user, action, moduleKey) {
  if (!can(user, action, moduleKey)) throw new PermissionError(`Your role is not permitted to ${action} ${moduleKey}.`);
}
export function moduleKeysFor(user) {
  const role = user?.role;
  if (!role) return [];
  if (role === "super_admin") return Object.keys(ROLES.super_admin.modules === "*" ? {} : {});
  const all = ["dashboard","calendar","reports","inquiries","builder","quotations","bookings","itineraries","customers","invoices","payments","suppliers","products","catalogue","destinations","cms","reviews","users","integrations","audit"];
  return all.filter((k) => can(user, "view", k));
}

/* ============================ AUDIT =============================== */
export function audit(actor, action, moduleKey, recordId, before, after) {
  const entry = {
    id: uid("LOG"), at: Date.now(),
    actor: actor?.name || actor?.email || "system",
    role: actor?.role || "system",
    action, module: moduleKey, recordId: recordId || "-",
    before: typeof before === "object" ? JSON.stringify(before).slice(0, 400) : String(before ?? ""),
    after: typeof after === "object" ? JSON.stringify(after).slice(0, 400) : String(after ?? ""),
  };
  DB.auditLogs.unshift(entry);
  if (DB.auditLogs.length > 800) DB.auditLogs.length = 800;
  /* protected security log — records changes made TO audit records */
  if (action === "audit-edit" || action === "audit-delete") {
    DB.settings.securityLog.unshift({ ...entry, id: uid("SEC") });
  }
  return entry;
}

/* ===================== GENERIC DATA ACCESS ======================== */
export const db = () => DB;
export const collection = (key) => DB[key] || [];

export function nextNumber(prefix, key, pad = 4) {
  const n = DB.settings[key] || 1;
  DB.settings[key] = n + 1;
  return prefix + String(n).padStart(pad, "0");
}

export function insert(coll, data, actor, opts = {}) {
  assertCan(actor, "add", opts.module || coll);
  const rec = { id: data.id || uid(coll.slice(0, 3).toUpperCase()), ...data };
  runHooks(hooks.before, coll, null, rec, actor);
  DB[coll].unshift(rec);
  audit(actor, "add", opts.module || coll, rec.id, null, rec);
  runHooks(hooks.after, coll, null, rec, actor);
  notify("insert:" + coll);
  return rec;
}
export function update(coll, id, patch, actor, opts = {}) {
  assertCan(actor, "edit", opts.module || coll);
  const i = DB[coll].findIndex((r) => r.id === id);
  if (i < 0) return null;
  const before = { ...DB[coll][i] };
  const next = { ...before, ...patch };
  runHooks(hooks.before, coll, before, next, actor);
  DB[coll][i] = next;
  audit(actor, "edit", opts.module || coll, id, before, DB[coll][i]);
  runHooks(hooks.after, coll, before, next, actor);
  notify("update:" + coll);
  return DB[coll][i];
}
export function remove(coll, id, actor, opts = {}) {
  assertCan(actor, "delete", opts.module || coll);
  const i = DB[coll].findIndex((r) => r.id === id);
  if (i < 0) return null;
  const before = DB[coll][i];
  runHooks(hooks.before, coll, before, null, actor);
  DB[coll].splice(i, 1);
  audit(actor, "delete", opts.module || coll, id, before, null);
  runHooks(hooks.after, coll, before, null, actor);
  notify("delete:" + coll);
  return before;
}

/* CMS is a single settings object rather than a collection, so it has
   its own publisher. */
export function publishCMS(patch, actor) {
  assertCan(actor, "edit", "cms");
  const before = { ...DB.cms };
  DB.cms = { ...DB.cms, ...patch };
  /* keep the editors' draft in step with direct publishes */
  DB.cmsDraft = { ...(DB.cmsDraft || JSON.parse(JSON.stringify(before))), ...JSON.parse(JSON.stringify(patch)) };
  audit(actor, "publish", "cms", "website", before, DB.cms);
  notify("publish:cms");
  return DB.cms;
}

/* ==================== PRODUCT MASTER SYNCHRONISATION ============== */
/* Customer website reads products through here, so an edit in Product
   Master is live on the site without a rebuild.                      */
export function productOf(slug) {
  return DB.products.find((p) => p.slug === slug) || null;
}
export function siteView(p) {
  if (!p) return p;
  return {
    ...p,
    price: p.sellingRate,
    nett: p.netRate,
    margin: Math.round(p.sellingRate - p.netRate),
    sub: p.subcategory,
    region: p.destination,
    desc: p.description ?? p.desc,
    priceOnRequest: !!p.priceOnRequest && !(Number(p.sellingRate) > 0),
    category: p.category || SITE_CATEGORY[p.categoryId] || "Experience",
    img: p.images?.[0]?.url || p.img || "",
    supplier: p.supplier,
  };
}
function decorate(view, master) {
  let v = view;
  siteDecorators.forEach((d) => { v = d(v, master) || v; });
  return v;
}
export function syncOne(p) {
  if (!p) return p;
  const m = productOf(p.slug);
  if (!m) return p;
  if (m.status !== "live" || m.published === false) return { ...siteView(m), _hidden: true };
  return decorate(siteView(m), m);
}
export function syncAll(list) {
  const base = list.map(syncOne).filter((p) => p && !p._hidden);
  /* products created in Product Master (not part of the original site
     catalogue) are published too once live, published and priced */
  const known = new Set(list.map((p) => p.slug));
  const added = DB.products
    .filter((p) => !known.has(p.slug) && p.status === "live" && p.published !== false && (Number(p.sellingRate) > 0 || p.priceOnRequest) && p.verification !== "pending")
    .map((p) => decorate(siteView(p), p));
  return [...base, ...added];
}
const published = [];
export function registerPublished(base) {
  const arr = syncAll(base);
  published.push({ arr, base });
  return arr;
}
function republish() {
  published.forEach(({ arr, base }) => {
    arr.splice(0, arr.length, ...syncAll(base));
  });
}
export function onSiteSync(fn) {
  return subscribe(fn);
}

/* ===================== PRICING & QUOTE MATH ======================= */
export function lineTotals(line) {
  const p = productOf(line.slug);
  const sell = Number(line.sell ?? p?.sellingRate ?? 0);
  const net = Number(line.net ?? p?.netRate ?? 0);
  const qty = Number(line.qty || 1);
  return { sell: sell * qty, net: net * qty, margin: (sell - net) * qty, qty, unit: sell, unitNet: net };
}
export function quoteTotals(q) {
  const lines = (q.lines || []).map((l) => ({ ...l, ...lineTotals({ ...l, slug: l.slug, qty: l.qty }) }));
  const net = lines.reduce((s, l) => s + l.net, 0);
  const sell = lines.reduce((s, l) => s + l.sell, 0);
  const discount = Math.round((sell * (Number(q.discountPct) || 0)) / 100);
  const taxable = sell - discount;
  const tax = Math.round((taxable * (Number(q.taxPct ?? DB.settings.taxRate))) / 100);
  return { lines, net, sell, discount, taxable, tax, total: taxable + tax, margin: sell - discount - net };
}

/* ==================== CANCELLATION ENGINE ========================= */
export function cancellationQuote(booking, asOf = today()) {
  const rules = DB.settings.cancellationRules;
  const dToArrival = daysBetween(asOf, booking.arrival);
  const dFromConfirm = daysBetween((booking.createdAt || "").slice(0, 10) || asOf, asOf);
  const applicable = rules.filter((r) =>
    r.basis === "confirmation" ? dFromConfirm <= r.max : dToArrival >= r.min && dToArrival <= r.max
  );
  let best = null;
  applicable.forEach((r) => {
    const amount = r.unit === "night" ? oneNight(booking) : Math.round((booking.total * r.charge) / 100);
    if (!best || amount > best.amount) best = { rule: r, amount };
  });
  const refundable = Math.max(0, (booking.depositPaid || 0) - (best?.amount || 0));
  return { daysToArrival: dToArrival, daysSinceConfirmation: dFromConfirm, rule: best?.rule || null, charge: best?.amount || 0, refundable };
}
function oneNight(booking) {
  const first = (booking.lines || []).find((l) => productOf(l.slug)?.unit === "night") || (booking.lines || [])[0];
  if (!first) return 0;
  return lineTotals({ ...first, qty: 1 }).sell;
}

/* ======================= ANALYTICS / REPORTS ====================== */
const inRange = (iso, from, to) => (!from || iso >= from) && (!to || iso <= to);

export function analytics({ from, to } = {}) {
  const bookings = DB.bookings.filter((b) => inRange((b.createdAt || "").slice(0, 10), from, to));
  const inquiries = DB.inquiries.filter((i) => inRange((i.createdAt || "").slice(0, 10), from, to));
  const active = bookings.filter((b) => b.status !== "Cancelled");
  const payments = DB.payments.filter((p) => inRange(p.date, from, to));
  const L = salesLedger({ from, to });
  const revenue = L.totals.collected;
  const gross = L.totals.revenue;
  const outstanding = L.totals.outstanding;
  const net = L.totals.profit;
  const converted = inquiries.filter((i) => i.status === "Converted").length;
  const cancelled = bookings.filter((b) => b.status === "Cancelled");
  return {
    inquiries: inquiries.length,
    quotations: DB.quotations.filter((q) => inRange((q.createdAt || "").slice(0, 10), from, to)).length,
    bookings: bookings.length, activeBookings: active.length,
    revenue, gross, outstanding, net, marginPct: gross ? Math.round((net / gross) * 100) : 0,
    customers: DB.customers.length, suppliers: DB.suppliers.length, products: DB.products.length,
    confirmed: bookings.filter((b) => b.status === "Confirmed").length,
    completed: bookings.filter((b) => b.status === "Completed").length,
    cancelled: cancelled.length,
    cancelRate: bookings.length ? Math.round((cancelled.length / bookings.length) * 100) : 0,
    conversionPct: inquiries.length ? Math.round((converted / inquiries.length) * 100) : 0,
    aov: active.length ? Math.round(gross / active.length) : 0,
    paymentsCount: payments.length,
  };
}

export function monthlySeries(months = 12) {
  const out = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = ym(d);
    const rev = DB.payments.filter((p) => (p.date || "").slice(0, 7) === key).reduce((s, p) => s + p.amount, 0);
    const bk = DB.bookings.filter((b) => (b.createdAt || "").slice(0, 7) === key);
    out.push({
      key, label: d.toLocaleDateString("en-GB", { month: "short" }) + " " + String(d.getFullYear()).slice(2),
      revenue: rev,
      bookings: bk.length,
      inquiries: DB.inquiries.filter((x) => (x.createdAt || "").slice(0, 7) === key).length,
      margin: bk.filter((b) => b.status !== "Cancelled").reduce((s, b) => s + (b.lines || []).reduce((t, l) => t + lineTotals(l).margin, 0), 0),
    });
  }
  return out;
}

export function groupReport(list, keyFn, valueFn) {
  const map = new Map();
  list.forEach((x) => {
    const k = keyFn(x) || "—";
    const cur = map.get(k) || { key: k, count: 0, value: 0 };
    cur.count++; cur.value += valueFn(x);
    map.set(k, cur);
  });
  return [...map.values()].sort((a, b) => b.value - a.value);
}

load();


/* ==================================================================
   PERIODS — one definition used by every report, chart and filter
   ================================================================== */
const iso = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
const D0 = (s) => new Date(s + "T00:00:00");
export const startOfWeek = (s) => { const d = D0(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const endOfMonth = (y, m) => iso(new Date(y, m + 1, 0));

export function periodOf(p = {}) {
  const mode = p.mode || "month";
  const a = p.anchor || today();
  const d = D0(a);
  const y = d.getFullYear(), m = d.getMonth();
  let from, to, prev, label, gran;
  switch (mode) {
    case "day":
      from = to = a; prev = { from: addDays(a, -1), to: addDays(a, -1) };
      label = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" }); gran = "day"; break;
    case "week":
      from = startOfWeek(a); to = addDays(from, 6); prev = { from: addDays(from, -7), to: addDays(from, -1) };
      label = "Week of " + fmtDate(from); gran = "day"; break;
    case "quarter": {
      const q = Math.floor(m / 3);
      from = iso(new Date(y, q * 3, 1)); to = endOfMonth(y, q * 3 + 2);
      prev = { from: iso(new Date(y, q * 3 - 3, 1)), to: endOfMonth(y, q * 3 - 1) };
      label = "Q" + (q + 1) + " " + y; gran = "month"; break;
    }
    case "year":
      from = y + "-01-01"; to = y + "-12-31"; prev = { from: y - 1 + "-01-01", to: y - 1 + "-12-31" };
      label = String(y); gran = "month"; break;
    case "custom": {
      from = p.from || addDays(today(), -30); to = p.to || today();
      const len = Math.max(1, daysBetween(from, to) + 1);
      prev = { from: addDays(from, -len), to: addDays(from, -1) };
      label = fmtDate(from) + " – " + fmtDate(to); gran = len > 62 ? "month" : "day"; break;
    }
    case "all":
      from = null; to = null; prev = { from: null, to: null }; label = "All time"; gran = "month"; break;
    default:
      from = iso(new Date(y, m, 1)); to = endOfMonth(y, m);
      prev = { from: iso(new Date(y, m - 1, 1)), to: endOfMonth(y, m - 1) };
      label = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }); gran = "day";
  }
  return { mode, anchor: a, from, to, prev, label, gran };
}

/* ==================================================================
   SALES LEDGER — transaction-level, the single source for every
   revenue figure (dashboard, charts, sales report, analytics).
   Rules:
     · revenue is recognised per booked line, on the confirmation date
     · inquiries and unapproved quotations never count (no booking)
     · cancelled bookings contribute only their cancellation charge
     · booking discounts are allocated across lines
     · tax is excluded from revenue and shown separately
     · cash collected = cleared payments − refunds, by payment date
   ================================================================== */
export function salesLedger({ from, to } = {}) {
  const inR = (d) => (!from || d >= from) && (!to || d <= to);
  const rows = [];
  const catName = (id) => DB.categories.find((c) => c.id === id)?.name || "—";
  DB.bookings.forEach((b) => {
    const inv = DB.invoices.find((i) => i.bookingId === b.id);
    const base = { bookingId: b.id, bcn: b.bcn, invoiceId: inv?.id || "", customerId: b.customerId, customerName: b.customerName, guests: Number(b.guests) || 0, status: b.status };
    if (b.status === "Cancelled") {
      const d = (b.cancelledAt || b.createdAt || "").slice(0, 10);
      const charge = Number(b.cancellationCharge) || 0;
      if (charge > 0 && inR(d))
        rows.push({ ...base, id: b.id + ":cxl", type: "Cancellation charge", date: d, product: "Cancellation charge · " + (b.cancellationRule || "policy"), slug: "", categoryId: "", category: "Cancellation", supplier: "—", destination: "—", qty: 1, sellRate: charge, netRate: 0, gross: charge, discount: 0, revenue: charge, net: 0, profit: charge });
      return;
    }
    const d = (b.createdAt || "").slice(0, 10);
    if (!inR(d)) return;
    const disc = Number(b.discountPct) || 0;
    (b.lines || []).forEach((l, i) => {
      const p = productOf(l.slug);
      const qty = Number(l.qty) || 1;
      const sellRate = Number(l.sell ?? p?.sellingRate ?? 0);
      const netRate = Number(l.net ?? p?.netRate ?? 0);
      const gross = sellRate * qty;
      const discount = Math.round((gross * disc) / 100);
      const revenue = gross - discount;
      const net = netRate * qty;
      const categoryId = p?.categoryId || l.categoryId || "";
      rows.push({ ...base, id: b.id + ":" + i, type: "Sale", date: d, product: l.name, slug: l.slug, categoryId, category: catName(categoryId), supplier: p?.supplier || "—", destination: p?.destination || "—", qty, sellRate, netRate, gross, discount, revenue, net, profit: revenue - net });
    });
  });
  rows.sort((a, b) => (a.date === b.date ? String(a.bcn).localeCompare(String(b.bcn)) : a.date < b.date ? 1 : -1));

  const payments = DB.payments.filter((p) => inR(p.date || ""));
  const cleared = payments.filter((p) => p.status === "Cleared").reduce((s, p) => s + Number(p.amount || 0), 0);
  const refunds = payments.filter((p) => p.status === "Refunded").reduce((s, p) => s + Number(p.amount || 0), 0);
  const bookingIds = [...new Set(rows.filter((r) => r.type === "Sale").map((r) => r.bookingId))];
  const bookings = bookingIds.map((id) => DB.bookings.find((b) => b.id === id)).filter(Boolean);
  const outstanding = bookings.reduce((s, b) => s + Number(DB.invoices.find((i) => i.bookingId === b.id)?.balance ?? b.balance ?? 0), 0);
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const net = rows.reduce((s, r) => s + r.net, 0);
  const profit = revenue - net;
  return {
    rows, payments,
    totals: {
      revenue, net, profit,
      marginPct: revenue ? Math.round((profit / revenue) * 1000) / 10 : 0,
      discount: rows.reduce((s, r) => s + r.discount, 0),
      bookings: bookingIds.length,
      guests: bookings.reduce((s, b) => s + (Number(b.guests) || 0), 0),
      bookedValue: bookings.reduce((s, b) => s + Number(b.total || 0), 0),
      collected: cleared - refunds, refunds, outstanding,
      cancellationCharges: rows.filter((r) => r.type === "Cancellation charge").reduce((s, r) => s + r.revenue, 0),
    },
  };
}

const bucketOf = (d, gran) =>
  gran === "day" ? d : gran === "week" ? startOfWeek(d) : gran === "quarter" ? d.slice(0, 4) + "-Q" + (Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1) : gran === "year" ? d.slice(0, 4) : d.slice(0, 7);
const bucketLabel = (k, gran) => {
  if (gran === "day" || gran === "week") return D0(k).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (gran === "month") return D0(k + "-01").toLocaleDateString("en-GB", { month: "short" }) + " " + k.slice(2, 4);
  return k;
};

/* chart series built from the same ledger as the tables */
export function salesSeries(gran, from, to) {
  const L = salesLedger({ from, to });
  const allDates = [...L.rows.map((r) => r.date), ...L.payments.map((p) => p.date)].filter(Boolean).sort();
  const start = from || allDates[0] || today();
  const end = to || allDates[allDates.length - 1] || today();
  const keys = [];
  for (let d = start, guard = 0; d <= end && guard < 800; guard++) {
    const k = bucketOf(d, gran);
    if (!keys.includes(k)) keys.push(k);
    d = gran === "day" ? addDays(d, 1) : gran === "week" ? addDays(d, 7) : addDays(d, 28);
  }
  const lastKey = bucketOf(end, gran);
  if (!keys.includes(lastKey)) keys.push(lastKey);
  return keys.map((k) => {
    const rows = L.rows.filter((r) => bucketOf(r.date, gran) === k);
    const pays = L.payments.filter((p) => bucketOf(p.date, gran) === k);
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    const net = rows.reduce((s, r) => s + r.net, 0);
    return {
      key: k, label: bucketLabel(k, gran), gran,
      revenue, net, profit: revenue - net,
      bookings: new Set(rows.filter((r) => r.type === "Sale").map((r) => r.bookingId)).size,
      collected: pays.filter((p) => p.status === "Cleared").reduce((s, p) => s + p.amount, 0) - pays.filter((p) => p.status === "Refunded").reduce((s, p) => s + p.amount, 0),
    };
  });
}
/* period that a chart bucket represents — used for drill-down */
export function periodForBucket(key, gran) {
  if (gran === "day") return { mode: "day", anchor: key };
  if (gran === "week") return { mode: "week", anchor: key };
  if (gran === "quarter") { const [y, q] = key.split("-Q"); return { mode: "quarter", anchor: iso(new Date(Number(y), (Number(q) - 1) * 3, 1)) }; }
  if (gran === "year") return { mode: "year", anchor: key + "-01-01" };
  return { mode: "month", anchor: key + "-01" };
}

/* ==================================================================
   GUEST MOVEMENTS — arrivals, in-house and departures from the same
   booking records the Booking Calendar uses. Stay dates drive it:
     arrival day   → Arrivals
     nights between → In-House
     check-out day → Departures
   Only confirmed operational stays appear: cancelled bookings and
   bookings with no payment received are held back.
   ================================================================== */
export function isOperational(b) {
  return (b.status === "Confirmed" || b.status === "Completed") && b.paymentStatus !== "Unpaid";
}
export function heldBackReason(b) {
  if (b.status === "Cancelled") return "Cancelled";
  if (b.paymentStatus === "Unpaid") return "No payment received";
  if (b.status !== "Confirmed" && b.status !== "Completed") return "Not confirmed";
  return "";
}
export function guestMovements(date) {
  const ops = DB.bookings.filter(isOperational);
  return {
    arrivals: ops.filter((b) => b.arrival === date),
    inHouse: ops.filter((b) => b.arrival < date && date < b.departure),
    departures: ops.filter((b) => b.departure === date),
    heldBack: DB.bookings.filter((b) => !isOperational(b) && b.arrival <= date && date <= b.departure),
  };
}
export function movementCounts(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const m = guestMovements(d);
    out.push({ date: d, arrivals: m.arrivals.length, inHouse: m.inHouse.length, departures: m.departures.length, heldBack: m.heldBack.length,
      pax: m.arrivals.reduce((s, b) => s + (Number(b.guests) || 0), 0) });
  }
  return out;
}
/* everything an operations list needs about one booking */
export function bookingOps(b, date) {
  const lines = (b.lines || []).map((l) => ({ ...l, product: productOf(l.slug) }));
  const cat = (l) => l.product?.categoryId || l.categoryId;
  const accom = lines.filter((l) => cat(l) === "accommodation");
  const transport = lines.filter((l) => cat(l) === "transportation");
  const services = lines.filter((l) => cat(l) !== "accommodation" && cat(l) !== "transportation");
  const customer = DB.customers.find((c) => c.id === b.customerId);
  const itinerary = DB.itineraries.find((i) => i.bookingId === b.id);
  const nights = b.nights || daysBetween(b.arrival, b.departure);
  const night = date ? daysBetween(b.arrival, date) + 1 : null;
  const dayPlan = date && itinerary ? (itinerary.days || []).find((d) => d.date === date) : null;
  return {
    accommodation: accom.map((l) => l.name).join(", ") || (lines[0]?.name ?? "—"),
    accomLines: accom, transport, services, customer, itinerary,
    invoice: DB.invoices.find((i) => i.bookingId === b.id),
    nights, night, remaining: date ? Math.max(0, daysBetween(date, b.departure)) : null,
    adults: b.adults ?? b.guests, children: b.children ?? 0,
    todaysPlan: dayPlan ? (dayPlan.items || []).map((i) => (i.time ? i.time + " " : "") + i.name) : [],
  };
}

/* ==================================================================
   WEBSITE IDS — globally unique references for anything created on
   the public website (each visitor's browser counts independently,
   so sequential numbers would collide between guests).
   ================================================================== */
const B32 = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export function webId(prefix) {
  const d = new Date();
  const yymm = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, "0");
  let r = "";
  const buf = new Uint8Array(5);
  (globalThis.crypto && globalThis.crypto.getRandomValues ? globalThis.crypto.getRandomValues(buf) : buf.forEach((_, i) => (buf[i] = Math.floor(Math.random() * 256))));
  buf.forEach((b) => (r += B32[b % B32.length]));
  return prefix + "-" + yymm + "-" + r;
}

/* ==================================================================
   CUSTOMER ACCOUNTS — unlimited self-registered guest accounts.
   Passwords are never stored: PBKDF2-SHA256 (120k rounds) + salt.
   ================================================================== */
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function derive(password, saltHex) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 120000 }, key, 256));
}
const accounts = () => (Array.isArray(DB.accounts) ? DB.accounts : (DB.accounts = []));
export const accountByEmail = (email) => accounts().find((a) => a.email === String(email || "").trim().toLowerCase()) || null;
export function accountUser(email) {
  const a = accountByEmail(email);
  return a ? { email: a.email, name: a.name, role: "customer", label: "Customer", customerId: a.customerId } : null;
}
export async function registerAccount({ name, email, password, phone, country }) {
  const em = String(email || "").trim().toLowerCase();
  if (!String(name || "").trim()) throw new Error("Please enter your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) throw new Error("Please enter a valid email address.");
  if (String(password || "").length < 8) throw new Error("Choose a password of at least 8 characters.");
  if (accountByEmail(em)) throw new Error("An account with this email already exists — please sign in.");
  if (DB.users.some((u) => u.email.toLowerCase() === em)) throw new Error("This email belongs to a staff account — staff sign in from the Admin page.");
  const saltBuf = new Uint8Array(16);
  crypto.getRandomValues(saltBuf);
  const salt = hex(saltBuf);
  const hash = await derive(password, salt);
  let cust = DB.customers.find((c) => (c.email || "").toLowerCase() === em);
  if (!cust) {
    cust = { id: webId("CUS"), name: String(name).trim(), email: em, phone: phone || "", whatsapp: phone || "", country: country || "", nationality: "", address: "", status: "New", notes: "", tags: ["website account"], createdAt: Date.now() };
    DB.customers.unshift(cust);
  }
  accounts().push({ email: em, name: String(name).trim(), salt, hash, customerId: cust.id, createdAt: Date.now(), lastLogin: Date.now() });
  audit({ name: String(name).trim(), role: "customer" }, "register", "account", em, null, { customerId: cust.id });
  notify("account");
  return accountUser(em);
}
export async function verifyAccount(email, password) {
  const a = accountByEmail(email);
  if (!a) throw new Error("No account found for this email — create one below.");
  const hash = await derive(String(password || ""), a.salt);
  if (hash !== a.hash) throw new Error("Incorrect password.");
  a.lastLogin = Date.now();
  notify("account");
  return accountUser(a.email);
}
