import type {
  IssueProviderPluginDefinition,
  OAuthFlowConfig,
  OAuthTokenResult,
  PluginFieldMapping,
  PluginHttp,
  PluginIssue,
  PluginSearchResult,
} from '@super-productivity/plugin-api';

declare const PluginAPI: {
  registerIssueProvider(definition: IssueProviderPluginDefinition): void;
  startOAuthFlow(config: OAuthFlowConfig): Promise<OAuthTokenResult>;
  getOAuthToken(): Promise<string | null>;
  clearOAuthToken(): Promise<void>;
};

const API_BASE = 'https://app.clio.com/api/v4';
const CLIO_AUTH_URL = 'https://app.clio.com/oauth/authorize';
const CLIO_TOKEN_URL = 'https://app.clio.com/oauth/token';
const CLIENT_ID = 'jaty2F0w3l5V0u8dOtig147sysfW8j8GQsRjmLOd';
// NOT A SECRET — this is a "Desktop" OAuth client type (RFC 8252).
// This is a public client where the secret cannot be kept
// confidential (it ships in the binary users download). PKCE + server-side
// redirect URI restrictions are the actual security mechanisms.
// Do not rotate or revoke — this value is intentionally committed.
const CLIENT_SECRET = '4r75hieBXW9dAVjsLfnw6nK3OFzgXY92YJnHrFu8';

interface ClioTask {
  id: number;
  name: string;
  description: string;
  status: string;
  due_at: string;
  time_estimated?: number;
}

interface ClioTaskResponse {
  data: ClioTask;
}

interface ClioSearchMeta {
  paging: object;
  records: number;
}

interface ClioSearchResponse {
  meta: ClioSearchMeta;
  data: ClioTask[];
}

const mapSearchResult = (issue: ClioTask) : PluginSearchResult => ({
  ...issue,
  id: String(issue.id),
  title: issue.name,
});

const isAuthOrNotFoundError = (err: unknown): boolean => {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const status = (err as { status: unknown }).status;
    return status === 401 || status === 403 || status === 404;
  }
  return false;
};

