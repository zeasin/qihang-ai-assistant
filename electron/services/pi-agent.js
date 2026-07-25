let piSdk = null;

async function ensurePiSdk() {
  if (!piSdk) piSdk = await import('@earendil-works/pi-coding-agent');
  return piSdk;
}

async function createSession(projectDir, tools) {
  const sdk = await ensurePiSdk();
  const { session } = await sdk.createAgentSession({
    cwd: projectDir,
    tools: tools || ['read', 'bash', 'grep', 'find', 'ls'],
    sessionManager: sdk.SessionManager.inMemory(),
  });
  return session;
}

async function prompt(session, text, onDelta, onTool, onDone) {
  session.subscribe((event) => {
    switch (event.type) {
      case 'message_update':
        if (event.assistantMessageEvent?.type === 'text_delta') {
          onDelta?.(event.assistantMessageEvent.delta);
        }
        break;
      case 'tool_execution_start':
        onTool?.({ type: 'start', name: event.toolName, args: event.args });
        break;
      case 'tool_execution_end':
        onTool?.({ type: 'end', name: event.toolName, error: event.isError });
        break;
      case 'agent_end':
        onDone?.();
        break;
    }
  });
  await session.prompt(text);
  session.dispose();
}

async function checkStatus() {
  try {
    const sdk = await ensurePiSdk();
    return { installed: true, version: '0.82.0' };
  } catch {
    return { installed: false, version: null };
  }
}

module.exports = { createSession, prompt, checkStatus };