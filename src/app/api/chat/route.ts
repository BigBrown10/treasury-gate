import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  getExecuteVendorPaymentTool,
  getBankBalanceTool,
  getPendingInvoicesTool,
  mapAuth0InterruptToStatus,
} from "@/lib/agent/tools";
import { hasGeminiKey } from "@/lib/server/env";
import { getInvoicePaymentEvidence } from "@/lib/server/stripe";

type MessageBody = {
  message?: string;
  threadId?: string;
};

type AgentLogEntry = {
  at: string;
  step: string;
  detail: string;
};

type NormalizedPayment = {
  receiptUrl: string;
  status: string;
  amountPaid: number;
  currency: string;
  verifiedPaid: boolean;
  stripeInvoiceUrl: string;
};

function log(step: string, detail: string): AgentLogEntry {
  return {
    at: new Date().toISOString(),
    step,
    detail,
  };
}

function normalizePaymentResponse(rawPayment: unknown, invoiceId: string): NormalizedPayment {
  const dashboardUrl = `https://dashboard.stripe.com/test/invoices/${encodeURIComponent(invoiceId)}`;

  if (typeof rawPayment === "string") {
    return {
      receiptUrl: dashboardUrl,
      status: rawPayment,
      amountPaid: 0,
      currency: "USD",
      verifiedPaid: false,
      stripeInvoiceUrl: dashboardUrl,
    };
  }

  if (!rawPayment || typeof rawPayment !== "object") {
    return {
      receiptUrl: dashboardUrl,
      status: "unknown",
      amountPaid: 0,
      currency: "USD",
      verifiedPaid: false,
      stripeInvoiceUrl: dashboardUrl,
    };
  }

  const candidate = rawPayment as Record<string, unknown>;
  const receiptUrl =
    typeof candidate.receiptUrl === "string" && candidate.receiptUrl.length > 0
      ? candidate.receiptUrl
      : dashboardUrl;

  const status = typeof candidate.status === "string" && candidate.status ? candidate.status : "unknown";
  const amountPaid = typeof candidate.amountPaid === "number" ? candidate.amountPaid : 0;
  const currency = typeof candidate.currency === "string" && candidate.currency ? candidate.currency : "USD";
  const verifiedPaid = Boolean(candidate.verifiedPaid) || status === "paid";
  const stripeInvoiceUrl =
    typeof candidate.stripeInvoiceUrl === "string" && candidate.stripeInvoiceUrl.length > 0
      ? candidate.stripeInvoiceUrl
      : dashboardUrl;

  return { receiptUrl, status, amountPaid, currency, verifiedPaid, stripeInvoiceUrl };
}

function parseIntentFallback(message: string): { amountCents: number | null; vendor: string | null } {
  const amountMatch = message.match(/\$(\d+(?:\.\d{1,2})?)/);
  const amountCents = amountMatch ? Math.round(Number.parseFloat(amountMatch[1]) * 100) : null;

  const vendorMatch = message.match(/pay\s+the\s+\$?\d+(?:\.\d{1,2})?\s+(.+?)\s+invoice/i);
  const vendor = vendorMatch?.[1]?.trim() ?? null;

  return { amountCents, vendor };
}

async function parseIntent(message: string): Promise<{ amountCents: number | null; vendor: string | null }> {
  if (!hasGeminiKey()) {
    return parseIntentFallback(message);
  }

  try {
    const response = await generateObject({
      model: google("gemini-2.5-pro"),
      schema: z.object({
        amountCents: z.number().int().nullable(),
        vendor: z.string().nullable(),
      }),
      prompt: `Extract payment intent from user message. Return amountCents and vendor if present. Message: ${message}`,
    });

    return response.object;
  } catch {
    return parseIntentFallback(message);
  }
}

