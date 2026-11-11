/* ==================================================================
   OPERATIONS SHELL — sidebar, top bar, module router
   Rendered inside the customer site's providers, so there is one
   login, one session and one database for the whole company.
   ================================================================== */
import * as React from "react";
import * as jsxrt from "react/jsx-runtime";
import * as D from "./db.js";
import * as U from "./ui.js";
import { bridge, drill, clearDrill } from "./bridge.js";
import { GuestMovements } from "./modules4.js";
import { InventoryOverview } from "./inventoryUI.js";
import { VacationRequests, EmailCenter } from "./requestsUI.js";
import { CustomerAuth, ImportInquiry } from "./portalAuth.js";
import { WebsiteManagement, WM_MENU } from "./cmsAdmin.js";
import { Dashboard, BookingCalendar, Reports } from "./modules1.js";
import { Inquiries, VacationBuilder, Quotations, Bookings, Itineraries, Customers, Invoices } from "./modules2.js";
import { ProductMaster, Catalogue, Suppliers, Destinations, CMS, Reviews, Users, Integrations, AuditLog, SupplierPortal, CustomerAccount } from "./modules3.js";

const g = jsxrt;
const We = React;
const { useState, useEffect } = React;

export const MENU = [
  { key: "dashboard", label: "Dashboard", group: "Overview" },
  { key: "arrivals", label: "Arrival lists", group: "Overview" },
  { key: "inhouse", label: "In-house guests", group: "Overview" },
  { key: "departures", label: "Departure lists", group: "Overview" },
  { key: "calendar", label: "Booking calendar", group: "Overview" },
  { key: "reports", label: "Reports & analytics", group: "Overview" },
  { key: "requests", label: "Itinerary inquiries", group: "Sales" },
  { key: "inquiries", label: "Inquiries", group: "Sales" },
  { key: "builder", label: "Vacation builder", group: "Sales" },
  { key: "quotations", label: "Quotations", group: "Sales" },
  { key: "bookings", label: "Confirmed bookings", group: "Sales" },
  { key: "itineraries", label: "Itinerary management", group: "Sales" },
  { key: "customers", label: "Customers", group: "Relationships" },
  { key: "invoices", label: "Invoices & payments", group: "Finance" },
  { key: "suppliers", label: "Suppliers", group: "Master data" },
  { key: "products", label: "Product master", group: "Master data" },
  { key: "inventory", label: "Inventory & availability", group: "Master data" },
  { key: "catalogue", label: "Catalogue & categories", group: "Master data" },
  { key: "destinations", label: "Destinations", group: "Master data" },
  { key: "reviews", label: "Google reviews", group: "Communication" },
  { key: "emails", label: "Email & notifications", group: "Communication" },
  { key: "users", label: "Users & permissions", group: "Administration" },
  { key: "integrations", label: "API integrations", group: "Administration" },
  { key: "audit", label: "Audit log", group: "Administration" },
  ...WM_MENU.map(([key, label]) => ({ key, label, group: "Website Management" })),
  { key: "wm-builder-config", label: "Vacation builder settings", group: "Website Management" },
];

const Arrivals = (p) => g.jsx(GuestMovements, { ...p, view: "arrivals" });
const InHouse = (p) => g.jsx(GuestMovements, { ...p, view: "inhouse" });
const Departures = (p) => g.jsx(GuestMovements, { ...p, view: "departures" });

const WM = (key) => (p) => g.jsx(WebsiteManagement, { ...p, section: key });
const RENDERERS = {
  ...Object.fromEntries([...WM_MENU.map(([k]) => k), "wm-builder-config"].map((k) => [k, WM(k)])),
  inventory: InventoryOverview, requests: VacationRequests, emails: EmailCenter,
  dashboard: Dashboard, arrivals: Arrivals, inhouse: InHouse, departures: Departures, calendar: BookingCalendar, reports: Reports,
  inquiries: Inquiries, builder: VacationBuilder, quotations: Quotations,
  bookings: Bookings, itineraries: Itineraries, customers: Customers,
  invoices: Invoices, suppliers: Suppliers, products: ProductMaster,
  catalogue: Catalogue, destinations: Destinations, cms: WM("wm-overview"),
  reviews: Reviews, users: Users, integrations: Integrations, audit: AuditLog,
};

