/** Agent config presets listed in the marketplace (read-only for the MVP). */
export interface MarketplaceTemplate {
  slug: string;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  config: {
    model: string;
    temperature: number;
    maxTokens: number;
    systemPrompt: string;
    tools: string[];
    permissions: string[];
  };
}

export const MARKETPLACE_TEMPLATES: MarketplaceTemplate[] = [
  {
    slug: 'rag-support-agent',
    name: 'RAG Support Agent',
    description: 'Grounded customer-support agent with a knowledge-base search tool.',
    category: 'support',
    priceCents: 0,
    config: {
      model: 'gpt-4o',
      temperature: 0.3,
      maxTokens: 2048,
      systemPrompt:
        'You are a customer support agent. Answer only from the retrieved documents. If the answer is not present, say so and escalate.',
      tools: ['kb_search', 'ticket_read', 'ticket_write'],
      permissions: ['read:kb', 'write:tickets']
    }
  },
  {
    slug: 'data-export-agent',
    name: 'GDPR Data Export Agent',
    description: 'Handles data subject access requests with mandatory approval gating.',
    category: 'compliance',
    priceCents: 4900,
    config: {
      model: 'gpt-4o',
      temperature: 0,
      maxTokens: 4096,
      systemPrompt:
        'Handle data subject access and deletion requests exactly as policy dictates. Never export without a recorded approval.',
      tools: ['db_query', 'file_write', 'email_send'],
      permissions: ['read:users', 'write:exports', 'send:email']
    }
  },
  {
    slug: 'analytics-summarizer',
    name: 'Analytics Summarizer',
    description: 'Reads warehouse metrics and produces a labelled daily summary.',
    category: 'analytics',
    priceCents: 0,
    config: {
      model: 'gpt-4o-mini',
      temperature: 0.1,
      maxTokens: 1024,
      systemPrompt:
        'Summarise the metrics you are given. Never speculate without labelling the statement as a hypothesis.',
      tools: ['warehouse_query'],
      permissions: ['read:warehouse']
    }
  },
  {
    slug: 'code-review-agent',
    name: 'Code Review Agent',
    description: 'Reviews pull requests for security and correctness regressions.',
    category: 'engineering',
    priceCents: 2900,
    config: {
      model: 'gpt-4o',
      temperature: 0.2,
      maxTokens: 4096,
      systemPrompt:
        'Review the diff for security, correctness and test coverage. Report findings with file and line references.',
      tools: ['git_diff', 'repo_read', 'ci_status'],
      permissions: ['read:repo']
    }
  },
  {
    slug: 'incident-triage',
    name: 'Incident Triage Agent',
    description: 'Classifies alerts, checks runbooks and pages the right on-call.',
    category: 'devops',
    priceCents: 4900,
    config: {
      model: 'gpt-4o',
      temperature: 0,
      maxTokens: 2048,
      systemPrompt:
        'Classify the alert against the runbook. Page a human for anything not covered by an automated remediation.',
      tools: ['alert_read', 'runbook_search', 'pagerduty_page'],
      permissions: ['read:alerts', 'page:oncall']
    }
  },
  {
    slug: 'finance-approval-agent',
    name: 'Finance Approval Agent',
    description: 'Routes purchase orders over a threshold to a human approver.',
    category: 'finance',
    priceCents: 7900,
    config: {
      model: 'gpt-4o',
      temperature: 0,
      maxTokens: 2048,
      systemPrompt:
        'Validate purchase orders against policy. Any order above the approval threshold must be escalated, never self-approved.',
      tools: ['erp_read', 'po_create', 'email_send'],
      permissions: ['read:erp', 'write:po']
    }
  }
];
