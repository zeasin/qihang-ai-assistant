const lark = require('@larksuiteoapi/node-sdk');
const logger = require('./logger');

let webhookUrl = null;
let wsClient = null;
let client = null;
let running = false;
let messageHandler = null;

// ========== Webhook (simple send-only, no SDK needed) ==========

async function sendViaWebhook(url, message) {
  if (!url) return { ok: false, error: 'Webhook URL 未配置' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msg_type: 'text',
        content: JSON.stringify({ text: message }),
      }),
    });
    const data = await res.json();
    return { ok: data.code === 0 || data.StatusCode === 0 || res.ok, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function setWebhook(url) {
  webhookUrl = url;
}

function getWebhook() {
  return webhookUrl;
}

// ========== Event Subscription via SDK (WebSocket long connection) ==========

async function start(configData, onMessage) {
  if (running) stop();
  messageHandler = onMessage;
  running = true;

  try {
    const baseConfig = {
      appId: configData.app_id || configData.appId,
      appSecret: configData.app_secret || configData.appSecret,
    };
    if (!baseConfig.appId || !baseConfig.appSecret) {
      running = false;
      return false;
    }

    client = new lark.Client(baseConfig);

    wsClient = new lark.WSClient({
      ...baseConfig,
      loggerLevel: lark.LoggerLevel.error,
    });

    wsClient.start({
      eventDispatcher: new lark.EventDispatcher({}).register({
        'im.message.receive_v1': async (data) => {
          try {
            const event = data.event || data;
            const message = event.message || data.message;
            const sender = event.sender || data.sender;
            if (!message || !sender) return;

            const content = JSON.parse(message.content);
            const text = content.text || '';
            const openId = sender.sender_id?.open_id;
            if (text && openId && messageHandler) {
              messageHandler({
                text: text.replace(/@_user_\d+/g, '').trim(),
                sender: openId,
                chatId: message.chat_id,
                messageId: message.message_id,
              });
            }
          } catch (e) {
            logger.error('[Feishu] Event handler error:', e.message);
          }
        },
      }),
    });

    return true;
  } catch (e) {
    logger.error('[Feishu] SDK start error:', e.message);
    running = false;
    return false;
  }
}

async function sendMessage(openId, content, msgType = 'text') {
  if (!client) return;
  try {
    await client.im.v1.message.create({
      params: { receive_id_type: 'open_id' },
      data: {
        receive_id: openId,
        msg_type: msgType,
        content: typeof content === 'string'
          ? JSON.stringify({ text: content })
          : JSON.stringify(content),
      },
    });
  } catch (e) {
    logger.error('[Feishu] sendMessage error:', e.message);
  }
}

function stop() {
  running = false;
  if (wsClient) {
    try { wsClient.stop?.(); } catch {}
    wsClient = null;
  }
  client = null;
}

function isRunning() {
  return running;
}

module.exports = { sendViaWebhook, setWebhook, getWebhook, start, stop, isRunning, sendMessage };
