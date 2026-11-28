// Curated remote MCP servers (Streamable HTTP, no auth). Client-safe data:
// the settings UI reads it, the server resolves ids from it. Tool lists were
// probed live (research_notes/v2/mcp_byok.md §2).

export interface CuratedMcpServer {
  /** Stable id, also the tool-name prefix: [a-z0-9-]. */
  id: string;
  name: string;
  description: string;
  url: string;
  /** Mirrors DEFAULT_SETTINGS.tools.mcp in lib/store/chat-store.ts. */
  defaultEnabled: boolean;
  /** Tools never exposed to the model (huge outputs, useless anonymously). */
  hiddenTools?: string[];
  /** Vendor domain (shown in the UI). */
  domain: string;
  /** Example prompt shown in settings. */
  example?: string;
  /** Category label. */
  category: 'code' | 'web' | 'docs' | 'ml';
}

export const CURATED_MCP_SERVERS: readonly CuratedMcpServer[] = [
  {
    id: 'deepwiki',
    name: 'DeepWiki',
    description: 'Ask questions about any public GitHub repository, answered from its generated wiki.',
    url: 'https://mcp.deepwiki.com/mcp',
    defaultEnabled: true,
    hiddenTools: ['read_wiki_contents'],
    domain: 'deepwiki.com',
    example: 'Using DeepWiki, how does vercel/next.js handle routing?',
    category: 'code',
  },
  {
    id: 'context7',
    name: 'Context7',
    description: 'Up-to-date, version-specific documentation and code examples for popular libraries.',
    url: 'https://mcp.context7.com/mcp',
    defaultEnabled: true,
    domain: 'context7.com',
    example: 'Use Context7 to show how to stream from a Next.js route handler.',
    category: 'code',
  },
  {
    id: 'exa',
    name: 'Exa',
    description: 'Neural web search and page fetching (free tier, no key).',
    url: 'https://mcp.exa.ai/mcp',
    defaultEnabled: false,
    domain: 'exa.ai',
    category: 'web',
  },
  {
    id: 'microsoft-learn',
    name: 'Microsoft Learn',
    description: 'Search and fetch official Microsoft and Azure documentation and code samples.',
    url: 'https://learn.microsoft.com/api/mcp',
    defaultEnabled: false,
    domain: 'learn.microsoft.com',
    category: 'docs',
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    description: 'Search models, datasets and Spaces on the Hugging Face Hub.',
    url: 'https://huggingface.co/mcp',
    defaultEnabled: false,
    hiddenTools: ['hf_whoami'],
    domain: 'huggingface.co',
    category: 'ml',
  },
  {
    id: 'aws-knowledge',
    name: 'AWS Knowledge',
    description: 'AWS documentation search, regional availability and best practices.',
    url: 'https://knowledge-mcp.global.api.aws',
    defaultEnabled: false,
    domain: 'aws.amazon.com',
    category: 'docs',
  },
  {
    id: 'cloudflare-docs',
    name: 'Cloudflare Docs',
    description: 'Search the Cloudflare developer documentation (Workers, Pages, R2, …).',
    url: 'https://docs.mcp.cloudflare.com/mcp',
    defaultEnabled: false,
    domain: 'developers.cloudflare.com',
    category: 'docs',
  },
  {
    id: 'astro-docs',
    name: 'Astro Docs',
    description: 'Search the official Astro framework documentation.',
    url: 'https://mcp.docs.astro.build/mcp',
    defaultEnabled: false,
    domain: 'docs.astro.build',
    category: 'docs',
  },
];

export function getCuratedServer(id: string): CuratedMcpServer | undefined {
  return CURATED_MCP_SERVERS.find((s) => s.id === id);
}
