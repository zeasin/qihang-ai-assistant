const cron = require('node-cron');
const db = require('./database');
const logger = require('./logger');
const { Notification } = require('electron');

let jobs = new Map();
let running = false;

// China timezone helper (UTC+8, no DST)
function getChinaDate(offsetDays = 0) {
  const d = new Date();
  // Shift to China time, then toISOString gives the correct date
  const china = new Date(d.getTime() + 8 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return china.toISOString().slice(0, 10);
}
// China timezone midnight timestamp (ms since epoch)
function getChinaMidnight() {
  const chinaDate = getChinaDate();
  return new Date(chinaDate + 'T00:00:00+08:00').getTime();
}

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
      const today = getChinaDate();
      const yesterday = getChinaDate(-1);
      const todayStart = getChinaMidnight();
      const weekAgo = getChinaDate(-7);
      const kbName = kbId ? (db.qOne("SELECT name FROM knowledge_bases WHERE id = ?", kbId) || {}).name || '笔记库' : '笔记库';

      const docs = db.q("SELECT path, substr(content, 1, 200) as snippet FROM documents WHERE kb_id = ? AND file_mtime >= ? AND path NOT LIKE '%node_modules%' AND path NOT LIKE '%.git%' AND path NOT LIKE '%.opencode%'", kbId, todayStart);
      const recCount = (db.qOne("SELECT COUNT(*) as c FROM data_center_records WHERE created_at >= ?", today) || {}).c || 0;
      const recs = db.q("SELECT data_json, dataset_id FROM data_center_records WHERE created_at >= ? ORDER BY created_at DESC LIMIT 15", today);
      const todos = db.q("SELECT title, status, due_date, priority FROM todos ORDER BY created_at DESC LIMIT 30");
      const pendingTodos = todos.filter(t => t.status !== 'done');
      const doneToday = db.q("SELECT title, priority FROM todos WHERE status = 'done' AND updated_at >= ?", today);
      const overdueTodos = pendingTodos.filter(t => t.due_date && t.due_date < today);
      const reminders = db.q("SELECT name, type, time, day_of_week, day_of_month, enabled FROM reminders WHERE enabled = 1 ORDER BY created_at DESC LIMIT 10");
      const chats = db.q("SELECT substr(content, 1, 150) as snippet, created_at FROM messages WHERE created_at >= ? AND role = 'user' ORDER BY created_at DESC LIMIT 12", today);
      const workLogs = db.q("SELECT data_json FROM data_center_records WHERE dataset_id IN (SELECT dataset_id FROM data_center_datasets WHERE name LIKE '%工作日志%' OR name LIKE '%日志%') AND created_at >= ? ORDER BY created_at DESC LIMIT 8", today);
      const allDatasets = db.q("SELECT dataset_id, name FROM data_center_datasets ORDER BY name");
      const doneWeek = db.q("SELECT date(updated_at) as d, COUNT(*) as c FROM todos WHERE status = 'done' AND updated_at >= ? GROUP BY date(updated_at) ORDER BY d", weekAgo);
      const chatCountToday = chats.length;
      const chatCountWeek = (db.qOne("SELECT COUNT(*) as c FROM messages WHERE created_at >= ? AND role = 'user'", weekAgo) || {}).c || 0;
      const docCountToday = docs.length;
      const recCountWeek = (db.qOne("SELECT COUNT(*) as c FROM data_center_records WHERE created_at >= ?", weekAgo) || {}).c || 0;
      const hour = new Date().getHours();
      let greeting = '🌅 早上好';
      if (hour >= 12 && hour < 14) greeting = '🌤️ 中午好';
      else if (hour >= 14 && hour < 18) greeting = '🌇 下午好';
      else if (hour >= 18) greeting = '🌙 晚上好';
      let r = greeting + '，这是今天的综合日报\n\n📅 ' + today + '\n\n';
      r += '📊 今日数据总览\n';
      r += '  ━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
      r += '  ✅  完成任务：' + doneToday.length + ' 项\n';
      r += '  📋  待办事项：' + pendingTodos.length + ' 项（进行中 ' + pendingTodos.filter(t => t.status === 'in_progress').length + ' 项）\n';
      if (overdueTodos.length) r += '  ⚠️  已逾期：' + overdueTodos.length + ' 项\n';
      r += '  💬  对话次数：' + chatCountToday + ' 次\n';
      r += '  🗂️  新增记录：' + recCount + ' 条\n';
      r += '  📝  笔记更新：' + docCountToday + ' 个文件\n';
      if (doneWeek.length) {
        const weekTotal = doneWeek.reduce((s, x) => s + x.c, 0);
        r += '  📈  本周完成：' + weekTotal + ' 项\n';
      }
      r += '\n';
      if (doneToday.length) {
        r += '✅ 今日完成（' + doneToday.length + ' 项）\n';
        doneToday.forEach(t => {
          const icon = t.priority === 'high' ? '⭐' : t.priority === 'low' ? '🔹' : '✅';
          r += '  ' + icon + ' ' + t.title + '\n';
        });
        r += '\n';
      }
      if (overdueTodos.length) {
        r += '⚠️ 逾期待办（' + overdueTodos.length + ' 项）\n';
        overdueTodos.forEach(t => r += '  🔴 ' + t.title + '（截止 ' + t.due_date + '）\n');
        r += '\n';
      }
      if (pendingTodos.length) {
        r += '📋 待办事项\n';
        pendingTodos.forEach(t => {
          const due = t.due_date ? ' 截止 ' + t.due_date : '';
          const icon = t.status === 'in_progress' ? '🔄' : (t.priority === 'high' ? '🔴' : '⬜');
          r += '  ' + icon + ' ' + t.title + due + '\n';
        });
        r += '\n';
      }
      if (reminders.length) {
        const todayReminders = reminders.filter(rem => {
          if (rem.type === 'daily') return true;
          if (rem.type === 'weekly') return rem.day_of_week == new Date().getDay();
          if (rem.type === 'monthly') return rem.day_of_month == new Date().getDate();
          return false;
        });
        if (todayReminders.length) {
          r += '⏰ 今日提醒\n';
          todayReminders.forEach(rem => r += '  🔔 ' + rem.name + '（' + rem.time + '）\n');
          r += '\n';
        }
      }
      if (workLogs.length) {
        r += '📝 工作日志\n';
        workLogs.forEach(wl => {
          let data;
          try { data = JSON.parse(wl.data_json || '{}'); } catch { data = {}; }
          const content = data.内容 || data.content || data.今日工作 || '';
          const project = data.项目 || data.project || '';
          if (content) r += '  ' + (project ? '📁 [' + project + '] ' : '📄 ') + content.slice(0, 120) + '\n';
        });
        r += '\n';
      }
      if (chats.length) {
        r += '💬 对话与沟通\n';
        r += '  今日共 ' + chats.length + ' 次对话';
        if (chatCountWeek > 0) r += '，本周累计 ' + chatCountWeek + ' 次';
        r += '\n';
        chats.forEach(c => {
          const snippet = (c.snippet || '').replace(/\n/g, ' ').slice(0, 100);
          if (snippet) r += '  💭 ' + snippet + '\n';
        });
        r += '\n';
      }
      if (recs.length) {
        r += '🗂️ 数据中心动态\n';
        r += '  今日新增 ' + recCount + ' 条记录';
        if (recCountWeek > 0) r += '，本周累计 ' + recCountWeek + ' 条';
        r += '\n';
        const dsGroups = {};
        recs.forEach(rec => {
          const dsId = rec.dataset_id;
          if (!dsGroups[dsId]) dsGroups[dsId] = [];
          dsGroups[dsId].push(rec);
        });
        for (const [dsId, groupRecs] of Object.entries(dsGroups)) {
          const ds = db.qOne("SELECT name FROM data_center_datasets WHERE dataset_id = ?", dsId);
          const dsName = ds ? ds.name : '未分类';
          r += '  📦 ' + dsName + '（' + groupRecs.length + ' 条）\n';
          groupRecs.forEach(rec => {
            let data;
            try { data = JSON.parse(rec.data_json || '{}'); } catch { data = {}; }
            const name = data.name || data.名称 || data.title || data.标题 || '';
            const status = data.status || data.状态 || '';
            if (name) r += '    📌 ' + name + (status ? '（' + status + '）' : '') + '\n';
          });
        }
        r += '\n';
      }
      if (docs.length) {
        const meaningfulDocs = docs.filter(d => {
          const s = (d.snippet || '').trim();
          return s && !s.startsWith('{') && !s.startsWith('<') && !s.startsWith('import ') && !s.startsWith('module.');
        }).slice(0, 10);
        if (meaningfulDocs.length) {
          r += '📝 笔记更新\n';
          r += '  今日更新 ' + docs.length + ' 个文件';
          if (docs.length > 0) {
            const dirs = new Set();
            docs.forEach(d => {
              const dir = d.path ? d.path.split(/[\\/]/).slice(-2, -1)[0] : '';
              if (dir) dirs.add(dir);
            });
            if (dirs.size) r += '，涉及 ' + dirs.size + ' 个目录';
          }
          r += '\n';
          meaningfulDocs.forEach(d => {
            const name = d.path ? d.path.split(/[\\/]/).pop() : '';
            const s = (d.snippet || '').replace(/\n/g, ' ').slice(0, 80);
            r += '  📄 ' + name + '：' + s + '\n';
          });
          if (docs.length > meaningfulDocs.length) r += '  ...及其他 ' + (docs.length - meaningfulDocs.length) + ' 个文件\n';
          r += '\n';
        }
      }
      r += '🔍 综合分析\n';
      r += '  ━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
      {
        const totalTodos = todos.length;
        const doneCount = doneToday.length;
        const inProgress = pendingTodos.filter(t => t.status === 'in_progress').length;
        const completionRate = totalTodos > 0 ? Math.round((doneCount / totalTodos) * 100) : 0;
        const highPriorityPending = pendingTodos.filter(t => t.priority === 'high');
        r += '  📊 【工作状态分析】\n';
        if (totalTodos > 0) r += '  待办完成率：' + completionRate + '%（今日完成 ' + doneCount + '/' + totalTodos + '）\n';
        if (inProgress > 0) r += '  进行中任务：' + inProgress + ' 项\n';
        if (highPriorityPending.length) {
          r += '  ⚡ 高优先级待办：' + highPriorityPending.length + ' 项\n';
          highPriorityPending.forEach(t => r += '    🔴 ' + t.title + (t.due_date ? '（截止 ' + t.due_date + '）' : '') + '\n');
        }
        if (overdueTodos.length) {
          const overdueDays = overdueTodos.map(t => Math.ceil((new Date(today) - new Date(t.due_date)) / 86400000));
          const maxOverdue = Math.max(...overdueDays, 0);
          r += '  ⚠️ 有 ' + overdueTodos.length + ' 项逾期，最长逾期 ' + maxOverdue + ' 天，建议尽快处理\n';
        }
        if (doneToday.length > 0) {
          const highDone = doneToday.filter(t => t.priority === 'high').length;
          if (highDone > 0) r += '  ✅ 今日完成了 ' + highDone + ' 项高优先级任务，效率不错！\n';
        }
        r += '\n';
      }
      if (chats.length > 0) {
        r += '  💬 【沟通与协作分析】\n';
        r += '  今日对话 ' + chatCountToday + ' 次';
        if (chatCountWeek > 0) {
          const dailyAvg = Math.round(chatCountWeek / 7);
          r += '，日均 ' + dailyAvg + ' 次';
          if (chatCountToday > dailyAvg) r += '，今天对话较活跃';
          else if (chatCountToday < dailyAvg) r += '，今天对话较少';
        }
        r += '\n';
        const keywords = [];
        const stopWords = ['的','了','是','在','有','和','就','不','人','都','一','一个','上','也','很','到','说','要','去','你','会','着','没有','看','好','自己','这','这个','我','他','她','它','们','那','那个','什么','怎么','如何','为什么','可以','能','吗','吧','啊','呢','哦','嗯','哈','呀'];
        chats.forEach(c => {
          const snippet = (c.snippet || '').trim();
          if (snippet) {
            snippet.split(/[\s,，。！？、；：""''（）()【】\[\]]/).forEach(word => {
              if (word.length >= 2 && !stopWords.includes(word) && !keywords.includes(word)) keywords.push(word);
            });
          }
        });
        if (keywords.length > 0) r += '  对话关键词：' + keywords.slice(0, 8).join('、') + '\n';
        const topicCategories = {
          开发: ['开发','代码','bug','修复','部署','功能','项目','前端','后端','接口','数据库','服务器','git','分支','合并','测试','上线'],
          学习: ['学习','教程','课程','文档','阅读','笔记','知识','了解','研究'],
          管理: ['任务','计划','安排','进度','汇报','会议','讨论','沟通','协调'],
          内容: ['文章','写作','发布','内容','编辑','文案','排版'],
          数据分析: ['数据','分析','统计','报表','图表','指标'],
        };
        const topicCounts = {};
        chats.forEach(c => {
          const snippet = (c.snippet || '').toLowerCase();
          for (const [topic, words] of Object.entries(topicCategories)) {
            for (const w of words) { if (snippet.includes(w)) { topicCounts[topic] = (topicCounts[topic] || 0) + 1; break; } }
          }
        });
        const activeTopics = Object.entries(topicCounts).filter(([_, c]) => c >= 1).sort((a, b) => b[1] - a[1]);
        if (activeTopics.length > 0) r += '  对话主题：' + activeTopics.map(([t, c]) => t + '（' + c + '次）').join('、') + '\n';
        r += '\n';
      }
      if (docs.length > 0) {
        const meaningfulDocs = docs.filter(d => {
          const s = (d.snippet || '').trim();
          return s && !s.startsWith('{') && !s.startsWith('<') && !s.startsWith('import ') && !s.startsWith('module.');
        });
        r += '  📚 【知识沉淀分析】\n';
        r += '  今日记录 ' + docs.length + ' 篇笔记';
        if (docCountToday > 0) {
          const totalChars = meaningfulDocs.reduce((sum, d) => sum + (d.snippet || '').length, 0);
          r += '，总字数约 ' + totalChars + ' 字';
        }
        r += '\n';
        const dirGroups = {};
        docs.forEach(d => {
          const dir = d.path ? d.path.split(/[\\/]/).slice(-2, -1)[0] || '根目录' : '根目录';
          if (!dirGroups[dir]) dirGroups[dir] = [];
          dirGroups[dir].push(d);
        });
        const dirEntries = Object.entries(dirGroups).sort((a, b) => b[1].length - a[1].length);
        if (dirEntries.length > 1) {
          r += '  笔记分布：' + dirEntries.slice(0, 5).map(([dir, files]) => dir + '（' + files.length + '篇）').join('、') + '\n';
        }
        const contentTypes = { 技术: 0, 随笔: 0, 计划: 0, 总结: 0 };
        meaningfulDocs.forEach(d => {
          const s = (d.snippet || '').toLowerCase();
          if (s.includes('代码') || s.includes('函数') || s.includes('api') || s.includes('实现')) contentTypes.技术++;
          if (s.includes('今天') || s.includes('感觉') || s.includes('觉得')) contentTypes.随笔++;
          if (s.includes('计划') || s.includes('待办') || s.includes('安排')) contentTypes.计划++;
          if (s.includes('总结') || s.includes('完成') || s.includes('结果')) contentTypes.总结++;
        });
        const activeTypes = Object.entries(contentTypes).filter(([_, c]) => c > 0).sort((a, b) => b[1] - a[1]);
        if (activeTypes.length > 0) r += '  内容类型：' + activeTypes.map(([t, c]) => t + '（' + c + '篇）').join('、') + '\n';
        r += '\n';
      }
      if (doneWeek.length > 0 || recCountWeek > 0) {
        r += '  📈 【数据趋势分析】\n';
        if (doneWeek.length > 0) {
          r += '  本周完成任务趋势：';
          doneWeek.forEach((d, i) => {
            const dayName = ['周日','周一','周二','周三','周四','周五','周六'][new Date(d.d).getDay()];
            r += dayName + d.c + '项';
            if (i < doneWeek.length - 1) r += ' → ';
          });
          r += '\n';
          const todayCount = doneWeek.find(d => d.d === today);
          const yesterdayCount = doneWeek.find(d => d.d === yesterday);
          if (todayCount && yesterdayCount) {
            const diff = todayCount.c - yesterdayCount.c;
            if (diff > 0) r += '  较昨日：📈 +' + diff + ' 项，效率提升！\n';
            else if (diff < 0) r += '  较昨日：📉 ' + diff + ' 项，需加油\n';
            else r += '  较昨日：➡️ 持平\n';
          }
        }
        if (recCountWeek > 0 && recCount > 0) {
          const recsYesterday = (db.qOne("SELECT COUNT(*) as c FROM data_center_records WHERE created_at >= ? AND created_at < ?", yesterday, today) || {}).c || 0;
          r += '  数据中心：今日新增 ' + recCount + ' 条';
          if (recsYesterday > 0) {
            const diff = recCount - recsYesterday;
            if (diff > 0) r += '，较昨日 +' + diff;
            else if (diff < 0) r += '，较昨日 ' + diff;
          }
          r += '\n';
        }
        r += '\n';
      }
      let score = 0;
      {
        const inProgress = pendingTodos.filter(t => t.status === 'in_progress').length;
        const highPriorityPending = pendingTodos.filter(t => t.priority === 'high');
        r += '  🎯 【综合评估与建议】\n';
        score = 60;
        if (doneToday.length > 0) score += 10;
        if (doneToday.length >= 3) score += 5;
        if (inProgress > 0) score += 5;
        if (overdueTodos.length === 0) score += 10; else score -= 10;
        if (chats.length > 0) score += 5;
        if (docs.length > 0) score += 5;
        if (recCount > 0) score += 5;
        score = Math.max(0, Math.min(100, score));
        const scoreBar = '█'.repeat(Math.round(score / 10)) + '░'.repeat(10 - Math.round(score / 10));
        r += '  今日效率评分：' + scoreBar + ' ' + score + '/100\n';
        const suggestions = [];
        if (overdueTodos.length > 0) suggestions.push('优先处理 ' + overdueTodos.length + ' 项逾期待办');
        if (inProgress > 3) suggestions.push('进行中任务较多，建议集中精力完成一项再开始下一项');
        if (chatCountToday > 10) suggestions.push('今日对话较多，注意时间管理');
        if (docs.length === 0 && recCount === 0) suggestions.push('今日暂无知识沉淀，建议记录工作笔记');
        if (doneToday.length === 0) suggestions.push('今日尚未完成待办，建议设定小目标开始行动');
        if (highPriorityPending.length > 0 && overdueTodos.length === 0) suggestions.push('高优先级任务还有 ' + highPriorityPending.length + ' 项，建议优先攻克');
        if (suggestions.length > 0) {
          r += '  建议：\n';
          suggestions.forEach(s => r += '    💡 ' + s + '\n');
        } else {
          r += '  建议：今日状态良好，保持节奏继续加油！\n';
        }
        r += '  ';
        if (score >= 80) r += '🎉 今天效率很高，继续保持！';
        else if (score >= 60) r += '👍 状态不错，还有提升空间！';
        else if (score >= 40) r += '💪 加油，从完成一个小目标开始！';
        else r += '🌟 调整心态，重新出发，你可以的！';
        r += '\n\n';
      }
      r += '📊 综合日报 · ' + today + '\n';
      r += '---\n';
      r += '💡 打开应用查看完整详情\n';
      r += '笔灵 AI · ' + kbName;

      db.run("INSERT INTO ai_analysis (kb_id, type, content, report_date, created_at) VALUES (?, 'daily_report', ?, ?, datetime('now', '+8 hours'))",
        kbId, r, today);
      logger.info(`[Scheduler] daily report generated for kb ${kbId}`);
      sendNotification('每日报告', '📋 ' + pendingTodos.length + ' 项待办 · ' + recCount + ' 条新数据 · 📊 评分 ' + score + '/100');
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