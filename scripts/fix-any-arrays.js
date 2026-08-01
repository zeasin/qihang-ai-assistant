const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'electron');
function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(full));
    else if (e.name.endsWith('.ts')) out.push(full);
  }
  return out;
}
let fixed = 0;
for (const f of walk(root)) {
  let c = fs.readFileSync(f, 'utf8');
  let nc = c.replace(/const\s+(\w+)\s*=\s*\[\];/g, 'const $1: any[] = [];');
  nc = nc.replace(/let\s+(\w+)\s*=\s*\[\];/g, 'let $1: any[] = [];');
  nc = nc.replace(/let\s+(\w+)\s*=\s*null;/g, 'let $1: any = null;');
  nc = nc.replace(/const\s+(\w+)\s*=\s*\{\};/g, 'const $1: any = {};');
  if (nc !== c) { fs.writeFileSync(f, nc); fixed++; }
}
console.log('fixed files:', fixed);
