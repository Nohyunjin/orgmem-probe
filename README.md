# orgmem-probe

[![npm version](https://img.shields.io/npm/v/orgmem-probe.svg)](https://www.npmjs.com/package/orgmem-probe)
[![npm downloads](https://img.shields.io/npm/dw/orgmem-probe.svg?label=weekly%20downloads)](https://www.npmjs.com/package/orgmem-probe)
[![GitHub stars](https://img.shields.io/github/stars/Nohyunjin/orgmem-probe.svg?style=social)](https://github.com/Nohyunjin/orgmem-probe/stargazers)
[![phase 1 active](https://img.shields.io/badge/phase%201-active%20at%20Nohyunjin%2Forgmem-success)](https://github.com/Nohyunjin/orgmem)

**Phase 0 probe** for an Organizational Memory OS — a read-only MCP wrapper that lets
your AI agent (Claude Code, Cursor, Claude Desktop, etc.) pull three kinds of
organizational knowledge through a single protocol:

| Resource | Source | MCP tools |
|---|---|---|
| **docs** | Any folder of markdown (Obsidian vault) | `docs_search`, `docs_list`, `docs_read` |
| **tasks** | Linear (via personal API key) | `tasks_list`, `tasks_get` |
| **decisions** | On-the-fly LLM extraction over docs | `decisions_extract`, `decisions_classify` |

It is now a companion to the Phase 1 build happening at
[**Nohyunjin/orgmem**](https://github.com/Nohyunjin/orgmem). If you install the
probe and use it twice, you are the most useful kind of early signal — but
the probe no longer blocks whether Phase 1 ships.

---

## Founder commitment

I chose to start Phase 1 without waiting 7 days for the gate evaluation
because I have high personal conviction on the hypothesis and the dogfood
value is immediate — I am the target user, and the graph engine saves me
work from day one whether or not an external user ever installs this probe.

The probe stays in the field as an **informative** data collector. Q1/Q2/Q3
below continue to be measured and reported; they will shape Phase 1
priorities (which features to harden first, who to talk to, where to push
distribution) but will not gate the build. If the data comes back strong,
the probe's audience graduates into Phase 1 beta. If it comes back weak,
that is a signal to narrow Phase 1's target segment, not to stop.

---

## Informative signals (Q1/Q2/Q3)

Still collected, still published. **Informative**, not a gate.

| # | Question | How it is measured | Status |
|---|---|---|---|
| **Q1** | Do AI-native team leads actually feel the "docs + tasks don't reach my agent" pain? | Interviews + [pain-signal issues](https://github.com/Nohyunjin/orgmem-probe/issues?q=label%3Aq1-pain); count team-lead respondents scoring ≥7 with concrete workaround | **informative** |
| **Q2** | Will anyone bother to install this? | npm weekly downloads + GitHub stars (see badges above) | **informative** |
| **Q3** | Does anyone come back? | [q3-stats issues](https://github.com/Nohyunjin/orgmem-probe/issues?q=label%3Aq3-stats); count submissions with `distinctDaysUsed >= 2` | **informative** |

Collection methodology unchanged:

- **Q1**: the [Pain signal issue template](https://github.com/Nohyunjin/orgmem-probe/issues/new?template=pain-signal.yml) captures team size, agent usage frequency, pain score (1–10), workaround, and buy-signal. Five 30-minute interviews cover the long-form version (notes stay local under `docs/interviews/`, gitignored).
- **Q2**: npm weekly download count and GitHub stars, both visible via the badges at the top.
- **Q3**: the [My stats issue template](https://github.com/Nohyunjin/orgmem-probe/issues/new?template=my-stats.yml) collects voluntary `orgmem-probe stats` output. No network telemetry — all counting is opt-in.

A short summary of what the data showed, and how it shaped Phase 1, will be
appended to this README at the end of Week 1 of Phase 1.

---

## Install

```bash
npm install -g orgmem-probe
```

Node 18+ required. The install adds a single `orgmem-probe` binary to your PATH.

Verify:

```bash
orgmem-probe --version
orgmem-probe --help
```

---

## Configure

Three environment variables. Only `ORGMEM_VAULT` is required; the others unlock
additional tools.

```bash
export ORGMEM_VAULT="$HOME/Documents/MyVault"   # required for docs_*
export LINEAR_API_KEY="lin_api_..."             # required for tasks_*
export ANTHROPIC_API_KEY="sk-ant-..."           # required for decisions_*
```

Optional:

```bash
export ORGMEM_DECISIONS_MODEL="claude-haiku-4-5-20251001"   # override model
export ORGMEM_TELEMETRY=off                                 # opt out of local usage log
```

---

## Wire it into your agent

### Claude Code

Add to `~/.claude/mcp.json` (or the project-level equivalent):

```json
{
  "mcpServers": {
    "orgmem": {
      "command": "orgmem-probe",
      "args": ["serve"],
      "env": {
        "ORGMEM_VAULT": "/absolute/path/to/your/vault",
        "LINEAR_API_KEY": "lin_api_...",
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

Then, in Claude Code, ask the agent things like:

> "Search my vault for anything about the payment spec, then extract the
> decisions from that doc."

> "List my open Linear issues in team PLAT and cross-reference any that relate
> to docs in my vault."

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
with the same `mcpServers` block as above. Restart the app.

### Cursor / other MCP clients

Any MCP-compatible client that supports stdio servers can run
`orgmem-probe serve`.

---

## MCP tool reference

All tools return JSON text content. Errors are returned as `isError: true` with
a human-readable message.

### `docs_search`
Keyword search across markdown files under `ORGMEM_VAULT`. Case-insensitive
substring matches, ranked by occurrence count. Returns up to `limit` hits with
snippet context.

- `query` (string, required) — space-separated keywords (2+ chars each)
- `limit` (int, optional, default 20, max 50)

### `docs_list`
Lists markdown files, most recently modified first.

- `limit` (int, optional, default 50, max 500)

### `docs_read`
Reads a single markdown file's frontmatter + body.

- `path` (string, required) — path relative to vault root. Paths that resolve
  outside the vault are rejected.

### `tasks_list`
Lists Linear issues. Needs `LINEAR_API_KEY`.

- `query` (string, optional) — fuzzy match on issue content
- `teamKey` (string, optional) — e.g. `"PLAT"`
- `assignedToMe` (bool, optional)
- `limit` (int, optional, default 25, max 100)

### `tasks_get`
Fetch one issue.

- `id` (string, required) — Linear identifier (`"PLAT-142"`) or UUID.

### `decisions_extract`
Reads a vault doc and asks Claude to pull out the sentences where the team
committed to something (chose X, deferred Y, adopted policy Z). On-the-fly —
no local cache. Needs `ANTHROPIC_API_KEY`.

- `path` (string, required)

Output shape is aligned with the Phase 1 eval harness (a 60-pair labeled
dataset with a ≥90% precision / ≥70% recall gate), so the same prompt can be
regression-tested before Phase 1 ships.

### `decisions_classify`
Binary classifier for a single snippet: `"decision"` or `"non_decision"`.
Matches the eval dataset input shape 1:1.

- `text` (string, required)

---

## Local usage stats

```bash
orgmem-probe stats
```

Prints a small JSON blob: your random install id, first-run timestamp, count of
each tool called, and distinct days used. This is **local only** — no network
telemetry. If you want to help answer Q2/Q3 above, paste that JSON into a
GitHub issue titled `[probe-feedback]` or reply to the launch thread.

Opt out any time with `ORGMEM_TELEMETRY=off`.

---

## What this probe is NOT

- Not a CLI to query the graph (`kg ask` etc.) — that is Phase 1.
- Not a writer — all six tools are read-only. No `graph.create_node`, no
  `doc.append`. Phase 1.
- Not an FS watcher / SQLite index. Each call walks the vault fresh.
- Not an embedding index. Search is keyword-only. Phase 1 adds
  BM25 + embeddings hybrid.

If this probe earns the three green checks above, those pieces land next.

---

## Development

```bash
git clone https://github.com/Nohyunjin/orgmem-probe.git
cd orgmem-probe
npm install
npm run build
npm run smoke   # spins up the server against a temp vault, runs initialize + tools/list + tools/call
```

---

## License

MIT.
