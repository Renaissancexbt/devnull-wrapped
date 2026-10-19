#!/usr/bin/env node
// devnull-agent: turns what you actually shipped (your git log) into a /dev/null commit,
// written in the voice of an agent you pick. Drafts first, posts only when you say yes.
//
//   node agent/devnull-agent.mjs agents            list voices
//   node agent/devnull-agent.mjs init              set up this repo (.devnull-agent/)
//   node agent/devnull-agent.mjs draft [--agent x] print a draft, post nothing
//   node agent/devnull-agent.mjs post  [--agent x] draft → you approve/edit → post
//   node agent/devnull-agent.mjs post --yes        post without asking (capped, labeled)
//   node agent/devnull-agent.mjs post --reply <commit> --image card.png   thread a follow-up
//
// With ANTHROPIC_API_KEY set the agent writes the post with Claude; without it, it uses the
// agent's template. Posting goes through the official `curl dev-null.sh/commit | bash`,
// signed with your own SSH key. Nothing here ever sees that key.

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, appendFileSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";

const HERE = dirname(fileURLToPath(import.meta.url));
export const AGENTS_DIR = join(HERE, "..", "agents");
const DIR = ".devnull-agent";
const DEFAULTS = { agent: "shipper", maxPerDay: 3, maxChars: 280, label: true };
const AUTO_LABEL = " · via agent";

// ---------- agents ----------
export function validateAgent(a, file = "") {
  const errs = [];
  if (!a || typeof a !== "object") return ["not an object"];
  if (!/^[a-z0-9-]{2,32}$/.test(a.name || "")) errs.push("name must be 2-32 chars of a-z, 0-9, -");
  if (file && basename(file, ".json") !== a.name) errs.push("name must match the file name");
  for (const k of ["author", "description", "voice", "template"]) if (typeof a[k] !== "string" || !a[k].trim()) errs.push(`${k} is required`);
  if ((a.voice || "").length > 1000) errs.push("voice must be under 1000 chars");
  if ((a.template || "").length > 300) errs.push("template must be under 300 chars");
  return errs;
}

export function loadAgents(dir = AGENTS_DIR) {
  const out = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const a = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const errs = validateAgent(a, f);
    if (errs.length) throw new Error(`agents/${f}: ${errs.join("; ")}`);
    out[a.name] = a;
  }
  return out;
}

// ---------- what shipped ----------
const NOISE = /^(wip|fixup!|squash!|merge |bump |chore\(deps\)|update readme$|typo)/i;

export function gitShipped({ cwd = process.cwd(), sinceSha = null, sinceHours = 24 } = {}) {
  const range = sinceSha ? [`${sinceSha}..HEAD`] : [`--since=${sinceHours} hours ago`];
  let out = "";
  try {
    out = execFileSync("git", ["log", "--no-merges", "--pretty=%H%x09%s", ...range], { cwd, encoding: "utf8" });
  } catch { return { head: null, commits: [] }; }
  const commits = out.split("\n").filter(Boolean).map((l) => { const [sha, ...s] = l.split("\t"); return { sha, subject: s.join("\t").trim() }; })
    .filter((c) => c.subject && !NOISE.test(c.subject));
  let head = null;
  try { head = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim(); } catch {}
  return { head, commits };
}

const RANK = { feat: 0, perf: 1, fix: 2, refactor: 3, docs: 4, test: 5, ci: 6, chore: 7 };
export function summarize(commits) {
  const items = commits.map((c) => {
    const m = c.subject.match(/^(\w+)(\([^)]*\))?!?:\s*(.+)$/);
    return m ? { type: m[1].toLowerCase(), text: m[3] } : { type: "other", text: c.subject };
  });
  items.sort((a, b) => (RANK[a.type] ?? 3.5) - (RANK[b.type] ?? 3.5));
  const clean = (t) => t.replace(/\s+/g, " ").replace(/\.$/, "").trim();
  return { top: items[0] ? clean(items[0].text) : "", list: items.slice(0, 5).map((i) => clean(i.text)), count: commits.length };
}

