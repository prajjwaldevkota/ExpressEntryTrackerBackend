import { html } from "hono/html";
import { HTTPException } from "hono/http-exception";
import { loadData } from "../utils/dataLoader.js";
import { drawId, newestFirst } from "../utils/draws.js";
import { cache, generateCacheKey } from "../utils/cache.js";
import { getLanguage } from "../utils/query.js";

const copy = {
  en: { title: "Express Entry cutoff tracker", choose: "Draw category", apply: "Show rounds",
    cutoff: "Latest CRS cutoff", change: "Change from previous round", invitations: "Invitations",
    history: "Recent rounds", round: "Round", date: "Date", score: "CRS cutoff", other: "Français",
    none: "No comparable round", noProgram: "No program specified", empty: "No rounds available." },
  fr: { title: "Suivi des seuils d’Entrée express", choose: "Catégorie de ronde", apply: "Afficher les rondes",
    cutoff: "Dernier seuil du SCG", change: "Écart avec la ronde précédente", invitations: "Invitations",
    history: "Rondes récentes", round: "Ronde", date: "Date", score: "Seuil du SCG", other: "English",
    none: "Aucune ronde comparable", noProgram: "Aucun programme spécifié", empty: "Aucune ronde disponible." },
};

// Bundled records only change at deployment. Index them once per Worker isolate.
const trackerIndex = loadData().then(({ en, fr }) => ({
  draws: [...en.draws].sort((a, b) => b.date.localeCompare(a.date) || newestFirst(a, b)),
  french: new Map(fr.draws.map(draw => [drawId(draw), draw])),
}));

async function trackerData(c) {
  const lang = getLanguage(c);
  const today = new Date().toISOString().slice(0, 10);
  let selected = c.req.query("category")?.trim().toLowerCase();
  const key = generateCacheKey("tracker", { lang, selected, today });
  const existing = cache.get(key);
  c.header("X-Cache-Hit", String(existing !== null));
  if (existing !== null) return existing;

  const { draws, french } = await trackerIndex;
  const options = new Map();
  const history = [];
  for (const draw of draws) {
    if (draw.date > today) continue;
    const code = draw.category ?? "no-program";
    const localized = lang === "fr" ? french.get(drawId(draw)) : draw;
    if (!options.has(code)) options.set(code, localized.category ?? copy[lang].noProgram);
    selected ??= code.toLowerCase();
    if (code.toLowerCase() === selected && history.length < 10) history.push(localized);
  }
  const categories = Array.from(options, ([code, label]) => ({ code, label }));
  const category = categories.find(item => item.code.toLowerCase() === selected) ?? null;
  if (selected !== undefined && !category) {
    throw new HTTPException(400, { message: "Unknown tracker category" });
  }
  const change = history.length >= 2 ? history[0].minimumCRS - history[1].minimumCRS : null;
  const result = { lang, category, categories, history, change };
  cache.set(key, result);
  return result;
}

export const getTracker = async c => c.json(await trackerData(c));

// The page expires with its cached data and is rendered only when HTML is requested.
const renderedPages = new WeakMap();

export async function showTracker(c) {
  const data = await trackerData(c);
  c.header("Content-Language", data.lang);
  const existing = renderedPages.get(data);
  if (existing !== undefined) return c.html(existing);
  const { lang, category, categories, history, change } = data;
  const t = copy[lang];
  const number = new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA");
  const other = new URLSearchParams({ lang: lang === "fr" ? "en" : "fr" });
  if (category) other.set("category", category.code);
  const latest = history[0];
  const page = html`<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.title}</title><style>
*{box-sizing:border-box}body{margin:0;background:#f6f5ee;color:#172c29;font:1rem/1.5 "Source Sans 3",system-ui,sans-serif}
main{max-width:58rem;margin:auto;padding:clamp(1rem,5vw,4rem)}nav{text-align:right}a{color:#176455}
h1,h2{font-family:Georgia,serif;font-weight:500}h1{font-size:clamp(2.2rem,6vw,4rem);line-height:1.08;margin:.65em 0}
form{display:flex;align-items:end;flex-wrap:wrap;gap:.7rem}label{display:grid;gap:.35rem;max-width:100%}
select,button{font:inherit;padding:.6rem;border:1px solid #658078;border-radius:.3rem}select{max-width:100%}button{background:#184e43;color:white;cursor:pointer}
dl{display:flex;flex-wrap:wrap;gap:1rem 3rem;background:#e0ebe3;border-top:3px solid #286451;padding:1.2rem;margin:2rem 0}
dd{margin:0;font-size:1.8rem;font-weight:650}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
td,th{text-align:right;padding:.55rem .25rem;border-bottom:1px solid #cad3ca}td:first-child,th:first-child{text-align:left}
</style></head><body><main><nav><a href="/tracker?${other.toString()}">${t.other}</a></nav>
<h1>${t.title}</h1><form action="/tracker"><input type="hidden" name="lang" value="${lang}">
<label>${t.choose}<select name="category">${categories.map(item => html`<option value="${item.code}" ${item.code === category?.code ? "selected" : ""}>${item.label}</option>`)}</select></label>
<button>${t.apply}</button></form>
${latest ? html`<dl><div><dt>${t.cutoff}</dt><dd>${latest.minimumCRS}</dd></div>
<div><dt>${t.change}</dt><dd>${change === null ? t.none : new Intl.NumberFormat(lang, { signDisplay: "exceptZero" }).format(change)}</dd></div>
<div><dt>${t.invitations}</dt><dd>${number.format(latest.invitationsIssued)}</dd></div></dl>
<h2>${t.history}</h2><table><thead><tr>${[t.round, t.date, t.score, t.invitations].map(label => html`<th scope="col">${label}</th>`)}</tr></thead>
<tbody>${history.map(draw => html`<tr><td>${drawId(draw)}</td><td>${draw.date}</td><td>${draw.minimumCRS}</td><td>${number.format(draw.invitationsIssued)}</td></tr>`)}</tbody></table>` : html`<p>${t.empty}</p>`}
</main></body></html>`;
  renderedPages.set(data, page);
  return c.html(page);
}
