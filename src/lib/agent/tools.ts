import "server-only";

import { getAsyncAuthorizationCredentials } from "@auth0/ai-langchain";
import {
  AccessDeniedInterrupt,
  AsyncAuthorizationInterrupt,
  AuthorizationPendingInterrupt,
  AuthorizationRequestExpiredInterrupt,
} from "@auth0/ai/interrupts";
import { z } from "zod";

import { buildAuth0AI } from "@/lib/agent/auth0-gate";
import { getEnv } from "@/lib/server/env";
import { getBankBalance } from "@/lib/server/plaid";
import { getPendingInvoices, payInvoice } from "@/lib/server/stripe";

export type PaymentInput = {
  invoiceId: string;
  expectedAmountCents: number;
  userId?: string;
  threadId?: string;
};

export type ChatStatus =
  | "awaiting_approval"
  | "approved_executing"
  | "denied"
  | "timed_out"
  | "completed";

export const getBankBalanceTool = {
  name: "get_bank_balance",
  description: "Read-only. Fetches current bank balance from Plaid sandbox.",
  schema: z.object({}),
  async invoke() {
    const balance = await getBankBalance();
    return balance;
  },
};

export const getPendingInvoicesTool = {
  name: "get_pending_invoices",
  description: "Read-only. Lists open Stripe invoices in test mode.",
  schema: z.object({}),
  async invoke() {
    return getPendingInvoices();
  },
};

const executeVendorPaymentCore = {
  name: "execute_vendor_payment",
  description: "Mutating. Pays a specific open Stripe invoice after user authorization.",
  schema: z.object({
    invoiceId: z.string().min(1),
    expectedAmountCents: z.number().int().positive(),
  }),
  async invoke({ invoiceId, expectedAmountCents }: PaymentInput) {
    const pendingInvoices = await getPendingInvoices();
    const target = pendingInvoices.find((invoice) => invoice.id === invoiceId);

    if (!target) {
      throw new Error(`Invoice ${invoiceId} is not open.`);
    }

    if (target.amountDue !== expectedAmountCents) {
      throw new Error(
        `Invoice amount mismatch. Expected ${expectedAmountCents}, found ${target.amountDue}.`,
      );
    }

    // Pull credentials emitted by Auth0's async authorization flow.
    const credentials = getAsyncAuthorizationCredentials();
    if (!credentials?.accessToken) {
      throw new Error("Missing elevated Auth0 access token after authorization.");
    }

    return payInvoice(invoiceId);
  },
};

let executeVendorPaymentToolCache: typeof executeVendorPaymentCore | null = null;

export function getExecuteVendorPaymentTool() {
  if (executeVendorPaymentToolCache) {
    return executeVendorPaymentToolCache;
  }

  const auth0AI = buildAuth0AI();
  const env = getEnv();

  executeVendorPaymentToolCache = auth0AI.withAsyncAuthorization(
    {
      userID: (params: PaymentInput) => params.userId ?? "demo-user",
      bindingMessage: async ({ invoiceId, expectedAmountCents }: PaymentInput) =>
        `Approve vendor payment of $${(expectedAmountCents / 100).toFixed(2)} for invoice ${invoiceId}`,
      requestedExpiry: 300,
      audience: env.AUTH0_AUDIENCE,
      scopes: ["payments:execute"],
      onAuthorizationRequest: "interrupt",
    },
    executeVendorPaymentCore,
  );

  return executeVendorPaymentToolCache;
}

export function mapAuth0InterruptToStatus(error: unknown): {
  status: ChatStatus;
  message: string;
  retryAfterSeconds?: number;
} | null {
  if (!AsyncAuthorizationInterrupt.isInterrupt(error)) {
    return null;
  }

  if (AuthorizationPendingInterrupt.isInterrupt(error)) {
    return {
      status: "awaiting_approval",
      message: "Authorization pending. Approve the push notification in your Auth0 Guardian app.",
      retryAfterSeconds: 5,
    };
  }

  if (AccessDeniedInterrupt.isInterrupt(error)) {
    return {
      status: "denied",
      message: "Authorization was denied. Payment was not executed.",
    };
  }

  if (AuthorizationRequestExpiredInterrupt.isInterrupt(error)) {
    return {
      status: "timed_out",
      message: "Authorization request expired before approval. Payment was not executed.",
    };
  }

  return {
    status: "timed_out",
    message: "Authorization failed before payment execution.",
  };
}
