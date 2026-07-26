let opencodeClient = null;
let opencodeServer = null;
const sessionCache = new Map();
const activeSubscriptions = new Map();

async function ensureClient() {
  if (opencodeClient && opencodeServer) {
    try { await opencodeClient.config.get(); return opencodeClient; }
    catch { try { opencodeServer.close(); } catch {} opencodeServer = null; opencodeClient = null; sessionCache.clear(); }
  }
  const sdk = await import('@opencode-ai/sdk');
  const { client, server } = await sdk.createOpencode({ hostname: '127.0.0.1', port: 0, timeout: 8000, config: { logLevel: 'ERROR' } });
  opencodeServer = server;
  opencodeClient = await sdk.createOpencodeClient({ baseUrl: server.url });
  console.log('[opencode] server started at:', server.url);
  return opencodeClient;
}

async function getOrCreateSession(directory, onError) {
  const key = directory || '__default__';
  const client = await ensureClient();
  const cached = sessionCache.get(key);
  if (cached) {
    try { const check = await client.session.get({ path: { id: cached.sessionId } }); if (!check?.data?.id) throw new Error('Session not found'); return cached; }
    catch { sessionCache.delete(key); }
  }
  try {
    const result = await client.session.create({ query: directory ? { directory } : {}, body: { label: 'biling-ai-coding' } });
    const sessionId = result?.data?.id;
    if (!sessionId) throw new Error('Failed to create session');
    const info = { sessionId, directory };
    sessionCache.set(key, info);
    console.log('[opencode] session created:', sessionId, 'dir:', directory);
    return info;
  } catch (err) { onError?.('opencode session failed: ' + err.message); throw err; }
}

/**
 * Extract sessionID from event based on event type.
 * The SDK puts sessionID at different paths depending on the event type.
 */
function getSessionIdFromEvent(event) {
  if (!event || !event.properties) return null;
  const p = event.properties;

  // message.part.updated → sessionID is on the part object
  if (p.part && p.part.sessionID) return p.part.sessionID;
  // message.updated → sessionID is on the info object
  if (p.info && p.info.sessionID) return p.info.sessionID;
  // message.completed / message.removed → sessionID at top of properties
  if (p.sessionID) return p.sessionID;
  return null;
}

async function prompt(context, question, directory, onDelta, onDone, onError, onTool) {
  const client = await ensureClient();
  const session = await getOrCreateSession(directory, onError);
  const sessionId = session.sessionId;
  const fullText = context ? context + '\n\nUser question: ' + question : question;

  const abortController = new AbortController();
  activeSubscriptions.set(sessionId, abortController);
  let finished = false;
  const textLenByPart = new Map();

  try {
    // Subscribe to events BEFORE sending prompt (avoid race condition)
    const events = await client.event.subscribe();
    const streamIterator = events.stream[Symbol.asyncIterator]();

    // Send the prompt (async - returns immediately, responses come via event stream)
    await client.session.promptAsync({
      path: { id: sessionId },
      body: { parts: [{ type: 'text', text: fullText }] },
    });
    console.log('[opencode] promptAsync sent, sessionId:', sessionId);

    // Read events from stream
    let assistantStarted = false;
    while (!finished && !abortController.signal.aborted) {
      const { value: event, done: streamDone } = await streamIterator.next();
      if (streamDone) {
        console.log('[opencode] event stream ended (done)');
        break;
      }
      if (!event || !event.type) continue;

      // Filter events by sessionID
      const eventSessionId = getSessionIdFromEvent(event);
      if (eventSessionId && eventSessionId !== sessionId) continue;

      const type = event.type;
      const props = event.properties || {};
      console.log('[opencode] event:', type, eventSessionId ? 'session:' + eventSessionId : '');

      if (type === 'message.part.updated') {
        const part = props.part;
        if (!part) continue;
        const partType = part.type;
        const partText = part.text || '';

        if (partType === 'step-start') {
          assistantStarted = true;
          onTool?.({ type: 'thinking', text: '正在思考...' });
        } else if (partType === 'text' && partText) {
          if (assistantStarted) {
            // Use delta if available (more efficient), otherwise track by part text length
            if (props.delta) {
              onDelta?.(props.delta);
            } else {
              const prev = textLenByPart.get(part.id) || 0;
              if (partText.length > prev) {
                onDelta?.(partText.slice(prev));
                textLenByPart.set(part.id, partText.length);
              }
            }
          }
        } else if (partType === 'reasoning' && partText) {
          onTool?.({ type: 'thinking', text: partText });
        } else if (partType === 'step-finish') {
          // step-finish means one step completed, but there may be more steps
          // Don't set finished=true here, wait for message.completed
        } else if (partType === 'tool' && part.callID) {
          onTool?.({ type: 'tool', name: part.tool || 'unknown', text: part.state || 'running' });
        }
      } else if (type === 'message.updated') {
        // Full message update (e.g., when message is completed or has final text)
        const info = props.info;
        if (info && info.role === 'assistant') {
          // A completed message might have final text in its content
          assistantStarted = true;
        }
      } else if (type === 'message.completed') {
        console.log('[opencode] message completed for session:', sessionId);
        finished = true;
        onDone?.();
        break;
      } else if (type === 'session.error' || type === 'error') {
        const errMsg = props.message || props.text || (props.data && props.data.message) || 'opencode error';
        console.log('[opencode] error:', errMsg);
        onError?.(errMsg);
        finished = true;
        break;
      } else if (type === 'server.connected') {
        // Initial connection event - ignore
      }
    }
  } catch (err) {
    if (err.name === 'AbortError' || abortController.signal.aborted) return;
    console.log('[opencode] stream error:', err.message);
    onError?.('opencode stream error: ' + err.message);
  } finally {
    activeSubscriptions.delete(sessionId);
    abortController.abort();
    if (!finished) onDone?.();
  }
}

async function cancelSession(sessionId) {
  const abort = activeSubscriptions.get(sessionId);
  if (abort) { abort.abort(); activeSubscriptions.delete(sessionId); }
  try { const client = await ensureClient(); await client.session.abort({ path: { id: sessionId } }); } catch {}
}

async function checkStatus() {
  try {
    const client = await ensureClient();
    const cfg = await client.config.get();
    const pm = cfg?.data?.provider;
    let providers = [], totalModels = 0;
    if (pm) {
      providers = Object.entries(pm).map(([k, p]) => ({
        name: p.name || k,
        models: p.models ? Object.keys(p.models).length : 0,
      }));
      totalModels = providers.reduce((s, p) => s + p.models, 0);
    }
    const hasProvider = totalModels > 0;
    return { installed: hasProvider, version: '1.18.5', providers, totalModels };
  } catch {
    return { installed: false, version: null, providers: [], totalModels: 0 };
  }
}

function clearCache() { for (const [, a] of activeSubscriptions) a.abort(); activeSubscriptions.clear(); sessionCache.clear(); }

async function removeSession(directory) {
  const key = directory || '__default__';
  const cached = sessionCache.get(key);
  if (cached) { try { await cancelSession(cached.sessionId); const client = await ensureClient(); await client.session.delete({ path: { id: cached.sessionId } }); } catch {} sessionCache.delete(key); }
}

module.exports = { prompt, cancelSession, checkStatus, clearCache, removeSession };
