// Baut eine einzelne HTML-Datei mit allen Daten, Styles und Skripten (kein Server nötig).
//   node tools/build-standalone.mjs            → dist/lunchly.html (komplettes Dokument)
//   node tools/build-standalone.mjs --fragment → dist/lunchly-fragment.html (ohne <html>/<head>, zum Einbetten)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fragment = process.argv.includes("--fragment");

const html = read("index.html");
const css = read("css/style.css");
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const js = scripts.map((src) => `/* ${src} */\n${read(src)}`).join("\n");
const fonts = html.match(/<link rel="stylesheet" href="(https:\/\/fonts[^"]+)">/)[1];
const body = html.match(/<body>([\s\S]*?)\n\s*<script/)[1].trim();

const embedFlag = "window.LUNCHLY = window.LUNCHLY || { dishes: [], desserts: [] }; LUNCHLY.embedded = true;";
const inner = `<title>Lunchly</title>
<link rel="stylesheet" href="${fonts}">
<style>
${css}</style>
${body}
<script>
${embedFlag}
${js}
</script>
`;

const out = fragment
  ? inner
  : `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${inner.replace(/\n<div id="app"[\s\S]*/, "")}
</head>
<body>
${inner.slice(inner.indexOf('<div id="app"'))}</body>
</html>
`;

mkdirSync(join(root, "dist"), { recursive: true });
const file = join(root, "dist", fragment ? "lunchly-fragment.html" : "lunchly.html");
writeFileSync(file, out);
console.log(`✓ ${file} (${(out.length / 1024).toFixed(0)} KB)`);
