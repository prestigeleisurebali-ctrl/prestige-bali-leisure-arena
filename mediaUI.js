/* ==================================================================
   WEBSITE MANAGEMENT — shared editors
   MediaPicker · media library modal · rich-text editor · device preview
   ================================================================== */
import * as React from "react";
import * as jsxrt from "react/jsx-runtime";
import * as D from "./db.js";
import * as C from "./cmsCore.js";
import * as U from "./ui.js";
import { sanitize } from "./siteCms.js";

const g = jsxrt;
const { useState, useRef, useEffect } = React;
const inp = "w-full border border-ivory/20 bg-ink/40 px-2.5 py-1.5 text-[12px] text-ivory placeholder:text-ivory/30 outline-none focus:border-gold";
export const fmtBytes = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB");

/* ------------------------- media library modal -------------------- */
export function MediaLibraryModal({ user, onPick, onClose, type = "image" }) {
  U.useDB();
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("all");
  const [busy, setBusy] = useState("");
  const [url, setUrl] = useState("");
  const list = C.media().filter((m) => (type === "any" || m.type === type || (type === "image" && !m.type)) && (folder === "all" || m.folder === folder) && (!q || (m.name + " " + m.alt + " " + m.folder).toLowerCase().includes(q.toLowerCase())));
  const folders = [...new Set(C.media().map((m) => m.folder))];
  const upload = async (files) => { setBusy("Optimising…"); try { const recs = await C.uploadMedia([...files], { folder: folder === "all" ? "General" : folder }, user); if (recs[0] && files.length === 1) onPick("media:" + recs[0].id); } catch (e) { alert(e.message); } setBusy(""); };
  return g.jsx(U.Modal, { open: true, onClose, wide: true, title: "Choose from the media library", footer: [g.jsx(U.Btn, { size: "sm", onClick: onClose, children: "Close" }, "c")], children: g.jsxs("div", { className: "space-y-4", children: [
      g.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
          g.jsx("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search by name, folder or description", className: U.cx(inp, "max-w-xs py-2") }),
          g.jsxs("select", { value: folder, onChange: (e) => setFolder(e.target.value), className: U.cx(inp, "w-auto py-2"), children: [g.jsx("option", { value: "all", children: "All folders" }), folders.map((f) => g.jsx("option", { value: f, children: f }, f))] }),
          type !== "video" && g.jsxs("label", { className: "inline-flex cursor-pointer items-center rounded-full border border-gold bg-gold px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink", children: [busy || "Upload images", g.jsx("input", { type: "file", accept: "image/*", multiple: true, className: "hidden", onChange: (e) => { upload(e.target.files); e.target.value = ""; } })] }),
          g.jsx("input", { value: url, onChange: (e) => setUrl(e.target.value), placeholder: type === "video" ? "Video link (YouTube, Vimeo or .mp4)" : "…or paste an image link (https://)", className: U.cx(inp, "min-w-[220px] flex-1 py-2") }),
          g.jsx(U.Btn, { size: "sm", disabled: !url, onClick: () => { try { const r = C.addMediaUrl({ url, type: type === "video" || /youtu|vimeo|\.mp4/i.test(url) ? "video" : "image" }, user); onPick("media:" + r.id); } catch (e) { alert(e.message); } }, children: "Add link" }),
        ] }),
      list.length ? g.jsx("div", { className: "grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6", children: list.map((m) => g.jsxs("button", { onClick: () => onPick("media:" + m.id), className: "group border border-line bg-ink/40 text-left hover:border-gold", children: [
          m.type === "video" ? g.jsx("div", { className: "grid aspect-square place-items-center text-2xl text-gold", children: "▶" }) : g.jsx("img", { src: m.mobile || m.url, alt: m.alt || "", className: "aspect-square w-full object-cover" }),
          g.jsx("p", { className: "truncate px-2 py-1 text-[10px] text-ivory/70", children: m.name }),
        ] }, m.id)) }) : g.jsx("p", { className: "py-8 text-center text-[13px] text-ivory/45", children: "No media yet — upload images or add a link." }),
    ] }) });
}

