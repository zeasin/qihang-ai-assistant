let opencodeSdk = null;
let opencodeClient = null;

async function ensureSdk() {
  if (!opencodeSdk) opencodeSdk = await import('@opencode-ai/sdk');
  return opencodeSdk;
}

async function ensureClient() {
  if (!opencodeClient) {
    const sdk = await ensureSdk();
    const result = await sdk.createOpencode();
    opencodeClient = result.client;
  }
  return opencodeClient;
}

async function prompt(context, question, onDelta, onDone) {
  const client = await ensureClient();
  const sessions = await client.session.list({});
  let sessionId = sessions?.[0]?.id;
  if (!sessionId) {
    const created = await client.session.create({ body: { label: 'biling-ai' } });
    sessionId = created.id;
  }
  const fullText = context ? `${context}\n\n${question}` : question;
  const result = await client.session.prompt({
    path: { id: sessionId },
    body: { parts: [{ type: 'text', text: fullText }] },
  });
  const text = result?.parts?.map(p => p.text).join('') || '';
  onDelta?.(text);
  onDone?.();
  return text;
}

async function checkStatus() {
  try {
    const sdk = await ensureSdk();
    return { installed: true, version: '1.18.5' };
  } catch {
    return { installed: false, version: null };
  }
}

module.exports = { prompt, checkStatus };