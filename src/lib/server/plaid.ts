import "server-only";

import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
} from "plaid";

import { getEnv } from "@/lib/server/env";

export type BankBalance = {
  accountName: string;
  available: number;
  current: number;
  isoCurrencyCode: string;
  asOf: string;
};

let plaidClient: PlaidApi | null = null;
let cachedAccessToken: string | undefined;

function getPlaidClient(): PlaidApi {
  if (plaidClient) {
    return plaidClient;
  }

  const env = getEnv();
  plaidClient = new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": env.PLAID_CLIENT_ID,
          "PLAID-SECRET": env.PLAID_SECRET,
          "Plaid-Version": "2020-09-14",
        },
      },
    }),
  );
  cachedAccessToken = env.PLAID_ACCESS_TOKEN;

  return plaidClient;
}

async function getSandboxAccessToken(): Promise<string> {
  const plaidClient = getPlaidClient();
  const env = getEnv();

  if (cachedAccessToken) {
    return cachedAccessToken;
  }

  const publicToken = await plaidClient.sandboxPublicTokenCreate({
    institution_id: env.PLAID_SANDBOX_INSTITUTION_ID,
    initial_products: [Products.Auth],
    options: {
      webhook: "https://example.com/plaid-webhook",
    },
  });

  const exchange = await plaidClient.itemPublicTokenExchange({
    public_token: publicToken.data.public_token,
  });

  cachedAccessToken = exchange.data.access_token;
  return cachedAccessToken;
}

export async function getBankBalance(): Promise<BankBalance> {
  const plaidClient = getPlaidClient();
  const accessToken = await getSandboxAccessToken();

  const response = await plaidClient.accountsBalanceGet({
    access_token: accessToken,
    options: {
      min_last_updated_datetime: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    },
  });

  const first = response.data.accounts[0];

  if (!first) {
    throw new Error("No Plaid sandbox account found.");
  }

  return {
    accountName: first.name,
    available: first.balances.available ?? 0,
    current: first.balances.current ?? 0,
    isoCurrencyCode: first.balances.iso_currency_code ?? "USD",
    asOf: new Date().toISOString(),
  };
}
