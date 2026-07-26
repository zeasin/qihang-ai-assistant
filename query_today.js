const initSqlJs = require('sql.js');
const fs = require('fs');

async function main() {
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync('memory.db');
  const db = new SQL.Database(fileBuffer);
  
  // 获取今天的日期
  const today = new Date().toISOString().split('T')[0];
  
  console.log(`查询日期: ${today}\n`);
  
  function getCount(result) {
    if (!result || result.length === 0) return 0;
    try {
      const tables = result[0];
      const values = tables.values[0] || [];
      return values[0] || 0;
    } catch(e) {
      return 0;
    }
  }
  
  // 1. 今日消息统计
  const todayMessages = db.exec(`
    SELECT COUNT(*) as count FROM messages m
    WHERE date(m.created_at) = '${today}'
  `);
  
  const todayUserMessages = db.exec(`
    SELECT COUNT(*) as count FROM messages m
    WHERE date(m.created_at) = '${today}' AND m.role = 'user'
  `);
  
  const todayAssistantMessages = db.exec(`
    SELECT COUNT(*) as count FROM messages m
    WHERE date(m.created_at) = '${today}' AND m.role = 'assistant'
  `);
  
  // 2. 今日会话统计
  const todaySessions = db.exec(`
    SELECT COUNT(*) as count FROM sessions s
    WHERE date(s.created_at) = '${today}'
  `);
  
  // 3. 今日文档更新
  const todayDocs = db.exec(`
    SELECT COUNT(*) as count FROM file_index_meta f
    WHERE date(datetime(f.last_modified/1000, 'unixepoch', '+8 hours')) = '${today}'
  `);
  
  // 4. 今日新增记录
  const todayRecords = db.exec(`
    SELECT COUNT(*) as count FROM data_center_records r
    WHERE date(r.created_at) = '${today}'
  `);
  
  // 5. 今日Agent记忆
  const todayMemories = db.exec(`
    SELECT COUNT(*) as count FROM agent_memories
    WHERE date(created_at) = '${today}'
  `);
  
  // 6. 今日Agent追踪
  const todayTraces = db.exec(`
    SELECT COUNT(*) as count FROM agent_traces
    WHERE date(created_at) = '${today}'
  `);
  
  // 7. 今日任务
  const todayTasks = db.exec(`
    SELECT COUNT(*) as count FROM tasks
    WHERE date(created_at) = '${today}'
  `);
  
  const todayDoneTasks = db.exec(`
    SELECT COUNT(*) as count FROM tasks
    WHERE date(updated_at) = '${today}' AND status = 'done'
  `);
  
  const todayPendingTasks = db.exec(`
    SELECT COUNT(*) as count FROM tasks
    WHERE status IN ('pending', 'in_progress')
    AND (date(created_at) <= '${today}' AND (due_date IS NULL OR date(due_date) >= '${today}'))
  `);
  
  // 8. 今日代码记录
  const todayCoding = db.exec(`
    SELECT COUNT(*) as count FROM coding_records
    WHERE date(time) = '${today}'
  `);
  
  const todayCodingSuccess = db.exec(`
    SELECT COUNT(*) as count FROM coding_records
    WHERE date(time) = '${today}' AND success = 1
  `);
  
  // 9. 提醒统计
  const activeReminders = db.exec(`
    SELECT COUNT(*) as count FROM reminders
    WHERE enabled = 1
  `);
  
  const todayReminders = db.exec(`
    SELECT COUNT(*) as count FROM reminders
    WHERE enabled = 1 AND date(date) = '${today}'
  `);
  
  // 10. 收集任务
  const activeCollectorTasks = db.exec(`
    SELECT COUNT(*) as count FROM collector_tasks
    WHERE enabled = 1
  `);
  
  // 11. 知识库信息
  const kb = db.exec(`
    SELECT name, notes_dir FROM knowledge_bases WHERE id = 1
  `);
  
  // 12. 文档索引统计
  const totalDocs = db.exec(`
    SELECT COUNT(*) as count FROM file_index_meta
    WHERE kb_id = 1
  `);
  
  // 13. 最近5条消息
  const recentMessages = db.exec(`
    SELECT substr(m.created_at, 1, 16) as time, m.role, substr(m.content, 1, 100) as preview, s.title
    FROM messages m
    JOIN sessions s ON m.session_id = s.id
    WHERE date(m.created_at) = '${today}'
    ORDER BY m.created_at DESC
    LIMIT 5
  `);
  
  // 14. 最近5个会话
  const recentSessions = db.exec(`
    SELECT s.id, substr(s.title, 1, 50) as title, s.source, substr(s.created_at, 1, 16) as created
    FROM sessions s
    WHERE date(s.created_at) = '${today}'
    ORDER BY s.created_at DESC
    LIMIT 5
  `);
  
  // 15. 今日待办列表
  const pendingTaskList = db.exec(`
    SELECT id, title, priority, due_date, status
    FROM tasks
    WHERE status IN ('pending', 'in_progress')
    ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'mid' THEN 2 WHEN 'low' THEN 3 END, due_date
    LIMIT 10
  `);
  
  // 16. 系统总体统计
  const totalSessions = db.exec(`
    SELECT COUNT(*) as count FROM sessions
  `);
  
  const totalMessages = db.exec(`
    SELECT COUNT(*) as count FROM messages
  `);
  
  const totalMemories = db.exec(`
    SELECT COUNT(*) as count FROM agent_memories
  `);
  
  // 格式化输出
  console.log('========================================');
  console.log('           笔灵 AI - 今日数据报告');
  console.log('========================================\n');
  
  console.log(`📅 日期: ${today}`);
  console.log(`📚 知识库: ${kb.length > 0 ? kb[0].values[0][0] : '未设置'}`);
  console.log('');
  
  console.log('--- 今日活动统计 ---');
  console.log(`💬 对话总数: ${getCount(todayMessages)} 条`);
  console.log(`   - 用户消息: ${getCount(todayUserMessages)} 条`);
  console.log(`   - AI回复: ${getCount(todayAssistantMessages)} 条`);
  console.log(`🔄 新建会话: ${getCount(todaySessions)} 个`);
  console.log(`📝 文档更新: ${getCount(todayDocs)} 篇`);
  console.log(`🗂️ 新增记录: ${getCount(todayRecords)} 条`);
  console.log(`🧠 Agent记忆: ${getCount(todayMemories)} 条`);
  console.log(`🔍 Agent追踪: ${getCount(todayTraces)} 条`);
  console.log('');
  
  console.log('--- 今日任务统计 ---');
  console.log(`📋 新增任务: ${getCount(todayTasks)} 个`);
  console.log(`✅ 完成任务: ${getCount(todayDoneTasks)} 个`);
  console.log(`⏳ 进行中任务: ${getCount(todayPendingTasks)} 个`);
  console.log('');
  
  console.log('--- 今日开发记录 ---');
  console.log(`💻 代码交互: ${getCount(todayCoding)} 次`);
  console.log(`✅ 成功次数: ${getCount(todayCodingSuccess)} 次`);
  console.log('');
  
  console.log('--- 提醒与任务 ---');
  console.log(`⏰ 启用提醒: ${getCount(activeReminders)} 个`);
  console.log(`📊 收集任务: ${getCount(activeCollectorTasks)} 个`);
  console.log('');
  
  console.log('--- 系统总体统计 ---');
  console.log(`📊 总会话数: ${getCount(totalSessions)}`);
  console.log(`💬 总消息数: ${getCount(totalMessages)}`);
  console.log(`🧠 总记忆数: ${getCount(totalMemories)}`);
  console.log(`📄 索引文档: ${getCount(totalDocs)} 篇`);
  
  if (recentMessages.length > 0) {
    console.log('');
    console.log('--- 今日最近对话 ---');
    recentMessages[0].values.forEach(v => {
      console.log(`  [${v[0]}] ${v[1]}: ${v[2]}`);
    });
  }
  
  if (recentSessions.length > 0) {
    console.log('');
    console.log('--- 今日新建会话 ---');
    recentSessions[0].values.forEach(v => {
      console.log(`  [${v[3]}] ${v[1]} (${v[2]})`);
    });
  }
  
  if (pendingTaskList.length > 0) {
    console.log('');
    console.log('--- 待办任务列表 ---');
    pendingTaskList[0].values.forEach(v => {
      const priority = v[2] === 'high' ? '🔴' : v[2] === 'mid' ? '🟡' : '🟢';
      const due = v[3] ? ` (截止: ${v[3]})` : '';
      console.log(`  ${priority} ${v[1]} [${v[4]}]${due}`);
    });
  }
  
  db.close();
}

main().catch(console.error);
