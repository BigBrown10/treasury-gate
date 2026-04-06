import "server-only";

import Stripe from "stripe";

import { getEnv } from "@/lib/server/env";

export type PendingInvoice = {
  id: string;
  amountDue: number;
  amountDueDisplay: string;
  currency: string;
  customerName: string | null;
  description: string | null;
  hostedInvoiceUrl: string | null;
  status: Stripe.Invoice.Status | null;
  createdAt: string;
};

export type CreateInvoiceInput = {
  vendor: string;
  recipientName?: string;
  recipientEmail?: string;
  amountCents: number;
  currency?: string;
  description?: string;
};

export type VendorPaymentResult = {
  invoiceId: string;
  status: string | null;
  hostedInvoiceUrl: string | null;
  receiptUrl: string;
  stripeInvoiceUrl: string;
  verifiedPaid: boolean;
  amountPaid: number;
  currency: string;
};

export type InvoicePaymentEvidence = {
  invoiceId: string;
  status: string | null;
  amountPaid: number;
  currency: string;
  hostedInvoiceUrl: string | null;
  stripeInvoiceUrl: string;
  verifiedPaid: boolean;
};

let stripeClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (stripeClient) {
    return stripeClient;
  }

  const env = getEnv();
  stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-03-31.basil",
  });

  return stripeClient;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatMoneyFromCents(amount: number): string {
  return currencyFormatter.format(amount / 100);
}

function normalizeInvoice(invoice: Stripe.Invoice): PendingInvoice {
  const customerName =
    typeof invoice.customer === "object" && invoice.customer !== null
      ? "name" in invoice.customer
        ? invoice.customer.name ?? null
        : null
      : null;

  return {
    id: invoice.id,
    amountDue: invoice.amount_due,
    amountDueDisplay: formatMoneyFromCents(invoice.amount_due),
    currency: invoice.currency.toUpperCase(),
    customerName,
    description: invoice.description,
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    status: invoice.status,
    createdAt: new Date(invoice.created * 1000).toISOString(),
  };
}

export async function getPendingInvoices(): Promise<PendingInvoice[]> {
  const env = getEnv();
  const stripe = getStripeClient();

  const result = await stripe.invoices.list({
    status: "open",
    limit: env.STRIPE_INVOICE_LIMIT,
    expand: ["data.customer"],
  });

  return result.data.map((invoice) => normalizeInvoice(invoice));
}

export async function getInvoiceById(invoiceId: string): Promise<PendingInvoice> {
  const stripe = getStripeClient();
  const invoice = await stripe.invoices.retrieve(invoiceId, {
    expand: ["customer"],
  });

  return normalizeInvoice(invoice);
}

export async function createOpenInvoiceForVendor(
  input: CreateInvoiceInput,
): Promise<PendingInvoice> {
  const stripe = getStripeClient();
  const normalizedVendor = input.vendor.trim();
  const normalizedRecipientName = input.recipientName?.trim() || normalizedVendor;
  const normalizedRecipientEmail =
    input.recipientEmail?.trim() ||
    `${normalizedVendor.toLowerCase().replace(/[^a-z0-9]/g, "") || "vendor"}@treasurygate.test`;

  const customer = await stripe.customers.create({
    name: normalizedRecipientName,
    description: `TreasuryGate autopay customer for ${normalizedVendor}`,
    email: normalizedRecipientEmail,
  });

  await stripe.invoiceItems.create({
    customer: customer.id,
    amount: input.amountCents,
    currency: (input.currency ?? "usd").toLowerCase(),
    description: input.description ?? `${normalizedVendor} payable`,
  });

  const draftInvoice = await stripe.invoices.create({
    customer: customer.id,
    auto_advance: false,
    collection_method: "send_invoice",
    days_until_due: 30,
    pending_invoice_items_behavior: "include",
    description: input.description ?? `${normalizedVendor} payable`,
  });

  const openInvoice = await stripe.invoices.finalizeInvoice(draftInvoice.id);

  if (openInvoice.amount_due <= 0) {
    throw new Error(
      `Stripe returned a zero-amount invoice for ${normalizedVendor}. Check amount input and invoice item creation.`,
    );
  }

  return normalizeInvoice(openInvoice);
}

export async function payInvoice(
  invoiceId: string,
  idempotencyKey?: string,
): Promise<VendorPaymentResult> {
  const stripe = getStripeClient();
  const invoice = await stripe.invoices.retrieve(invoiceId);

  if (invoice.status !== "open") {
    throw new Error(`Invoice ${invoiceId} is not open and cannot be paid.`);
  }

  const paid = await stripe.invoices.pay(
    invoiceId,
    {
      // For demo/test invoices in send_invoice mode, mark as paid manually
      // so status reliably transitions to paid.
      paid_out_of_band: true,
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  );

  let verifiedInvoice = await stripe.invoices.retrieve(paid.id);

  if (verifiedInvoice.status !== "paid") {
    await stripe.invoices.pay(
      invoiceId,
      {
        paid_out_of_band: true,
      },
      idempotencyKey ? { idempotencyKey: `${idempotencyKey}-retry` } : undefined,
    );

    verifiedInvoice = await stripe.invoices.retrieve(paid.id);
  }
  const stripeInvoiceUrl = `https://dashboard.stripe.com/test/invoices/${encodeURIComponent(verifiedInvoice.id)}`;

  return {
    invoiceId: verifiedInvoice.id,
    status: verifiedInvoice.status,
    hostedInvoiceUrl: verifiedInvoice.hosted_invoice_url ?? null,
    receiptUrl:
      verifiedInvoice.hosted_invoice_url ??
      stripeInvoiceUrl,
    stripeInvoiceUrl,
    verifiedPaid: verifiedInvoice.status === "paid",
    amountPaid: verifiedInvoice.amount_paid,
    currency: verifiedInvoice.currency.toUpperCase(),
  };
}

export async function getInvoicePaymentEvidence(
  invoiceId: string,
): Promise<InvoicePaymentEvidence> {
  const stripe = getStripeClient();
  const invoice = await stripe.invoices.retrieve(invoiceId);
  const stripeInvoiceUrl = `https://dashboard.stripe.com/test/invoices/${encodeURIComponent(invoice.id)}`;
  const normalizedAmountPaid =
    invoice.amount_paid > 0
      ? invoice.amount_paid
      : invoice.status === "paid"
        ? invoice.total
        : invoice.amount_paid;

  return {
    invoiceId: invoice.id,
    status: invoice.status,
    amountPaid: normalizedAmountPaid,
    currency: invoice.currency.toUpperCase(),
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    stripeInvoiceUrl,
    verifiedPaid: invoice.status === "paid",
  };
}
