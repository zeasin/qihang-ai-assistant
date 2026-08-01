// Codemod: electron/services/*.js -> *.ts 机械转换
// 用法: node scripts/migrate-services.js
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'electron', 'services');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'pi-agent.js');

for (const file of files) {
  const src = fs.readFileSync(path.join(dir, file), 'utf8');
  let out = src;

  // 1. require() -> import
  // 1a. 解构 require: const { a, b } = require('x');
  out = out.replace(
    /const\s*\{([^}]+)\}\s*=\s*require\((['"])([^'"]+)\2\);/g,
    (m, names, q, mod) => `import { ${names.trim()} } from '${mod}';`
  );
  // 1b. 直接 require: const x = require('x');
  out = out.replace(
    /const\s+(\w+)\s*=\s*require\((['"])([^'"]+)\2\);/g,
    (m, name, q, mod) => `import * as ${name} from '${mod}';`
  );
  // 1c. 其他位置的 require（函数内），保留但加注释标记
  out = out.replace(/require\((['"])([^'"]+)\1\)/g, (m) => m); // no-op, keep

  // 2. module.exports = { ... }; -> export { ... };
  out = out.replace(
    /module\.exports\s*=\s*\{([\s\S]*?)\};?$/m,
    (m, names) => {
      const cleaned = names.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim();
      return `export { ${cleaned} };`;
    }
  );

  // 3. 移除尾部的 module.exports = logger; 等整体导出（logger 特殊处理）
  out = out.replace(/module\.exports\s*=\s*(\w+);?/g, (m, name) => {
    // 单对象导出（如 logger）：转成 export default
    if (file === 'logger.js') return `export default ${name};`;
    return `export default ${name};`;
  });

  const dest = path.join(dir, file.replace(/\.js$/, '.ts'));
  fs.writeFileSync(dest, out, 'utf8');
  console.log(`converted ${file} -> ${path.basename(dest)}`);
}
