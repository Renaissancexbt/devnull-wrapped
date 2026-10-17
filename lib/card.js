// Shared by the edge functions: fetch a /dev/null profile, crunch stats,
// and build the 1200x630 card as a satori element tree (no JSX, no build step).

export const C = { bg: "#0e0e11", panel: "#17171c", line: "#2a2a33", ink: "#f2f2f4", dim: "#8b8b97", pink: "#f0679a", faint: "#24242c" };
const MONO = "JetBrains Mono", SANS = "Inter";

export function cleanName(u) {
  return String(u || "").replace(/^@/, "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 39);
}

async function getJSON(url) {
  const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "devnull-wrapped" } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`/dev/null answered ${r.status}`);
  return r.json();
}

export async function fetchProfile(username, { api = "https://dev-null.sh", pages = 10 } = {}) {
  const base = `${api}/api/v1/users/${encodeURIComponent(username)}`;
  const u = await getJSON(base);
  if (!u || !u.data) return null;
  const commits = [];
  let url = `${base}/commits`;
  for (let p = 0; url && p < pages; p++) {
    const j = await getJSON(url);
    if (!j) break;
    commits.push(...(j.data || []));
    const next = j.meta && j.meta.next_cursor;
    url = j.links && j.links.next ? j.links.next : next ? `${base}/commits?cursor=${encodeURIComponent(next)}` : null;
  }
  return { user: u.data, commits };
}

