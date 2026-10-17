// /u/:name — a tiny HTML page whose og:image is that user's card.
// Link-preview bots (dev-null.sh, X, Telegram, Discord) read the tags; people get redirected to the app.
import { cleanName } from "../lib/card.js";

export const config = { runtime: "edge" };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export default function handler(req) {
  const url = new URL(req.url);
  const username = cleanName(url.searchParams.get("u") || url.pathname.split("/").pop());
  const origin = `${url.protocol}//${url.host}`;
  const v = Math.floor(Date.now() / 3600e3); // hourly cache-buster so previews refresh
  const img = `${origin}/api/og?u=${encodeURIComponent(username)}&v=${v}`;
  const app = `${origin}/?u=${encodeURIComponent(username)}`;
  const title = username ? `@${username} on /dev/null, wrapped` : "/dev/null wrapped";
  const desc = "Commits, stars, peak hour, best commit and persona. Get yours.";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(`${origin}/u/${username}`)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<meta http-equiv="refresh" content="0; url=${esc(app)}">
</head><body style="background:#0e0e11;color:#f2f2f4;font-family:monospace">
<a href="${esc(app)}" style="color:#f0679a">open ${esc(title)}</a></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" } });
}
