# X/Twitter thread — draft

8 tweets. 280-char limit per tweet. Screenshot placeholders marked `[SCREENSHOT:...]`.
Capture the screenshots before posting and drop them into `docs/launch/screenshots/`.

---

**Tweet 1/8 — hook** (pin the thread from this one)

> I'm testing a hypothesis for 1 week before I commit to a 6-8 week MVP.
>
> The hypothesis: AI-native teams have a real "my agent can't reach our
> docs + tasks" problem.
>
> If I'm right, this probe gets 10+ installs in 7 days. If I'm wrong, I pivot.
>
> [SCREENSHOT: Claude Code asking "search payment-spec" → orgmem-probe returns hits]

---

**Tweet 2/8 — problem**

> The workaround today: dump your markdown notes in a folder, paste ticket
> links into PRDs, hope the agent finds the right context when you ask it
> something cross-cutting.
>
> It works ~80% of the time. The 20% is where the real pain hides.

---

**Tweet 3/8 — what it is**

> orgmem-probe: a read-only MCP server that exposes three resources to any
> MCP agent —
>
> • docs (your Obsidian vault)
> • tasks (Linear)
> • decisions (on-the-fly LLM extraction from docs)
>
> Seven tools. Stdio. 7 min to wire into Claude Code.

---

**Tweet 4/8 — what it isn't** (anti-overclaim)

> On purpose, it is NOT:
>
> • a graph store
> • a CLI to query your knowledge
> • a writer (no agent → doc mutations)
> • an embedding index
>
> All of that is Phase 1. Phase 0 is just: does anyone care enough to install it.

---

**Tweet 5/8 — install**

> ```
> npm install -g orgmem-probe
> export ORGMEM_VAULT=/path/to/vault
> export LINEAR_API_KEY=lin_api_...
> export ANTHROPIC_API_KEY=sk-ant-...
> ```
>
> Then paste the Claude Code snippet from the README into ~/.claude/mcp.json.
>
> https://github.com/Nohyunjin/orgmem-probe

---

**Tweet 6/8 — the three gates, publicly**

> I'm publishing the go/no-go rubric up front so I can't move the goalposts:
>
> Q1 — 3/5 interviewed team leads say the pain is real
> Q2 — 10+ installs in 7 days
> Q3 — 2+ users run it on 2+ different days
>
> All three green = Phase 1. Anything red = pivot.

---

**Tweet 7/8 — ask** (include CTA)

> Two concrete asks:
>
> 1. If you're on a 2–10 person AI-native eng team and this premise resonates,
>    reply or DM — I have 3 interview slots left.
>
> 2. If you install it, paste your `orgmem-probe stats` output into the
>    GitHub issue template. That's how Q3 gets measured.

---

**Tweet 8/8 — demo** (screenshot-driven)

> Live demo: Claude Code asking "why did we move payment from Stripe to Toss"
> across docs + tasks + extracted decisions in one pass.
>
> [SCREENSHOT: agent output combining search hits + decision extraction]
>
> Gate closes: 2026-04-21. Results posted here as a reply.

---

## Posting checklist

- [ ] Capture two screenshots (search result, agent cross-referencing)
- [ ] Replace `[SCREENSHOT:...]` placeholders
- [ ] Post tweet 1 as the thread root, then reply-chain 2–8
- [ ] Pin the thread
- [ ] Cross-post link in relevant Slack/Discord (see `discord.md`)
- [ ] Set a calendar reminder for 2026-04-21 to post Q1/Q2/Q3 results