/* ---------------------------- media picker ------------------------ */
export function MediaPicker({ value, onChange, user, label, type = "image", hint, disabled }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const src = C.resolve(value);
  const rec = C.isRef(value) ? C.media().find((m) => "media:" + m.id === value) : null;
  const upload = async (f) => { if (!f) return; setBusy(true); try { const [r] = await C.uploadMedia([f], { folder: "General" }, user); onChange("media:" + r.id); } catch (e) { alert(e.message); } setBusy(false); };
  return g.jsxs("div", { children: [
      label && g.jsx("p", { className: "mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/55", children: label }),
      g.jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [
          g.jsx("div", { className: "grid h-20 w-28 shrink-0 place-items-center overflow-hidden border border-line bg-ink/50", children: src ? (type === "video" || rec?.type === "video" ? g.jsx("span", { className: "text-[10px] text-gold", children: "▶ video" }) : g.jsx("img", { src, alt: "", className: "h-full w-full object-cover" })) : g.jsx("span", { className: "text-[10px] text-ivory/35", children: "None" }) }),
          !disabled && g.jsxs("div", { className: "flex flex-wrap gap-1.5", children: [
              g.jsx(U.Btn, { size: "sm", onClick: () => setOpen(true), children: value ? "Change" : "Choose" }),
              type !== "video" && g.jsxs("label", { className: "inline-flex cursor-pointer items-center rounded-full border border-ivory/25 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ivory/85 hover:border-ivory", children: [busy ? "…" : "Upload", g.jsx("input", { type: "file", accept: "image/*", className: "hidden", onChange: (e) => { upload(e.target.files?.[0]); e.target.value = ""; } })] }),
              value && g.jsx(U.Btn, { size: "sm", variant: "danger", onClick: () => onChange(""), children: "Remove" }),
            ] }),
        ] }),
      (hint || rec) && g.jsx("p", { className: "mt-1 text-[10px] text-ivory/40", children: [rec ? rec.name + (rec.alt ? " · alt: " + rec.alt : " · no alt text yet") : "", hint].filter(Boolean).join(" · ") }),
      open && g.jsx(MediaLibraryModal, { user, type, onClose: () => setOpen(false), onPick: (v) => { onChange(v); setOpen(false); } }),
    ] });
}
export function MediaList({ value = [], onChange, user, label }) {
  const [open, setOpen] = useState(false);
  return g.jsxs("div", { children: [
      label && g.jsx("p", { className: "mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/55", children: label }),
      g.jsxs("div", { className: "flex flex-wrap gap-2", children: [
          value.map((v, i) => g.jsxs("div", { className: "relative h-20 w-24 overflow-hidden border border-line bg-ink", children: [g.jsx("img", { src: C.resolve(v), alt: "", className: "h-full w-full object-cover" }), g.jsxs("span", { className: "absolute inset-x-0 bottom-0 flex justify-between bg-ink/80 px-1 text-[10px]", children: [g.jsx("button", { onClick: () => { const n = [...value]; if (i > 0) { [n[i - 1], n[i]] = [n[i], n[i - 1]]; onChange(n); } }, className: "text-ivory/70", children: "←" }), g.jsx("button", { onClick: () => onChange(value.filter((_, k) => k !== i)), className: "text-rose-300", children: "×" }), g.jsx("button", { onClick: () => { const n = [...value]; if (i < n.length - 1) { [n[i + 1], n[i]] = [n[i], n[i + 1]]; onChange(n); } }, className: "text-ivory/70", children: "→" })] })] }, i)),
          g.jsx("button", { onClick: () => setOpen(true), className: "grid h-20 w-24 place-items-center border border-dashed border-ivory/25 text-[10px] uppercase tracking-[0.12em] text-ivory/50 hover:border-gold", children: "+ Add" }),
        ] }),
      open && g.jsx(MediaLibraryModal, { user, onClose: () => setOpen(false), onPick: (v) => { onChange([...value, v]); setOpen(false); } }),
    ] });
}

