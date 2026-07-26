const { spawn } = require('child_process');
const path = require('path');
const logger = require('./logger');

/**
 * Claude Code CLI 服务
 * 支持：claude -p "prompt" --print 模式，非交互式调用
 */

async function checkStatus() {
  try {
    const result = require('child_process').execSync('claude --version', { timeout: 5000, encoding: 'utf-8' });
    const version = result.trim();
    return { installed: true, version };
  } catch (e) {
    return { installed: false, version: null, error: e.message };
  }
}

/**
 * 向 Claude Code CLI 发送提示
 * @param {string} context - 对话历史上下文
 * @param {string} question - 用户新问题
 * @param {string} projectDir - 项目目录（作为 cwd）
 * @param {function} onDelta - 流式回调
 * @param {function} onDone - 完成回调
 * @param {function} onError - 错误回调
 */
async function prompt(context, question, projectDir, onDelta, onDone, onError) {
  const fullText = context ? `${context}\n\n${question}` : question;

  return new Promise((resolve, reject) => {
    let output = '';

    const proc = spawn('claude', [
      '-p', fullText,
      '--print',
      '--no-session-persistence',
      '--dangerously-skip-permissions',
    ], {
      cwd: projectDir || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300000, // 5 min
      env: { ...process.env, CLAUDE_QUIET: '1' },
    });

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      onDelta?.(text);
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (text) logger.debug(`[ClaudeCode] stderr: ${text.substring(0, 200)}`);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        onDone?.();
        resolve(output.trim());
      } else {
        const errMsg = `Claude Code 退出码: ${code}${output ? `\n${output.substring(0, 500)}` : ''}`;
        logger.error(`[ClaudeCode] ${errMsg}`);
        onError?.(errMsg);
        reject(new Error(errMsg));
      }
    });

    proc.on('error', (err) => {
      logger.error(`[ClaudeCode] Error: ${err.message}`);
      onError?.(err.message);
      reject(err);
    });
  });
}

module.exports = { prompt, checkStatus };