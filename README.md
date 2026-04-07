# TreasuryGate

TreasuryGate is an agentic FinSecOps prototype for autonomous payable execution with human approval gates.

It combines:

- **Vercel AI SDK** with **Google Gemini 2.5 Pro** for true agentic decision-making, natural language parsing, and risk analysis.
- Stripe (real SDK calls in test mode) for invoice creation and payment execution.
- Plaid sandbox for liquidity signals.
- Slack Block Kit Webhooks for async human-in-the-loop authorization.

## What The Platform Does

- **Natural Language Parsing**: Create payment tasks simply by typing strings like *"Pay  to Adobe next Friday"*.
- **Autonomous Risk Analyst**: An AI agent reviews live Plaid liquidity against outgoing Stripe invoices and generates an instantaneous risk assessment.
- **AI Task Summaries**: Automatically generates executive summaries from complex execution logs to explain why a payment succeeded or stalled.
- Auto-create Stripe invoices from tasks and continuously process the queue in the background.
- Request Slack async approval before mutating payment execution.

## Architecture Overview

### Frontend (Next.js App Router)
- / landing and product narrative.
- /items Create New form (task creation + recurrence + payee identity).
- /tasks task operation console with modal panels, agentic chat input, and AI summaries.

### API Layer & Agentic Orchestration (Vercel AI SDK)
- \POST /api/tasks/parse\
  - **Agentic Feature:** Uses \generateObject\ to parse unstructured natural language intents into strictly typed \QueueItem\ structs.
- \POST /api/payments/attempt\
  - **Agentic Feature:** Uses \generateText\ to act as an Autonomous Risk Analyst. Pauses execution, reads Plaid balances, checks the Stripe invoice, and generates a risk recommendation injected directly into a Slack webhook approval request.
- \POST /api/tasks/review\
  - **Agentic Feature:** Gemini summary endpoint using \generateObject\ to translate raw robotic execution logs into human-readable executive summaries.
- \POST /api/payments/create-invoice\
  - creates Stripe open invoice from task data.

### Server Integrations

- AI/Agentic: \Vercel AI SDK\ (\i\, \@ai-sdk/google\)
- Stripe: \src/lib/server/stripe.ts\
- Plaid: \src/lib/server/plaid.ts\
- Env contract: \src/lib/server/env.ts\

## End-to-End Execution Flow

1. User creates a task either via the UI form or by typing a natural language command into the Agentic Chat.
2. The AI Parser (\generateObject\) securely structures the task and drops it into the queue.
3. The background polling loop (\src/components/tasks-monitor.tsx\) picks up the task immediately.
4. If needed, the system auto-creates a pending Stripe invoice.
5. The Risk Analyst Agent (\generateText\) reads the Plaid balance and the Stripe invoice, then generates a liquidity-impact assessment.
6. A Slack webhook containing the AI Risk Assessment and an Approve/Deny button is sent to the financial controller.
7. Upon Slack approval callback, the API automatically triggers Stripe to pay the invoice and updates the React queue.
8. The AI Reviewer Agent generates a post-execution executive summary for the dashboard.

## Stripe Payment Semantics

- Current payment mode uses \paid_out_of_band: true\ in Stripe test context.
- Evidence verification marks paid when invoice status becomes \paid\.
- Idempotency key strategy: \	reasurygate-\-\\.

## Environment Variables

Required:

\\\ash
STRIPE_SECRET_KEY=
PLAID_CLIENT_ID=
PLAID_SECRET=
SLACK_WEBHOOK_URL=
GOOGLE_GENERATIVE_AI_API_KEY=
\\\

Optional:

\\\ash
PLAID_ACCESS_TOKEN=
STRIPE_INVOICE_LIMIT=25
PLAID_SANDBOX_INSTITUTION_ID=ins_109508
\\\

## Local Development

\\\ash
npm install
npm run dev
\\\

Open \http://localhost:3000\.
