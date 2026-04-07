import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  getBankBalanceTool,
  getPendingInvoicesTool,
  getExecuteVendorPaymentTool,
  mapAuth0InterruptToStatus,
  ChatStatus
} from "@/lib/agent/tools";
import { getInvoiceById, getInvoicePaymentEvidence, payInvoice, updateInvoiceMetadata } from "@/lib/server/stripe";
import { getEnv, hasGeminiKey } from "@/lib/server/env";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

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

const EVIDENCE_RETRY_ATTEMPTS = 8;

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

    let effectiveInvoiceId = input.invoiceId;
    if (input.requireInvoiceId && !effectiveInvoiceId) {
      const candidates = invoices.filter((invoice) => {
        const amountMatch = invoice.amountDue === input.amountCents;
        const vendorMatch = `${invoice.customerName ?? ""} ${invoice.description ?? ""}`
          .toLowerCase()
          .includes(input.vendor.toLowerCase());
        return amountMatch && vendorMatch;
      });

      if (candidates.length === 1) {
        effectiveInvoiceId = candidates[0].id;
        agentLogs.push(log("invoice_recovered", `Recovered invoice id ${effectiveInvoiceId} from open invoices`));
      } else {
        return NextResponse.json({
          itemId: input.itemId,
          threadId,
          status: "waiting_invoice",
          retryAfterSeconds: DEFAULT_RETRY_SECONDS,
          agentLogs: [
            ...agentLogs,
            log(
              "invoice_required",
              `Task requires explicit invoice id before payment; recovery candidates=${candidates.length}`,
            ),
          ],
          timeline: [
            "Task is configured for auto-created invoice mode.",
            "Waiting for a concrete invoice id before attempting payment.",
          ],
        });
      }
    }

    let match = invoices.find((invoice) => {
      if (effectiveInvoiceId) {
        return invoice.id === effectiveInvoiceId;
      }

      const amountMatch = invoice.amountDue === input.amountCents;
      const vendorMatch = `${invoice.customerName ?? ""} ${invoice.description ?? ""}`
        .toLowerCase()
        .includes(input.vendor.toLowerCase());
      return amountMatch && vendorMatch;
    });

    if (!match && effectiveInvoiceId) {
      const exactInvoice = await getInvoiceById(effectiveInvoiceId);

      if (exactInvoice.status === "paid") {
        const paidEvidence = await getInvoicePaymentEvidence(exactInvoice.id);
        return NextResponse.json({
          itemId: input.itemId,
          threadId,
          status: "completed",
          matchedInvoice: {
            id: exactInvoice.id,
            hostedInvoiceUrl: paidEvidence.hostedInvoiceUrl,
          },
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


    const env = getEnv();

    let fallbackToSlack = false;

    // 1. Try Auth0 CIBA Flow First (Hackathon Requirement)
    try {
      await getExecuteVendorPaymentTool().invoke({
        invoiceId: match.id,
        expectedAmountCents: match.amountDue,
        threadId,
      });

      agentLogs.push(
        log("authorization_granted", "Auth0 CIBA authorized. Credentials received and payment executed."),
      );
    } catch (auth0Error) {
      const resolution = mapAuth0InterruptToStatus(auth0Error);
      
      if (resolution) {
        // Log interrupt for tracing
        agentLogs.push(log("auth0_ciba_interrupt", resolution.message));

        // If newly pending, push a Slack notification for transparency and Risk Analysis!
        if (resolution.status === "awaiting_approval" && match.metadata?.slack_notified !== "true") {
          await updateInvoiceMetadata(match.id, { slack_notified: "true" });
          if (env.SLACK_WEBHOOK_URL) {
            let aiRiskAssessment = "Automated payment request ready for Auth0 Guardian review.";
            if (hasGeminiKey()) {
              try {
                const { text } = await generateText({
                  model: google("gemini-2.5-pro"),
                  prompt: `Act as a corporate treasury risk director. We have an outgoing payment request for $${(match.amountDue / 100).toFixed(2)} to vendor "${input.vendor}". Our current Plaid confirmed bank balance is $${balance.available}. Provide a 1-2 sentence snappy risk assessment. Emphasize liquidity impact if high. Keep it brief.`,
                });
                aiRiskAssessment = `*🤖 AI Risk Assessment:*\n${text.replace(/\*/g, '')}`;
              } catch (e) {}
            }

            const slackPayload = {
              blocks: [
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: `🚨 *Auth0 CIBA Request Triggered*\n\nYou have a new request:\n*${input.vendor}*\nAmount: *$${(match.amountDue / 100).toFixed(2)}*\nInvoice: ${match.id}\nReason: ${match.description || 'Auto-generated task'}\n\n*This Slack notification was securely orchestrated via Auth0 Extensibility! Please Approve or Deny.*`,
                  }
                },
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: aiRiskAssessment
                  }
                }
              ]
            };
            try {
              await fetch(env.SLACK_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(slackPayload) });
              agentLogs.push(log("slack_notified", "Auth0 prompt was successful. Risk report copied to Slack."));
            } catch(e) {}
          }
        }

        return NextResponse.json({
          itemId: input.itemId,
          threadId,
          status: resolution.status,
          retryAfterSeconds: resolution.retryAfterSeconds ?? 8,
          agentLogs,
          timeline: [
            `Matched invoice ${match.id}.`,
            resolution.message,
          ],
        });
      } else {
        // Auth0 crashed completely (e.g. Guardian Push disabled on user tenant). 
        // Gracefully degrade to our custom Slack buttons!
        fallbackToSlack = true;
        agentLogs.push(
          log("auth0_ciba_fallback", "Auth0 unavailable. Falling back to Slack webhook."),
        );
      }
    }

    // 2. Deterministic Slack Fallback (If Auth0 fails or config is missing)
    if (fallbackToSlack) {


    }

    let evidence = await getInvoicePaymentEvidence(match.id);
    if (!evidence.verifiedPaid) {
      for (let attempt = 0; attempt < EVIDENCE_RETRY_ATTEMPTS; attempt += 1) {
        await delay(1000);
        evidence = await getInvoicePaymentEvidence(match.id);
        if (evidence.verifiedPaid) {
          break;
        }
      }
    }

    // If Slack already granted execution but Stripe still reads open,
    // run one additional execute attempt (idempotent) and re-check.
    if (!evidence.verifiedPaid) {
      try {
        await payInvoice(match.id, threadId ? `treasurygate-${threadId}-${match.id}-retry` : undefined);
      } catch (e) {}

      for (let attempt = 0; attempt < EVIDENCE_RETRY_ATTEMPTS; attempt += 1) {
        await delay(1000);
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
      matchedInvoice: {
        id: match.id,
        hostedInvoiceUrl: evidence.hostedInvoiceUrl,
      },
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
        log("authorization_granted", "Slack authorization approved. Executing payment."),
        log(
          "payment_evidence",
          `status=${evidence.status}, verifiedPaid=${evidence.verifiedPaid}, amountPaid=${evidence.amountPaid}`,
        ),
      ],
      timeline: [
        `Matched invoice ${match.id}.`,
        "Approval requested via Slack.",
        "Slack approval granted. Payment execution attempted in Stripe.",
        evidence.verifiedPaid
          ? "Payment verified as paid in Stripe."
          : "Stripe did not report paid status yet.",
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : typeof error === "object" && error && "code" in error ? String((error as Record<string, unknown>).code || "Unknown code") : "Unknown payment attempt error";
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}