export function OpsApp({ mode }) {
  const auth = bridge.useAuth();
  const user = auth.user;
  const path = usePath();
  const sub = mode === "workspace" ? path.replace(/^\/workspace\/?/, "") : mode;
  const [navOpen, setNavOpen] = useState(false);

  /* Supplier and customer roles get their own console, never the back office. */
  const role = user?.role;
  const effectiveMode = role === "supplier" ? "supplier-portal" : role === "customer" ? "account" : sub || "dashboard";

  if (!user) return mode === "account" ? g.jsx(CustomerAuth, {}) : g.jsx(SignInPrompt, {});
  if (role === "supplier") return g.jsx(OpsFrame, { user, auth, navOpen, setNavOpen, mode: "supplier-portal", sub: "supplier-portal" });
  if (role === "customer") return g.jsx(OpsFrame, { user, auth, navOpen, setNavOpen, mode: "account", sub: "account" });

  const allowed = MENU.filter((m) => D.can(user, "view", m.key));
  if (/^import(\?|$)/.test(sub || "")) return g.jsx(OpsFrame, { user, auth, navOpen, setNavOpen, mode: "import", sub, allowed, activeKey: "import" });
  const activeKey = RENDERERS[effectiveMode] ? effectiveMode : "dashboard";

  return g.jsx(OpsFrame, { user, auth, navOpen, setNavOpen, mode: effectiveMode, sub, allowed, activeKey });
}

