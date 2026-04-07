/**
 * Auth0 Post-Login or Custom API Action for Slack Async Payment Approval
 * This runs securely inside the Auth0 tenant environment, leveraging Extensibility.
 * 
 * @param {Event} event - Details about the user and the context in which they are logging in.
 * @param {PostLoginAPI} api - Interface whose methods can be used to change the behavior of the login.
 */
const axios = require('axios');

exports.onExecutePostLogin = async (event, api) => {
  // Only trigger for specific payments or M2M transactions asking for elevated approval
  const paymentAmount = event.request.query.amountCents;
  const vendorName = event.request.query.vendor;
  
  if (paymentAmount && vendorName) {
    const slackPayload = {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: 'Auth0 Action Triggered Payment Approval',
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: \*Vendor:* \\n*Amount:* $\\n*User:* \\n*Location:* \\n\n*This request was dynamically intercepted by Auth0 Extensibility.*\
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Approve Payment' },
              style: 'primary',
              value: \pprove_\\
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Deny' },
              style: 'danger',
              value: \deny_\\
            }
          ]
        }
      ]
    };
    
    try {
      // Fire Webhook securely from the Auth0 tenant, hiding the SLACK URL from Next.js client
      await axios.post(event.secrets.SLACK_WEBHOOK_URL, slackPayload);
      
      // Optionally deny the login payload immediately until the Slack approval is granted out-of-band
      // api.access.deny('Awaiting Slack Approval'); 
    } catch(e) {
      console.error('Failed to send Slack webhook from Auth0 Action', e);
    }
  }
};
