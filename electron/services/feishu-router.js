const logger = require('./logger');

/** 意图枚举 */
const Intent = {
  QUERY_INFO: 'QUERY_INFO',
  RECORD_LOG: 'RECORD_LOG',
  RECORD_LEAD: 'RECORD_LEAD',
  CREATE_BUG: 'CREATE_BUG',
  UPDATE_BUG: 'UPDATE_BUG',
  CODE_INVESTIGATE: 'CODE_INVESTIGATE',
  DAILY_REPORT: 'DAILY_REPORT',
  GENERAL_CHAT: 'GENERAL_CHAT',
};

function startsWithAny(t, prefixes) {
  for (const p of prefixes) {
    if (t.startsWith(p)) return true;
  }
  return false;
}

function containsAny(t, keywords) {
  for (const k of keywords) {
    if (t.includes(k)) return true;
  }
  return false;
}

function classify(text) {
  if (!text || !text.trim()) return Intent.GENERAL_CHAT;
  const t = text.trim();

  if (startsWithAny(t, ['查代码', '排查代码', '看源码', '让pi看', '让 pi 看'])) {
    return Intent.CODE_INVESTIGATE;
  }
  if (startsWithAny(t, ['更新Bug', '更新 Bug', '标记已修复', '关闭Bug', '关闭 Bug'])
      || containsAny(t, ['状态改为', '补充排查结果'])) {
    return Intent.UPDATE_BUG;
  }
  if (startsWithAny(t, ['新增Bug', '新增 Bug', '报bug', '报 bug'])
      || containsAny(t, ['客户反馈', '报错', '异常', '打不开', '白屏', '崩溃'])) {
    return Intent.CREATE_BUG;
  }
  if (containsAny(t, ['日报', '周报', '今天做了什么', '本周总结', '本周做了什么'])) {
    return Intent.DAILY_REPORT;
  }
  if (startsWithAny(t, ['新增线索', '记录线索', '新线索', '加线索', '记录新线索'])
      || containsAny(t, ['来咨询', '有人咨询', '客户咨询', '咨询电话', '来电咨询', '加了微信', '加微信', '线索咨询'])) {
    return Intent.RECORD_LEAD;
  }
  if (startsWithAny(t, ['记录日志', '记录客户沟通', '记录', '记一下'])
      || containsAny(t, ['工作日志', '客户沟通'])) {
    return Intent.RECORD_LOG;
  }
  if (startsWithAny(t, ['查客户', '查项目', '查Bug', '查 Bug', '查bug', '查日志', '查线索'])) {
    return Intent.QUERY_INFO;
  }

  return Intent.GENERAL_CHAT;
}

/**
 * 路由处理一条飞书消息
 * @param {object} ctx - { sender, text, chatId, messageId }
 * @param {object} deps - { db, kb, ds, project, feishu, orchestrator }
 * @returns {Promise<string>} 回复文本
 */
async function route(ctx, deps) {
  const intent = classify(ctx.text);
  const text = ctx.text;
  logger.info('[FeishuRouter] intent=%s text="%s"', intent, text.slice(0, 100));

  switch (intent) {
    case Intent.QUERY_INFO:
      return handleQuery(ctx, deps);
    case Intent.RECORD_LOG:
      return handleRecord(ctx, deps);
    case Intent.CODE_INVESTIGATE:
      return handleCode(ctx, deps);
    case Intent.DAILY_REPORT:
      return handleReport(ctx, deps);
    case Intent.GENERAL_CHAT:
    default:
      return handleGeneralChat(ctx, deps);
  }
}

async function handleQuery(ctx, deps) {
  const text = ctx.text;
  // extract project name from text
  const projectName = extractProjectName(text, deps);
  let reply = '';

  // search knowledge bases
  const kbs = deps.db.kb.list();
  for (const kb of kbs) {
    const results = await deps.kb.search(kb.id, text);
    if (results.length > 0) {
      reply += `📚 **${kb.name}** 中找到以下内容：\n`;
      results.slice(0, 3).forEach(r => {
        reply += `- ${r.content?.slice(0, 200) || r}\n`;
      });
      reply += '\n';
    }
  }

  if (projectName) {
    reply += `\n📁 关联项目：${projectName}`;
  }

  return reply || '未找到相关信息，请换个关键词试试。';
}

async function handleRecord(ctx, deps) {
  const text = ctx.text;
  // For now, save to a dataset record or just log it
  logger.info('[FeishuRouter] Record: %s', text);
  return '✅ 已记录。';
}

async function handleCode(ctx, deps) {
  const text = ctx.text;
  const projectName = extractProjectName(text, deps);
  let projectDir = '';
  let projectInfo = '';

  if (projectName) {
    const projects = deps.db.project.list();
    const match = projects.find(p => p.name.includes(projectName) || projectName.includes(p.name));
    if (match) {
      projectDir = match.dir;
      projectInfo = `项目：${match.name}`;
    }
  }

  logger.info('[FeishuRouter] Code investigate: project=%s dir=%s', projectName, projectDir);
  return `🔧 正在排查代码${projectInfo ? '（' + projectInfo + '）' : ''}...\n（功能待完善）`;
}

async function handleReport(ctx, deps) {
  return '📊 日报/周报生成功能待完善。';
}

async function handleGeneralChat(ctx, deps) {
  logger.info('[FeishuRouter] General chat, passing to orchestrator');
  return null;
}

function extractProjectName(text, deps) {
  try {
    const projects = deps.db.project.list();
    for (const p of projects) {
      if (text.includes(p.name)) return p.name;
    }
    const match = text.match(/项目[：:]\s*(\S+)/);
    if (match) return match[1];
  } catch {}
  return '';
}

module.exports = { route, Intent, classify };
