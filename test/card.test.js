import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanName, stats, fmt, cardTree, missingTree, mentions, crewTree } from "../lib/card.js";
import { badgeSVG } from "../api/badge.js";
import uHandler from "../api/u.js";

const at = (h, day = 1) => new Date(Date.UTC(2026, 9, day, h)).toISOString();
const commit = (o) => ({ id: Math.random(), short_hash: "abc1234", body: "shipped it", parent_id: null, stars_count: 0, replies_count: 0, images: [], created_at: at(12), ...o });
const user = { username: "dev", name: "Dev", commits_count: 0, followers_count: 7 };

test("cleanName strips junk and @", () => {
  assert.equal(cleanName("@nunomaduro"), "nunomaduro");
  assert.equal(cleanName('"><script>'), "script");
  assert.equal(cleanName("a".repeat(80)).length, 39);
  assert.equal(cleanName(null), "");
});

test("fmt shortens big numbers", () => {
  assert.equal(fmt(999), "999");
  assert.equal(fmt(1233), "1,233");
  assert.equal(fmt(12345), "12.3k");
  assert.equal(fmt(250000), "250k");
});

test("stats: totals, best commit, peak hour", () => {
  const s = stats({ user, commits: [
    commit({ stars_count: 2, created_at: at(3) }),
    commit({ stars_count: 9, replies_count: 4, body: "the good one", created_at: at(3, 2) }),
    commit({ parent_id: 1, created_at: at(22) }),
  ] });
  assert.equal(s.total, 3);
  assert.equal(s.stars, 11);
  assert.equal(s.repliesIn, 4);
  assert.equal(s.best.body, "the good one");
  assert.equal(s.peak, 3);
  assert.ok(s.tags.includes("night owl"));
  assert.ok(s.tags.includes("well starred"));
});

test("stats: uses profile commits_count when larger than what was fetched", () => {
  assert.equal(stats({ user: { ...user, commits_count: 500 }, commits: [commit({})] }).total, 500);
});

test("stats: personas come from fields the feed really has", () => {
  const chatty = Array.from({ length: 6 }, () => commit({ body: "hey @alice look", replies_count: 5, created_at: at(20) }));
  const s = stats({ user, commits: chatty });
  assert.deepEqual(s.tags, ["evening shipper", "reply magnet", "tagger", "one-liner"]);
  const loud = Array.from({ length: 5 }, () => commit({ body: "x".repeat(300), stars_count: 20, images: [{}], link_preview: { url: "u" }, created_at: at(7) }));
  assert.deepEqual(stats({ user, commits: loud }).tags, ["early bird", "link dropper", "essayist", "crowd favorite", "screenshot enjoyer"]);
  // no replies in the feed means nobody gets "broadcaster" for free any more
  assert.ok(!stats({ user, commits: [commit({ body: "a normal sized commit message here, nothing special about it at all" })] }).tags.some((t) => t === "broadcaster" || t === "reply guy"));
});

test("stats: empty profile does not crash", () => {
  const s = stats({ user, commits: [] });
  assert.equal(s.total, 0);
  assert.equal(s.best, null);
  assert.deepEqual(s.topWords, []);
});

test("stats: top words skip stopwords, links and mentions", () => {
  const s = stats({ user, commits: [
    commit({ body: "rust rust rust and the https://x.com/rust @rust" }),
    commit({ body: "rust is fast, laravel too" }),
  ] });
  assert.equal(s.topWords[0], "rust");
  assert.ok(!s.topWords.includes("the"));
  assert.ok(!s.topWords.some((w) => w.includes("http") || w.startsWith("@")));
});

test("card tree builds for full and empty profiles", () => {
  const walk = (n, f) => { f(n); const c = n.props && n.props.children; (Array.isArray(c) ? c : c ? [c] : []).forEach((k) => typeof k === "object" && walk(k, f)); };
  for (const commits of [[commit({ body: "x".repeat(400) })], []]) {
    const tree = cardTree(stats({ user, commits }), { avatar: null, host: "example.app" });
    assert.equal(tree.props.style.width, 1200);
    // satori needs display:flex on every div with more than one child
    walk(tree, (n) => { if (Array.isArray(n.props.children)) assert.equal(n.props.style.display, "flex"); });
  }
  assert.equal(missingTree("ghost", "example.app").props.style.height, 630);
});

test("long best commit is clipped", () => {
  const tree = JSON.stringify(cardTree(stats({ user, commits: [commit({ body: "y".repeat(400) })] }), { avatar: null, host: "h" }));
  assert.ok(tree.includes("…"));
  assert.ok(!tree.includes("y".repeat(120)));
});

test("badge escapes and sizes", () => {
  const svg = badgeSVG("/dev/null", '<b>&"');
  assert.ok(svg.startsWith("<svg"));
  assert.ok(!svg.includes("<b>"));
  const w = (s) => Number(s.match(/width="(\d+)"/)[1]);
  assert.ok(w(badgeSVG("/dev/null", "1 commits")) < w(badgeSVG("/dev/null", "1,234 commits · 5,678 ★")));
});

test("share page: OG tags point at the card, input is escaped", async () => {
  const html = await uHandler(new Request("https://wrapped.test/api/u?u=nunomaduro")).text();
  assert.match(html, /og:image" content="https:\/\/wrapped\.test\/api\/og\?u=nunomaduro/);
  assert.match(html, /twitter:card" content="summary_large_image/);
  assert.match(html, /url=https:\/\/wrapped\.test\/\?u=nunomaduro/);
  const evil = await uHandler(new Request("https://wrapped.test/api/u?u=%22%3E%3Cscript%3Ealert(1)%3C/script%3E")).text();
  assert.ok(!evil.includes("<script>"));
});

test("mentions: counts people once per commit, skips self, emails and links", () => {
  const m = mentions([
    commit({ body: "pairing with @alice and @alice again" }),
    commit({ body: "@Alice @bob review pls" }),
    commit({ body: "mail me at x@y.com, see https://x.com/@carol" }),
    commit({ body: "talking to myself @dev" }),
    commit({ body: "thanks @bob_" }),
  ], "dev");
  assert.deepEqual(m.map((x) => [x.username.toLowerCase(), x.n]), [["alice", 2], ["bob", 2]]);
});

test("crew card: podium for 1-3 members and an empty state", () => {
  const walk = (n, f) => { f(n); const c = n.props && n.props.children; (Array.isArray(c) ? c : c ? [c] : []).forEach((k) => typeof k === "object" && walk(k, f)); };
  const people = [{ username: "alice", n: 3 }, { username: "bob", n: 2 }, { username: "carol", n: 1 }];
  for (let k = 0; k <= 3; k++) {
    const tree = crewTree(user, people.slice(0, k), { host: "h" });
    walk(tree, (n) => { if (Array.isArray(n.props.children)) assert.equal(n.props.style.display, "flex"); });
    const json = JSON.stringify(tree);
    assert.equal(json.includes("no crew yet"), k === 0);
    if (k) assert.ok(json.includes("#1"));
  }
});

test("share page: crew links get the crew card", async () => {
  const html = await uHandler(new Request("https://wrapped.test/api/u?u=dev&kind=crew")).text();
  assert.match(html, /og:image" content="https:\/\/wrapped\.test\/api\/og\?u=dev&amp;kind=crew/);
  assert.match(html, /@dev&#39;s \/dev\/null crew/);
});
