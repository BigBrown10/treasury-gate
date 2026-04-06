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

  if (response.data.accounts.length === 0) {
    throw new Error("No Plaid sandbox account found.");
  }

  // Pick the account with the highest available balance for a more realistic
  // liquidity signal than blindly using the first returned account.
  const highest = [...response.data.accounts].sort(
    (a, b) => (b.balances.available ?? 0) - (a.balances.available ?? 0),
  )[0];

  return {
    accountName: highest.name,
    available: highest.balances.available ?? 0,
    current: highest.balances.current ?? 0,
    isoCurrencyCode: highest.balances.iso_currency_code ?? "USD",
    asOf: new Date().toISOString(),
  };
}
