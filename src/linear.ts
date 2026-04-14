export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  state: string;
  priority: number;
  url: string;
  assignee: string | null;
  team: string | null;
  updatedAt: string;
}

const LINEAR_ENDPOINT = "https://api.linear.app/graphql";

async function linearRequest<T>(apiKey: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(LINEAR_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Linear API HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`Linear API: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) throw new Error("Linear API: empty response");
  return json.data;
}

const ISSUES_QUERY = /* GraphQL */ `
  query Issues($filter: IssueFilter, $first: Int) {
    issues(filter: $filter, first: $first, orderBy: updatedAt) {
      nodes {
        id
        identifier
        title
        description
        priority
        url
        updatedAt
        state { name }
        assignee { displayName }
        team { key }
      }
    }
  }
`;

const ISSUE_QUERY = /* GraphQL */ `
  query Issue($id: String!) {
    issue(id: $id) {
      id
      identifier
      title
      description
      priority
      url
      updatedAt
      state { name }
      assignee { displayName }
      team { key }
    }
  }
`;

interface RawIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number;
  url: string;
  updatedAt: string;
  state: { name: string } | null;
  assignee: { displayName: string } | null;
  team: { key: string } | null;
}

function normalize(raw: RawIssue): LinearIssue {
  return {
    id: raw.id,
    identifier: raw.identifier,
    title: raw.title,
    description: raw.description,
    state: raw.state?.name ?? "unknown",
    priority: raw.priority,
    url: raw.url,
    assignee: raw.assignee?.displayName ?? null,
    team: raw.team?.key ?? null,
    updatedAt: raw.updatedAt,
  };
}

export async function listIssues(
  apiKey: string,
  opts: { query?: string; limit?: number; teamKey?: string; assignedToMe?: boolean } = {}
): Promise<LinearIssue[]> {
  const filter: Record<string, unknown> = {};
  if (opts.query) filter.searchableContent = { contains: opts.query };
  if (opts.teamKey) filter.team = { key: { eq: opts.teamKey } };
  if (opts.assignedToMe) filter.assignee = { isMe: { eq: true } };
  const data = await linearRequest<{ issues: { nodes: RawIssue[] } }>(apiKey, ISSUES_QUERY, {
    filter,
    first: opts.limit ?? 25,
  });
  return data.issues.nodes.map(normalize);
}

export async function getIssue(apiKey: string, id: string): Promise<LinearIssue | null> {
  const data = await linearRequest<{ issue: RawIssue | null }>(apiKey, ISSUE_QUERY, { id });
  return data.issue ? normalize(data.issue) : null;
}
