const logger = require('./logger');

/**
 * Claude Agent SDK 服务
 * 使用 @anthropic-ai/claude-agent-sdk 的 query() API 实现流式 AI 对话
 *
 * API 参考: https://code.claude.com/docs/en/agent-sdk/overview
 *
 * query() 返回 AsyncGenerator<SDKMessage>，支持流式输出和会话恢复
 * 消息类型: system(含 session_id) / assistant / assistantPartial / result / stream_event
 */

let sdkInstance = null;
const sessionCache = new Map(); // localSessionId → claudeSessionId

// 默认允许的工具
const DEFAULT_TOOLS = [
  'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash',
  'WebSearch', 'WebFetch',
];

async function ensureSdk() {
  if (sdkInstance) return sdkInstance;
  try {
    sdkInstance = await import('@anthropic-ai/claude-agent-sdk');
    return sdkInstance;
  } catch (err) {
    throw new Error(`Claude Agent SDK 未安装。请运行: npm install @anthropic-ai/claude-agent-sdk`);
  }
}

async function checkStatus() {
  try {
    const sdk = await ensureSdk();
    // 简单验证 SDK 可用
    const hasQuery = typeof sdk.query === 'function';
    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    return {
      installed: !!hasQuery,
      version: 'SDK',
      apiKeyConfigured: apiKey.length > 0 && apiKey.startsWith('sk-ant-'),
      apiKeyHint: apiKey ? apiKey.substring(0, 12) + '...' : null,
    };
  } catch (e) {
    return { installed: false, version: null, apiKeyConfigured: false, error: e.message };
  }
}

/**
 * 向 Claude 发送提示（流式输出）
 *
 * @param {string} context - 对话历史上下文
 * @param {string} question - 用户新问题
 * @param {string} projectDir - 项目目录
 * @param {function} onDelta - 文本增量回调 (text: string) => void
 * @param {function} onDone - 完成回调 () => void
 * @param {function} onError - 错误回调 (err: string) => void
 * @param {function} onTool - 工具事件回调 (event: object) => void
 */
async function prompt(context, question, projectDir, onDelta, onDone, onError, onTool) {
  const sdk = await ensureSdk();

  // 读取缓存的 Claude session ID
  const cacheKey = projectDir || '__default__';
  let claudeSessionId = sessionCache.get(cacheKey);
  let sessionCaptured = !!claudeSessionId;

  try {
    // 构造完整提示
    const fullPrompt = context
      ? `${context}\n\n---\n\n用户的新问题：${question}`
      : question;

    // 调用 query() 获得流式结果
    const result = sdk.query({
      prompt: fullPrompt,
      options: {
        cwd: projectDir || process.cwd(),
        maxTurns: 50,
        allowedTools: DEFAULT_TOOLS,
        permissionMode: 'acceptEdits',
        includePartialMessages: true, // 启用流式部分消息
        ...(claudeSessionId ? { resume: claudeSessionId } : {}),
      },
    });

    for await (const message of result) {
      switch (message.type) {
        case 'system':
          // 捕获 session_id（首次响应的 init 消息中包含）
          if (message.subtype === 'init' && message.session_id && !sessionCaptured) {
            claudeSessionId = message.session_id;
            sessionCache.set(cacheKey, claudeSessionId);
            sessionCaptured = true;
            logger.info('[ClaudeSDK] session started: %s', claudeSessionId);
          }
          break;

        case 'assistantPartial':
          // 流式增量内容（需要 includePartialMessages: true）
          if (message.message?.content) {
            const content = message.message.content;
            if (typeof content === 'string') {
              onDelta?.(content);
            } else if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text' && block.text) {
                  onDelta?.(block.text);
                } else if (block.type === 'tool_use') {
                  onTool?.({ type: 'tool', name: block.name, text: 'running' });
                }
              }
            }
          }
          break;

        case 'assistant':
          // 完整的 assistant 消息（也可能是流式结束后的完整内容）
          if (message.message?.content) {
            const content = message.message.content;
            if (typeof content === 'string') {
              onDelta?.(content);
            } else if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text' && block.text) {
                  onDelta?.(block.text);
                } else if (block.type === 'tool_use') {
                  onTool?.({ type: 'tool', name: block.name, text: JSON.stringify(block.input || {}) });
                } else if (block.type === 'tool_result') {
                  onTool?.({ type: 'tool_result', name: block.tool_use_id, text: typeof block.content === 'string' ? block.content.substring(0, 200) : 'completed' });
                }
              }
            }
          }
          break;

        case 'result':
          // 查询完成
          if (message.subtype === 'success') {
            logger.info('[ClaudeSDK] result success, session: %s, cost: $%s',
              claudeSessionId || '?', message.total_cost_usd?.toFixed(4) || '?');
          } else {
            logger.warn('[ClaudeSDK] result subtype: %s', message.subtype);
          }
          onDone?.();
          return; // 正常结束

        case 'stream_event':
          // 原始流事件（可选处理）
          break;

        default:
          break;
      }
    }

    // 流正常结束但未收到 result 消息
    onDone?.();
  } catch (err) {
    logger.error('[ClaudeSDK] error: %s', err.message);
    onError?.('Claude error: ' + err.message);
  }
}

/**
 * 清除缓存的 session（强制新建）
 */
function clearCache() {
  sessionCache.clear();
}

/**
 * 移除一个 session
 */
function removeSession(localSessionId) {
  sessionCache.delete(localSessionId);
  // 注：Claude SDK 的 session 由服务端管理，无法直接删除
}

module.exports = { prompt, checkStatus, clearCache, removeSession };
