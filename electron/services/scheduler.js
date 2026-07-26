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
  if (!url) return;
  try {
    const body = typeof message === 'string'
      ? { msg_type: 'text', content: JSON.stringify({ text: message }) }
      : { msg_type: 'interactive', card: message };
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    logger.warn(`[Scheduler] feishu send failed: ${e.message}`);
  }
}

function buildReportCard(data) {
  const { today, doneToday, overdueTodos, pendingTodos, reminders, chats, workLogs, recs, recCount, docs, docCount, kbName, hour } = data;
  const elements = [];

  // greeting
  let greeting = '☀️ 早上好';
  if (hour >= 12 && hour < 14) greeting = '🌤️ 中午好';
  else if (hour >= 14 && hour < 18) greeting = '🌇 下午好';
  else if (hour >= 18) greeting = '🌙 晚上好';
  elements.push({ tag: 'div', text: { tag: 'lark_md', content: `${greeting}，这是今天的综合日报` } });
  elements.push({ tag: 'div', text: { tag: 'lark_md', content: `📅 **${today}**` } });
  elements.push({ tag: 'hr' });

  // stats bar
  let statsLine = `✅ 完成 ${doneToday.length} 项 · 📋 待办 ${pendingTodos.length} 项 · 🗂️ 新增 ${recCount} 条 · 📝 ${docCount} 篇`;
  elements.push({ tag: 'div', text: { tag: 'lark_md', content: `**今日概览**\n${statsLine}` } });
  elements.push({ tag: 'hr' });

  // ✅ 今日完成
  if (doneToday.length) {
    let md = `**✅ 今日完成（${doneToday.length} 项）**\n`;
    doneToday.forEach(t => { md += `✅ ${t.title}\n`; });
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: md } });
  }

  // ⚠️ 逾期待办
  if (overdueTodos.length) {
    let md = `**⚠️ 逾期待办（${overdueTodos.length} 项）**\n`;
    overdueTodos.forEach(t => { md += `🔴 ${t.title}（截止 ${t.due_date}）\n`; });
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: md } });
  }

  // 📋 待办
  if (pendingTodos.length) {
    let md = `**📋 待办事项（${pendingTodos.length} 项未完成）**\n`;
    pendingTodos.forEach(t => {
      const icon = t.status === 'in_progress' ? '🔄' : '⬜';
      const due = t.due_date ? `（截止 ${t.due_date}）` : '';
      md += `${icon} ${t.title} ${due}\n`;
      if (md.length > 1500) { md = md.slice(0, 1500) + '\n...'; return; }
    });
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: md } });
  }

  // ⏰ 今日提醒
  if (reminders.length) {
    const todayReminders = reminders.filter(rem => {
      if (rem.type === 'daily') return true;
      if (rem.type === 'weekly') return rem.day_of_week == new Date().getDay();
      if (rem.type === 'monthly') return rem.day_of_month == new Date().getDate();
      return false;
    });
    if (todayReminders.length) {
      let md = `**⏰ 今日提醒**\n`;
      todayReminders.forEach(r => { md += `🔔 ${r.name}（${r.time}）\n`; });
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: md } });
    }
  }

  // 💬 今日对话
  if (chats.length) {
    let md = `**💬 今日对话摘要**\n`;
    chats.forEach(c => {
      const s = (c.snippet || '').replace(/\n/g, ' ').slice(0, 80);
      if (s) md += `💭 ${s}\n`;
    });
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: md } });
  }

  // 📝 工作日志
  if (workLogs.length) {
    let md = `**📝 工作日志**\n`;
    workLogs.forEach(wl => {
      let data;
      try { data = JSON.parse(wl.data_json || '{}'); } catch { data = {}; }
      const content = data.内容 || data.content || data.今日工作 || '';
      const project = data.项目 || data.project || '';
      if (content) md += `📄 ${project ? `[${project}] ` : ''}${content.slice(0, 100)}\n`;
    });
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: md } });
  }

  // 🗂️ 数据中心
  if (recs.length) {
    let md = `**🗂️ 数据中心新增记录**\n`;
    recs.slice(0, 8).forEach(rec => {
      let data;
      try { data = JSON.parse(rec.data_json || '{}'); } catch { data = {}; }
      const name = data.name || data.名称 || data.title || data.标题 || '';
      const status = data.status || data.状态 || '';
      if (name) {
        const ds = db.qOne("SELECT name FROM data_center_datasets WHERE dataset_id = ?", rec.dataset_id);
        md += `📌 [${ds ? ds.name : '数据集'}] ${name}${status ? '（' + status + '）' : ''}\n`;
      }
    });
    if (recs.length > 8) md += `...及其他 ${recs.length - 8} 条\n`;
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: md } });
  }

  // 📝 笔记
  if (docs.length) {
    const meaningfulDocs = docs.filter(d => {
      const s = (d.snippet || '').trim();
      return s && !s.startsWith('{') && !s.startsWith('<') && !s.startsWith('import ') && !s.startsWith('module.');
    }).slice(0, 6);
    if (meaningfulDocs.length) {
      let md = `**📝 笔记更新**\n`;
      meaningfulDocs.forEach(d => {
        const name = d.path ? d.path.split(/[\\\/]/).pop() : '';
        const s = (d.snippet || '').replace(/\n/g, ' ').slice(0, 60);
        md += `📄 ${name}：${s}\n`;
      });
      if (docs.length > meaningfulDocs.length) md += `...及其他 ${docs.length - meaningfulDocs.length} 个文件\n`;
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: md } });
    }
  }

  elements.push({ tag: 'hr' });

  // completion rate
  let summary = `**📊 完成概览**\n`;
  summary += `✅ 今日完成：${doneToday.length} 项\n📋 剩余待办：${pendingTodos.length} 项`;
  if (overdueTodos.length) summary += `\n⚠️ **${overdueTodos.length} 项逾期**，建议优先处理`;
  elements.push({ tag: 'div', text: { tag: 'lark_md', content: summary } });

  return {
    header: { title: { tag: 'plain_text', content: `☀️ 综合日报 ${today}` } },
    elements: [
      ...elements,
      { tag: 'hr' },
      { tag: 'note', elements: [{ tag: 'plain_text', content: `笔灵 AI · ${kbName} · ${today}` }] },
    ],
  };
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
      let kbId = config.kb_id;
      if (!kbId) {
        const firstKb = db.qOne("SELECT id FROM knowledge_bases ORDER BY id ASC LIMIT 1");
        if (firstKb) kbId = firstKb.id;
      }
      if (!kbId) { logger.warn('[Scheduler] daily_report: no kb available'); return; }
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const todayStart = new Date().setHours(0, 0, 0, 0);
      const kbName = kbId ? (db.qOne("SELECT name FROM knowledge_bases WHERE id = ?", kbId) || {}).name || '笔记库' : '笔记库';

      const docs = db.q("SELECT path, substr(content, 1, 200) as snippet FROM documents WHERE kb_id = ? AND file_mtime >= ? AND path NOT LIKE '%node_modules%' AND path NOT LIKE '%.git%' AND path NOT LIKE '%.opencode%'", kbId, todayStart);
      const recCount = (db.qOne("SELECT COUNT(*) as c FROM data_center_records WHERE created_at >= ?", today) || {}).c || 0;
      const recs = db.q("SELECT data_json, dataset_id FROM data_center_records WHERE created_at >= ? ORDER BY created_at DESC LIMIT 15", today);
      const todos = db.q("SELECT title, status, due_date FROM todos ORDER BY created_at DESC LIMIT 20");
      const pendingTodos = todos.filter(t => t.status !== 'done');
      const doneToday = db.q("SELECT title FROM todos WHERE status = 'done' AND updated_at >= ?", today);
      const overdueTodos = pendingTodos.filter(t => t.due_date && t.due_date < today);
      const reminders = db.q("SELECT name, type, time, day_of_week, day_of_month, enabled FROM reminders WHERE enabled = 1 ORDER BY created_at DESC LIMIT 10");
      const chats = db.q("SELECT substr(content, 1, 100) as snippet, created_at FROM messages WHERE created_at >= ? AND role = 'user' ORDER BY created_at DESC LIMIT 8", today);
      const workLogs = db.q("SELECT data_json FROM data_center_records WHERE dataset_id IN (SELECT dataset_id FROM data_center_datasets WHERE name LIKE '%工作日志%' OR name LIKE '%日志%') AND created_at >= ? ORDER BY created_at DESC LIMIT 5", today);

      let r = `☀️ 早上好，这是今天的综合日报\n\n📅 ${today}\n\n`;

      // 今日完成
      if (doneToday.length) {
        r += `✅ 今日完成（${doneToday.length} 项）\n`;
        doneToday.forEach(t => r += `  - ${t.title}\n`);
        r += '\n';
      }

      // 待办
      if (overdueTodos.length) {
        r += `⚠️ 逾期待办（${overdueTodos.length} 项）\n`;
        overdueTodos.forEach(t => r += `  - 🔴 ${t.title}（截止 ${t.due_date}）\n`);
        r += '\n';
      }
      if (pendingTodos.length) {
        r += `📋 待办事项（${pendingTodos.length} 项未完成）\n`;
        pendingTodos.forEach(t => {
          const due = t.due_date ? ` 截止 ${t.due_date}` : '';
          r += `  - ${t.status === 'in_progress' ? '🔄' : '⬜'} ${t.title}${due}\n`;
        });
        r += '\n';
      }

      // 今日提醒
      if (reminders.length) {
        const todayReminders = reminders.filter(rem => {
          if (rem.type === 'daily') return true;
          if (rem.type === 'weekly') return rem.day_of_week == new Date().getDay();
          if (rem.type === 'monthly') return rem.day_of_month == new Date().getDate();
          return false;
        });
        if (todayReminders.length) {
          r += `⏰ 今日提醒\n`;
          todayReminders.forEach(rem => r += `  - ${rem.name}（${rem.time}）\n`);
          r += '\n';
        }
      }

      // 对话记录 - 反映当天工作内容
      if (chats.length) {
        r += `💬 今日对话摘要\n`;
        chats.forEach(c => {
          const snippet = (c.snippet || '').replace(/\n/g, ' ').slice(0, 80);
          if (snippet) r += `  - ${snippet}\n`;
        });
        r += '\n';
      }

      // 工作日志
      if (workLogs.length) {
        r += `📝 工作日志\n`;
        workLogs.forEach(wl => {
          let data;
          try { data = JSON.parse(wl.data_json || '{}'); } catch { data = {}; }
          const content = data.内容 || data.content || data.今日工作 || '';
          const project = data.项目 || data.project || '';
          if (content) r += `  - ${project ? '[' + project + '] ' : ''}${content.slice(0, 120)}\n`;
        });
        r += '\n';
      }

      // 数据中心
      if (recs.length) {
        r += `🗂️ 数据中心新增记录\n`;
        recs.forEach(rec => {
          let data;
          try { data = JSON.parse(rec.data_json || '{}'); } catch { data = {}; }
          const name = data.name || data.名称 || data.title || data.标题 || '';
          const status = data.status || data.状态 || '';
          const ds = db.qOne("SELECT name FROM data_center_datasets WHERE dataset_id = ?", rec.dataset_id);
          if (name) r += `  - [${ds ? ds.name : '数据集'}] ${name}${status ? '（' + status + '）' : ''}\n`;
        });
        r += '\n';
      }

      // 笔记
      if (docs.length) {
        const meaningfulDocs = docs.filter(d => {
          const s = (d.snippet || '').trim();
          return s && !s.startsWith('{') && !s.startsWith('<') && !s.startsWith('import ') && !s.startsWith('module.');
        }).slice(0, 8);
        if (meaningfulDocs.length) {
          r += `📝 今日笔记更新\n`;
          meaningfulDocs.forEach(d => {
            const name = d.path ? d.path.split(/[\\\/]/).pop() : '';
            const s = (d.snippet || '').replace(/\n/g, ' ').slice(0, 60);
            r += `  - ${name}：${s}\n`;
          });
          if (docs.length > meaningfulDocs.length) r += `  ...及其他 ${docs.length - meaningfulDocs.length} 个文件\n`;
          r += '\n';
        }
      }

      // 综合分析
      r += `📊 今日概览\n`;
      r += `  - ✅ 今日完成：${doneToday.length} 项\n`;
      r += `  - 📋 剩余待办：${pendingTodos.length} 项\n`;
      if (overdueTodos.length) r += `  - ⚠️ 有 ${overdueTodos.length} 项待办已逾期，建议优先处理\n`;
      if (chats.length) r += `  - 💬 今日进行了 ${chats.length} 次对话\n`;
      if (recCount > 0) r += `  - 🗂️ 数据中心新增 ${recCount} 条记录\n`;
      if (docs.length > 0) r += `  - 📝 笔记库更新了 ${docs.length} 个文件\n`;
      const now = new Date();
      const hour = now.getHours();
      if (hour >= 6 && hour < 12) r += `\n🌅 上午好，今天的工作要加油哦！`;
      else if (hour >= 12 && hour < 14) r += `\n🌤️ 中午好，记得午休！`;
      else if (hour >= 14 && hour < 18) r += `\n🌇 下午好，继续加油！`;
      else r += `\n🌙 晚上好，今天辛苦了！`;
      r += '\n\n---\n💡 打开应用查看完整详情';

      db.run("INSERT INTO ai_analysis (kb_id, type, content, report_date, created_at) VALUES (?, 'daily_report', ?, ?, datetime('now'))",
        kbId, r, today);
      logger.info(`[Scheduler] daily report generated for kb ${kbId}`);
      sendNotification('每日报告', `📋 ${pendingTodos.length} 项待办 · ${recCount} 条新数据`);
      if (task.notify_feishu) {
        const card = buildReportCard({ today, doneToday, overdueTodos, pendingTodos, reminders, chats, workLogs, recs, recCount, docs, docCount: docs.length, kbName, hour: new Date().getHours() });
        await sendFeishu(card);
      }
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