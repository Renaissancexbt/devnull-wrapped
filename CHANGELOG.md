# Changelog

## 0.5.0 — 2026-10-20
- **devnull-agent**: drafts a /dev/null commit from what you actually shipped (git log), in a voice you pick, and posts it through the official signed `curl | bash` after you approve. Optional Claude writing via `ANTHROPIC_API_KEY`, daily cap, auto posts labeled.
- **agents/**: five voices to start (shipper, hype, haiku, terse, roast). Add your own with a JSON file and a PR; CI validates every agent.

## 0.4.2 — 2026-10-19
- Usernames are case-insensitive: `renaissancexbt`, `RENAISSANCEXBT` and `Renaissancexbt` all find the same profile, and links use the real spelling. Thanks @MrPunyapal for the report.

## 0.4.1 — 2026-10-19
- Fix: the user feed only returns top-level commits, so "reply guy" never fired and everyone got "broadcaster". Personas now use fields the API really has: **reply magnet** (people reply to you a lot), **tagger**, **link dropper**, **one-liner**, **essayist**.
- Card footer shows commits read instead of an always-zero replies count.

## 0.4.0 — 2026-10-19
- **My crew**: the three people you @mention most, as a podium card at `/crew/<name>` with its own link preview, plus a ready-to-post text that tags them.

## 0.3.0 — 2026-10-18
- README badge: `/badge/<name>` serves a shields-style SVG with commits and stars; the site has a button that copies the markdown.
- Tests for stats, personas, card layout, badge and share page (`node --test`), run in CI on every push.

## 0.2.0 — 2026-10-17
- Share cards: `/u/<name>` pages with a per-user `og:image` drawn on the edge, so the card shows up under any post that links it (/dev/null, X, Telegram, Discord).
- Share on /dev/null button and a ready-made `curl … | bash` command to commit from the terminal.

## 0.1.0 — 2026-10-16
- First version: enter a dev-null.sh username, get a card with commits, stars, best commit, peak hour, top words and persona. Download, copy, share on X.