function usePath() {
  const [p, setP] = useState(() => currentPath());
  useEffect(() => {
    const h = () => setP(currentPath());
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  return p;
}
function currentPath() {
  const h = window.location.hash.replace(/^#/, "");
  return h || "/";
}

function OpsFrame({ user, auth, navOpen, setNavOpen, mode, sub, allowed, activeKey }) {
  const data = U.useDB();
  const items = mode === "supplier-portal" || mode === "account"
    ? []
    : (allowed || MENU).filter((m) => D.can(user, "view", m.key));
  const groups = [...new Set(MENU.filter((m) => items.some((i) => i.key === m.key)).map((m) => m.group))];
  const [drillSeq, setDrillSeq] = useState(drill.seq);
  useEffect(() => { drill.listeners.add(setDrillSeq); return () => drill.listeners.delete(setDrillSeq); }, []);
  const portal = mode === "supplier-portal" ? SupplierPortal : mode === "account" ? CustomerAccount : mode === "import" ? ImportInquiry : null;
  const allowedHere = portal || (RENDERERS[mode] && D.can(user, "view", mode));
  const Renderer = portal || (allowedHere ? RENDERERS[mode] : Dashboard);
  const params = drill.module === mode ? drill.params : {};



  return g.jsxs("div", { className: "grain min-h-screen bg-[#0b1412] lg:flex", children: [
      g.jsxs("aside", { className: U.cx("fixed inset-y-0 left-0 z-50 flex w-[268px] shrink-0 flex-col overflow-y-auto border-r border-line bg-[#0a120f] px-5 py-6 transition-transform duration-300 lg:sticky lg:top-0 lg:bottom-auto lg:z-30 lg:h-screen lg:translate-x-0", navOpen ? "translate-x-0" : "-translate-x-full"), children: [
          g.jsx(bridge.Link, { to: "/", className: "block", children: g.jsx(bridge.Logo, {}) }),
          g.jsxs("div", { className: "mt-6 border border-line px-3 py-3", children: [
              g.jsx("p", { className: "text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-soft", children: D.ROLES[user.role]?.label || user.role }),
              g.jsx("p", { className: "mt-1 text-[13px] font-medium text-ivory", children: user.name }),
              g.jsx("p", { className: "text-[11px] text-ivory/45", children: user.email }),
            ] }),
          g.jsxs("nav", { className: "mt-6 mb-8 space-y-5", children: [
              groups.map((grp) => g.jsxs("div", { children: [
                  g.jsx("p", { className: "mb-2 text-[9px] font-semibold uppercase tracking-[0.22em] text-ivory/35", children: grp }),
                  g.jsx("ul", { className: "space-y-0.5", children: items.filter((i) => MENU.find((m) => m.key === i.key)?.group === grp).map((i) => {
                      const label = MENU.find((m) => m.key === i.key)?.label || i.label;
                      const isActive = i.key === mode;
                      return g.jsxs(bridge.Link, { to: bridge.paths.workspace + "/" + i.key, onClick: () => { clearDrill(); setNavOpen(false); }, className: U.cx("flex items-center justify-between border-l-2 px-3 py-2 text-[12.5px] transition-colors",
                          isActive ? "border-gold bg-ivory/[0.06] text-gold-soft" : "border-transparent text-ivory/65 hover:border-ivory/25 hover:text-ivory"), children: [
                          label,
                          i.key === "invoices" && data.invoices.some((v) => v.balance > 0 && v.dueDate < D.today()) && g.jsx("span", { className: "h-1.5 w-1.5 rounded-full bg-rose-400" }),
                        ] }, i.key);
                    }) }),
                ] }, grp)),
              mode === "account" && g.jsxs("div", { children: [
                  g.jsx("p", { className: "mb-2 text-[9px] font-semibold uppercase tracking-[0.22em] text-ivory/35", children: "Guest portal" }),
                  g.jsx("p", { className: "px-3 text-[12.5px] text-gold-soft", children: "My journeys" }),
                ] }),
            ] }),
          g.jsxs("div", { className: "mt-auto space-y-2 border-t border-line pt-5", children: [
              g.jsx("button", { onClick: () => bridge.navigate("/"), className: "block w-full px-3 py-2 text-left text-[12px] text-ivory/60 hover:text-ivory", children: "← Back to website" }),
              g.jsx("button", { onClick: auth.logout, className: "block w-full px-3 py-2 text-left text-[12px] text-ivory/60 hover:text-ivory", children: "Sign out" }),
            ] }),
        ] }),
      navOpen && g.jsx("div", { className: "fixed inset-0 z-40 bg-ink/70 lg:hidden", onClick: () => setNavOpen(false) }),
      g.jsxs("div", { className: "min-w-0 flex-1", children: [
          g.jsxs("header", { className: "sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-[#0b1412]/95 px-5 py-3.5 backdrop-blur", children: [
              g.jsxs("div", { className: "flex items-center gap-3", children: [
                  g.jsx("button", { onClick: () => setNavOpen(!navOpen), className: "border border-ivory/25 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-ivory/75 lg:hidden", children: "Menu" }),
                  g.jsx("h1", { className: "font-display text-[15px] font-semibold text-ivory", children: mode === "supplier-portal" ? "Supplier portal" : mode === "account" ? "Guest portal" : MENU.find((m) => m.key === mode)?.label || "Operations" }),
                ] }),
              g.jsxs("div", { className: "flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-ivory/45", children: [
                  g.jsxs("span", { children: ["Central database · ", data.products.length, " products"] }),
                  g.jsx("span", { className: "hidden sm:inline", children: "Synced with website" }),
                  g.jsx("span", { className: "h-1.5 w-1.5 rounded-full bg-emerald-400" }),
                ] }),
            ] }),
          g.jsx(ErrorToast, {}),
          g.jsx("main", { className: "px-5 py-6 md:px-8 md:py-8", children: [
              !allowedHere && RENDERERS[mode] && g.jsx("p", { className: "mb-5 border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200", children: "Your role does not include this module — showing the dashboard instead." }, "deny"),
              g.jsx(Renderer, { user, params }, mode + ":" + drillSeq),
            ] }),
        ] }),
    ] });
}

/* Writes refused by the data layer (inventory or permission rules)
   surface here, whatever screen triggered them. */
function ErrorToast() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    const h = (ev) => {
      const e = ev.error || ev.reason;
      if (e && (e.name === "InventoryError" || e instanceof D.PermissionError)) { ev.preventDefault?.(); setMsg({ title: e.name === "InventoryError" ? "Not enough inventory" : "Not permitted", text: e.message }); }
    };
    window.addEventListener("error", h);
    window.addEventListener("unhandledrejection", h);
    return () => { window.removeEventListener("error", h); window.removeEventListener("unhandledrejection", h); };
  }, []);
  if (!msg) return null;
  return g.jsx(U.Modal, { open: true, onClose: () => setMsg(null), title: msg.title, footer: [g.jsx(U.Btn, { variant: "solid", onClick: () => setMsg(null), children: "Understood" }, "ok")],
    children: g.jsx("p", { className: "whitespace-pre-line text-[14px] leading-relaxed text-ivory/80", children: msg.text }) });
}

function SignInPrompt() {
  return g.jsx("div", { className: "grain flex min-h-screen flex-col items-center justify-center bg-[#0b1412] px-6 text-center", children: [
      g.jsx(bridge.Logo, {}),
      g.jsx("h2", { className: "font-display mt-8 text-3xl font-semibold text-ivory", children: "This desk is for the house." }),
      g.jsx("p", { className: "mt-3 max-w-md text-[14px] leading-relaxed text-ivory/60", children: "Sign in with your Prestige account to open the operations console. Guests and suppliers each have their own portal." }),
      g.jsx("div", { className: "mt-8 flex gap-3", children: [
          g.jsx("button", { onClick: () => bridge.navigate("/login"), className: "rounded-full border border-gold bg-gold px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink", children: "Sign in" }),
          g.jsx("button", { onClick: () => bridge.navigate("/"), className: "rounded-full border border-ivory/30 px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-ivory/80", children: "Back to the website" }),
        ] }),
    ] });
}
