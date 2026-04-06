# TreasuryGate (Real API MVP)

TreasuryGate is a Next.js 16 treasury agent demo that:

- reads real Stripe Test Mode open invoices,
- reads real Plaid Sandbox balances,
- and gates Stripe invoice payment execution via Auth0 asynchronous authorization.
- supports an autonomous payable queue with categories and due dates.

## Stack

- Next.js 16 + TypeScript + Tailwind CSS
- Stripe Node SDK (`stripe`)
- Plaid Node SDK (`plaid`)
- Auth0 AI LangChain SDK (`@auth0/ai-langchain`)
- Vercel AI SDK with Gemini provider (`ai`, `@ai-sdk/google`)

## Required Environment

Copy `.env.local.example` to `.env.local` and fill values:

```bash
AUTH0_CLIENT_ID=
AUTH0_SECRET=
STRIPE_SECRET_KEY=
PLAID_CLIENT_ID=
PLAID_SECRET=
AUTH0_DOMAIN=
```

Optional:

- `AUTH0_AUDIENCE`
- `GOOGLE_GENERATIVE_AI_API_KEY` (advanced intent extraction)
- `PLAID_ACCESS_TOKEN`
- `STRIPE_INVOICE_LIMIT`
- `PLAID_SANDBOX_INSTITUTION_ID`

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Real Execution Flow

1. Dashboard loads and fetches live Plaid sandbox balance + open Stripe test invoices.
2. Finance team adds queue items (salary, supplies, logistics, other) with due dates.
3. Agent runs read-only checks:
	- `get_bank_balance`
	- `get_pending_invoices`
4. Agent matches or auto-creates Stripe invoices, then attempts `execute_vendor_payment` wrapped by Auth0 `withAsyncAuthorization()`.
5. Auth0 CIBA approval is required before Stripe payment execution continues.
6. After approval, Stripe invoice is paid and the queue item stores Stripe proof URL + status.

## Approval Channel

- TreasuryGate uses Auth0 asynchronous authorization (CIBA) for sensitive actions.
- Approval is an out-of-band Auth0/Guardian push-style confirmation flow.
- The queue auto-polls while approval is pending and resumes execution once approved.
- Email can be added for notifications, but email is not the authorization control in this MVP.

## Auth0 Token Clarification

- Do not paste a runtime access token into `.env.local`.
- Keep using `AUTH0_CLIENT_ID`, `AUTH0_SECRET`, `AUTH0_DOMAIN`, and `AUTH0_AUDIENCE`.
- The app requests authorization tokens dynamically during execution.

## Notes

- The payment tool validates invoice openness and amount before mutation.
- Stripe payment calls include an idempotency key to prevent accidental duplicate charges during retries.
- If no Gemini key is provided, chat intent extraction falls back to deterministic regex parsing.
- Pending/denied/timeout authorization states are surfaced directly in the chat timeline.
