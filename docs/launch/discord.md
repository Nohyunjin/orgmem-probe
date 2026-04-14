# Discord / Slack community post — draft

Short. Rewrite per-community norms before pasting. Pick one channel:
`#show-and-tell`, `#mcp`, `#builders`, `#ai-native`, or whatever the
community's build-in-public channel is.

---

## Version A — builder-focused (3 paragraphs, ~150 words)

> Shipping a 1-week probe before committing to a longer MVP — would love
> eyes from anyone running Claude Code / Cursor in a small team.
>
> It's a read-only MCP wrapper that gives your agent three things: your
> Obsidian vault (docs), your Linear issues (tasks), and on-the-fly LLM
> extraction of committed decisions from any doc. Seven MCP tools total, stdio,
> wire into Claude Code in ~7 minutes.
>
> The whole thing is scoped as a buy-signal test, not a product. I'm publishing
> the go/no-go rubric publicly: **3/5 interviews say the pain is real, 10+
> installs, 2+ returning users by 2026-04-21**. Gate fails → I pivot. If you
> install it, running `orgmem-probe stats` and dropping the output into a
> GitHub issue is the single most useful thing you can do.
>
> Repo: https://github.com/Nohyunjin/orgmem-probe

---

## Version B — ultra-short (1 paragraph, ~50 words)

> 1-week probe for an agent-native knowledge graph — a read-only MCP server
> that gives Claude/Cursor your Obsidian vault + Linear + LLM-extracted
> decisions. Shipping the Phase 1 commit decision on 2026-04-21 based on
> install/usage data. If you try it, `orgmem-probe stats` → GitHub issue
> is gold.
>
> https://github.com/Nohyunjin/orgmem-probe

---

## Posting order

1. Claude Developers discord → `#mcp` or `#show-and-tell`
2. MCP community (if a dedicated discord exists)
3. Any AI-native eng slack you're already in (respect the `#build` etiquette —
   single post, reply with updates instead of reposts)
4. HN (separate, see `hn.md`)
5. X thread (see `x-thread.md`)

Do NOT mass-DM. Cold outreach goes through the 5-interview funnel in the
design doc, not the broadcast channels.
