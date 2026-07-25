const cron = require('node-cron');
const db = require('./database');
const logger = require('./logger');

let jobs = new Map();
let running = false;

// Task executors registry
const executors = {
  'ping': async (task) => {
    logger.info(`[Scheduler] ping: ${task.name}`);
  },
  'auto_index': async (task) => {
    logger.info(`[Scheduler] auto-index triggered: ${task.name}`);
    const config = JSON.parse(task.config_json || '{}');
    const kbId = config.kbId;
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
  },
  'reminder': async (task) => {
    logger.info(`[Scheduler] reminder: ${task.name}`);
    // TODO: trigger feishu notification
  },
};

function start() {
  if (running) return;
  running = true;

  const tasks = db.task.getActive();
  for (const task of tasks) {
    scheduleTask(task);
  }
  logger.info(`[Scheduler] started with ${tasks.length} tasks`);
}

function scheduleTask(task) {
  if (!task.cron_expr || !cron.validate(task.cron_expr)) return;
  const job = cron.schedule(task.cron_expr, async () => {
    try {
      const executor = executors[task.task_type];
      if (executor) await executor(task);
    } catch (e) {
      logger.error(`[Scheduler] task ${task.name} error:`, e.message);
    }
  });
  jobs.set(task.id, job);
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

module.exports = { start, stop, reload, isRunning };