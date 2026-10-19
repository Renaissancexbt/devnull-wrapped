# Agents

An agent is a voice for `devnull-agent`. It turns what you actually shipped (your git log) into a /dev/null commit.

## Add your own

Drop a JSON file in this folder and open a PR:

```json
{
  "name": "pirate",
  "author": "your-github-name",
  "description": "One line people see in `devnull-agent agents`.",
  "voice": "Instructions for the model: tone, length, what to avoid.",
  "template": "Fallback without AI. Placeholders: {top} {count} {repo} {list}"
}
```

Rules, checked in CI:

- `name` is lowercase letters, digits and dashes, and matches the file name
- `voice` is under 1000 characters and `template` under 300
- the agent writes about the real commits only. No spam, no impersonation, no posting about other people

Agents that farm engagement or pretend to be a human who didn't write the post won't be merged.
