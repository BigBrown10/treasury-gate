# TreasuryGate

TreasuryGate is an agentic FinSecOps prototype for autonomous payable execution with human approval gates.

It combines:

- Stripe (real SDK calls in test mode) for invoice creation and payment execution,
- Plaid sandbox for liquidity signals,
- Auth0 AI Agents async authorization for high-risk action control,
- Gemini-based task review summaries for operator clarity.

## What The Platform Does

- Create one-time or monthly recurring payment tasks.
- Capture payee information (`vendor`, optional recipient name/email).
- Auto-create Stripe invoices from tasks.
- Continuously process due tasks.
- Request Auth0 async approval before mutating payment execution.
- Execute payment on approved tasks.
- Store Stripe evidence URL and payment status.
- Show `Scheduled`, `Live`, and `Finished` task states.

## Architecture Overview

### Frontend (Next.js App Router)

- `/` landing and product narrative.
- `/items` Create New form (task creation + recurrence + payee identity).
- `/tasks` task operation console with modal panels and AI summaries.

Core UI components:

- `src/components/items-manager.tsx`
- `src/components/tasks-monitor.tsx`

### API Layer

- `POST /api/payments/create-invoice`
	- creates Stripe open invoice from task data.
- `POST /api/payments/attempt`
	- runs liquidity check, invoice match, approval gate, payment execution, evidence readback.
- `POST /api/tasks/review`
	- Gemini summary endpoint for task reviews.
- `GET /api/treasury`
	- bank/invoice snapshot for overview.

### Server Integrations

- Stripe: `src/lib/server/stripe.ts`
- Plaid: `src/lib/server/plaid.ts`
- Auth0 gate: `src/lib/agent/auth0-gate.ts`, `src/lib/agent/tools.ts`
- Env contract: `src/lib/server/env.ts`

### Local State Model

Task state is currently client-side persisted:

- `localStorage` key: `treasurygate.autopay.queue.v1`
- schema and helpers: `src/lib/client/queue-store.ts`

This is suitable for demo workflows. Production should move queue state to a durable backend datastore.

## End-to-End Execution Flow

1. User creates task in `/items`.
2. Task is persisted with schedule, recurrence, payee identity, and optional auto-invoice setting.
3. `/tasks` loop checks due tasks.
4. If needed, task auto-creates Stripe invoice.
5. Attempt route performs:
	 - Plaid balance read,
	 - Stripe invoice selection by invoice ID or vendor+amount,
	 - Auth0 async authorization gate,
	 - Stripe payment execution,
	 - Stripe evidence verification (with retry polling).
6. Task status transitions to `completed`, `awaiting_approval`, `denied`, `timed_out`, etc.
7. Monthly tasks auto-spawn the next cycle after completion.

## Approval Model (Auth0 Async Authorization)

TreasuryGate uses `withAsyncAuthorization()` for `execute_vendor_payment`.

Important behavior:

- Approval is out-of-band (no in-page modal popup).
- API returns `awaiting_approval` while user approval is pending.
- The same `threadId` is reused to bind retries to the same authorization context.
- On approval, elevated credentials are read via `getAsyncAuthorizationCredentials()` and payment executes.

Token Vault requirement alignment:

- Integration uses Auth0 AI Agents async auth flow expected for Token Vault-backed authorization.
- Keep Auth0 configuration proof (dashboard screenshot + README reference) for judging clarity.

## Stripe Payment Semantics

- Current payment mode uses `paid_out_of_band: true` in Stripe test context.
- Evidence verification marks paid when invoice status becomes `paid`.
- For out-of-band cases where `amount_paid` may be zero, displayed paid amount is normalized from invoice totals.
- Idempotency key strategy: `treasurygate-${threadId}-${invoiceId}`.

## Payee Identity Fields

- `Vendor / Recipient Name`: required payee identity used for matching/reporting and Stripe customer name.
- `Vendor / Recipient Email`: required payee email used for Stripe customer mapping.

These two fields are mandatory in task creation to avoid identity ambiguity.

## Approval And Payment Badges

- Approval badge reflects Auth0 async authorization runtime state.
- `Approved` is shown only when authorization grant is observed in task agent logs.
- Payment status badge is separate and reflects Stripe evidence (`completed` vs `payment_unverified`).
- This separation prevents false interpretation where approval and final Stripe settlement are conflated.

## Recurring Tasks

- Supported recurrence:
	- `one_time`
	- `monthly`
- Completed monthly task auto-spawns next month’s queued task with inherited metadata.

## Environment Variables

Required:

```bash
AUTH0_CLIENT_ID=
AUTH0_SECRET=
AUTH0_DOMAIN=
STRIPE_SECRET_KEY=
PLAID_CLIENT_ID=
PLAID_SECRET=
```

Optional:

```bash
AUTH0_AUDIENCE=
GOOGLE_GENERATIVE_AI_API_KEY=
PLAID_ACCESS_TOKEN=
STRIPE_INVOICE_LIMIT=25
PLAID_SANDBOX_INSTITUTION_ID=ins_109508
```

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification Commands

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Operational Notes

- Plaid sandbox balance does not auto-decrement from Stripe events.
- Stripe test mode is non-production cash movement.
- AI review endpoint falls back to deterministic summary behavior if Gemini key is missing.

## Known Gaps To Reach Full Enterprise FinSecOps

- Durable backend queue + audit database.
- Multi-approver policy engine (SoD, thresholds, role matrices).
- Immutable audit stream and compliance exports.
- Alerting/incident routing (Slack, PagerDuty, SIEM).
- Production-grade secrets lifecycle and key rotation controls.
- Accounting/ERP reconciliation integration.
