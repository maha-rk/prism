// IBM Cloud IAM access tokens are short-lived (~1 hour) and must be
// exchanged from the account-level API key before calling watsonx — the
// API key itself is NOT a valid Bearer token. Shared by both the vision
// provider and the narrative-reconstruction provider, since both call
// watsonx directly via fetch (unlike Watson TTS, which goes through the
// ibm-watson SDK's IamAuthenticator and already handles this internally).

let cachedToken = null;
let cachedExpiryMs = 0;

async function getIamToken(apiKey) {
  const now = Date.now();
  if (cachedToken && now < cachedExpiryMs - 60_000) {
    return cachedToken;
  }

  const res = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
      apikey: apiKey,
    }),
  });

  if (!res.ok) {
    throw new Error(`IAM token exchange failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  cachedExpiryMs = now + (data.expires_in ?? 3600) * 1000;
  return cachedToken;
}

module.exports = { getIamToken };
