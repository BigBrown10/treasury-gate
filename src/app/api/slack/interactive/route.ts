import { NextRequest, NextResponse } from "next/server";
import { updateInvoiceMetadata } from "@/lib/server/stripe";

export async function POST(request: NextRequest) {
  try {
    const text = await request.text();
    const params = new URLSearchParams(text);
    const payloadStr = params.get("payload");

    if (!payloadStr) {
      return NextResponse.json({ error: "No payload provided text" }, { status: 400 });
    }

    const payload = JSON.parse(payloadStr);

    const action = payload.actions?.[0];
    if (!action || !action.value) {
      return NextResponse.json({ ok: true });
    }

    const actionValue = action.value as string;
    const [actionType, invoiceId] = actionValue.split("|");

    if (!invoiceId) {
      return NextResponse.json({ ok: true });
    }

    // Set the decision as metadata on the Stripe invoice
    if (actionType === "approve" || actionType === "deny") {
      await updateInvoiceMetadata(invoiceId, { slack_approval: actionType });

      return NextResponse.json({
        replace_original: true,
        text: `*Status Update:* Payment has been ${actionType === "approve" ? "approved ✅" : "denied ❌"}\nInvoice: ${invoiceId}`
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Slack Interactive Error:", error);
    return NextResponse.json({ error: "Failed to process interaction" }, { status: 500 });
  }
}