export function clip(s, max) {
  s = String(s).trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

export function templateDraft(agent, ctx, maxChars = 280) {
  const fill = { top: ctx.top, count: String(ctx.count), repo: ctx.repo, list: ctx.list.join(", ") };
  return clip(agent.template.replace(/\{(top|count|repo|list)\}/g, (_, k) => fill[k]), maxChars);
}

export async function aiDraft(agent, ctx, { apiKey, model = process.env.DEVNULL_AGENT_MODEL || "claude-haiku-5-5", maxChars = 280, fetchImpl = fetch } = {}) {
  const system = [
    agent.voice,
    `Write ONE post for /dev/null, a social network for developers where posts are called commits.`,
    `Hard rules: at most ${maxChars} characters. Only mention work that appears in the commit list. Never invent features, numbers or users.`,
    `No hashtags. No links unless one is in the list. Output the post text only, nothing else.`,
  ].join("\n");
  const user = `Repo: ${ctx.repo}\nCommits shipped (${ctx.count}):\n${ctx.list.map((l) => `- ${l}`).join("\n")}`;
  const r = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 400, system, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`model answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  if (!text) throw new Error("model returned an empty post");
  return clip(text.replace(/^["“]|["”]$/g, ""), maxChars);
}

// ---------- state + limits ----------
export function readJSON(path, fallback) { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; } }

export function postsToday(state, now = Date.now()) {
  return (state.posts || []).filter((t) => now - t < 24 * 3600e3).length;
}

export function withLabel(msg, { auto, label, maxChars }) {
  if (!auto || !label) return msg;
  return clip(msg, maxChars - AUTO_LABEL.length) + AUTO_LABEL;
}

// ---------- posting ----------
// --reply and --image are flags of /dev/null's own /commit script (Settings → Terminal);
// we only check them and forward them.
export function commitFlags({ reply, image } = {}) {
  const flags = [];
  if (reply) {
    if (!/^[0-9a-f][0-9a-f-]{5,39}$/i.test(reply)) throw new Error(`--reply wants a commit hash or id, got "${reply}"`);
    flags.push("--reply", reply);
  }
  if (image) {
    if (!existsSync(image) || !statSync(image).isFile()) throw new Error(`--image: no such file ${image}`);
    flags.push("--image", image);
  }
  return flags;
}

export function postToDevNull(msg, { dry = !!process.env.DEVNULL_AGENT_DRY, reply, image } = {}) {
  const flags = commitFlags({ reply, image });
  if (dry) { process.stdout.write(`[dry run] would commit${flags.length ? ` (${flags.join(" ")})` : ""}:\n${msg}\n`); return true; }
  // flags and message go in as positional arguments ("$@"), never through the shell parser
  const r = spawnSync("bash", ["-c", 'curl -fsSL https://dev-null.sh/commit | bash -s -- "$@"', "devnull-agent", ...flags, msg], { stdio: "inherit" });
  return r.status === 0;
}

// ---------- cli ----------
function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--yes" || a === "-y") o.yes = true;
    else if (a === "--agent") o.agent = argv[++i];
    else if (a === "--reply") o.reply = argv[++i];
    else if (a === "--image") o.image = argv[++i];
    else if (a === "--hours") o.hours = Number(argv[++i]);
    else o._.push(a);
  }
  return o;
}

async function main() {
  const o = args(process.argv.slice(2));
  const cmd = o._[0] || "help";
  const agents = loadAgents();
  const cfgPath = join(DIR, "config.json"), statePath = join(DIR, "state.json");
  const cfg = { ...DEFAULTS, ...readJSON(cfgPath, {}) };

  if (cmd === "agents") {
    for (const a of Object.values(agents)) console.log(`${a.name.padEnd(10)} ${a.description}  (by ${a.author})`);
    return;
  }
  if (cmd === "init") {
    mkdirSync(DIR, { recursive: true });
    if (!existsSync(cfgPath)) writeFileSync(cfgPath, JSON.stringify(DEFAULTS, null, 2) + "\n");
    if (existsSync(".gitignore") && !readFileSync(".gitignore", "utf8").includes(DIR)) appendFileSync(".gitignore", `\n${DIR}/\n`);
    console.log(`ready. edit ${cfgPath} to pick an agent and limits. try: devnull-agent draft`);
    return;
  }
  if (cmd !== "draft" && cmd !== "post") {
    console.log("usage: devnull-agent agents | init | draft [--agent name] [--hours 24] | post [--agent name] [--reply <commit>] [--image <file>] [--yes]");
    return;
  }

  commitFlags({ reply: o.reply, image: o.image });
  const agent = agents[o.agent || cfg.agent];
  if (!agent) throw new Error(`no agent "${o.agent || cfg.agent}". run: devnull-agent agents`);
  const state = readJSON(statePath, { posts: [] });
  const { head, commits } = gitShipped({ sinceSha: o.hours ? null : state.lastSha, sinceHours: o.hours || 24 });
  if (!commits.length) { console.log("nothing new shipped since the last post. go write some code"); return; }

  const ctx = { ...summarize(commits), repo: basename(process.cwd()) };
  const key = process.env.ANTHROPIC_API_KEY;
  let draft = key ? await aiDraft(agent, ctx, { apiKey: key, maxChars: cfg.maxChars }).catch((e) => { console.error(`AI draft failed (${e.message}), using template`); return null; }) : null;
  draft = draft || templateDraft(agent, ctx, cfg.maxChars);

  console.log(`\n── ${agent.name} drafted (${draft.length}/${cfg.maxChars}) ──\n${draft}\n`);
  if (cmd === "draft") return;

  if (postsToday(state) >= cfg.maxPerDay) { console.log(`daily limit reached (${cfg.maxPerDay}). change maxPerDay in ${cfgPath} if you mean it`); return; }

  let final = draft;
  if (!o.yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = (await rl.question("post it? [y]es / [e]dit / [n]o: ")).trim().toLowerCase();
    if (ans === "e") final = clip((await rl.question("your version: ")).trim() || draft, cfg.maxChars);
    rl.close();
    if (!["y", "yes", "e"].includes(ans)) { console.log("not posted"); return; }
  }
  final = withLabel(final, { auto: !!o.yes, label: cfg.label, maxChars: cfg.maxChars });

  if (!postToDevNull(final, { reply: o.reply, image: o.image })) { console.error("posting failed, nothing saved"); process.exitCode = 1; return; }
  mkdirSync(DIR, { recursive: true });
  writeFileSync(statePath, JSON.stringify({ lastSha: head, posts: [...(state.posts || []), Date.now()].slice(-50) }, null, 2) + "\n");
  console.log("committed to /dev/null ✓");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
