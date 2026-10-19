import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadAgents, validateAgent, summarize, templateDraft, withLabel, postsToday, aiDraft, gitShipped, postToDevNull, clip,
} from "../agent/devnull-agent.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "agent", "devnull-agent.mjs");

function tempRepo(subjects) {
  const dir = mkdtempSync(join(tmpdir(), "dna-"));
  const git = (...a) => execFileSync("git", a, { cwd: dir, env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  git("init", "-q");
  subjects.forEach((s, i) => { writeFileSync(join(dir, `f${i}`), s); git("add", "."); git("commit", "-q", "-m", s); });
  return { dir, git };
}

test("every agent in agents/ is valid (contributed agents are checked here in CI)", () => {
  const agents = loadAgents();
  assert.ok(Object.keys(agents).length >= 5);
  for (const a of Object.values(agents)) assert.ok(templateDraft(a, { top: "x", list: ["x"], count: 1, repo: "r" }).length > 0);
});

test("validateAgent rejects bad agents", () => {
  assert.ok(validateAgent({ name: "Bad Name!" }).length > 1);
  assert.ok(validateAgent({ name: "ok", author: "a", description: "d", voice: "v".repeat(1001), template: "t" }).some((e) => e.includes("voice")));
  assert.ok(validateAgent({ name: "ok", author: "a", description: "d", voice: "v", template: "t" }, "other.json").some((e) => e.includes("file name")));
  assert.deepEqual(validateAgent({ name: "ok", author: "a", description: "d", voice: "v", template: "t" }, "ok.json"), []);
});

test("summarize puts features first and strips conventional prefixes", () => {
  const s = summarize([{ subject: "fix: typo in footer" }, { subject: "feat(api): crew cards." }, { subject: "docs: readme" }]);
  assert.equal(s.top, "crew cards");
  assert.deepEqual(s.list, ["crew cards", "typo in footer", "readme"]);
  assert.equal(s.count, 3);
});

test("templates fill placeholders and respect the length cap", () => {
  const a = { template: "shipped in {repo}: {top}. {count} commits ({list})" };
  assert.equal(templateDraft(a, { repo: "app", top: "login", count: 2, list: ["login", "logout"] }), "shipped in app: login. 2 commits (login, logout)");
  assert.equal(templateDraft({ template: "{top}" }, { top: "x".repeat(500), count: 1, list: [], repo: "r" }, 50).length, 50);
});

test("auto posts are labeled, approved posts are not", () => {
  assert.equal(withLabel("hi", { auto: false, label: true, maxChars: 280 }), "hi");
  assert.equal(withLabel("hi", { auto: true, label: true, maxChars: 280 }), "hi · via agent");
  assert.ok(withLabel("x".repeat(300), { auto: true, label: true, maxChars: 280 }).length <= 280);
});

test("daily cap counts only the last 24 hours", () => {
  const now = Date.now();
  assert.equal(postsToday({ posts: [now - 1e3, now - 2e3, now - 30 * 3600e3] }, now), 2);
});

test("AI draft: sends the voice and real commits, cleans the answer", async () => {
  let sent;
  const fakeFetch = async (url, init) => { sent = { url, init }; return new Response(JSON.stringify({ content: [{ type: "text", text: '"shipped crew cards"' }] })); };
  const out = await aiDraft({ voice: "be calm" }, { repo: "app", count: 1, list: ["crew cards"] }, { apiKey: "k", fetchImpl: fakeFetch, maxChars: 280 });
  assert.equal(out, "shipped crew cards");
  assert.equal(sent.url, "https://api.anthropic.com/v1/messages");
  assert.equal(sent.init.headers["x-api-key"], "k");
  const body = JSON.parse(sent.init.body);
  assert.match(body.system, /be calm/);
  assert.match(body.system, /Only mention work that appears in the commit list/);
  assert.match(body.messages[0].content, /- crew cards/);
  await assert.rejects(aiDraft({ voice: "v" }, { repo: "a", count: 0, list: [] }, { apiKey: "k", fetchImpl: async () => new Response("nope", { status: 401 }) }), /401/);
});

test("gitShipped reads real commits, skips noise, resumes from the last posted sha", () => {
  const { dir, git } = tempRepo(["feat: first thing", "wip", "fix: second thing"]);
  const all = gitShipped({ cwd: dir });
  assert.deepEqual(all.commits.map((c) => c.subject).sort(), ["feat: first thing", "fix: second thing"]);
  writeFileSync(join(dir, "z"), "z"); git("add", "."); git("commit", "-q", "-m", "feat: third");
  const since = gitShipped({ cwd: dir, sinceSha: all.head });
  assert.deepEqual(since.commits.map((c) => c.subject), ["feat: third"]);
});

test("posting passes the message as data: quotes, $() and backticks survive untouched", () => {
  const bin = mkdtempSync(join(tmpdir(), "dna-bin-")), out = join(bin, "posted.txt");
  // fake curl prints the "commit script"; bash -s runs it with the message as $1
  writeFileSync(join(bin, "curl"), `#!/bin/sh\necho 'printf "%s" "$1" > ${out}'\n`); chmodSync(join(bin, "curl"), 0o755);
  const msg = `it's "done" $(rm -rf ~) \`whoami\` & ; | > $HOME`;
  const old = process.env.PATH; process.env.PATH = `${bin}:${old}`;
  try { assert.equal(postToDevNull(msg, { dry: false }), true); } finally { process.env.PATH = old; }
  assert.equal(readFileSync(out, "utf8"), msg);
});

test("cli: auto post is drafted from git, labeled, then nothing new on the next run", () => {
  const { dir } = tempRepo(["feat: crew podium cards", "fix: case-insensitive usernames"]);
  const run = (...a) => spawnSync("node", [CLI, ...a], { cwd: dir, encoding: "utf8", env: { ...process.env, DEVNULL_AGENT_DRY: "1", ANTHROPIC_API_KEY: "" } });
  run("init");
  const first = run("post", "--yes");
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /would commit:\nshipped in dna-\w+: crew podium cards\. 2 commits today\. · via agent/);
  assert.match(run("post", "--yes").stdout, /nothing new shipped/);
  assert.match(run("agents").stdout, /haiku/);
  assert.equal(clip("abc", 2), "a…");
});
