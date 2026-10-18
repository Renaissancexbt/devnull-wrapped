// /badge/:name — shields-style SVG for a GitHub README:  [/dev/null | 57 commits · 386 ★]
import { cleanName, fetchProfile, stats, fmt } from "../lib/card.js";

export const config = { runtime: "edge" };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// rough Verdana 11px advance widths, same trick shields.io uses
const width = (t) => Math.round([...t].reduce((w, c) => w + (/[ilj.,:;'|!]/.test(c) ? 3.6 : /[mwMW@]/.test(c) ? 9.5 : /[A-Z0-9★]/.test(c) ? 7.4 : 6.4), 0)) + 14;

export function badgeSVG(label, value, color = "#f0679a") {
  const lw = width(label), vw = width(value), w = lw + vw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(label)}: ${esc(value)}">
<title>${esc(label)}: ${esc(value)}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#17171c"/><rect x="${lw}" width="${vw}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="15" fill="#010101" fill-opacity=".3">${esc(label)}</text><text x="${lw / 2}" y="14">${esc(label)}</text>
<text x="${lw + vw / 2}" y="14" fill="#0e0e11">${esc(value)}</text>
</g></svg>`;
}

export default async function handler(req) {
  const url = new URL(req.url);
  const username = cleanName(url.searchParams.get("u"));
  let svg, ok = false;
  try {
    const p = username ? await fetchProfile(username, { pages: 5 }) : null;
    if (p) {
      const s = stats(p);
      svg = badgeSVG("/dev/null", `${fmt(s.total)} commits · ${fmt(s.stars)} ★`);
      ok = true;
    } else svg = badgeSVG("/dev/null", "not found", "#8b8b97");
  } catch {
    svg = badgeSVG("/dev/null", "unavailable", "#8b8b97");
  }
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": ok ? "public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400" : "public, max-age=120",
    },
  });
}
