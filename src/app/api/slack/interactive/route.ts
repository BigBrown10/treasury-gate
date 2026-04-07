import { NextRequest, NextResponse } from "next/server";
import { updateInvoiceMetadata } from "@/lib/server/stripe";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let payload: Record<string, unknown>;

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await request.text();
      const params = new URLSearchParams(text);
      const payloadStr = params.get("payload");
      if (!payloadStr) {
        return NextResponse.json({ error: "No payload provided text" }, { status: 400 });
      }
      payload = JSON.parse(payloadStr) as Record<string, unknown>;
    } else {
      payload = (await request.json()) as Record<string, unknown>;
    }

    const actions = (payload.actions as Array<Record<string, unknown>> | undefined) ?? [];
    const action = actions[0];
    if (!action || !action.value) {
      return NextResponse.json({ ok: true });
    }

    const actionValue = action.value as string;
    const [actionType, invoiceId] = actionValue.split("|");

    if (!invoiceId) {
      return NextResponse.json({ ok: true });
    }

    const normalizedDecision =
      actionType === "approve" ? "approved" : actionType === "deny" ? "denied" : null;

    // Set the decision as metadata on the Stripe invoice
    if (actionType === "approve" || actionType === "deny") {
      await updateInvoiceMetadata(invoiceId, { slack_approval: normalizedDecision! });

      return NextResponse.json({
        replace_original: true,
        text: `*Status Update:* Payment has been ${normalizedDecision === "approved" ? "approved ✅" : "denied ❌"}\nInvoice: ${invoiceId}`
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Slack Interactive Error:", error);
    return NextResponse.json({ error: "Failed to process interaction" }, { status: 500 });
  }
}
