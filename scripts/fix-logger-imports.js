const fs = require('fs');
const path = require('path');

function walk(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p));
    else if (f.endsWith('.ts')) out.push(p);
  }
  return out;
}

for (const file of walk('electron')) {
  let c = fs.readFileSync(file, 'utf8');
  const before = c;
  c = c.replace(/import \* as logger from '(\.\.\/)*services\/logger';/g, (m, slash) => `import logger from '${slash || ''}services/logger';`);
  c = c.replace(/import \* as logger from '\.\/logger';/g, "import logger from './logger';");
  if (c !== before) {
    fs.writeFileSync(file, c, 'utf8');
    console.log('fixed', file);
  }
}
