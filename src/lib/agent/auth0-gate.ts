import "server-only";

import { Auth0AI } from "@auth0/ai-langchain";

import { getEnv } from "@/lib/server/env";

export function buildAuth0AI(): Auth0AI {
  const env = getEnv();

  if (!env.AUTH0_DOMAIN) {
    throw new Error("AUTH0_DOMAIN is required for async authorization.");
  }

  return new Auth0AI({
    auth0: {
      domain: env.AUTH0_DOMAIN,
      clientId: env.AUTH0_CLIENT_ID,
      clientSecret: env.AUTH0_SECRET,
    },
  });
}
