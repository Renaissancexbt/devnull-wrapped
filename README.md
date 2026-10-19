# /dev/null wrapped

**Toolkit for [/dev/null](https://dev-null.sh), the social network for devs.** Plug an agent into your repo that posts what you ship. Make your card, find your crew, put a badge on your GitHub.

| | What it does | Try it |
|---|---|---|
| 🤖 **Agents** | Reads your git log and drafts a /dev/null commit about what you actually shipped, in a voice you pick. You approve, it posts with your own SSH key. Add your own agent with one JSON file. | [`devnull-agent`](#devnull-agent-post-what-you-shipped) |
| 🎁 **Wrapped card** | Your /dev/null in one image: commits, stars, best commit, peak hour, persona. | [▶ make yours](https://renaissancexbt.github.io/devnull-wrapped/) |
| 🫡 **Crew** | The 3 people you @ most, on a podium card. Tag them, they make theirs. | `/crew/<you>` |
| 🏷 **Badge** | Your /dev/null stats on your GitHub profile README. | `/badge/<you>` |

### Plug in an agent in 30 seconds

```sh
git clone https://github.com/Renaissancexbt/devnull-wrapped ~/devnull-wrapped
cd your-project
node ~/devnull-wrapped/agent/devnull-agent.mjs init
node ~/devnull-wrapped/agent/devnull-agent.mjs post --agent hype
```

```
── hype drafted (85/280) ──
just shipped crew podium cards in devnull-wrapped 🚀 10 commits deep and it feels good

post it? [y]es / [e]dit / [n]o: y
committed to /dev/null ✓
```

Voices out of the box: **shipper**, **hype**, **haiku**, **terse**, **roast**. [Write your own →](agents/README.md)

![Example card: commits, stars received, best commit, when you commit, persona and top words](og.png)

## What's on the card

- **commits, stars received, replies received, followers**
- **best commit**: your most starred commit, quoted
- **when you commit**: a 24-hour histogram in your local time, with your peak hour
- **git config persona**: night owl / early bird / day shift / evening shipper, reply magnet, tagger, link dropper, one-liner or essayist, crowd favorite, screenshot enjoyer, your streak
- **last 14 days** and **grep -c your words**: what you post about most

Download it as a PNG, copy it straight to the clipboard, or share a link that rebuilds the card:
`https://renaissancexbt.github.io/devnull-wrapped/?u=nunomaduro`

## How it works

One static HTML file. It reads the public `dev-null.sh/api/v1` endpoints
(`users/{username}` and `users/{username}/commits`, following the cursor up to 800 commits),
computes everything in your browser and draws the card on a canvas. No server, no tracking,
nothing stored.

## Run it locally

```bash
git clone https://github.com/Renaissancexbt/devnull-wrapped && cd devnull-wrapped
python3 -m http.server 8000   # open http://localhost:8000/?u=your_username
```

Not affiliated with /dev/null. Made for fun by a user. MIT.

## Share cards (link previews)

Every share link points at `/u/<username>`, a tiny edge page whose `og:image` is that user's card,
rendered on the fly by `/api/og?u=<username>` (satori via `@vercel/og`). Paste the link into a
/dev/null commit, a tweet, Telegram or Discord and the card shows up under the post by itself,
no download or upload.

```
api/og.js    1200x630 PNG card for any /dev/null user (cached for an hour)
api/u.js     share page: OG/Twitter tags for the bots, instant redirect to the app for people
lib/card.js  fetch + stats + card layout, shared by both
```

Deploy: import the repo on Vercel, no settings needed.

## Your crew

**My crew** finds the three people you @mention most in your commits (checked against /dev/null so typos
drop out) and makes a podium card for them. Share `/crew/<name>` and the card shows up under the post.
Tag your crew, they make theirs.

/dev/null's API has star counts but not who starred, so "your people" means who you talk to.

## devnull-agent: post what you shipped

An agent that reads your git log and drafts a /dev/null commit about what you actually shipped,
in the voice you pick. It drafts first and posts only when you say yes.

```sh
node agent/devnull-agent.mjs agents              # list voices: shipper, hype, haiku, terse, roast
node agent/devnull-agent.mjs init                # per-repo config in .devnull-agent/
node agent/devnull-agent.mjs draft --agent haiku # see a draft, post nothing
node agent/devnull-agent.mjs post                # draft → [y]es / [e]dit / [n]o → commit
```

- **Writes from real work only.** Input is your commits since the last post; the prompt forbids inventing anything.
- **AI optional.** Set `ANTHROPIC_API_KEY` and the agent writes with Claude (`DEVNULL_AGENT_MODEL` to change the model). Without it, it fills the agent's template.
- **Your key, your post.** Posting runs the official `curl dev-null.sh/commit | bash`, signed with your own SSH key.
- **Threads and images.** `--reply <commit>` posts a follow-up under an existing commit, `--image <file>` attaches a picture (your wrapped card, a screenshot). Both are flags of /dev/null's own `/commit` script, the agent just forwards them.

```sh
node agent/devnull-agent.mjs post --reply 8d21928 --image devnull-wrapped-you.png
```

### What /dev/null enforces vs. what the agent adds

| | Who | What |
|---|---|---|
| Signed posting | **/dev/null** | The terminal path checks an SSH key published on your GitHub. Your private key never leaves your machine ([Settings → Terminal](https://dev-null.sh) has the `/commit` script). |
| Content limits, moderation | **/dev/null** | Same rules as posting from the site. |
| 10 submissions per minute | **/dev/null** | Platform rate limit for the terminal path. |
| Draft first, ask y / edit / n | **devnull-agent** | Our default. Not platform behaviour. |
| Max 3 posts a day | **devnull-agent** | Our default, change `maxPerDay` in `.devnull-agent/config.json`. Not platform behaviour. |
| `· via agent` label on `--yes` posts | **devnull-agent** | Our convention, so people can tell. Not required by /dev/null. |

Thanks [@tom](https://dev-null.sh/@tom) for the review.

### Add your own agent

An agent is one JSON file in [`agents/`](agents/): a name, a voice and a fallback template.
Open a PR with yours. CI checks the format. See [agents/README.md](agents/README.md).

## README badge

Show your /dev/null stats on your GitHub profile:

```md
[![/dev/null](https://devnull-wrapped.vercel.app/badge/YOUR_NAME)](https://dev-null.sh/@YOUR_NAME)
```

Or press **README badge** on the site to copy it with your name filled in.

## Development

```sh
node --test test/*.test.js   # stats, card layout, badge, share page
```

No build step. `index.html` is the whole app; `api/` runs on Vercel's edge.
