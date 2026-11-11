/* ==================================================================
   OPERATIONS BRIDGE
   Lets the backend modules use the customer site's session, cart and
   router so there is exactly one login, one router and one database.
   ================================================================== */
import * as jsxrt from "react/jsx-runtime";

export const bridge = {
  Link: ({ to, className, children, onClick }) =>
    jsxrt.jsx("a", { href: "#" + to, className, onClick, children }),
  navigate: (to) => {
    if (typeof window !== "undefined") {
      window.location.hash = to.startsWith("#") ? to : "#" + to;
    }
  },
  useAuth: () => ({ user: null }),
  useCart: () => ({ items: [] }),
  Logo: () => jsxrt.jsx("span", { children: "PRESTIGE" }),
  paths: { workspace: "/workspace", account: "/account", supplier: "/supplier", home: "/" },
};

/* Drill-down: a chart, stat or report cell opens a module with
   parameters (period, tab, date, search). Each drill has a sequence
   number so the target re-renders even if it is already open. */
export const drill = { module: null, params: {}, seq: 0, listeners: new Set() };
export function drillTo(moduleKey, params = {}) {
  drill.module = moduleKey;
  drill.params = params;
  drill.seq += 1;
  bridge.navigate(bridge.paths.workspace + "/" + moduleKey);
  drill.listeners.forEach((fn) => fn(drill.seq));
}
export function clearDrill() {
  drill.module = null;
  drill.params = {};
}
