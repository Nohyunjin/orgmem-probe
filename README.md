# orgmem-probe

**Phase 0 probe** for an Organizational Memory OS — a read-only MCP wrapper that lets
your AI agent (Claude Code, Cursor, Claude Desktop, etc.) pull three kinds of
organizational knowledge through a single protocol:

| Resource | Source | MCP tools |
|---|---|---|
| **docs** | Any folder of markdown (Obsidian vault) | `docs_search`, `docs_list`, `docs_read` |
| **tasks** | Linear (via personal API key) | `tasks_list`, `tasks_get` |
| **decisions** | On-the-fly LLM extraction over docs | `decisions_extract`, `decisions_classify` |

This is **not** a finished product. It is a one-week probe built to answer three
go/no-go questions before committing to a 6–8 week MVP. If you install it and
use it twice, you are literally the signal the project is looking for.

---

## Go / No-go questions (Phase 0 gate)

The probe is instrumented to answer three questions. All three must pass for the
project to advance to Phase 1.

| # | Question | How it is measured | Status |
|---|---|---|---|
| **Q1** | Do AI-native team leads actually feel the "docs + tasks don't reach my agent" pain? | 5 interviews; 3+ agree with the pain; 2+ align with the target segment (2–10 person AI-native eng team) | **OPEN** — interviews in flight |
| **Q2** | Will anyone bother to install this? | 10+ distinct installs (GitHub stars / npm downloads / self-reported installs from launch post) | **OPEN** — pending launch post |
| **Q3** | Does anyone come back? | 2+ users report running the probe on two or more distinct days | **OPEN** — pending launch post |

Answers will be filled in here once the 1-week probe closes. If Q1 or (Q2 AND Q3)
fail, the project pivots per the CEO plan's Pivot Scenarios section rather than
starting Phase 1.

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
