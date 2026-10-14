// Run after editing api/_lib/catalog.js:  node tools/sync-catalog.mjs
// Copies the catalogue into bmce/index.html as an offline fallback (the page still loads live data from /api/bmce/catalog).
import { readFileSync, writeFileSync } from "node:fs";
import { CATALOG } from "../api/_lib/catalog.js";
const f = new URL("../bmce/index.html", import.meta.url);
const html = readFileSync(f, "utf8");
const json = JSON.stringify(CATALOG).replace(/</g, "\\u003c");
const out = html.replace(/(<script type="application\/json" id="catalog-fallback">)[\s\S]*?(<\/script>)/, (_, a, b) => a + json + b);
writeFileSync(f, out);
console.log("catalog synced:", CATALOG.length, "items");
