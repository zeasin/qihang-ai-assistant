let opencodeClient = null;
let opencodeServer = null;
const sessionCache = new Map();
const activeSubscriptions = new Map();

async function ensureClient() {
  if (opencodeClient && opencodeServer) {
    try { await opencodeClient.config.get(); return opencodeClient; }
    catch { try { opencodeServer.close(); } catch {} opencodeServer = null; opencodeClient = null; sessionCache.clear(); }
  }

  // 手动启动 opencode serve 进程
  const { spawn } = require('child_process');

  const args = ['serve', '--hostname=127.0.0.1', '--port=0'];
  console.log('[opencode] starting server: opencode', args.join(' '));

  const proc = spawn('opencode', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: { ...process.env },
  });

  const serverUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for opencode server to start')), 8000);

    let output = '';
    const onData = (chunk) => {
      output += chunk.toString();
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.startsWith('opencode server listening')) {
          const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
          if (match) {
            clearTimeout(timeout);
            resolve(match[1]);
            return;
          }
        }
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);

    proc.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`opencode server exited with code ${code}\nOutput: ${output}`));
    });
    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  console.log('[opencode] server started at:', serverUrl);

  const sdk = await import('@opencode-ai/sdk');
  opencodeClient = sdk.createOpencodeClient({ baseUrl: serverUrl });
  opencodeServer = {
    url: serverUrl,
    close() {
      try { proc.kill(); } catch {}
    },
  };

  // 验证 provider 配置
  try {
    const cfg = await opencodeClient.config.get();
    const providerCfg = cfg?.data?.provider;
    if (providerCfg && typeof providerCfg === 'object' && Object.keys(providerCfg).length > 0) {
      console.log('[opencode] providers configured:', Object.keys(providerCfg).join(', '));
    } else {
      console.warn('[opencode] WARNING: No provider configured!');
    }
  } catch (e) {
    console.warn('[opencode] could not verify config:', e.message);
  }

  return opencodeClient;
}

async function getOrCreateSession(directory, onError) {
  const key = directory || '__default__';
  const client = await ensureClient();
  const cached = sessionCache.get(key);
  if (cached) {
    try {
      const check = await client.session.get({ path: { id: cached.sessionId } });
      if (check?.data?.id) return cached;
    } catch {}
    sessionCache.delete(key);
  }
  try {
    const result = await client.session.create({
      query: directory ? { directory } : {},
      body: { title: 'biling-ai-coding' },
    });
    const sessionId = result?.data?.id;
    if (!sessionId) throw new Error('Failed to create session');
    const info = { sessionId, directory };
    sessionCache.set(key, info);
    console.log('[opencode] session created:', sessionId, 'dir:', directory);
    return info;
  } catch (err) {
    onError?.('opencode session failed: ' + err.message);
    throw err;
  }
}

/**
 * 从事件中提取 sessionID（事件类型不同，sessionID 所在路径也不同）
 * Event types and their sessionID locations:
 *   - message.part.updated → properties.part.sessionID
 *   - message.updated → properties.info.sessionID
 *   - session.idle / session.status / message.removed → properties.sessionID
 *   - server.connected / other server events → no sessionID
 */
