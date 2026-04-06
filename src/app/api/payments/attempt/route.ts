import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  getExecuteVendorPaymentTool,
  getBankBalanceTool,
  getPendingInvoicesTool,
  mapAuth0InterruptToStatus,
} from "@/lib/agent/tools";
import { getInvoiceById, getInvoicePaymentEvidence } from "@/lib/server/stripe";

const schema = z.object({
  itemId: z.string().min(1),
  vendor: z.string().min(1),
  amountCents: z.number().int().positive(),
  invoiceId: z.string().optional(),
  requireInvoiceId: z.boolean().optional(),
  threadId: z.string().optional(),
});

type AgentLog = {
  at: string;
  step: string;
  detail: string;
};

const DEFAULT_RETRY_SECONDS = 20;

const EVIDENCE_RETRY_ATTEMPTS = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function log(step: string, detail: string): AgentLog {
  return { at: new Date().toISOString(), step, detail };
}

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id") ?? "demo-user";
  let threadId = crypto.randomUUID();

  try {
    const body = await request.json();
    const input = schema.parse(body);
    threadId = input.threadId ?? crypto.randomUUID();
    const agentLogs: AgentLog[] = [log("request_received", `item=${input.itemId}, thread=${threadId}`)];

    const [balance, invoices] = await Promise.all([
      getBankBalanceTool.invoke(),
      getPendingInvoicesTool.invoke(),
    ]);

    agentLogs.push(
      log(
        "read_tools_completed",
        `available=${balance.available.toFixed(2)} ${balance.isoCurrencyCode}, openInvoices=${invoices.length}`,
      ),
    );

    if (input.requireInvoiceId && !input.invoiceId) {
      return NextResponse.json({
        itemId: input.itemId,
        threadId,
        status: "waiting_invoice",
        retryAfterSeconds: DEFAULT_RETRY_SECONDS,
        agentLogs: [...agentLogs, log("invoice_required", "Task requires explicit invoice id before payment")],
        timeline: [
          "Task is configured for auto-created invoice mode.",
          "Waiting for a concrete invoice id before attempting payment.",
        ],
      });
    }

    let match = invoices.find((invoice) => {
      if (input.invoiceId) {
        return invoice.id === input.invoiceId;
      }

      const amountMatch = invoice.amountDue === input.amountCents;
      const vendorMatch = `${invoice.customerName ?? ""} ${invoice.description ?? ""}`
        .toLowerCase()
        .includes(input.vendor.toLowerCase());
      return amountMatch && vendorMatch;
    });

    if (!match && input.invoiceId) {
      const exactInvoice = await getInvoiceById(input.invoiceId);

      if (exactInvoice.status === "paid") {
        const paidEvidence = await getInvoicePaymentEvidence(exactInvoice.id);
        return NextResponse.json({
          itemId: input.itemId,
          threadId,
          status: "completed",
          payment: {
            status: paidEvidence.status,
            verifiedPaid: paidEvidence.verifiedPaid,
            amountPaid: paidEvidence.amountPaid,
            currency: paidEvidence.currency,
            receiptUrl: paidEvidence.hostedInvoiceUrl ?? paidEvidence.stripeInvoiceUrl,
            stripeInvoiceUrl: paidEvidence.stripeInvoiceUrl,
          },
          agentLogs: [...agentLogs, log("already_paid", `invoice=${exactInvoice.id}`)],
          timeline: [
            `Invoice ${exactInvoice.id} is already paid in Stripe.`,
            "Skipping payment execution.",
          ],
        });
      }

      if (exactInvoice.status !== "open") {
        return NextResponse.json({
          itemId: input.itemId,
          threadId,
          status: "waiting_invoice",
          retryAfterSeconds: DEFAULT_RETRY_SECONDS,
          agentLogs: [
            ...agentLogs,
            log("invoice_not_open", `invoice=${exactInvoice.id}, status=${exactInvoice.status}`),
          ],
          timeline: [
            `Invoice ${exactInvoice.id} exists but is ${exactInvoice.status ?? "unknown"}.`,
            "Waiting for invoice to be open before attempting payment.",
          ],
        });
      }

      match = exactInvoice;
    }

    if (!match) {
      return NextResponse.json({
        itemId: input.itemId,
        threadId,
        status: "waiting_invoice",
        retryAfterSeconds: DEFAULT_RETRY_SECONDS,
        agentLogs: [...agentLogs, log("invoice_not_found", "No matching open invoice found yet")],
        timeline: [
          `No open invoice found for ${input.vendor} at ${(input.amountCents / 100).toFixed(2)}.`,
          "Waiting for invoice to be created/finalized.",
        ],
      });
    }

    if (balance.available * 100 < match.amountDue) {
      return NextResponse.json({
        itemId: input.itemId,
        threadId,
        status: "insufficient_funds",
        retryAfterSeconds: DEFAULT_RETRY_SECONDS,
        agentLogs: [...agentLogs, log("insufficient_funds", `need=${match.amountDue}, available=${balance.available * 100}`)],
        timeline: [
          `Insufficient liquidity for invoice ${match.id}.`,
          `Available: ${balance.available.toFixed(2)} ${balance.isoCurrencyCode}`,
        ],
      });
    }

    const paymentResultRaw = await getExecuteVendorPaymentTool().invoke({
      invoiceId: match.id,
      expectedAmountCents: match.amountDue,
      userId,
      threadId,
    });

    void paymentResultRaw;

    let evidence = await getInvoicePaymentEvidence(match.id);
    if (!evidence.verifiedPaid) {
      for (let attempt = 0; attempt < EVIDENCE_RETRY_ATTEMPTS; attempt += 1) {
        await delay(800);
        evidence = await getInvoicePaymentEvidence(match.id);
        if (evidence.verifiedPaid) {
          break;
        }
      }
    }

    return NextResponse.json({
      itemId: input.itemId,
      threadId,
      status: evidence.verifiedPaid ? "completed" : "payment_unverified",
      payment: {
        status: evidence.status,
        verifiedPaid: evidence.verifiedPaid,
        amountPaid: evidence.amountPaid,
        currency: evidence.currency,
        receiptUrl: evidence.hostedInvoiceUrl ?? evidence.stripeInvoiceUrl,
        stripeInvoiceUrl: evidence.stripeInvoiceUrl,
      },
      agentLogs: [
        ...agentLogs,
        log("authorization_granted", "Auth0 async authorization approved. Executing payment."),
        log(
          "payment_evidence",
          `status=${evidence.status}, verifiedPaid=${evidence.verifiedPaid}, amountPaid=${evidence.amountPaid}`,
        ),
      ],
      timeline: [
        `Matched invoice ${match.id}.`,
        "Approval requested via Auth0 async authorization.",
        "Auth0 approval granted. Payment execution attempted in Stripe.",
        evidence.verifiedPaid
          ? "Payment verified as paid in Stripe."
          : "Stripe did not report paid status yet.",
      ],
    });
  } catch (error) {
    const mapped = mapAuth0InterruptToStatus(error);
    if (mapped) {
      return NextResponse.json(
        {
          threadId,
          status: mapped.status,
          timeline: [mapped.message],
          agentLogs: [log("authorization_state", mapped.message)],
          retryAfterSeconds: mapped.retryAfterSeconds,
        },
        { status: 202 },
      );
    }

    const message = error instanceof Error ? error.message : "Unknown payment attempt error";
    return NextResponse.json({ status: "timed_out", error: message }, { status: 500 });
  }
}
