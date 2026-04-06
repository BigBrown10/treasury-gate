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

export type VendorPaymentResult = {
  invoiceId: string;
  status: string | null;
  hostedInvoiceUrl: string | null;
  receiptUrl: string;
  amountPaid: number;
  currency: string;
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

export async function getPendingInvoices(): Promise<PendingInvoice[]> {
  const env = getEnv();
  const stripe = getStripeClient();

  const result = await stripe.invoices.list({
    status: "open",
    limit: env.STRIPE_INVOICE_LIMIT,
    expand: ["data.customer"],
  });

  return result.data.map((invoice) => {
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
  });
}

export async function payInvoice(invoiceId: string): Promise<VendorPaymentResult> {
  const stripe = getStripeClient();
  const invoice = await stripe.invoices.retrieve(invoiceId);

  if (invoice.status !== "open") {
    throw new Error(`Invoice ${invoiceId} is not open and cannot be paid.`);
  }

  const paid = await stripe.invoices.pay(invoiceId);

  return {
    invoiceId: paid.id,
    status: paid.status,
    hostedInvoiceUrl: paid.hosted_invoice_url ?? null,
    receiptUrl:
      paid.hosted_invoice_url ??
      `https://dashboard.stripe.com/test/invoices/${encodeURIComponent(paid.id)}`,
    amountPaid: paid.amount_paid,
    currency: paid.currency.toUpperCase(),
  };
}
