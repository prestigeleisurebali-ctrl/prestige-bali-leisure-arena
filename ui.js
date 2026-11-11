/* ==================================================================
   OPERATIONS UI KIT — shared primitives for every backend module
   ================================================================== */
import * as React from "react";
import * as jsxrt from "react/jsx-runtime";
import * as dbmod from "./db.js";

const g = jsxrt;
const We = React;
const { useState, useEffect, useMemo, useRef } = React;

/* ---------------------------- hooks ------------------------------- */
export function useDB() {
  const [, force] = useState(0);
  useEffect(() => dbmod.subscribe(() => force((n) => n + 1)), []);
  return dbmod.db();
}
export function useLocalState(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const raw = localStorage.getItem("pbl-ui-" + key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => localStorage.setItem("pbl-ui-" + key, JSON.stringify(v)), [key, v]);
  return [v, setV];
}

/* --------------------------- primitives --------------------------- */
export const cx = (...a) => a.filter(Boolean).join(" ");

export function Panel({ title, subtitle, actions, children, className, pad = true }) {
  return g.jsxs("section", {
    className: cx("border border-line bg-surface", className),
    children: [
      (title || actions) &&
        g.jsxs("header", {
          className: "flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4",
          children: [
            g.jsxs("div", { children: [
                title && g.jsx("h3", { className: "font-display text-[17px] font-semibold text-ivory", children: title }),
                subtitle && g.jsx("p", { className: "mt-0.5 text-[12px] text-ivory/55", children: subtitle }),
              ] }),
            actions && g.jsx("div", { className: "flex flex-wrap items-center gap-2", children: We.Children.toArray(actions) }),
          ],
        }),
      g.jsx("div", { className: pad ? "p-5" : "", children }),
    ],
  });
}

const TONES = {
  neutral: "bg-ivory/10 text-ivory/75",
  green: "bg-emerald-500/15 text-emerald-300",
  amber: "bg-amber-500/15 text-amber-300",
  red: "bg-rose-500/15 text-rose-300",
  blue: "bg-sky-500/15 text-sky-300",
  gold: "bg-gold/20 text-gold-soft",
};
export function toneFor(value) {
  const v = String(value || "").toLowerCase();
  if (/live|published|confirmed|paid|approved|cleared|completed|active|connected|converted/.test(v)) return "green";
  if (/pending|part|draft|sent|new|contacted|quarantine|awaiting|issued|shared/.test(v)) return "amber";
  if (/cancel|declin|lost|overdue|error|disconnected|unpaid|no-show|archived/.test(v)) return "red";
  if (/quote|residenc/.test(v)) return "blue";
  return "neutral";
}
export function Badge({ children, tone }) {
  const t = tone || toneFor(children);
  return g.jsx("span", { className: cx("inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]", TONES[t] || TONES.neutral), children });
}

export function Btn({ children, onClick, variant = "ghost", size = "md", disabled, title, type }) {
  const styles = {
    solid: "bg-gold text-ink hover:bg-gold-soft border-gold",
    dark: "bg-pine text-ivory hover:bg-[#2c5147] border-pine",
    ghost: "border-ivory/25 text-ivory/85 hover:border-ivory hover:bg-ivory/5",
    danger: "border-rose-400/40 text-rose-300 hover:bg-rose-500/10",
    subtle: "border-transparent bg-ivory/5 text-ivory/70 hover:bg-ivory/10",
  };
  return g.jsx("button", {
    type: type || "button", onClick, disabled, title,
    className: cx("inline-flex items-center justify-center gap-2 rounded-full border font-semibold uppercase tracking-[0.14em] transition-colors disabled:cursor-not-allowed disabled:opacity-35",
      size === "sm" ? "px-3 py-1.5 text-[10px]" : "px-5 py-2.5 text-[11px]", styles[variant]),
    children,
  });
}

export function Modal({ open, onClose, title, children, footer, wide }) {
  if (!open) return null;
  return g.jsxs("div", {
    className: "fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-ink/80 p-4 backdrop-blur-sm md:p-8",
    children: [
      g.jsxs("div", { className: cx("my-6 w-full border border-line bg-surface shadow-lift", wide ? "max-w-4xl" : "max-w-2xl"), children: [
        g.jsxs("header", { className: "flex items-center justify-between border-b border-line px-6 py-4", children: [
            g.jsx("h3", { className: "font-display text-lg font-semibold text-ivory", children: title }),
            g.jsx("button", { onClick: onClose, className: "text-xl leading-none text-ivory/50 hover:text-ivory", "aria-label": "Close", children: "×" }),
          ] }),
        g.jsx("div", { className: "max-h-[68vh] overflow-y-auto px-6 py-5", children }),
        footer && g.jsx("footer", { className: "flex flex-wrap justify-end gap-3 border-t border-line px-6 py-4", children: We.Children.toArray(footer) }),
      ] }),
    ],
  });
}

