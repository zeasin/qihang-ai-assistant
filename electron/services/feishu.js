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
      logger.error('[Feishu] start: missing appId or appSecret');
      running = false;
      return false;
    }

    logger.info('[Feishu] Creating Lark.Client...');
    client = new lark.Client(baseConfig);

    logger.info('[Feishu] Creating Lark.WSClient...');
    wsClient = new lark.WSClient({
      ...baseConfig,
      loggerLevel: lark.LoggerLevel.debug,
    });

    logger.info('[Feishu] Starting WSClient...');
    wsClient.start({
      eventDispatcher: new lark.EventDispatcher({}).register({
        'im.message.receive_v1': async (data) => {
          logger.info('[Feishu] WS event received: im.message.receive_v1');
          try {
            logger.info('[Feishu] Raw event data: %s', JSON.stringify(data).slice(0, 1000));
            const event = data.event || data;
            const message = event.message || data.message;
            const sender = event.sender || data.sender;
            logger.info('[Feishu] Parsed - message: %s, sender: %s', JSON.stringify(message).slice(0, 300), JSON.stringify(sender).slice(0, 300));
            if (!message || !sender) {
              logger.warn('[Feishu] Missing message or sender in event');
              return;
            }

            const contentRaw = message.content;
            logger.info('[Feishu] Message content raw: %s', contentRaw);
            const content = JSON.parse(contentRaw);
            const text = content.text || '';
            const openId = sender.sender_id?.open_id || sender.open_id || '';
            const chatId = message.chat_id || '';
            const messageId = message.message_id || '';
            logger.info('[Feishu] Parsed message - text: "%s", openId: %s, chatId: %s, messageId: %s', text.slice(0, 200), openId, chatId, messageId);
            if (text && openId && messageHandler) {
              const cleaned = text.replace(/@_user_\d+/g, '').trim();
              logger.info('[Feishu] Dispatching to messageHandler: "%s"', cleaned);
              messageHandler({
                text: cleaned,
                sender: openId,
                chatId: chatId,
                messageId: messageId,
              });
            } else {
              logger.warn('[Feishu] Missing text/openId/handler: text=%s, openId=%s, handler=%s', !!text, !!openId, !!messageHandler);
            }
          } catch (e) {
            logger.error('[Feishu] Event handler error: %s', e.message);
            logger.error('[Feishu] Event handler error stack: %s', e.stack);
          }
        },
      }),
    });

    logger.info('[Feishu] WSClient started successfully');
    return true;
  } catch (e) {
    logger.error('[Feishu] SDK start error: %s', e.message);
    logger.error('[Feishu] SDK start error stack: %s', e.stack);
    running = false;
    return false;
  }
}

async function sendMessage(openId, content, msgType = 'text') {
  if (!client) {
    logger.warn('[Feishu] sendMessage: no client');
    return;
  }
  try {
    logger.info('[Feishu] Sending message to %s: "%s"', openId, (typeof content === 'string' ? content : JSON.stringify(content)).slice(0, 200));
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
    logger.info('[Feishu] Message sent successfully');
  } catch (e) {
    logger.error('[Feishu] sendMessage error: %s', e.message);
  }
}

function stop() {
  logger.info('[Feishu] Stopping...');
  running = false;
  if (wsClient) {
    try { wsClient.stop?.(); } catch (e) { logger.error('[Feishu] stop error: %s', e?.message); }
    wsClient = null;
  }
  client = null;
  logger.info('[Feishu] Stopped');
}

function isRunning() {
  return running;
}

module.exports = { sendViaWebhook, setWebhook, getWebhook, start, stop, isRunning, sendMessage };
