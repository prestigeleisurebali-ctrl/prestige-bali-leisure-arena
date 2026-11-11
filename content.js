/* ==================================================================
   WEBSITE CONTENT RUNTIME
   Every text and image on the public website is read through these
   two functions. The default is the original content; an editor's
   published override (CMS → Website content) replaces it instantly.
   ================================================================== */
import * as D from "./db.js";
import { siteCms, resolve } from "./cmsCore.js";

/** text: override → original; hidden entries render nothing */
export function CT(key, def) {
  const c = siteCms();
  if (c && c.hidden && c.hidden[key]) return "";
  const v = c && c.content ? c.content[key] : undefined;
  return v === undefined || v === null || v === "" ? def : v;
}
/** image: uploaded / replaced image → original */
export function CI(key, def) {
  const c = siteCms();
  const v = c && c.images ? c.images[key] : undefined;
  return (v && resolve(v)) || def;
}