export function Confirm({ open, onClose, onConfirm, title = "Are you sure?", body, confirmLabel = "Delete" }) {
  return g.jsx(Modal, {
    open, onClose, title,
    footer: [g.jsx(Btn, { onClick: onClose, children: "Keep it" }, "k"), g.jsx(Btn, { variant: "danger", onClick: () => { onConfirm(); onClose(); }, children: confirmLabel }, "c")],
    children: g.jsx("p", { className: "text-[14px] leading-relaxed text-ivory/75", children: body || "This action is recorded in the audit log and cannot be undone." }),
  });
}

/* ----------------------------- fields ----------------------------- */
const inputCls = "w-full border border-ivory/20 bg-ink/40 px-3 py-2.5 text-[14px] text-ivory outline-none transition-colors placeholder:text-ivory/30 focus:border-gold";

export function Field({ label, value, onChange, type = "text", options, placeholder, rows, hint, disabled, min, max, step }) {
  const id = "f-" + String(label).replace(/\W+/g, "-").toLowerCase();
  let control;
  if (type === "select")
    control = g.jsx("select", { id, className: inputCls, value: value ?? "", disabled, onChange: (e) => onChange(e.target.value),
      children: (options || []).map((o) => g.jsx("option", { value: typeof o === "object" ? o.value : o, children: typeof o === "object" ? o.label : o }, typeof o === "object" ? o.value : o)) });
  else if (type === "textarea")
    control = g.jsx("textarea", { id, className: inputCls, rows: rows || 3, value: value ?? "", placeholder, disabled, onChange: (e) => onChange(e.target.value) });
  else if (type === "checkbox")
    control = g.jsx("input", { id, type: "checkbox", checked: !!value, disabled, onChange: (e) => onChange(e.target.checked), className: "h-4 w-4 accent-[#d2ab6d]" });
  else
    control = g.jsx("input", { id, type, className: inputCls, value: value ?? "", placeholder, disabled, min, max, step,
      onChange: (e) => onChange(type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value) });
  if (type === "checkbox")
    return g.jsxs("label", { htmlFor: id, className: "flex cursor-pointer items-center gap-3 py-1.5", children: [control, g.jsx("span", { className: "text-[13px] text-ivory/80", children: label })] });
  return g.jsxs("div", { className: "block", children: [
      label && g.jsx("label", { htmlFor: id, className: "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/55", children: label }),
      control,
      hint && g.jsx("p", { className: "mt-1 text-[11px] text-ivory/45", children: hint }),
    ] });
}

export function FieldGrid({ children, cols = 2 }) {
  return g.jsx("div", { className: cx("grid gap-4", cols === 3 ? "md:grid-cols-3" : cols === 1 ? "" : "md:grid-cols-2"), children });
}

