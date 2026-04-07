    const env = getEnv();

    // --------------------------------------------------------------------------------
    // AUTH0 ASYNCHRONOUS AUTHORIZATION (CIBA) GATE
    // --------------------------------------------------------------------------------
    let auth0Succeeded = false;
    let fallbackToSlack = false;

    try {
      await getExecuteVendorPaymentTool().invoke({
        invoiceId: match.id,
        expectedAmountCents: match.amountDue,
        threadId,
      });

      auth0Succeeded = true;
      agentLogs.push(
        log("authorization_granted", "Auth0 CIBA authorized credentials received and payment executed."),
      );
    } catch (auth0Error) {
      const resolution = mapAuth0InterruptToStatus(auth0Error);
      
      if (resolution) {
        // We hit an expected Auth0 CIBA Interrupt (e.g. pending push notification)
        
        // Push the AI Risk Assessment to Slack for transparency
        if (resolution.status === "awaiting_approval" && match.metadata?.slack_notified !== "true" && env.SLACK_WEBHOOK_URL) {
          let aiRiskAssessment = "Automated payment request ready for Auth0 Guardian review.";
  
          if (hasGeminiKey()) {
            try {
              const { text } = await generateText({
                model: google("gemini-2.5-pro"),
                prompt: \Act as a corporate treasury risk director. We have an outgoing payment request for $\ to vendor "\". Our current Plaid confirmed bank balance is $\. Provide a 1-2 sentence snappy risk assessment. Emphasize liquidity impact if high. Keep it brief.\,
              });
              aiRiskAssessment = \*?? AI Risk Assessment:*\n\\;
            } catch (e) {
              aiRiskAssessment = "*?? AI Risk Assessment:*\nFailed to generate report.";
            }
          }

          const slackPayload = {
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: \?? *Auth0 CIBA Request Triggered*\n\nYou have a new request:\n*\*\nAmount: *$\*\nInvoice: \\nReason: \\n\n*Please check your Auth0 Guardian app to Approve or Deny this transaction.*\,
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
            await fetch(env.SLACK_WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(slackPayload)
            });
            await updateInvoiceMetadata(match.id, { slack_notified: "true" });
          } catch(e) {}
        }

        return NextResponse.json({
          itemId: input.itemId,
          threadId,
          status: resolution.status,
          retryAfterSeconds: resolution.retryAfterSeconds ?? 8,
          agentLogs: [
            ...agentLogs,
            log("auth0_ciba_interrupt", resolution.message),
          ],
          timeline: [
            \Matched invoice \.\,
            resolution.message,
          ],
        });
      } else {
        // It wasn't an interrupt. It was an actual hard error (e.g. "needs Guardian push enabled" tenant error)
        // We gracefully degrade to the deterministic Slack Webhook fallback so the demo doesn't crash!
        fallbackToSlack = true;
        agentLogs.push(
          log("auth0_ciba_fallback", \Auth0 gate unavailable: \. Falling back to deterministic Slack webhook.\),
        );
      }
    }

    // --------------------------------------------------------------------------------
    // DETERMINISTIC SLACK WEBHOOK FALLBACK (If Auth0 Tenant is misconfigured)
    // --------------------------------------------------------------------------------
    if (fallbackToSlack) {
      let slackApproval = match.metadata?.slack_approval;
  
      if (slackApproval === "approve") {
        slackApproval = "approved";
        await updateInvoiceMetadata(match.id, { slack_approval: "approved" });
      }
  
      if (slackApproval === "deny") {
        slackApproval = "denied";
        await updateInvoiceMetadata(match.id, { slack_approval: "denied" });
      }
  
      if (!slackApproval) {
        await updateInvoiceMetadata(match.id, { slack_approval: "pending" });
        slackApproval = "pending";
  
        if (!env.SLACK_WEBHOOK_URL) {
          throw new Error("SLACK_WEBHOOK_URL is not configured. Slack approval cannot be requested.");
        }
  
        let aiRiskAssessment = "Automated payment request ready for human review.";
  
        if (hasGeminiKey()) {
          try {
            const { text } = await generateText({
              model: google("gemini-2.5-pro"),
              prompt: \Act as a corporate treasury risk director. We have an outgoing payment request for $\ to vendor "\". Our current Plaid confirmed bank balance is $\. Provide a 1-2 sentence snappy risk assessment. Emphasize liquidity impact if high. Keep it brief.\,
            });
            aiRiskAssessment = \*?? AI Risk Assessment:*\n\\;
          } catch (e) {
            aiRiskAssessment = "*?? AI Risk Assessment:*\nFailed to generate report.";
          }
        }
  
        const slackPayload = {
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: \You have a new request:\n*\*\nAmount: *$\*\nInvoice: \\nReason: \\
              }
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: aiRiskAssessment
              }
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: { type: "plain_text", emoji: true, text: "Approve" },
                  style: "primary",
                  value: \pprove|\\
                },
                {
                  type: "button",
                  text: { type: "plain_text", emoji: true, text: "Deny" },
                  style: "danger",
                  value: \deny|\\
                }
              ]
            }
          ]
        };
  
        const slackResponse = await fetch(env.SLACK_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(slackPayload)
        });
  
        if (!slackResponse.ok) {
          throw new Error(\Slack webhook request failed with status \.\);
        }
  
        return NextResponse.json({
          itemId: input.itemId,
          threadId,
          status: "awaiting_approval",
          retryAfterSeconds: 8,
          agentLogs: [
            ...agentLogs,
            log("slack_approval_requested", "Approval request pushed to Slack.")
          ],
          timeline: [
            \Matched invoice \.\,
            "Approval requested via Slack.",
            "Waiting for authorized user to approve."
          ]
        });
      }
  
      if (slackApproval === "pending") {
        return NextResponse.json({
          itemId: input.itemId,
          threadId,
          status: "awaiting_approval",
          retryAfterSeconds: 8,
          agentLogs: [...agentLogs, log("slack_approval_pending", "Still waiting for Slack interaction")],
          timeline: ["Waiting for Slack approval..."]
        });
      }
  
      if (slackApproval === "denied") {
        return NextResponse.json({
          itemId: input.itemId,
          threadId,
          status: "denied",
          agentLogs: [...agentLogs, log("slack_approval_denied", "User clicked deny in Slack")],
          timeline: ["Payment was denied via Slack."]
        });
      }
  
      if (slackApproval !== "approved") {
        return NextResponse.json({
          itemId: input.itemId,
          threadId,
          status: "awaiting_approval",
          retryAfterSeconds: 8,
          agentLogs: [...agentLogs, log("slack_approval_unknown", \Unexpected slack_approval=\\)],
          timeline: ["Waiting for Slack approval state to become approved..."]
        });
      }
  
      // Execute Slack
      try {
        await payInvoice(match.id, threadId ? \	reasurygate-\-\\ : undefined);
      } catch (payErr) {
        throw payErr instanceof Error ? payErr : new Error(String(payErr));
      }
    }