PluginAPI.registerIssueProvider({
  configFields: [
    {
      key: 'oauth',
      type: 'oauthButton' as const,
      label: 'Connect Clio Account',
      oauthConfig: {
        authUrl: CLIO_AUTH_URL,
        tokenUrl: CLIO_TOKEN_URL,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        mobileClientId: CLIENT_ID,
        iosClientId: CLIENT_ID,
        scopes: [],
        extraAuthParams: {},
      },
    },
  ],

  async getHeaders(config: Record<string, unknown>): Record<string, string> {
    const token = await PluginAPI.getOAuthToken();
    if (!token) {
      throw new Error('Not authenticated. Please connect your Clio account first.');
    }
    return { Authorization: `Bearer ${token}` };
  },

  async searchIssues(
    searchTerm: string,
    config: Record<string, unknown>,
    http: PluginHttp,
  ): Promise<PluginSearchResult[]> {
    const url = `${API_BASE}/tasks.json?complete=false&fields=id,name,status,description,due_at,time_estimated&query=${searchTerm}`;
    const response = await http.get<ClioSearchResponse>(url);
    return (response.data || []).map(mapSearchResult);
  },

  async getNewIssuesForBacklog(
    config: Record<string, unknown>,
    http: PluginHttp,
  ): Promise<PluginSearchResult[]> {
    const url = `${API_BASE}/tasks.json?complete=false&fields=id,name,status,description,due_at,time_estimated`;
    const response = await http.get<ClioSearchResponse>(url);
    return (response.data || []).map(mapSearchResult);
  },

  async getById(
    issueId: string,
    config: Record<string, unknown>,
    http: PluginHttp,
  ): Promise<PluginIssue> {
    const issueUrl = `${API_BASE}/tasks/${issueId}.json?fields=id,name,status,description,due_at,time_estimated,assignee`;
    const issue = (await http.get<ClioTaskResponse>(issueUrl)).data;

    return {
      ...issue,
      timeEstimateFormatted: issue.time_estimated ? String(Math.floor(issue.time_estimated / 3600)) + "h " + String(issue.time_estimated % 3600) + "m" : undefined,
    };

    return result;
  },

  getIssueLink(
    issueId: string,
    config: Record<string, unknown>
  ) : string {
    return ""
  },

  async testConnection(
    config: Record<string, unknown>,
    http: PluginHttp,
  ): Promise<boolean> {
    try {
      await http.get(`${API_BASE}/`);
      return true;
    } catch {
      return false;
    }
  },

  issueDisplay: [
    { field: 'name', label: 'Title', type: 'text' },
    { field: 'status', label: 'Status', type: 'text' },
    { field: 'description', label: 'Description', type: 'text' },
    { field: 'due_at', label: 'Due Date', type: 'text' },
    { field: 'timeEstimateFormatted', label: 'Time Estimate', type: 'text' },
  ],

  fieldMappings: [
    {
      taskField: 'isDone',
      issueField: 'status',
      defaultDirection: 'both',
      toIssueValue: (taskValue: unknown): string => (taskValue ? 'complete' : 'pending'),
      toTaskValue: (issueValue: unknown): boolean => (issueValue === 'complete'),
    },
    {
      taskField: 'id',
      issueField: 'id',
      defaultDirection: 'both',
      toIssueValue: (
        taskValue: unknown,
        _ctx: { issueId: string; issueNumber?: number },
      ): number => {
        return Number.parse(taskValue);
      },
      toTaskValue: (
        issueValue: unknown,
        _ctx: { issueId: string; issueNumber?: number },
      ): string => {
        return String(issueValue)
      },
    },
    {
      taskField: 'title',
      issueField: 'name',
      defaultDirection: 'both',
      toIssueValue: (
        taskValue: unknown,
        _ctx: { issueId: string; issueNumber?: number },
      ): string => {
        // Done marker logic handled separately via isDone push
        return (taskValue as string) ?? '';
      },
      toTaskValue: (
        issueValue: unknown,
        _ctx: { issueId: string; issueNumber?: number },
      ): string => {
        const val = issueValue as string;
        // Strip done marker if present (from config or default [DONE])
        if (val && val.startsWith('[DONE] ')) {
          return val.slice(7);
        }
        return val || '(No title)';
      },
    },
    {
      taskField: 'notes',
      issueField: 'description',
      defaultDirection: 'both',
      toIssueValue: (taskValue: unknown): string => (taskValue as string) || '',
      toTaskValue: (issueValue: unknown): string => (issueValue as string) || '',
    },
    {
      taskField: 'timeEstimate',
      issueField: 'time_estimated',
      defaultDirection: 'both',
      toIssueValue: (taskValue: unknown): number => (taskValue as number) / 1000 || 0,
      toTaskValue: (issueValue: unknown): number => (issueValue as number) * 1000 || 0,
    },
    {
      taskField: 'dueDay',
      issueField: 'due_at',
      defaultDirection: 'both',
      mutuallyExclusive: ['dueWithTime'],
      toIssueValue: (taskValue: unknown): string | null => (taskValue as string) || null,
      toTaskValue: (issueValue: unknown): string | undefined =>
        (issueValue as string) || undefined,
    },
  ] satisfies PluginFieldMapping[],

  async updateIssue(
    id: string,
    changes: Record<string, unknown>,
    config: Record<string, unknown>,
    http: PluginHttp,
  ): Promise<void> {
    try {
      await http.patch(`${API_BASE}/tasks/${id}.json`, {data: changes});
    } catch (e) {
      throw isAuthOrNotFoundError(e)
        ? new Error("Insufficient permissions")
        : e;
    }
  },

  async createIssue(
    title: string,
    config: Record<string, unknown>,
    http: PluginHttp,
  ): Promise<{ issueId: string; issueNumber: number; issueData: PluginIssue }> {
    let response: ClioTaskResponse;
    try {
      const user = (await http.get(`${API_BASE}/who_am_i`)).data.id;
      response = await http.post<ClioTaskResponse>(
        `${API_BASE}/tasks.json`,
        { data: {
          assignee: {
            id: user,
            type: "User"
          },
          name: title,
          description: title,
        }
        },
      );
    } catch (e) {
      throw isAuthOrNotFoundError(e)
        ? new Error("Insufficient permissions")
        : e;
    }
    return {
      issueId: String(response.id),
      issueData: {
        id: String(response.id),
        title: response.name,
        description: response.description || '',
        state: response.status || 'confirmed',
        status: response.status,
      },
    };
  },

  extractSyncValues(issue: PluginIssue): Record<string, unknown> {
    return issue;
  },
});
