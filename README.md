# TreasuryGate (Real API MVP)

TreasuryGate is a Next.js 16 treasury agent demo that:

- reads real Stripe Test Mode open invoices,
- reads real Plaid Sandbox balances,
- and gates Stripe invoice payment execution via Auth0 asynchronous authorization.

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
2. In chat, run:
	`Check if we have enough cash, and if so, pay the $500 Vercel invoice.`
3. Agent runs read-only checks:
	- `get_bank_balance`
	- `get_pending_invoices`
4. Agent attempts `execute_vendor_payment`, wrapped by Auth0 `withAsyncAuthorization()`.
5. Auth0 CIBA push approval is required before Stripe payment continues.
6. Once approved, Stripe invoice is paid and receipt/invoice URL is returned in chat.

## Notes

- The payment tool validates invoice openness and amount before mutation.
- If no Gemini key is provided, chat intent extraction falls back to deterministic regex parsing.
- Pending/denied/timeout authorization states are surfaced directly in the chat timeline.
