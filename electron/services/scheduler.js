const cron = require('node-cron');
const db = require('./database');
const logger = require('./logger');
const { Notification } = require('electron');

let jobs = new Map();
let running = false;

let feishu = null;
function getFeishu() {
  if (!feishu) feishu = require('./feishu');
  return feishu;
}

function getWebhookUrl() {
  return db.configGet('feishuWebhookUrl') || '';
}

async function sendFeishu(message) {
  const url = getWebhookUrl();
  if (url) {
    try {
      await getFeishu().sendViaWebhook(url, message);
    } catch (e) {
      logger.warn(`[Scheduler] feishu send failed: ${e.message}`);
    }
  }
}

function sendNotification(title, body) {
  try {
    const n = new Notification({ title, body });
    n.show();
  } catch (e) {
    logger.warn(`[Scheduler] notification failed: ${e.message}`);
  }
}

function getCronFromReminder(r) {
  switch (r.type) {
    case 'daily': return `${r.time.split(':')[1] || '0'} ${r.time.split(':')[0] || '9'} * * *`;
    case 'weekly': return `${r.time.split(':')[1] || '0'} ${r.time.split(':')[0] || '9'} * * ${r.day_of_week || 1}`;
    case 'monthly': return `${r.time.split(':')[1] || '0'} ${r.time.split(':')[0] || '9'} ${r.day_of_month || 1} * *`;
    case 'yearly': {
      const parts = (r.month_day || '1-1').split('-');
      return `${r.time.split(':')[1] || '0'} ${r.time.split(':')[0] || '9'} ${parts[1] || 1} ${parts[0] || 1} *`;
    }
    default: return null;
  }
}

const executors = {
  'ping': async (task) => {
    logger.info(`[Scheduler] ping: ${task.name}`);
  },
  'auto_index': async (task) => {
    logger.info(`[Scheduler] auto-index triggered: ${task.name}`);
    const config = JSON.parse(task.params_json || '{}');
    const kbId = config.kb_id;
    if (kbId) {
      try {
        const indexer = require('./indexer');
        await indexer.indexSingle(kbId);
      } catch (e) {
        logger.error(`[Scheduler] index error: ${e.message}`);
      }
    }
  },
  'daily_report': async (task) => {
    logger.info(`[Scheduler] daily report: ${task.name}`);
    try {
      const config = JSON.parse(task.params_json || '{}');
      const kbId = config.kb_id;
      if (!kbId) { logger.warn('[Scheduler] daily_report: no kb_id'); return; }
      const today = new Date().toISOString().slice(0, 10);
      const docs = db.q("SELECT content FROM documents WHERE kb_id = ? AND indexed_at >= ?", kbId, today);
      const messages = db.q("SELECT content FROM messages WHERE created_at >= ? AND kb_id = ?", today, kbId);
      let report = `# 综合日报 - ${today}\n\n`;
      if (docs.length) {
        report += `## 笔记更新（${docs.length} 篇）\n\n`;
        docs.slice(0, 10).forEach(d => report += `- ${d.content.slice(0, 200)}\n`);
      }
      if (messages.length) {
        report += `\n## 对话记录（${messages.length} 条）\n\n`;
        messages.slice(0, 20).forEach(m => report += `- ${m.content.slice(0, 200)}\n`);
      }
      if (docs.length === 0 && messages.length === 0) report += '今日无新增内容。\n';
      db.run("INSERT INTO ai_analysis (kb_id, type, content, report_date, created_at) VALUES (?, 'daily_report', ?, ?, datetime('now'))",
        kbId, report, today);
      logger.info(`[Scheduler] daily report generated for kb ${kbId}`);
      sendNotification('每日报告', `笔记库 ${kbId} 的日报已生成`);
      if (task.notify_feishu) await sendFeishu(`📋 综合日报 - ${today}\n\n笔记更新: ${docs.length} 篇\n对话记录: ${messages.length} 条\n\n详情请查看应用内日报。`);
    } catch (e) {
      logger.error(`[Scheduler] daily_report error: ${e.message}`);
    }
  },
  'reminder': async (task) => {
    logger.info(`[Scheduler] reminder: ${task.name}`);
    try {
      const msg = task.name + (task.message ? '\n' + task.message : '');
      sendNotification('⏰ 提醒', msg);
      if (task.notify_feishu) await sendFeishu(`⏰ ${msg}`);
      db.run("UPDATE collector_tasks SET updated_at = datetime('now') WHERE id = ?", task.id);
    } catch (e) {
      logger.error(`[Scheduler] reminder error: ${e.message}`);
    }
  },
};

function start() {
  if (running) return;
  running = true;

  const tasks = db.task.getActive();
  for (const task of tasks) {
    scheduleTask(task);
  }

  const reminders = db.reminder.getActive();
  for (const r of reminders) {
    scheduleReminder(r);
  }

  logger.info(`[Scheduler] started with ${tasks.length} tasks + ${reminders.length} reminders`);
}

function scheduleTask(task) {
  if (!task.cron_expression || !cron.validate(task.cron_expression)) return;
  const job = cron.schedule(task.cron_expression, async () => {
    try {
      const executor = executors[task.task_type];
      if (executor) await executor(task);
    } catch (e) {
      logger.error(`[Scheduler] task ${task.name} error:`, e.message);
    }
  });
  jobs.set('task_' + task.id, job);
}

function scheduleReminder(r) {
  const cronExpr = getCronFromReminder(r);
  if (!cronExpr || !cron.validate(cronExpr)) return;
  const job = cron.schedule(cronExpr, async () => {
    try {
      const msg = '⏰ ' + r.name + (r.message ? '\n' + r.message : '');
      sendNotification('⏰ ' + r.name, r.message || '');
      await sendFeishu(msg);
      db.reminder.setEnabled(r.id, false);
      logger.info(`[Scheduler] reminder triggered: ${r.name}`);
    } catch (e) {
      logger.error(`[Scheduler] reminder ${r.name} error:`, e.message);
    }
  });
  jobs.set('reminder_' + r.id, job);
}

function addTask(task) {
  scheduleTask(task);
}

function removeTask(id) {
  const key = 'task_' + id;
  if (jobs.has(key)) { jobs.get(key).stop(); jobs.delete(key); }
}

function addReminder(r) {
  scheduleReminder(r);
}

function removeReminder(id) {
  const key = 'reminder_' + id;
  if (jobs.has(key)) { jobs.get(key).stop(); jobs.delete(key); }
}

function stop() {
  for (const [id, job] of jobs) {
    job.stop();
  }
  jobs.clear();
  running = false;
  logger.info('[Scheduler] stopped');
}

function reload() {
  stop();
  start();
}

function isRunning() { return running; }

module.exports = { start, stop, reload, isRunning, addTask, removeTask, addReminder, removeReminder };