/* ---------------------------- rich text --------------------------- */
const TOOLS = [["bold", "B", "Bold"], ["italic", "I", "Italic"], ["h2", "H2", "Heading"], ["h3", "H3", "Sub-heading"], ["insertUnorderedList", "• List", "Bullet list"], ["insertOrderedList", "1. List", "Numbered list"], ["blockquote", "❝", "Quote"], ["link", "Link", "Add link"], ["p", "¶", "Paragraph"], ["removeFormat", "Clear", "Clear formatting"]];
export function RichEditor({ value, onChange, placeholder, minHeight = 160 }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && document.activeElement !== ref.current && ref.current.innerHTML !== (value || "")) ref.current.innerHTML = value || ""; }, [value]);
  const run = (cmd) => {
    ref.current && ref.current.focus();
    if (cmd === "link") { const u = prompt("Link address (https://… or a page such as /contact)"); if (u) document.execCommand("createLink", false, /^(https?:|mailto:|tel:|\/|#)/.test(u) ? (u.startsWith("/") ? "#" + u : u) : "https://" + u); }
    else if (["h2", "h3", "p", "blockquote"].includes(cmd)) document.execCommand("formatBlock", false, cmd);
    else document.execCommand(cmd, false, null);
    onChange(sanitize(ref.current.innerHTML));
  };
  return g.jsxs("div", { className: "border border-ivory/20 bg-ink/40", children: [
      g.jsx("div", { className: "flex flex-wrap gap-1 border-b border-ivory/15 p-1.5", children: TOOLS.map(([c, l, t]) => g.jsx("button", { type: "button", title: t, onMouseDown: (e) => { e.preventDefault(); run(c); }, className: "min-w-[30px] border border-transparent px-2 py-1 text-[11px] font-semibold text-ivory/75 hover:border-ivory/30 hover:text-ivory", children: l }, c)) }),
      g.jsx("div", { ref, contentEditable: true, suppressContentEditableWarning: true, "data-placeholder": placeholder || "Write here…", onInput: () => onChange(sanitize(ref.current.innerHTML)), onBlur: () => onChange(sanitize(ref.current.innerHTML)), className: "pbl-rich px-4 py-3 outline-none empty:before:text-ivory/30 empty:before:content-[attr(data-placeholder)]", style: { minHeight } }),
    ] });
}

/* --------------------------- preview tools ------------------------ */
export const previewUrl = (route = "/") => (typeof location !== "undefined" ? location.pathname : "/") + "?pblPreview=1#" + route;
export function openPreview(route) { if (typeof window !== "undefined" && window.open) window.open(previewUrl(route), "_blank", "noopener"); }
const DEVICES = [["desktop", "Desktop", 1280], ["tablet", "Tablet", 820], ["mobile", "Mobile", 390]];
export function DevicePreview({ route = "/", version = 0 }) {
  const [dev, setDev] = useState("desktop");
  const [r, setR] = useState(route);
  const w = DEVICES.find((d) => d[0] === dev)[2];
  const boxW = 900;
  const scale = Math.min(1, boxW / w);
  return g.jsxs("div", { className: "space-y-3", children: [
      g.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
          g.jsx(U.Tabs, { tabs: DEVICES.map(([id, l, px]) => ({ id, label: l + " · " + px + "px" })), active: dev, onChange: setDev }),
          g.jsx("input", { value: r, onChange: (e) => setR(e.target.value), className: U.cx(inp, "w-56 py-2"), "aria-label": "Page to preview" }),
          g.jsx(U.Btn, { size: "sm", variant: "subtle", onClick: () => openPreview(r), children: "Open in new tab" }),
        ] }),
      g.jsx("div", { className: "overflow-hidden border border-line bg-ink", style: { height: 640 * scale + 2, maxWidth: "100%" }, children: g.jsx("iframe", { title: "Website preview", src: previewUrl(r), style: { width: w, height: 640, transform: `scale(${scale})`, transformOrigin: "0 0", border: 0 } }, dev + r + version) }),
      g.jsx("p", { className: "text-[11px] text-ivory/45", children: "Shows the saved draft. Save your changes as a draft first; the preview reloads automatically." }),
    ] });
}