/* --------------------------- data table --------------------------- */
export function DataTable({ rows, columns, onRowClick, actions, empty = "No records yet.", pageSize = 12, searchable = true, searchKeys, toolbar, rowTone, initialQuery = "", footer }) {
  const [q, setQ] = useState(initialQuery || "");
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows || [];
    if (q && searchable) {
      const keys = searchKeys || columns.map((c) => c.key).filter((k) => k !== "actions");
      const needle = q.toLowerCase();
      out = out.filter((r) => keys.some((k) => String(r[k] ?? "").toLowerCase().includes(needle)));
    }
    if (sort) {
      out = [...out].sort((a, b) => {
        const A = a[sort.key], B = b[sort.key];
        if (typeof A === "number" || typeof B === "number") return (Number(A) || 0) - (Number(B) || 0);
        return String(A ?? "").localeCompare(String(B ?? ""));
      });
      if (sort.dir === "desc") out.reverse();
    }
    return out;
  }, [rows, q, sort, columns, searchKeys]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pg = Math.min(page, pages - 1);
  const slice = filtered.slice(pg * pageSize, pg * pageSize + pageSize);

  return g.jsxs("div", { children: [
      (searchable || toolbar) && g.jsxs("div", { className: "mb-4 flex flex-wrap items-center justify-between gap-3", children: [
          searchable ? g.jsx("input", { value: q, onChange: (e) => { setQ(e.target.value); setPage(0); }, placeholder: "Search records…", className: cx(inputCls, "max-w-xs") }) : g.jsx("span", {}),
          g.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [We.Children.toArray(toolbar), g.jsxs("span", { className: "text-[11px] uppercase tracking-[0.14em] text-ivory/45", children: [filtered.length, " records"] })] }),
        ] }),
      g.jsx("div", { className: "overflow-x-auto", children: g.jsxs("table", { className: "w-full min-w-[640px] border-collapse text-left", children: [
          g.jsx("thead", { children: g.jsx("tr", { className: "border-b border-line", children: columns.map((c) => g.jsx("th", {
              onClick: c.sortable === false ? undefined : () => setSort((s) => (s && s.key === c.key ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: "asc" })),
              className: "cursor-pointer whitespace-nowrap px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/50 hover:text-ivory",
              children: c.label + (sort?.key === c.key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""),
            }, c.key)) }) }),
          g.jsx("tbody", { children: slice.length ? slice.map((r, i) => g.jsxs("tr", {
              onClick: onRowClick ? () => onRowClick(r) : undefined,
              className: cx("border-b border-line/60 align-top", onRowClick && "cursor-pointer", rowTone?.(r)),
              children: columns.map((c) => g.jsx("td", { className: "px-3 py-3 text-[13px] text-ivory/80", children: c.render ? c.render(r) : String(r[c.key] ?? "—") }, c.key + i)),
            }, r.id || i)) : g.jsx("tr", { children: g.jsx("td", { colSpan: columns.length, className: "px-3 py-10 text-center text-[13px] text-ivory/45", children: empty }) }) }),
          footer && g.jsx("tfoot", { children: footer }),
        ] }) }),
      pages > 1 && g.jsxs("div", { className: "mt-4 flex items-center justify-end gap-2", children: [
          g.jsx(Btn, { size: "sm", onClick: () => setPage(Math.max(0, pg - 1)), disabled: pg === 0, children: "Prev" }),
          g.jsxs("span", { className: "text-[11px] uppercase tracking-[0.14em] text-ivory/50", children: [pg + 1, " / ", pages] }),
          g.jsx(Btn, { size: "sm", onClick: () => setPage(Math.min(pages - 1, pg + 1)), disabled: pg >= pages - 1, children: "Next" }),
        ] }),
    ] });
}

/* ----------------------------- charts ----------------------------- */
export function BarChart({ data, valueKey = "revenue", height = 170, onBarClick, format = (v) => dbmod.money(v) }) {
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0));
  return g.jsx("div", { className: "flex items-end gap-1.5", style: { height }, children: data.map((d, i) => g.jsxs("button", {
      onClick: onBarClick ? () => onBarClick(d) : undefined,
      title: `${d.label}: ${format(d[valueKey])}`,
      className: "group flex flex-1 flex-col items-center justify-end gap-2",
      style: { height: "100%" },
      children: [
        g.jsx("span", { className: "pointer-events-none w-full rounded-t bg-gradient-to-t from-pine to-gold/80 opacity-80 transition-opacity group-hover:opacity-100", style: { height: Math.max(2, ((Number(d[valueKey]) || 0) / max) * 100) + "%" } }),
        g.jsx("span", { className: "text-[9px] uppercase tracking-wide text-ivory/40", children: d.label }),
      ],
    }, d.key || i)) });
}

export function Donut({ slices, size = 150 }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  const R = 60, C = 2 * Math.PI * R;
  return g.jsxs("div", { className: "flex flex-wrap items-center gap-6", children: [
      g.jsx("svg", { width: size, height: size, viewBox: "0 0 160 160", children: slices.map((s, i) => {
          const len = (s.value / total) * C;
          const el = g.jsx("circle", { cx: 80, cy: 80, r: R, fill: "none", stroke: s.color, strokeWidth: 22, strokeDasharray: `${len} ${C - len}`, strokeDashoffset: -acc, transform: "rotate(-90 80 80)" }, i);
          acc += len;
          return el;
        }) }),
      g.jsx("ul", { className: "space-y-1.5 text-[12px]", children: slices.map((s) => g.jsxs("li", { className: "flex items-center gap-2 text-ivory/70", children: [
            g.jsx("span", { className: "h-2.5 w-2.5 rounded-sm", style: { background: s.color } }),
            g.jsx("span", { children: s.label }),
            g.jsxs("span", { className: "font-medium text-ivory", children: [Math.round((s.value / total) * 100), "%"] }),
          ] }, s.label)) }),
    ] });
}

