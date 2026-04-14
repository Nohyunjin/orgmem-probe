# Show HN post — draft

**Title (80 char max):**

> Show HN: orgmem-probe – a 1-week probe for an agent-native knowledge graph

Alt title if you want to be more concrete:

> Show HN: Read-only MCP wrapper that gives your Claude/Cursor agent your docs + Linear

---

**Body (~300 words):**

This is a 1-week probe, not a product.

I'm exploring whether there's real pain in "my AI coding agent can't reach my
team's knowledge" that's worth 6–8 weeks of MVP work. Before I commit, I wanted
to ship the smallest possible artifact that lets me measure it.

`orgmem-probe` is a read-only MCP server. It gives any MCP-compatible agent
(Claude Code, Claude Desktop, Cursor, etc.) three tool families:

- **docs** — search/list/read an Obsidian-style markdown vault
- **tasks** — list/get issues from Linear (your personal API key)
- **decisions** — on-the-fly LLM extraction of committed decisions from a doc

It is intentionally *not* a graph store, not a CLI, not a writer, not an
embedding index. All of those are Phase 1 — and I only build Phase 1 if this
probe passes three gates:

1. 3+ of 5 interviewed AI-native team leads say the pain is real.
2. 10+ distinct installs in the next 7 days.
3. 2+ users who run it on 2+ different days.

Install:

```
npm install -g orgmem-probe
export ORGMEM_VAULT=/path/to/your/vault
# then wire it into ~/.claude/mcp.json (example in the README)
```

Source + README with the full go/no-go rubric, Claude Code config, and a
stdio smoke test:

https://github.com/Nohyunjin/orgmem-probe

Specifically what I'd love to hear:

- If you're on an AI-native team (2–10 eng, Claude Code / Cursor daily): does
  "docs + tasks don't reach my agent" actually hurt? How are you working around
  it today?
- If you install it: run `orgmem-probe stats` after a few uses and paste the
  JSON into the GitHub issue templates. That's literally how I answer Q3.

Roasts welcome. The whole point of this probe is to hear "no, this isn't a
real problem" early if that's the truth.
