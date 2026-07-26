let opencodeClient = null;
let opencodeServer = null;
const sessionCache = new Map();

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

async function prompt(context, question, directory, onDelta, onDone, onError, onTool) {
  const client = await ensureClient();
  const session = await getOrCreateSession(directory, onError);
  const sessionId = session.sessionId;
  const fullText = context ? context + '\n\nUser question: ' + question : question;

  try {
    console.log('[opencode] sending prompt (sync), sessionId:', sessionId);
    onTool?.({ type: 'thinking', text: '正在思考...' });

    // 使用同步 prompt API（会阻塞直到 AI 完成响应）
    const result = await client.session.prompt({
      path: { id: sessionId },
      body: { parts: [{ type: 'text', text: fullText }] },
    });

    // 检查是否有错误响应
    if (result?.error) {
      const errMsg = result.error?.data?.message || result.error?.message || JSON.stringify(result.error);
      console.log('[opencode] error response:', errMsg);
      onError?.('opencode: ' + errMsg);
      return;
    }

    // 解析响应中的 parts
    const parts = result?.data?.parts || [];
    let reply = '';

    for (const part of parts) {
      const partType = part.type;

      if (partType === 'text' && part.text) {
        reply += part.text;
        onDelta?.(part.text);
      } else if (partType === 'reasoning' && part.text) {
        onTool?.({ type: 'thinking', text: part.text });
      } else if (partType === 'step-start') {
        onTool?.({ type: 'thinking', text: '正在思考...' });
      } else if (partType === 'tool' && part.callID) {
        onTool?.({ type: 'tool', name: part.tool || 'unknown', text: part.state || 'running' });
      }
    }

    if (reply) {
      console.log('[opencode] response received, sessionId:', sessionId, 'chars:', reply.length);
    } else {
      console.warn('[opencode] empty response, sessionId:', sessionId);
    }

    onDone?.();
  } catch (err) {
    console.log('[opencode] error:', err.message);
    onError?.('opencode error: ' + err.message);
  }
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

function clearCache() { sessionCache.clear(); }

async function removeSession(directory) {
  const key = directory || '__default__';
  const cached = sessionCache.get(key);
  if (cached) {
    try {
      const client = await ensureClient();
      await client.session.delete({ path: { id: cached.sessionId } });
    } catch {}
    sessionCache.delete(key);
  }
}

module.exports = { prompt, checkStatus, clearCache, removeSession };