export function Stat({ label, value, sub, onClick, tone }) {
  return g.jsxs("button", {
    onClick,
    className: cx("border border-line bg-surface p-5 text-left transition-colors hover:border-gold/50 hover:bg-ivory/[0.03]", !onClick && "cursor-default"),
    children: [
      g.jsx("p", { className: "text-[10px] font-semibold uppercase tracking-[0.18em] text-ivory/45", children: label }),
      g.jsx("p", { className: cx("mt-2 font-display text-[26px] font-semibold leading-none", tone === "gold" ? "text-gold-soft" : "text-ivory"), children: value }),
      sub && g.jsx("p", { className: "mt-2 text-[11px] text-ivory/50", children: sub }),
      onClick && g.jsx("p", { className: "mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-soft/70", children: "Open records →" }),
    ],
  });
}

export function Tabs({ tabs, active, onChange }) {
  return g.jsx("div", { className: "flex flex-wrap gap-1 border-b border-line", children: tabs.map((t) => g.jsx("button", {
      onClick: () => onChange(t.id),
      className: cx("-mb-px border-b-2 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors",
        active === t.id ? "border-gold text-gold-soft" : "border-transparent text-ivory/50 hover:text-ivory"),
      children: t.label,
    }, t.id)) });
}

/* --------------------------- file export -------------------------- */
export function exportCSV(filename, rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename.endsWith(".csv") ? filename : filename + ".csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* print-based professional PDF (browser print → Save as PDF) */
export function printDoc(title, bodyHtml) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return alert("Allow pop-ups to export the PDF.");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
  <style>
    @page { margin: 18mm 16mm; }
    *{box-sizing:border-box}
    body{font-family:Jost,system-ui,sans-serif;color:#1f2a26;margin:0}
    h1,h2,h3{font-family:'Playfair Display',Georgia,serif;font-weight:600;margin:0}
    .brand{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1f3a33;padding-bottom:14px;margin-bottom:26px}
    .brand h1{font-size:22px;letter-spacing:.02em}
    .brand .m{font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:#8a8377}
    .eyebrow{font-size:9px;letter-spacing:.3em;text-transform:uppercase;color:#b08d4f;margin-bottom:6px}
    table{width:100%;border-collapse:collapse;margin:14px 0;font-size:12px}
    th{text-align:left;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:#6b6b60;border-bottom:1px solid #ddd;padding:8px 6px}
    td{padding:9px 6px;border-bottom:1px solid #f0efe9;vertical-align:top}
    .r{text-align:right}.num{font-variant-numeric:tabular-nums}
    .tot td{border:none;padding:4px 6px}
    .tot .l{text-align:right;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#6b6b60}
    .grand td{border-top:2px solid #1f3a33;font-weight:600;font-size:15px;padding-top:10px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 26px;font-size:12px;margin:16px 0}
    .kv{display:flex;gap:8px;padding:3px 0}
    .kv b{min-width:118px;font-weight:500;color:#6b6b60;font-size:10px;letter-spacing:.14em;text-transform:uppercase;padding-top:2px}
    .note{margin-top:26px;padding:14px;background:#f7f5ef;font-size:11px;line-height:1.6;color:#4a4a42}
    .foot{margin-top:34px;border-top:1px solid #ddd;padding-top:12px;font-size:10px;color:#8a8377;letter-spacing:.1em;text-transform:uppercase}
    .sig{margin-top:40px;display:flex;gap:40px;font-size:11px}
    .sig div{flex:1;border-top:1px solid #999;padding-top:6px;color:#6b6b60}
  </style></head><body>${bodyHtml}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 700);
}

/* image picker: upload → downscale → data URL (no external links needed) */
export function pickImage(file, maxDim = 1400, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = maxDim;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

export function ImageDrop({ images, onChange, single, maxDim = 1400, hint }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const list = images || [];
  const handle = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const next = [];
      for (const f of Array.from(files).slice(0, single ? 1 : 6)) next.push({ url: await pickImage(f, maxDim, maxDim > 1600 ? 0.7 : 0.72), caption: f.name.replace(/\.[a-z]+$/i, ""), kind: single ? "main" : "gallery" });
      onChange(single ? next[0] ? [next[0]] : list : [...list, ...next]);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };
  return g.jsxs("div", { children: [
      g.jsxs("div", { className: "flex flex-wrap gap-3", children: [
          list.map((im, i) => g.jsxs("div", { className: "relative h-24 w-32 overflow-hidden border border-line bg-ink", children: [
              g.jsx("img", { src: im.url, alt: im.caption || "", className: "h-full w-full object-cover" }),
              g.jsx("button", { onClick: () => onChange(list.filter((_, j) => j !== i)), title: "Delete photo",
                  className: "absolute right-1 top-1 grid h-5 w-5 place-items-center bg-ink/80 text-[11px] text-rose-300 hover:bg-rose-500/40", children: "×" }),
              i === 0 && !single && g.jsx("span", { className: "absolute bottom-0 left-0 bg-gold px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-ink", children: "Main" }),
              i > 0 && !single && g.jsx("button", { onClick: () => { const n = [...list]; const [x] = n.splice(i, 1); n.unshift(x); onChange(n); }, title: "Make main photo",
                  className: "absolute bottom-1 left-1 bg-ink/80 px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-ivory hover:bg-gold hover:text-ink", children: "Main" }),
            ] }, i)),
        g.jsxs("label", { className: "flex h-24 w-32 cursor-pointer flex-col items-center justify-center gap-1 border border-dashed border-ivory/25 text-center text-[10px] uppercase tracking-[0.12em] text-ivory/50 hover:border-gold hover:text-gold-soft", children: [
            g.jsx("span", { className: "text-lg", children: busy ? "…" : "+" }),
            "Upload photo",
            g.jsx("input", { ref, type: "file", accept: "image/*", multiple: !single, className: "hidden", onChange: (e) => handle(e.target.files) }),
          ] }),
      ] }),
      g.jsx("p", { className: "mt-2 text-[11px] text-ivory/40", children: hint || "Photos are uploaded from your device, optimised and stored with the record. No external links required." }),
    ] });
}

/* ------------------- record form (schema driven) ------------------- */
export function RecordForm({ fields, value, onChange, cols = 2 }) {
  return g.jsx(FieldGrid, { cols, children: fields.map((f) => g.jsx(Field, {
      label: f.label, type: f.type || "text", value: value[f.key], options: f.options, rows: f.rows,
      placeholder: f.placeholder, hint: f.hint, disabled: f.disabled,
      onChange: (v) => onChange({ ...value, [f.key]: v }),
    }, f.key)) });
}


/* ------------------------- period picker -------------------------- */
const PERIOD_MODES = [
  { id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" }, { id: "year", label: "Year" }, { id: "custom", label: "Custom" }, { id: "all", label: "All time" },
];
const QUICK = [
  { label: "Today vs yesterday", p: () => ({ mode: "day", anchor: dbmod.today() }) },
  { label: "This week vs last", p: () => ({ mode: "week", anchor: dbmod.today() }) },
  { label: "This month vs last", p: () => ({ mode: "month", anchor: dbmod.today() }) },
  { label: "This year vs last", p: () => ({ mode: "year", anchor: dbmod.today() }) },
];
const pickCls = "border border-ivory/20 bg-ink/40 px-2.5 py-1.5 text-[12px] text-ivory [color-scheme:dark]";

export function PeriodPicker({ period, onChange }) {
  const P = dbmod.periodOf(period);
  const set = (patch) => onChange({ ...period, ...patch });
  const step = (n) => {
    const a = P.anchor;
    const d = new Date(a + "T00:00:00");
    if (P.mode === "day") d.setDate(d.getDate() + n);
    else if (P.mode === "week") d.setDate(d.getDate() + 7 * n);
    else if (P.mode === "month") d.setMonth(d.getMonth() + n);
    else if (P.mode === "quarter") d.setMonth(d.getMonth() + 3 * n);
    else if (P.mode === "year") d.setFullYear(d.getFullYear() + n);
    set({ anchor: new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10) });
  };
  const year = Number(P.anchor.slice(0, 4));
  const years = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() + 1 - i);
  let control = null;
  if (P.mode === "day") control = g.jsx("input", { type: "date", value: P.anchor, onChange: (e) => e.target.value && set({ anchor: e.target.value }), className: pickCls });
  else if (P.mode === "week") control = g.jsx("input", { type: "date", value: P.from, onChange: (e) => e.target.value && set({ anchor: e.target.value }), className: pickCls, title: "Pick any day in the week" });
  else if (P.mode === "month") control = g.jsx("input", { type: "month", value: P.anchor.slice(0, 7), onChange: (e) => e.target.value && set({ anchor: e.target.value + "-01" }), className: pickCls });
  else if (P.mode === "quarter") control = g.jsxs("span", { className: "flex gap-2", children: [
      g.jsx("select", { value: Math.floor((Number(P.anchor.slice(5, 7)) - 1) / 3), onChange: (e) => set({ anchor: year + "-" + String(Number(e.target.value) * 3 + 1).padStart(2, "0") + "-01" }), className: pickCls, children: [0, 1, 2, 3].map((q) => g.jsx("option", { value: q, children: "Q" + (q + 1) }, q)) }),
      g.jsx("select", { value: year, onChange: (e) => set({ anchor: e.target.value + P.anchor.slice(4) }), className: pickCls, children: years.map((y) => g.jsx("option", { value: y, children: y }, y)) }),
    ] });
  else if (P.mode === "year") control = g.jsx("select", { value: year, onChange: (e) => set({ anchor: e.target.value + "-01-01" }), className: pickCls, children: years.map((y) => g.jsx("option", { value: y, children: y }, y)) });
  else if (P.mode === "custom") control = g.jsxs("span", { className: "flex items-center gap-2", children: [
      g.jsx("input", { type: "date", value: P.from, onChange: (e) => e.target.value && set({ from: e.target.value }), className: pickCls }),
      g.jsx("span", { className: "text-ivory/40", children: "→" }),
      g.jsx("input", { type: "date", value: P.to, onChange: (e) => e.target.value && set({ to: e.target.value }), className: pickCls }),
    ] });

  return g.jsxs("div", { className: "space-y-3", children: [
      g.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
          g.jsx("div", { className: "flex flex-wrap gap-1", children: PERIOD_MODES.map((m) => g.jsx("button", {
              onClick: () => onChange({ mode: m.id, anchor: P.anchor, from: P.from, to: P.to }),
              className: cx("rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors",
                P.mode === m.id ? "border-gold bg-gold/15 text-gold-soft" : "border-ivory/20 text-ivory/60 hover:border-ivory/50 hover:text-ivory"),
              children: m.label,
            }, m.id)) }),
          control,
          !["custom", "all"].includes(P.mode) && g.jsxs("span", { className: "flex gap-1", children: [
              g.jsx(Btn, { size: "sm", variant: "subtle", onClick: () => step(-1), title: "Previous period", children: "←" }),
              g.jsx(Btn, { size: "sm", variant: "subtle", onClick: () => step(1), title: "Next period", children: "→" }),
            ] }),
        ] }),
      g.jsxs("div", { className: "flex flex-wrap items-center gap-x-4 gap-y-1", children: [
          g.jsxs("p", { className: "text-[12px] text-ivory/70", children: [g.jsx("span", { className: "font-medium text-gold-soft", children: P.label }), P.from ? " · " + dbmod.fmtDate(P.from) + " – " + dbmod.fmtDate(P.to) : "", P.prev.from ? " · compared with " + dbmod.fmtDate(P.prev.from) + " – " + dbmod.fmtDate(P.prev.to) : ""] }),
          g.jsx("span", { className: "flex flex-wrap gap-2", children: QUICK.map((q) => g.jsx("button", { onClick: () => onChange(q.p()), className: "text-[10px] font-semibold uppercase tracking-[0.12em] text-ivory/45 hover:text-gold-soft", children: q.label }, q.label)) }),
        ] }),
    ] });
}

export const deltaPct = (a, b) => (b ? Math.round(((a - b) / Math.abs(b)) * 100) : a ? 100 : 0);
export function Delta({ now, before, invert }) {
  const d = deltaPct(now, before);
  const good = invert ? d <= 0 : d >= 0;
  return g.jsx("span", { className: cx("text-[11px] font-semibold", good ? "text-emerald-300" : "text-rose-300"), children: (d >= 0 ? "▲ " : "▼ ") + Math.abs(d) + "%" });
}