export async function POST(request: NextRequest) {
  const agentLogs: AgentLogEntry[] = [];
  const body = (await request.json()) as MessageBody;
  const message = body.message?.trim();
  const threadId = body.threadId ?? crypto.randomUUID();
  const userId = request.headers.get("x-user-id") ?? "demo-user";

  agentLogs.push(log("request_received", `thread=${threadId}, user=${userId}`));

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const intent = await parseIntent(message);
  agentLogs.push(
    log(
      "intent_parsed",
      `amountCents=${intent.amountCents ?? "null"}, vendor=${intent.vendor ?? "null"}`,
    ),
  );

  if (!intent.amountCents) {
    return NextResponse.json({
      threadId,
      status: "completed",
      agentLogs,
      timeline: [
        "I could not find a dollar amount in your request.",
        "Try: 'Check if we have enough cash, and if so, pay the $500 Vercel invoice.'",
      ],
    });
  }

  try {
    const [balance, invoices] = await Promise.all([
      getBankBalanceTool.invoke(),
      getPendingInvoicesTool.invoke(),
    ]);

    agentLogs.push(
      log(
        "read_tools_completed",
        `balance=${balance.isoCurrencyCode} ${balance.available.toFixed(2)}, openInvoices=${invoices.length}`,
      ),
    );

    const targetInvoice = invoices.find((invoice) => {
      const amountMatch = invoice.amountDue === intent.amountCents;
      const vendorMatch = intent.vendor
        ? `${invoice.customerName ?? ""} ${invoice.description ?? ""}`
            .toLowerCase()
            .includes(intent.vendor.toLowerCase())
        : true;

      return amountMatch && vendorMatch;
    });

    if (!targetInvoice) {
      return NextResponse.json({
        threadId,
        status: "completed",
        agentLogs,
        timeline: [
          `Bank balance check passed: ${balance.isoCurrencyCode} ${balance.available.toFixed(2)} available.`,
          `No open invoice matched amount $${(intent.amountCents / 100).toFixed(2)}${
            intent.vendor ? ` for vendor '${intent.vendor}'` : ""
          }.`,
        ],
      });
    }

    if (balance.available * 100 < targetInvoice.amountDue) {
      return NextResponse.json({
        threadId,
        status: "completed",
        agentLogs,
        timeline: [
          `Insufficient liquidity: available ${balance.isoCurrencyCode} ${balance.available.toFixed(2)}.`,
          `Invoice ${targetInvoice.id} requires ${(targetInvoice.amountDue / 100).toFixed(2)} ${targetInvoice.currency}.`,
        ],
      });
    }

    const timeline = [
      `Liquidity confirmed: ${balance.isoCurrencyCode} ${balance.available.toFixed(2)} available.`,
      `Matched open invoice ${targetInvoice.id} (${targetInvoice.amountDueDisplay}).`,
      "Awaiting mobile approval via Auth0 CIBA push notification...",
    ];

    const paymentRaw = await getExecuteVendorPaymentTool().invoke({
      invoiceId: targetInvoice.id,
      expectedAmountCents: targetInvoice.amountDue,
      userId,
      threadId,
    });

    const normalizedPayment = normalizePaymentResponse(paymentRaw, targetInvoice.id);
    const evidence = await getInvoicePaymentEvidence(targetInvoice.id);
    const payment: NormalizedPayment = {
      receiptUrl: evidence.hostedInvoiceUrl ?? normalizedPayment.receiptUrl,
      status: evidence.status ?? normalizedPayment.status,
      amountPaid: evidence.amountPaid,
      currency: evidence.currency,
      verifiedPaid: evidence.verifiedPaid,
      stripeInvoiceUrl: evidence.stripeInvoiceUrl,
    };
    agentLogs.push(
      log(
        "payment_executed",
        `status=${payment.status}, verifiedPaid=${payment.verifiedPaid}, amountPaid=${payment.amountPaid}`,
      ),
    );

    timeline.push("Authorization approved. Executing Stripe payment now...");
    timeline.push(`Invoice paid status: ${payment.status} (${payment.verifiedPaid ? "verified" : "not verified"}).`);
    timeline.push(`Stripe Invoice URL: ${payment.stripeInvoiceUrl}`);
    timeline.push(`Receipt link: ${payment.receiptUrl}`);

    return NextResponse.json({
      threadId,
      status: "completed",
      agentLogs,
      timeline,
      payment,
    });
  } catch (error) {
    const mapped = mapAuth0InterruptToStatus(error);
    if (mapped) {
      return NextResponse.json(
        {
          threadId,
          status: mapped.status,
          timeline: [
            "Liquidity confirmed and invoice selected.",
            "Payment execution paused for Auth0 asynchronous authorization.",
            mapped.message,
          ],
          agentLogs: [...agentLogs, log("authorization_pending", mapped.message)],
          retryAfterSeconds: mapped.retryAfterSeconds,
        },
        { status: 202 },
      );
    }

    const messageText = error instanceof Error ? error.message : "Unknown chat execution error";
    return NextResponse.json(
      {
        threadId,
        status: "timed_out",
        agentLogs: [...agentLogs, log("execution_error", messageText)],
        timeline: ["Payment flow failed before completion.", messageText],
      },
      { status: 500 },
    );
  }
}