export function stats({ user, commits }) {
  const n = commits.length || 1;
  const replies = commits.filter((c) => c.parent_id).length;
  const stars = commits.reduce((s, c) => s + (c.stars_count || 0), 0);
  const repliesIn = commits.reduce((s, c) => s + (c.replies_count || 0), 0);
  const best = [...commits].sort((a, b) => (b.stars_count || 0) - (a.stars_count || 0) || (b.replies_count || 0) - (a.replies_count || 0))[0] || null;
  const hours = new Array(24).fill(0);
  for (const c of commits) hours[new Date(c.created_at).getUTCHours()]++;
  const peak = hours.indexOf(Math.max(...hours));
  const withImages = commits.filter((c) => (c.images || []).length).length;
  const tags = [];
  if (peak <= 4) tags.push("night owl"); else if (peak <= 8) tags.push("early bird"); else if (peak <= 16) tags.push("day shift"); else tags.push("evening shipper");
  if (replies / n > 0.55) tags.push("reply guy"); else if ((commits.length - replies) / n > 0.8) tags.push("broadcaster");
  if (stars / n >= 10) tags.push("crowd favorite"); else if (stars / n >= 3) tags.push("well starred");
  if (withImages / n > 0.3) tags.push("screenshot enjoyer");
  const STOP = new Set("the a an and or but if then of to in on at for with from by is are was were be been it its this that these those you your we our they them he she my me so just not no yes do does did have has had will can could would should about what when where how why who all any some more most very really too also out up down over into than as like get got go going gonna one two new now today tonight time still even here there lol yeah okay thanks please let lets make made want need know think dont don't can't cant it's that's i'm i've i'll you're".split(" "));
  const words = new Map();
  for (const c of commits) {
    const t = (c.body || "").toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/[`*_>#~\[\](){}"“”.,!?;:]/g, " ");
    for (const w of t.split(/\s+/)) {
      if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w) || w.startsWith("@")) continue;
      words.set(w, (words.get(w) || 0) + 1);
    }
  }
  const topWords = [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w.slice(0, 14));
  return {
    user, stars, topWords, repliesIn, best, hours, peak, tags,
    total: Math.max(user.commits_count || 0, commits.length),
  };
}

export function fmt(n) { return n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + "k" : Number(n || 0).toLocaleString("en-US"); }

// avatar as data URL, only for formats satori can draw
export async function avatarData(url) {
  if (!url) return null;
  try {
    const r = await fetch(url);
    const type = (r.headers.get("content-type") || "").split(";")[0];
    if (!r.ok || !/^image\/(png|jpeg|jpg|gif)$/.test(type)) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length > 1_500_000) return null;
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return `data:${type};base64,${btoa(bin)}`;
  } catch { return null; }
}

// --- tiny element helper: h("div", style, ...children) ---
function h(type, style, ...children) {
  const kids = children.flat().filter((k) => k !== null && k !== undefined && k !== false);
  const props = { style: { display: "flex", ...style } };
  if (type === "img") { props.src = style.src; props.width = style.width; props.height = style.height; delete props.style.src; }
  if (kids.length) props.children = kids.length === 1 ? kids[0] : kids;
  return { type, props };
}
const text = (s, style) => h("div", style, String(s));

function tile(value, label, pink) {
  return h("div", { flexDirection: "column", flex: 1, background: C.panel, border: `2px solid ${C.line}`, borderRadius: 18, padding: "18px 22px" },
    text(value, { fontFamily: SANS, fontWeight: 800, fontSize: 50, color: pink ? C.pink : C.ink, lineHeight: 1 }),
    text(label, { fontFamily: MONO, fontSize: 18, color: C.dim, marginTop: 10 }));
}

function clip(s, max) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

export function cardTree(s, { avatar, host }) {
  const u = s.user;
  const name = clip(u.name || u.username, 22);
  const quote = s.best ? clip(s.best.body, 110) : "no commits yet. /dev/null is waiting.";
  const qSize = quote.length > 80 ? 30 : quote.length > 45 ? 36 : 42;
  const maxH = Math.max(1, ...s.hours);
  const initials = (u.name || u.username || "?").slice(0, 1).toUpperCase();

  return h("div", { width: 1200, height: 630, background: C.bg, flexDirection: "column", padding: "0 0 0 0", fontFamily: SANS, color: C.ink },
    h("div", { height: 10, width: "100%", background: C.pink }),
    h("div", { flexDirection: "column", flex: 1, padding: "34px 52px 30px" },
      // header
      h("div", { alignItems: "center", justifyContent: "space-between" },
        h("div", { alignItems: "center" },
          avatar
            ? h("img", { src: avatar, width: 104, height: 104, borderRadius: 52, border: `5px solid ${C.pink}` })
            : h("div", { width: 104, height: 104, borderRadius: 52, border: `5px solid ${C.pink}`, background: C.panel, alignItems: "center", justifyContent: "center", fontSize: 46, fontWeight: 800, color: C.pink }, initials),
          h("div", { flexDirection: "column", marginLeft: 26 },
            text(name, { fontWeight: 800, fontSize: 52, lineHeight: 1.05 }),
            text(`@${u.username}`, { fontFamily: MONO, fontSize: 24, color: C.dim, marginTop: 6 }))),
        h("div", { flexDirection: "column", alignItems: "flex-end" },
          text("/dev/null", { fontFamily: MONO, fontWeight: 700, fontSize: 34 }),
          text("WRAPPED", { fontFamily: MONO, fontWeight: 700, fontSize: 20, color: C.pink, letterSpacing: 3 }))),
      // stat tiles
      h("div", { marginTop: 28, gap: 18 },
        tile(fmt(s.total), "commits"),
        tile(fmt(s.stars), "stars received", true),
        tile(fmt(s.repliesIn), "replies received"),
        tile(fmt(u.followers_count || 0), "followers")),
      // best commit + side column
      h("div", { marginTop: 18, gap: 18, flex: 1 },
        h("div", { flexDirection: "column", flex: 1, background: C.panel, border: `2px solid ${C.line}`, borderRadius: 18, padding: "18px 24px" },
          h("div", { justifyContent: "space-between", fontFamily: MONO, fontSize: 18 },
            text(s.best ? `best commit  ${s.best.short_hash || ""}` : "best commit", { color: C.pink, fontWeight: 700 }),
            s.best ? text(`${s.best.stars_count || 0} stars · ${s.best.replies_count || 0} replies`, { color: C.dim }) : null),
          text(`“${quote}”`, { fontWeight: 800, fontSize: qSize, lineHeight: 1.2, marginTop: 14 }),
          s.topWords.length ? h("div", { marginTop: "auto", alignItems: "center", gap: 14, fontFamily: MONO, fontSize: 19 },
            text("grep -c your words", { color: C.pink, fontWeight: 700 }),
            s.topWords.map((w, i) => text(w, { color: i ? C.dim : C.ink, fontWeight: 700 }))) : null),
        h("div", { flexDirection: "column", width: 340, background: C.panel, border: `2px solid ${C.line}`, borderRadius: 18, padding: "18px 22px" },
          text("git config persona", { fontFamily: MONO, fontSize: 17, color: C.pink, fontWeight: 700 }),
          h("div", { flexWrap: "wrap", gap: 8, marginTop: 10 },
            s.tags.slice(0, 3).map((t) => text(t, { fontFamily: MONO, fontWeight: 700, fontSize: 17, color: C.ink, background: "#3a1d2a", border: `2px solid #5c2a40`, borderRadius: 14, padding: "4px 12px" }))),
          h("div", { justifyContent: "space-between", marginTop: "auto", fontFamily: MONO, fontSize: 15, color: C.dim },
            text("when you commit", {}), text(`peak ${String(s.peak).padStart(2, "0")}:00 UTC`, {})),
          h("div", { alignItems: "flex-end", gap: 3, height: 52, marginTop: 8 },
            s.hours.map((v, i) => h("div", { width: 9, height: Math.max(3, Math.round((v / maxH) * 52)), borderRadius: 2, background: i === s.peak ? C.pink : v ? "#6b3249" : C.faint }))))),
      // footer
      h("div", { justifyContent: "space-between", marginTop: 16, fontFamily: MONO, fontSize: 19, color: C.dim },
        text(`dev-null.sh/@${u.username}`, {}),
        text(`get yours · ${host}`, { color: C.ink }))));
}

export function missingTree(username, host) {
  return h("div", { width: 1200, height: 630, background: C.bg, flexDirection: "column", alignItems: "center", justifyContent: "center", color: C.ink, fontFamily: MONO },
    text("/dev/null wrapped", { fontWeight: 700, fontSize: 64 }),
    text(username ? `@${username} not found` : "your /dev/null in one card", { fontSize: 30, color: C.pink, marginTop: 20 }),
    text(host, { fontSize: 24, color: C.dim, marginTop: 40 }));
}