function getSessionIdFromEvent(event) {
  if (!event || !event.properties) return null;
  const p = event.properties;
  if (p.part && p.part.sessionID) return p.part.sessionID;
  if (p.info && p.info.sessionID) return p.info.sessionID;
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
    // ========== 1) 通过 /global/event 订阅全局事件 ==========
    // /global/event 返回所有事件的 SSE 流，每个事件包裹为 { directory, payload } 格式
    // 这比 /event 更可靠，因为 /event 可能只返回 server 级事件而不含 session 事件
    const events = await client.global.event();
    const streamIterator = events.stream[Symbol.asyncIterator]();

    // ========== 2) 先发起一次 next() 建立 SSE 连接（不等待事件）==========
    // 确保在 promptAsync 发送前 SSE 通道已就绪，避免竞态条件
    const connectPromise = streamIterator.next().catch(err => {
      console.log('[opencode] SSE connect error:', err.message);
      return { done: true, value: undefined };
    });

    // ========== 3) 异步发送 prompt（立即返回 204，响应通过事件流到达）=========
    await client.session.promptAsync({
      path: { id: sessionId },
      body: { parts: [{ type: 'text', text: fullText }] },
    });
    console.log('[opencode] promptAsync sent, sessionId:', sessionId);

    // ========== 4) 等待第一个事件（通常是 server.connected）=========
    const firstResult = await connectPromise;
    let currentEvent = firstResult.done ? null : firstResult.value;

    // ========== 5) 主事件循环 ==========
    let assistantStarted = false;
    while (!finished && !abortController.signal.aborted) {
      let rawEvent = currentEvent;
      if (rawEvent === null) {
        const { value, done: streamDone } = await streamIterator.next();
        if (streamDone) {
          console.log('[opencode] event stream ended (done)');
          break;
        }
        rawEvent = value;
      } else {
        currentEvent = null; // 消耗掉第一个事件
      }

      if (!rawEvent) continue;

      // /global/event 返回的是 GlobalEvent 格式: { directory, payload }
      // 需要解包取出实际的 Event
      let event = rawEvent;
      if (rawEvent.payload && typeof rawEvent.payload === 'object' && rawEvent.payload.type) {
        event = rawEvent.payload;
      }

      if (!event || !event.type) continue;

      // 按 sessionID 过滤：跳过不属于当前 session 的事件
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
          // 使用 delta（增量）方式流式输出
          if (props.delta) {
            onDelta?.(props.delta);
          } else {
            const prev = textLenByPart.get(part.id) || 0;
            if (partText.length > prev) {
              onDelta?.(partText.slice(prev));
              textLenByPart.set(part.id, partText.length);
            }
          }
        } else if (partType === 'reasoning' && partText) {
          onTool?.({ type: 'thinking', text: partText });
        } else if (partType === 'step-finish') {
          // step 完成，可能还有后续 step
        } else if (partType === 'tool' && part.callID) {
          onTool?.({ type: 'tool', name: part.tool || 'unknown', text: part.state || 'running' });
        }
      } else if (type === 'message.updated') {
        const info = props.info;
        if (info && info.role === 'assistant') {
          assistantStarted = true;
        }
        // message.updated 带有 completed 时间戳表示消息已完成
        if (info && info.role === 'assistant' && info.time && info.time.completed) {
          console.log('[opencode] message completed, sessionId:', sessionId);
          finished = true;
          onDone?.();
          break;
        }
      } else if (type === 'session.idle') {
        if (props.sessionID === sessionId) {
          console.log('[opencode] session idle, sessionId:', sessionId);
          finished = true;
          onDone?.();
          break;
        }
      } else if (type === 'session.status') {
        if (props.status?.type === 'idle' && props.sessionID === sessionId) {
          console.log('[opencode] session status idle, sessionId:', sessionId);
          finished = true;
          onDone?.();
          break;
        }
      } else if (type === 'session.error' || type === 'error') {
        const errMsg = props.message || props.text || (props.data && props.data.message) || 'opencode error';
        console.log('[opencode] error:', errMsg);
        onError?.(errMsg);
        finished = true;
        break;
      } else if (type === 'server.connected') {
        // 初始连接事件，忽略
      }
    }
  } catch (err) {
    if (err.name === 'AbortError' || abortController.signal.aborted) return;
    console.log('[opencode] stream error:', err.message);
    onError?.('opencode stream error: ' + err.message);
  } finally {
    activeSubscriptions.delete(sessionId);
    abortController.abort();
    if (!finished) {
      console.log('[opencode] stream ended before completion, forcing done');
      onDone?.();
    }
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
  if (cached) {
    try { await cancelSession(cached.sessionId); const client = await ensureClient(); await client.session.delete({ path: { id: cached.sessionId } }); } catch {}
    sessionCache.delete(key);
  }
}

module.exports = { prompt, cancelSession, checkStatus, clearCache, removeSession };
