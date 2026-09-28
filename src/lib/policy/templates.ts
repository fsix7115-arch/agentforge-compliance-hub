/**
 * Built-in compliance policy templates. Installed by the seed script and by
 * the marketplace, and used as starting points in the policy editor.
 */

export interface PolicyTemplate {
  slug: string;
  name: string;
  framework: string;
  description: string;
  yaml: string;
}

export const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    slug: 'hipaa-no-phi-in-logs',
    name: 'HIPAA — No PHI in agent input',
    framework: 'HIPAA',
    description:
      'Blocks actions whose input references protected health information. Use on any agent that touches clinical data.',
    yaml: `name: "HIPAA Data Access"
framework: "HIPAA"
description: "Prohibits protected health information in agent inputs"
rules:
  - field: "input"
    operator: "no_pii"
    severity: "critical"
    message: "Input contains PHI/identifiers — blocked under HIPAA"
  - field: "input.dataType"
    operator: "not_contains"
    value: "PHI"
    severity: "critical"
    message: "input.dataType must not be PHI"
`
  },
  {
    slug: 'gdpr-data-export',
    name: 'GDPR — Export requires approval',
    framework: 'GDPR',
    description:
      'Data export and deletion actions require human approval before they run. Warning severity, so the request is queued rather than blocked.',
    yaml: `name: "GDPR Data Subject Requests"
framework: "GDPR"
description: "Export and deletion of personal data require sign-off"
rules:
  - field: "actionType"
    operator: "in"
    value: ["data_export", "data_deletion", "user_export"]
    severity: "critical"
    message: "Data subject requests must be approved by a DPO"
  - field: "input"
    operator: "no_pii"
    severity: "warning"
    message: "Action touches personal data — legal review recommended"
`
  },
  {
    slug: 'soc2-change-control',
    name: 'SOC2 — Production writes need approval',
    framework: 'SOC2',
    description:
      'Change-control guard: agents in production may not perform irreversible writes without an approval trail.',
    yaml: `name: "SOC2 Change Control"
framework: "SOC2"
description: "Irreversible production writes require change control"
rules:
  - field: "actionType"
    operator: "in"
    value: ["db_write", "infra_change", "deploy", "delete_resource"]
    severity: "critical"
    message: "Irreversible change requires change-control approval"
  - field: "tokenCost"
    operator: "lte"
    value: 25
    severity: "warning"
    message: "High-cost action — verify the caller budgeted for it"
`
  },
  {
    slug: 'pci-no-card-data',
    name: 'PCI-DSS — No cardholder data',
    framework: 'PCI_DSS',
    description: 'Blocks any action whose payload carries a card number or CVV.',
    yaml: `name: "PCI-DSS Cardholder Data"
framework: "PCI_DSS"
description: "Cardholder data must never reach an agent payload"
rules:
  - field: "input"
    operator: "matches"
    value: "(?:\\\\d[ -]*?){13,19}"
    severity: "critical"
    message: "Possible PAN detected in input — PCI-DSS violation"
  - field: "input"
    operator: "matches"
    value: "(?i)cvv|cvc|security.code"
    severity: "critical"
    message: "CVV field detected in input — PCI-DSS violation"
`
  },
  {
    slug: 'cost-guard',
    name: 'Custom — Cost guard',
    framework: 'CUSTOM',
    description: 'Cheap guardrail: route expensive actions to a human and block runaway spend.',
    yaml: `name: "Cost Guard"
framework: "CUSTOM"
description: "Blocks or escalates actions above a cost threshold"
rules:
  - field: "tokenCost"
    operator: "lte"
    value: 10
    severity: "warning"
    message: "Action cost above $10 — approval required"
  - field: "tokenCost"
    operator: "lte"
    value: 100
    severity: "critical"
    message: "Action cost above $100 — blocked"
`
  }
];
