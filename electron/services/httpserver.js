const http = require('http');
const path = require('path');
const fs = require('fs');

let server = null;
let dbRef = null;
let running = false;
let serverPort = 15173;

const DIST_DIR = path.join(__dirname, '../../dist');
const VITE_DEV = 'http://localhost:15174';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function getKbPath(projectId) {
  const project = dbRef.project.get(projectId);
  return project ? project.dir : null;
}

function listDir(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const items = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      items.push({ name: entry.name, path: full, type: 'folder' });
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.txt') || entry.name.endsWith('.json')) {
      items.push({ name: entry.name, path: full, type: 'file' });
    }
  }
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return items;
}

function parseUrl(reqUrl) {
  const idx = reqUrl.indexOf('?');
  const pathname = idx === -1 ? reqUrl : reqUrl.slice(0, idx);
  const params = {};
  if (idx !== -1) {
    for (const part of reqUrl.slice(idx + 1).split('&')) {
      const [k, v] = part.split('=').map(decodeURIComponent);
      if (k) params[k] = v || '';
    }
  }
  return { pathname, params };
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function html(res, content, status = 200) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(content);
}

// ─── Vue SPA ───

function serveVueSpa(req, res) {
  const indexPath = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath, 'utf-8');
    return html(res, content);
  }
  proxyToVite(req, res);
}

function serveStatic(res, filePath) {
  const fullPath = path.join(DIST_DIR, filePath);
  if (fs.existsSync(fullPath)) {
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) return false;
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(fullPath));
    return true;
  }
  return false;
}

function proxyToVite(clientReq, clientRes) {
  const options = {
    hostname: 'localhost',
    port: 15174,
    path: clientReq.url,
    method: clientReq.method,
    headers: { ...clientReq.headers, host: 'localhost:15174' },
  };
  const proxyReq = http.request(options, (proxyRes) => {
    clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(clientRes);
  });
  proxyReq.on('error', () => {
    html(clientRes, '<h1>服务未就绪</h1><p>开发模式请运行 npm run dev (Vite)，或先执行 npm run build。</p><a href="/web">远程管理页面</a>', 503);
  });
  clientReq.pipe(proxyReq);
}

// ─── Remote Pages ───

const NAV_ITEMS = [
  { path: '/web', label: '首页', icon: '🏠' },
  { path: '/web/notes', label: '笔记', icon: '📄' },
  { path: '/web/datacenter', label: '数据', icon: '🗂️' },
  { path: '/web/planner', label: '提醒', icon: '⏰' },
  { path: '/web/reports', label: '日报', icon: '📊' },
  { path: '/web/quicknote', label: '随手', icon: '✏️' },
  { path: '/web/status', label: '状态', icon: '⚡' },
];

function pageLayout(title, bodyHTML, activePath, headExtra = '') {
  const navHTML = NAV_ITEMS.map(item => {
    const active = item.path === activePath ? ' active' : '';
    return `<a class="nav-item${active}" href="${item.path}" title="${item.label}"><span class="nav-icon">${item.icon}</span><span class="nav-label">${item.label}</span></a>`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} - 启航AI工作台</title><style>${LAYOUT_CSS}</style>${headExtra}</head><body><div class="app-container"><aside class="sidebar"><nav class="nav-menu">${navHTML}</nav><div class="sidebar-footer"><a class="nav-item" href="/web/status" title="状态"><span class="nav-icon">⚡</span><span class="nav-label">状态</span></a></div></aside><main class="main-content">${bodyHTML}</main></div></body></html>`;
}

const LAYOUT_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
:root{--primary:#6366f1;--primary-light:#818cf8;--primary-dark:#4f46e5;--bg-main:#f8fafc;--bg-sidebar:#fff;--text-primary:#1e293b;--text-secondary:#64748b;--text-muted:#94a3b8;--border:#e2e8f0;--hover:#f1f5f9;--success:#22c55e;--warning:#fb923c;--danger:#ef4444;--radius-sm:8px;--radius-md:12px;--radius-lg:16px;--shadow-sm:0 1px 2px rgba(0,0,0,.05);--shadow-md:0 4px 6px rgba(0,0,0,.05);--shadow-lg:0 10px 15px rgba(0,0,0,.08)}
html,body{height:100%;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
body{background:var(--bg-main);color:var(--text-primary)}
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:var(--text-muted)}
.app-container{display:flex;height:100vh;overflow:hidden}
.sidebar{width:68px;background:var(--bg-sidebar);border-right:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0}
.nav-menu{flex:1;display:flex;flex-direction:column;gap:2px;padding:8px 4px;overflow-y:auto}
.nav-item{display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 2px 6px;cursor:pointer;color:var(--text-secondary);font-size:10px;transition:all .15s;text-decoration:none;line-height:1.2;border-radius:var(--radius-sm)}
.nav-item:hover{background:var(--hover);color:var(--text-primary)}
.nav-item.active{background:rgba(99,102,241,.1);color:var(--primary)}
.nav-icon{font-size:20px;line-height:1;display:flex;align-items:center;justify-content:center}
.nav-label{font-size:10px;text-align:center;white-space:nowrap}
.sidebar-footer{display:flex;flex-direction:column;padding:4px;border-top:1px solid var(--border)}
.main-content{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
.page{flex:1;overflow-y:auto;padding:24px}
h1{font-size:22px;font-weight:700;margin-bottom:20px}
.card{background:#fff;border-radius:var(--radius-md);box-shadow:var(--shadow-sm);padding:20px;margin-bottom:16px}
.card h2{font-size:16px;font-weight:600;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--border)}
th{background:#f8fafc;font-weight:600;color:var(--text-secondary);font-size:12px}
tr:hover{background:#f8fafc}
.file-tree{margin:0;padding:0;list-style:none}
.file-tree li{padding:6px 0;font-size:13px}
.file-tree .folder{font-weight:500;color:var(--primary);cursor:pointer}
.file-tree .file{color:var(--text-primary);cursor:pointer;margin-left:16px}
.file-tree .file:hover{color:var(--primary)}
.file-tree .children{padding-left:20px;display:none}
.file-tree .children.open{display:block}
.badge{display:inline-flex;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:500}
.badge-gray{background:#f5f5f7;color:#909296}
.preview{background:#f8fafc;border-radius:var(--radius-sm);padding:16px;font-size:13px;line-height:1.6;border:1px solid var(--border);white-space:pre-wrap;font-family:monospace}
.empty{text-align:center;padding:40px;color:var(--text-muted);font-size:14px}
.back{display:inline-block;margin-bottom:16px;color:var(--primary);text-decoration:none;font-size:13px;font-weight:500}
.back:hover{text-decoration:underline}
.status-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}
.status-dot.on{background:var(--success)}
.status-dot.off{background:var(--text-muted)}
input,textarea,select{width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-family:inherit;box-sizing:border-box;margin-bottom:10px;background:#fff;outline:none;transition:all .2s}
input:focus,textarea:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(99,102,241,.1)}
textarea{min-height:80px;resize:vertical}
.btn{padding:8px 16px;border-radius:var(--radius-sm);border:none;font-size:13px;cursor:pointer;font-weight:500;display:inline-flex;align-items:center;gap:6px;transition:all .2s}
.btn-primary{background:var(--primary);color:#fff}
.btn-primary:hover{background:var(--primary-dark)}
.btn-secondary{background:#fff;color:var(--text-secondary);border:1px solid var(--border)}
.btn-secondary:hover{background:var(--hover)}
.btn-danger{background:var(--danger);color:#fff}
.btn-sm{padding:6px 12px;font-size:12px}
.flex{display:flex;gap:8px;align-items:center;flex-wrap:wrap}`;

function remoteIndex() {
  return pageLayout('远程管理', `
<div class="page">
<h1>📘 启航AI工作台 远程管理</h1>
<div class="card"><p style="font-size:14px;color:var(--text-secondary)">从左侧导航选择功能查看或管理数据。</p></div>
</div>`, '/web');
}

function notesPage() {
  const headExtra = `
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"><\/script>
<style>
.split-view{display:flex;gap:16px;flex:1;overflow:hidden}
.split-left{width:320px;flex-shrink:0;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-md);padding:12px;max-height:100%}
.split-right{flex:1;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-md);padding:16px}
.kb-list{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border)}
.kb-tag{padding:4px 10px;border-radius:12px;font-size:12px;cursor:pointer;border:1px solid var(--border);transition:all .15s;color:var(--text-secondary)}
.kb-tag.active{border-color:var(--primary);background:var(--primary);color:#fff}
.kb-tag:hover{border-color:var(--primary)}
.file-tree{list-style:none;padding:0;margin:0;font-size:13px}
.file-tree ul{list-style:none;padding-left:16px;margin:0}
.file-tree li{margin:2px 0}
.file-tree .folder,.file-tree .file{padding:3px 8px;border-radius:4px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.file-tree .folder:hover,.file-tree .file:hover{background:var(--hover);color:var(--primary)}
.file-tree .file.active{background:rgba(99,102,241,0.1);color:var(--primary);font-weight:500}
.file-tree .children{display:none}
.file-tree .children.open{display:block}
.preview{line-height:1.8;font-size:14px;max-width:800px;margin:0 auto}
.preview h1{font-size:22px;margin:20px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--border)}
.preview h2{font-size:18px;margin:16px 0 8px}
.preview h3{font-size:15px;margin:12px 0 6px}
.preview p{margin:8px 0}
.preview ul,.preview ol{padding-left:24px;margin:6px 0}
.preview li{margin:3px 0}
.preview code{background:var(--hover);padding:2px 6px;border-radius:4px;font-size:13px;font-family:Consolas,monospace}
.preview pre{background:var(--hover);padding:12px;border-radius:6px;overflow-x:auto;margin:10px 0}
.preview pre code{padding:0;background:none}
.preview blockquote{border-left:3px solid var(--primary);padding:4px 12px;margin:8px 0;color:var(--text-secondary);background:var(--hover);border-radius:0 6px 6px 0}
.preview table{border-collapse:collapse;width:100%;margin:10px 0;font-size:13px}
.preview th,.preview td{border:1px solid var(--border);padding:6px 10px;text-align:left}
.preview th{background:var(--hover);font-weight:600}
.preview img{max-width:100%;border-radius:6px;margin:8px 0}
.preview a{color:var(--primary)}
.preview hr{margin:16px 0}
.preview .empty{color:var(--text-muted);text-align:center;padding:40px 0}
.note-title{font-size:16px;font-weight:600;padding-bottom:12px;margin-bottom:16px;border-bottom:1px solid var(--border);color:var(--text-primary)}
@media(max-width:768px){.split-view{flex-direction:column}.split-left{width:auto;max-height:40vh}}
</style>`;
  return pageLayout('笔记浏览', `
<div class="page" style="display:flex;flex-direction:column;padding:16px">
<h1 style="flex-shrink:0">📝 笔记浏览</h1>
<div id="content" style="flex:1;display:flex;flex-direction:column">加载中...</div>
</div>
<script>
var treeEl = null;

async function init() {
  var r = await fetch('/api/kbs');
  var kbs = await r.json();
  if (!kbs.length) { document.getElementById('content').innerHTML = '<div class="empty" style="padding:40px">暂无笔记库</div>'; return; }
  var kbId = new URLSearchParams(location.search).get('kbId') || (kbs.length ? kbs[0].id : '');
  var h = '<div class="split-view">';
  h += '<div class="split-left"><div class="kb-list">' + kbs.map(function(k) {
    var active = String(k.id) === String(kbId) ? ' active' : '';
    return '<span class="kb-tag' + active + '" data-kbid="' + k.id + '" onclick="switchKb(' + k.id + ')">' + k.name + '</span>';
  }).join('') + '</div><div id="tree">加载目录...</div></div>';
  h += '<div class="split-right"><div id="file-view"><div class="preview"><div class="empty">← 从左侧选择笔记</div></div></div></div>';
  h += '</div>';
  document.getElementById('content').innerHTML = h;
  if (kbId) loadTree(kbId);
}

function switchKb(id) {
  history.replaceState(null, '', '/web/notes?kbId=' + id);
  document.querySelectorAll('.kb-tag').forEach(function(t) { t.classList.remove('active'); });
  document.querySelector('.kb-tag[data-kbid="' + id + '"]').classList.add('active');
  document.getElementById('file-view').innerHTML = '<div class="preview"><div class="empty">← 从左侧选择笔记</div></div>';
  loadTree(id);
}

async function loadTree(kbId) {
  var r = await fetch('/api/notes/tree?kbId=' + kbId);
  var items = await r.json();
  treeEl = document.getElementById('tree');
  renderTree(items, treeEl);
}

function renderTree(items, el) {
  if (!items.length) { el.innerHTML = '<div class="empty">空目录</div>'; return; }
  var ul = document.createElement('ul');
  ul.className = 'file-tree';
  items.forEach(function(item) {
    var li = document.createElement('li');
    if (item.type === 'folder') {
      li.innerHTML = '<div class="folder">📁 ' + item.name + '</div>';
      var cu = document.createElement('ul');
      cu.className = 'children';
      li.querySelector('.folder').onclick = async function() {
        var o = cu.classList.toggle('open');
        if (o && !cu.children.length) {
          var kids = await (await fetch('/api/notes/tree?dir=' + encodeURIComponent(item.path))).json();
          kids.forEach(function(k) {
            var c = document.createElement('li');
            if (k.type === 'folder') {
              c.innerHTML = '<div class="folder">📁 ' + k.name + '</div>';
            } else {
              c.innerHTML = '<div class="file" data-path="' + encodeURIComponent(k.path) + '">📄 ' + k.name + '</div>';
            }
            cu.appendChild(c);
          });
        }
      };
      li.appendChild(cu);
    } else {
      li.innerHTML = '<div class="file" data-path="' + encodeURIComponent(item.path) + '">📄 ' + item.name + '</div>';
    }
    ul.appendChild(li);
  });
  el.appendChild(ul);
  if (!el._listener) {
    el._listener = true;
    el.addEventListener('click', function(e) {
      var f = e.target.closest('.file');
      if (f && f.dataset.path) {
        document.querySelectorAll('.file-tree .file').forEach(function(n) { n.classList.remove('active'); });
        f.classList.add('active');
        openFile(f.dataset.path);
      }
    });
  }
}

async function openFile(p) {
  var d = await (await fetch('/api/notes/read?path=' + p)).json();
  var title = decodeURIComponent(p).split(/[\\\\/]/).pop();
  if (!d.ok) { document.getElementById('file-view').innerHTML = '<div class="preview"><div class="empty">' + d.error + '</div></div>'; return; }
  var html;
  if (typeof marked !== 'undefined') {
    html = marked.parse(d.content);
  } else {
    html = d.content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').split(String.fromCharCode(10)).join('<br>');
  }
  document.getElementById('file-view').innerHTML = '<div class="note-title">📄 ' + title + '</div><div class="preview">' + html + '</div>';
  if (typeof renderMathInElement === 'function') {
    renderMathInElement(document.querySelector('.preview'), { delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}] });
  }
}

var qkb = new URLSearchParams(location.search).get('kbId');
if (qkb) init(); else {
  fetch('/api/kbs').then(function(r){return r.json()}).then(function(kbs){
    if (kbs.length) location.href = '/web/notes?kbId=' + kbs[0].id;
    else init();
  });
}
<\/script>`, '/web/notes', headExtra);
}

function datacenterPage() {
  const headExtra = `
<style>
.dc-split{display:flex;flex:1;overflow:hidden}
.dc-left{width:260px;min-width:260px;background:#fafbfc;border-right:1px solid var(--border);display:flex;flex-direction:column}
.dc-left-header{padding:12px 16px;font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;border-bottom:1px solid var(--border);background:#fff}
.dc-left-body{flex:1;overflow-y:auto;padding:6px 0}
.mod-group{margin-bottom:2px}
.mod-head{display:flex;align-items:center;gap:6px;padding:7px 16px;cursor:pointer;font-size:13px;user-select:none}
.mod-head:hover{background:var(--hover)}
.mod-arrow{font-size:10px;color:var(--text-muted);width:12px;flex-shrink:0}
.mod-icon{font-size:16px;flex-shrink:0}
.mod-name{flex:1;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mod-cnt{font-size:11px;color:var(--text-muted);white-space:nowrap}
.ds-list{padding:0 0 4px 34px}
.ds-item{display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:13px;margin-bottom:1px}
.ds-item:hover{background:var(--hover)}
.ds-item.active{background:var(--primary);color:#fff}
.ds-item.active .ds-cnt{background:rgba(255,255,255,.2);color:rgba(255,255,255,.7)}
.ds-icon{font-size:14px;flex-shrink:0}
.ds-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ds-cnt{font-size:11px;background:rgba(0,0,0,.08);padding:0 6px;border-radius:8px;color:var(--text-secondary)}
.empty-hint{padding:24px;text-align:center;font-size:13px;color:var(--text-muted)}
.dc-right{flex:1;display:flex;flex-direction:column;overflow:hidden;background:#fff}
.dc-toolbar{display:flex;align-items:center;gap:8px;padding:10px 20px;border-bottom:1px solid var(--border);flex-wrap:wrap}
.dc-toolbar .search-box{position:relative;flex:1;min-width:160px;max-width:260px}
.dc-toolbar .search-box input{width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;outline:none}
.dc-toolbar .search-box input:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(99,102,241,.1)}
.record-area{flex:1;overflow-y:auto}
.dc-table{width:100%;border-collapse:collapse;font-size:13px}
.dc-table th{text-align:left;padding:10px 14px;background:#f8fafc;border-bottom:2px solid var(--border);font-weight:600;color:var(--text-secondary);position:sticky;top:0;z-index:1}
.dc-table td{padding:10px 14px;border-bottom:1px solid var(--border)}
.dc-table tr:hover{background:var(--hover)}
.empty-right{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text-muted)}
.empty-right .eicon{font-size:40px;margin-bottom:8px;opacity:.4}
.empty-right .etitle{font-size:14px;margin-bottom:12px}
.action-cell{white-space:nowrap}
.action-btn{background:none;border:none;cursor:pointer;font-size:12px;color:var(--text-muted);padding:2px 6px}
.action-btn:hover{color:var(--primary)}
.action-btn.danger:hover{color:var(--danger)}
.detail-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)}
.detail-row:last-child{border-bottom:none}
.detail-row .dl{font-size:13px;color:var(--text-secondary);font-weight:500}
.detail-row .dv{font-size:13px;color:var(--text-primary)}
.modal{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.4);z-index:100;justify-content:center;align-items:center}
.modal.show{display:flex}.modal-box{background:#fff;border-radius:10px;padding:20px;width:480px;max-width:90%;max-height:90vh;overflow-y:auto}
.modal-box h3{margin:0 0 16px;font-size:15px}.modal-box label{display:block;font-size:12px;font-weight:500;color:var(--text-secondary);margin-bottom:4px}
.modal-box input,.modal-box textarea,.modal-box select{width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;margin-bottom:12px;outline:none;font-family:inherit;box-sizing:border-box}
.modal-box input:focus,.modal-box textarea:focus,.modal-box select:focus{border-color:var(--primary)}
.modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}
.dc-top-bar{display:flex;align-items:center;gap:12px;padding:12px 20px;background:#fff;border-bottom:1px solid var(--border)}
.dc-top-bar h1{margin:0;font-size:16px;font-weight:600}
.dc-top-bar .mla{margin-left:auto}
</style>`;
  return pageLayout('数据中心', `
<div class="dc-split" style="flex:1">
  <div class="dc-left">
    <div class="dc-left-header">模块列表</div>
    <div class="dc-left-body" id="leftBody"></div>
  </div>
  <div class="dc-right">
    <div class="dc-top-bar">
      <h1>🗂️ 数据中心</h1>
      <button class="btn btn-primary btn-sm mla" onclick="showModuleModal()">+ 新建模块</button>
    </div>
    <div id="rightContent" style="flex:1;display:flex;flex-direction:column;overflow:hidden"></div>
  </div>
</div>

<div id="moduleModal" class="modal"><div class="modal-box">
<h3 id="moduleModalTitle">新建模块</h3>
<label>名称</label><input id="modName">
<label>描述</label><input id="modDesc">
<label>图标</label><input id="modIcon" value="📁">
<div class="modal-actions"><button class="btn btn-secondary" onclick="closeModuleModal()">取消</button><button class="btn btn-primary" onclick="saveModule()">保存</button></div>
</div></div>

<div id="dsModal" class="modal"><div class="modal-box">
<h3 id="dsModalTitle">新建数据集</h3>
<label>名称</label><input id="dsName">
<label>描述</label><textarea id="dsDesc" rows="2"></textarea>
<label>类型</label><input id="dsType">
<label>字段（每行一个）</label><textarea id="dsSchema" rows="3"></textarea>
<label>类型选项（每行一个）</label><textarea id="dsTypeOptions" rows="2" placeholder="需求\nBug\n优化"></textarea>
<label>状态选项（每行一个）</label><textarea id="dsStatusOptions" rows="2" placeholder="待办\n进行中\n已完成"></textarea>
<div class="modal-actions"><button class="btn btn-secondary" onclick="closeDsModal()">取消</button><button class="btn btn-primary" onclick="saveDataset()">保存</button></div>
</div></div>

<div id="recModal" class="modal"><div class="modal-box">
<h3 id="recModalTitle">记录</h3>
<div id="recForm"></div>
<div class="modal-actions"><button class="btn btn-secondary" onclick="closeRecModal()">取消</button><button class="btn btn-primary" onclick="saveRecord()">保存</button></div>
</div></div>

<div id="detailModal" class="modal"><div class="modal-box">
<h3>记录详情</h3>
<div id="detailBody"></div>
<div class="modal-actions" id="detailActions"></div>
</div></div>
<script>
let state={allModules:[],allDs:{},currentDs:null,currentRecId:null,recFields:[],recStatusOpts:['待办','进行中','已完成'],expanded:{},lastId:null}
function ls(k,v){if(v!==undefined){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}else{try{return JSON.parse(localStorage.getItem(k))}catch{}return null}}
async function loadLeft(){
  const mr=await fetch('/api/modules');state.allModules=await mr.json()
  const dr=await fetch('/api/datasets');const dsList=await dr.json()
  state.allDs={};dsList.forEach(d=>{state.allDs[d.dataset_id]=d})
  let h=''
  state.allModules.forEach(m=>{
    const mDs=dsList.filter(d=>d.module_id===m.module_id)
    const key=m.module_id||m.id
    if(state.expanded[key]===undefined) state.expanded[key]=true
    const open=state.expanded[key]
    h+='<div class="mod-group">'
    h+='<div class="mod-head" onclick="toggleMod(\\''+key+'\\')"><span class="mod-arrow">'+(open?'▾':'▸')+'</span><span class="mod-icon">'+(m.icon||'📁')+'</span><span class="mod-name">'+m.name+'</span><span class="mod-cnt">'+mDs.length+' 数据集</span></div>'
    if(open){
      h+='<div class="ds-list">'
      if(mDs.length){
        mDs.forEach(d=>{
          const did=d.dataset_id
          const active=state.currentDs&&state.currentDs.dataset_id===did?' active':''
          h+='<div class="ds-item'+active+'" onclick="selectDs(\\''+did+'\\')"><span class="ds-icon">📋</span><span class="ds-name">'+d.name+'</span><span class="ds-cnt">'+(d.recordCount||0)+'</span></div>'
        })
      }
      h+='</div>'
    }
    h+='</div>'
  })
  if(!state.allModules.length) h='<div class="empty-hint">暂无模块，点击右上角创建</div>'
  document.getElementById('leftBody').innerHTML=h
  if(state.lastId&&!state.currentDs){
    const found=dsList.find(d=>d.dataset_id===state.lastId)
    if(found) selectDs(state.lastId)
  }
}
function toggleMod(key){state.expanded[key]=!state.expanded[key];renderAll()}
async function renderAll(){await loadLeft();renderRight()}
function renderRight(){
  const el=document.getElementById('rightContent')
  if(!state.currentDs){el.innerHTML='<div class="empty-right"><div class="eicon">📋</div><div class="etitle">从左侧选择一个数据集</div></div>';return}
  const ds=state.currentDs
  let h='<div class="dc-toolbar">'
  h+='<div class="search-box"><input id="searchInput" placeholder="搜索记录..." onkeyup="if(event.key===\\'Enter\\')loadRecs()"></div>'
  h+='<button class="btn btn-sm btn-secondary" onclick="loadRecs()">搜索</button>'
  h+='<button class="btn btn-sm btn-primary" onclick="showRecModal()">+ 新增</button>'
  h+='<button class="btn btn-sm btn-secondary" onclick="showDsModal(\\''+ds.dataset_id+'\\')">✏️ 编辑</button>'
  h+='<button class="btn btn-sm btn-danger" onclick="deleteDs(\\''+ds.dataset_id+'\\')">🗑️ 删除</button>'
  h+='</div><div class="record-area" id="recordArea"><div class="empty-right"><div class="eicon">⏳</div><div class="etitle">加载中...</div></div></div>'
  el.innerHTML=h
  loadRecs()
}
async function loadRecs(){
  const el=document.getElementById('recordArea');if(!el||!state.currentDs)return
  const kw=document.getElementById('searchInput')?document.getElementById('searchInput').value:''
  try{
    const r=await fetch('/api/datasets/'+state.currentDs.dataset_id+'/records'+(kw?'?search='+encodeURIComponent(kw):''));const data=await r.json()
    if(!data.records||!data.records.length){el.innerHTML='<div class="empty-right"><div class="eicon">📝</div><div class="etitle">暂无记录</div><button class="btn btn-primary btn-sm" onclick="showRecModal()">+ 新增记录</button></div>';return}
    const cols=Object.keys(data.records[0]).filter(k=>k!=='id'&&k!=='_created_at'&&!k.startsWith('_')).slice(0,8)
    let h='<table class="dc-table"><thead><tr><th>状态</th>'+cols.map(c=>'<th>'+c+'</th>').join('')+'<th>操作</th></tr></thead><tbody>'
    data.records.forEach((rec,i)=>{
      h+='<tr><td><span class="badge badge-gray">'+(rec.status||'无')+'</span></td>'
      cols.forEach(c=>h+='<td>'+(rec[c]||'')+'</td>')
      h+='<td class="action-cell"><button class="action-btn" onclick="viewRec(\\''+rec.id+'\\',\\''+encodeURIComponent(JSON.stringify(rec))+'\\')">👁️</button> <button class="action-btn" onclick="editRec(\\''+rec.id+'\\',\\''+encodeURIComponent(JSON.stringify(rec))+'\\')">✏️</button> <button class="action-btn danger" onclick="deleteRec(\\''+rec.id+'\\')">🗑️</button></td></tr>'
    })
    h+='</tbody></table>'
    el.innerHTML=h
  }catch(e){el.innerHTML='<div class="empty-right"><div class="etitle">加载失败</div></div>'}
}
function getStatusOpts(ds){
  if(!ds) return ['待办','进行中','已完成']
  const schema=typeof ds.schema==='string'?JSON.parse(ds.schema):(ds.schema||{})
  const opts=schema.statusOptions
  return Array.isArray(opts)&&opts.length?opts:['待办','进行中','已完成']
}
function selectDs(id){
  const ds=state.allDs[id];if(!ds)return
  state.currentDs=ds;state.lastId=id;ls('webLastDatasetId',id)
  renderRight();loadLeft()
}
async function showModuleModal(id){
  const m=id?state.allModules.find(x=>x.module_id===id):null
  document.getElementById('moduleModalTitle').textContent=m?'编辑模块':'新建模块'
  document.getElementById('modName').value=m?m.name:''
  document.getElementById('modDesc').value=m?m.description||'':''
  document.getElementById('modIcon').value=m?m.icon||'📁':'📁'
  document.getElementById('moduleModal').dataset.id=id||''
  document.getElementById('moduleModal').classList.add('show')
}
function closeModuleModal(){document.getElementById('moduleModal').classList.remove('show')}
async function saveModule(){
  const id=document.getElementById('moduleModal').dataset.id
  const body={name:document.getElementById('modName').value,description:document.getElementById('modDesc').value,icon:document.getElementById('modIcon').value}
  if(id){await fetch('/api/modules/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}
  else{await fetch('/api/modules',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}
  closeModuleModal();renderAll()
}
async function deleteModule(id){if(!confirm('确定删除？'))return;await fetch('/api/modules/'+id,{method:'DELETE'});state.currentDs=null;renderAll()}
async function showDsModal(id){
  const ds=id?state.allDs[id]:null
  document.getElementById('dsModalTitle').textContent=ds?'编辑数据集':'新建数据集'
  document.getElementById('dsName').value=ds?ds.name:''
  document.getElementById('dsDesc').value=ds?ds.description||'':''
  document.getElementById('dsType').value=ds?ds.type||'':''
  document.getElementById('dsSchema').value=ds?(ds.schema&&ds.schema.fields?ds.schema.fields.map(f=>f.name).join('\\n'):''):''
  document.getElementById('dsTypeOptions').value=ds?(ds.schema&&ds.schema.typeOptions?ds.schema.typeOptions.join('\\n'):''):''
  document.getElementById('dsStatusOptions').value=ds?(ds.schema&&ds.schema.statusOptions?ds.schema.statusOptions.join('\\n'):''):''
  document.getElementById('dsModal').dataset.id=id||''
  document.getElementById('dsModal').classList.add('show')
}
function closeDsModal(){document.getElementById('dsModal').classList.remove('show')}
async function saveDataset(){
  const id=document.getElementById('dsModal').dataset.id
  const fields=document.getElementById('dsSchema').value.split('\\n').filter(s=>s.trim()).map(s=>({name:s.trim(),type:'text'}))
  const typeOptions=document.getElementById('dsTypeOptions').value.split('\\n').filter(s=>s.trim())
  const statusOptions=document.getElementById('dsStatusOptions').value.split('\\n').filter(s=>s.trim())
  const modId=state.currentDs?state.currentDs.module_id:(state.allModules.length?state.allModules[0].module_id:'')
  const body={name:document.getElementById('dsName').value,description:document.getElementById('dsDesc').value,type:document.getElementById('dsType').value,schemaJson:JSON.stringify({fields,typeOptions,statusOptions}),module_id:modId}
  if(id){await fetch('/api/datasets/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}
  else{await fetch('/api/datasets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}
  closeDsModal();renderAll()
}
async function deleteDs(id){
  if(!confirm('确定删除？'))return;await fetch('/api/datasets/'+id,{method:'DELETE'})
  state.currentDs=null;renderAll()
}
function getTypeOpts(ds){
  if(!ds) return []
  const schema=typeof ds.schema==='string'?JSON.parse(ds.schema):(ds.schema||{})
  const opts=schema.typeOptions
  return Array.isArray(opts)&&opts.length?opts:[]
}
function showRecModal(){
  if(!state.currentDs)return;state.currentRecId=null
  const ds=state.currentDs;const schema=(ds.schema&&ds.schema.fields)||[]
  state.recFields=schema.map(f=>f.name).filter(f=>f!=='status'&&f!=='id'&&f!=='type'&&f!=='类型')
  state.recStatusOpts=getStatusOpts(ds)
  const tOpts=getTypeOpts(ds)
  let h='';state.recFields.forEach(f=>{h+='<label>'+f+'</label><input id="rf_'+f+'">'})
  h+='<label>状态</label><select id="rf_status">'+state.recStatusOpts.map(o=>'<option value="'+o+'">'+o+'</option>').join('')+'</select>'
  if(tOpts.length){h+='<label>类型</label><select id="rf_type">'+tOpts.map(o=>'<option value="'+o+'">'+o+'</option>').join('')+'</select>'}
  document.getElementById('recForm').innerHTML=h;document.getElementById('recModal').classList.add('show')
}
function editRec(id,recStr){
  const rec=JSON.parse(decodeURIComponent(recStr));state.currentRecId=id
  const ds=state.currentDs;if(!ds)return
  const schema=(ds.schema&&ds.schema.fields)||[]
  state.recFields=schema.map(f=>f.name).filter(f=>f!=='status'&&f!=='id'&&f!=='type'&&f!=='类型')
  state.recStatusOpts=getStatusOpts(ds)
  const tOpts=getTypeOpts(ds)
  let h='';state.recFields.forEach(f=>{h+='<label>'+f+'</label><input id="rf_'+f+'" value="'+(rec[f]||'')+'">'})
  h+='<label>状态</label><select id="rf_status">'+state.recStatusOpts.map(o=>'<option value="'+o+'"'+(rec.status===o?' selected':'')+'>'+o+'</option>').join('')+'</select>'
  if(tOpts.length){h+='<label>类型</label><select id="rf_type">'+tOpts.map(o=>'<option value="'+o+'"'+(rec.type===o?' selected':'')+'>'+o+'</option>').join('')+'</select>'}
  document.getElementById('recForm').innerHTML=h;document.getElementById('recModal').classList.add('show')
}
function closeRecModal(){document.getElementById('recModal').classList.remove('show')}
async function saveRecord(){
  if(!state.currentDs)return
  const record={};state.recFields.forEach(f=>{record[f]=document.getElementById('rf_'+f).value})
  record.status=document.getElementById('rf_status').value
  const rfType=document.getElementById('rf_type');if(rfType) record.type=rfType.value
  if(state.currentRecId){await fetch('/api/records/'+state.currentRecId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(record)})}
  else{await fetch('/api/datasets/'+state.currentDs.dataset_id+'/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(record)})}
  closeRecModal();loadRecs();loadLeft()
}
async function deleteRec(id){
  if(!confirm('确定删除？'))return;await fetch('/api/records/'+id,{method:'DELETE'});loadRecs();loadLeft()
}
function viewRec(id,recStr){
  const rec=JSON.parse(decodeURIComponent(recStr))
  const cols=Object.keys(rec).filter(k=>k!=='id'&&k!=='_created_at'&&!k.startsWith('_'))
  let h='<div class="detail-row"><span class="dl">状态</span><span class="dv"><span class="badge badge-gray">'+(rec.status||'无')+'</span></span></div>'
  cols.forEach(c=>{h+='<div class="detail-row"><span class="dl">'+c+'</span><span class="dv">'+(rec[c]||'')+'</span></div>'})
  document.getElementById('detailBody').innerHTML=h
  document.getElementById('detailActions').innerHTML='<button class="btn btn-danger" onclick="closeDetail();deleteRec(\\''+rec.id+'\\')">🗑️ 删除</button><button class="btn btn-primary" onclick="closeDetail();editRec(\\''+rec.id+'\\',\\''+recStr+'\\')">✏️ 编辑</button><button class="btn btn-secondary" onclick="closeDetail()">关闭</button>'
  document.getElementById('detailModal').classList.add('show')
}
function closeDetail(){document.getElementById('detailModal').classList.remove('show')}
async function init(){
  state.lastId=ls('webLastDatasetId')
  await loadLeft()
  if(!state.currentDs&&state.lastId&&state.allDs[state.lastId]) selectDs(state.lastId)
}
init()
<\/script>`, '/web/datacenter', headExtra);
}

function plannerPage() {
  return pageLayout('待办', `
<div class="page">
<h1>✅ 待办</h1>
<div id="content">加载中...</div>
</div>
<script>
async function loadTodos(){try{const r=await(await fetch('/api/todos')).json()
let h='<div class="card"><div class="flex" style="justify-content:space-between;margin-bottom:12px"><h2 style="margin:0">待办列表</h2><button class="btn btn-primary btn-sm" onclick="showAdd()">+ 新建</button></div>'
if(r.length){h+='<table><thead><tr><th>标题</th><th>优先级</th><th>截止</th><th>状态</th><th>操作</th></tr></thead><tbody>'+r.map(t=>'<tr><td>'+t.title+'</td><td>'+['低','中','高'][{low:0,mid:1,high:2}[t.priority]||1]+'</td><td>'+(t.due_date||'-')+'</td><td><span class="badge badge-gray">'+(t.status==='done'?'已完成':t.status==='in_progress'?'进行中':'待办')+'</span></td><td><button class="btn btn-sm btn-secondary" onclick="toggleTodo('+t.id+')">'+(t.status==='done'?' reopen':'完成')+'</button> <button class="btn btn-sm btn-danger" onclick="delTodo('+t.id+')">删除</button></td></tr>').join('')+'</tbody></table>'}else{h+='<div class="empty">暂无待办</div>'}
h+='</div>';document.getElementById('content').innerHTML=h}catch(e){document.getElementById('content').innerHTML='<div class="card"><div class="empty">加载失败</div></div>'}}
async function toggleTodo(id){try{const r=await(await fetch('/api/todos/'+id)).json();await fetch('/api/todos/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:r.status==='done'?'pending':'done'})});loadTodos()}catch{}}
async function delTodo(id){if(!confirm('确定删除？'))return;await fetch('/api/todos/'+id,{method:'DELETE'});loadTodos()}
function showAdd(){document.getElementById('content').innerHTML='<div class="card"><h2>新建待办</h2><input id="tdTitle" placeholder="标题"><input id="tdDue" type="date" placeholder="截止日期"><select id="tdPri"><option value="low">低优先级</option><option value="mid" selected>中优先级</option><option value="high">高优先级</option></select><div class="flex"><button class="btn btn-primary" onclick="saveAdd()">保存</button><button class="btn btn-secondary" onclick="loadTodos()">取消</button></div></div>'}
async function saveAdd(){const title=document.getElementById('tdTitle').value;if(!title)return alert('请输入标题');await fetch('/api/todos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,due_date:document.getElementById('tdDue').value,priority:document.getElementById('tdPri').value})});loadTodos()}
loadTodos()
</script>`, '/web/planner');
}

function reportsPage() {
  return pageLayout('综合日报', `
<div class="page">
<h1>📊 综合日报</h1>
<div id="latest-report"></div>
<div id="report-list"></div>
</div>
<script>
var allReports = [];

function renderMarkdown(t) {
  if (!t) return "";
  var lines = t.split(String.fromCharCode(10));
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/^> /.test(line)) {
      var cnt = line.slice(2).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\\*\\*(.+?)\\*\\*/g,"<strong>$1</strong>").replace(/\`(.+?)\`/g,"<code>$1</code>").replace(/\[(.+?)\]\((.+?)\)/g,'<a href="$2">$1</a>');
      out.push('<blockquote style="border-left:3px solid var(--primary);padding:6px 12px;margin:8px 0;background:var(--hover);border-radius:4px;color:var(--text-secondary)">' + cnt + "</blockquote>"); continue;
    }
    if (/^\\|/.test(line)) {
      var trows = [line];
      while (i + 1 < lines.length && /^\\|/.test(lines[i + 1])) { i++; trows.push(lines[i]); }
      var thtml = "";
      if (trows.length > 1 && /^\\|[-:| ]+\\|$/.test(trows[1])) {
        thtml += "<thead><tr>";
        var hcells = trows[0].split("|").filter(function(c){return c.trim()!=="";});
        for (var ti = 0; ti < hcells.length; ti++) {
          thtml += "<th style=\\"padding:6px 10px;border:1px solid var(--border);background:var(--hover);font-weight:600;text-align:left;font-size:13px\\">" + hcells[ti].trim().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") + "</th>";
        }
        thtml += "</tr></thead><tbody>";
        for (var tj = 2; tj < trows.length; tj++) {
          var dcells = trows[tj].split("|").filter(function(c){return c.trim()!=="";});
          thtml += "<tr>";
          for (var tk = 0; tk < dcells.length; tk++) {
            thtml += "<td style=\\"padding:6px 10px;border:1px solid var(--border);font-size:13px\\">" + dcells[tk].trim().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") + "</td>";
          }
          thtml += "</tr>";
        }
        thtml += "</tbody>";
      } else {
        thtml += "<tbody>";
        for (var tj = 0; tj < trows.length; tj++) {
          var dcells = trows[tj].split("|").filter(function(c){return c.trim()!=="";});
          thtml += "<tr>";
          for (var tk = 0; tk < dcells.length; tk++) {
            thtml += "<td style=\\"padding:6px 10px;border:1px solid var(--border);font-size:13px\\">" + dcells[tk].trim().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") + "</td>";
          }
          thtml += "</tr>";
        }
        thtml += "</tbody>";
      }
      out.push("<table style=\\"width:100%;border-collapse:collapse;margin:8px 0\\">" + thtml + "</table>");
      continue;
    }
    var esc = line.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\\*\\*(.+?)\\*\\*/g,"<strong>$1</strong>").replace(/\`(.+?)\`/g,"<code>$1</code>").replace(/\[(.+?)\]\((.+?)\)/g,'<a href="$2">$1</a>');
    if (/^### /.test(line)) { out.push("<h3>" + esc.slice(4) + "</h3>"); continue; }
    if (/^## /.test(line)) { out.push('<h2 style="font-size:16px;margin:12px 0 6px">' + esc.slice(3) + "</h2>"); continue; }
    if (/^# /.test(line)) { out.push('<h1 style="font-size:18px;margin:16px 0 8px">' + esc.slice(2) + "</h1>"); continue; }
    if (/^---$/.test(line)) { out.push("<hr>"); continue; }
    if (/^\u2600/.test(line)) { out.push('<div style="font-size:20px;font-weight:700;margin:16px 0 8px">' + esc + "</div>"); continue; }
    if (/^\uD83D\uDCC5 /.test(line)) { out.push('<div style="font-size:14px;color:var(--text-secondary);margin-bottom:16px">' + esc + "</div>"); continue; }
    if (/^[\u2705\u2705]/.test(line)) { out.push('<div style="font-size:15px;font-weight:600;margin:12px 0 6px;color:#16a34a">' + esc + "</div>"); continue; }
    if (/^\u26A0/.test(line)) { out.push('<div style="font-size:15px;font-weight:600;margin:12px 0 6px;color:var(--danger)">' + esc + "</div>"); continue; }
    if (/^[\uD83D\uDCCB\uD83D\uDCDD\uD83D\uDCCA\uD83D\uDCAC\uD83D\uDCC4\uD83D\uDCC2\uD83D\uDEE0]/.test(line)) { out.push('<div style="font-size:15px;font-weight:600;margin:12px 0 6px">' + esc + "</div>"); continue; }
    if (/^\uD83C\uDF05/.test(line)) { out.push('<div style="font-size:14px;color:var(--primary);margin:8px 0">' + esc + "</div>"); continue; }
    if (/^\uD83C\uDF24/.test(line)) { out.push('<div style="font-size:14px;color:var(--primary);margin:8px 0">' + esc + "</div>"); continue; }
    if (/^\uD83C\uDF07/.test(line)) { out.push('<div style="font-size:14px;color:var(--primary);margin:8px 0">' + esc + "</div>"); continue; }
    if (/^\uD83C\uDF19/.test(line)) { out.push('<div style="font-size:14px;color:var(--primary);margin:8px 0">' + esc + "</div>"); continue; }
    if (/^\uD83D\uDCA1 /.test(line)) { out.push('<div style="font-size:13px;color:var(--text-muted);margin-top:8px">' + esc + "</div>"); continue; }
    if (/^  - \uD83D\uDD34 /.test(line)) { out.push('<div style="padding:2px 0 2px 16px;color:var(--danger)">' + esc.slice(6) + "</div>"); continue; }
    if (/^  - /.test(line)) { out.push('<div style="padding:2px 0 2px 16px">' + esc.slice(4) + "</div>"); continue; }
    if (line === "") { out.push("<br>"); continue; }
    out.push("<div>" + esc + "</div>");
  }
  return out.join(String.fromCharCode(10));
}

async function loadReports() {
  try {
    var r = await (await fetch("/api/reports")).json();
    allReports = r;
    renderLatest();
    renderList();
  } catch(e) {
    document.getElementById("latest-report").innerHTML = '<div class="card"><div class="empty">加载失败</div></div>';
  }
}

function renderLatest() {
  var el = document.getElementById("latest-report");
  if (!allReports.length) { el.innerHTML = ""; return; }
  var latest = allReports[0];
  el.innerHTML = '<div class="card"><h2 style="font-size:16px;font-weight:600;margin:0 0 4px 0">\uD83D\uDCCA ' + (latest.report_date || "最新日报") + '</h2><div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">' + (latest.created_at || "") + '</div><div style="line-height:1.8;font-size:14px">' + renderMarkdown(latest.content || "") + '</div></div>';
}

function renderList() {
  var el = document.getElementById("report-list");
  if (!allReports.length) {
    el.innerHTML = '<div class="card"><div class="empty">暂无日报</div><div style="font-size:13px;color:var(--text-muted);margin-top:4px;text-align:center">每日 9:56 自动生成综合日报</div></div>';
    return;
  }
  var h = '<div class="card"><h2 style="font-size:16px;font-weight:600;margin:0 0 12px 0">\uD83D\uDCCB 历史日报</h2><div style="display:flex;flex-direction:column;gap:6px">';
  for (var i = 0; i < allReports.length; i++) {
    var x = allReports[i];
    var isActive = i === 0;
    h += '<div style="padding:12px 14px;border:1px solid ' + (isActive ? "var(--primary)" : "var(--border)") + ';border-radius:6px;cursor:pointer;transition:all 0.15s" onclick="switchReport(' + i + ')" onmouseover="this.style.borderColor=\\"var(--primary)\\"" onmouseout="this.style.borderColor=\\"' + (isActive ? "var(--primary)" : "var(--border)") + '\\"">';
    h += '<div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:14px;font-weight:600;color:var(--primary)">' + (x.report_date || "日报") + '</span><span style="font-size:12px;color:var(--text-muted)">' + (x.created_at || "") + '</span></div>';
    h += '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;line-height:1.4">' + (x.summary || "").slice(0, 100) + '</div></div>';
  }
  h += '</div></div>';
  el.innerHTML = h;
}

function switchReport(index) {
  var report = allReports[index];
  var el = document.getElementById("latest-report");
  el.innerHTML = '<div class="card"><h2 style="font-size:16px;font-weight:600;margin:0 0 4px 0">\uD83D\uDCCA ' + (report.report_date || "日报") + '</h2><div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">' + (report.created_at || "") + '</div><div style="line-height:1.8;font-size:14px">' + renderMarkdown(report.content || "") + '</div></div>';
  renderList();
}

loadReports();
<\/script>`, '/web/reports');
}

function quicknotePage() {
  return pageLayout('随手记', `
<div class="page">
<h1>✏️ 随手记</h1>
<div id="content">加载中...</div>
</div>
<script>
async function init(){try{const kbs=await(await fetch('/api/kbs')).json()
let h='<div class="card"><h2>选择笔记库</h2>'
kbs.forEach(k=>{h+='<label style="display:flex;align-items:center;gap:8px;padding:8px 0;cursor:pointer"><input type="radio" name="kb" value="'+k.id+'" '+(kbs.length===1?'checked':'')+'><span>'+k.name+'</span></label>'})
h+='</div><div class="card"><h2>记录内容</h2><input id="noteTitle" placeholder="标题（可选，留空自动生成）"><textarea id="noteContent" placeholder="写点什么..." rows="8"></textarea><div class="flex"><button class="btn btn-primary" onclick="saveNote()">保存</button></div></div><div id="result"></div>'
document.getElementById('content').innerHTML=h}catch(e){document.getElementById('content').innerHTML='<div class="card"><div class="empty">加载失败</div></div>'}}
async function saveNote(){const kb=document.querySelector('input[name="kb"]:checked');if(!kb)return alert('请选择笔记库')
const title=document.getElementById('noteTitle').value.trim()||'随手记_'+new Date().toISOString().slice(0,10)
const content=document.getElementById('noteContent').value;if(!content)return alert('请输入内容')
try{const r=await(await fetch('/api/notes/write',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:parseInt(kb.value),title,content})})).json()
if(r.ok){document.getElementById('result').innerHTML='<div class="card" style="background:#f0fdf4;border:1px solid #bbf7d0"><span style="color:#16a34a">✅ 已保存</span><div class="preview" style="margin-top:8px;font-size:12px">'+r.path+'</div></div>';document.getElementById('noteContent').value=''}else{document.getElementById('result').innerHTML='<div class="card" style="background:#fef2f2;border:1px solid #fecaca"><span style="color:#dc2626">❌ 保存失败: '+r.error+'</span></div>'}
}catch(e){alert('保存失败: '+e.message)}}
init()
</script>`, '/web/quicknote');
}

function statusPage() {
  let f = false, s = false, i = false;
  try { const x = require('./feishu'); f = x.isRunning(); } catch {}
  try { const x = require('./scheduler'); s = x.isRunning(); } catch {}
  try { const x = require('./indexer'); i = x.isRunning(); } catch {}
  return pageLayout('服务状态', `
<div class="page">
<h1>⚡ 服务状态</h1>
<div class="card"><table><thead><tr><th>服务</th><th>状态</th></tr></thead><tbody>
<tr><td>飞书机器人</td><td><span class="status-dot ${f?'on':'off'}"></span>${f?'运行中':'已停止'}</td></tr>
<tr><td>定时任务</td><td><span class="status-dot ${s?'on':'off'}"></span>${s?'运行中':'已停止'}</td></tr>
<tr><td>索引器</td><td><span class="status-dot ${i?'on':'off'}"></span>${i?'运行中':'已停止'}</td></tr>
<tr><td>HTTP 服务</td><td><span class="status-dot on"></span>运行中 :${serverPort}</td></tr>
</tbody></table></div>
</div>`, '/web/status');
}

// ─── Helpers ───

function decodeBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
  });
}

// ─── Router ───

async function handleRequest(req, res) {
  const { pathname, params } = parseUrl(req.url);

  // Remote admin pages
  if (pathname === '/web' || pathname === '/web/') return html(res, remoteIndex());
  if (pathname === '/web/notes') return html(res, notesPage());
  if (pathname === '/web/datacenter') return html(res, datacenterPage());
  if (pathname === '/web/planner') return html(res, plannerPage());
  if (pathname === '/web/reports') return html(res, reportsPage());
  if (pathname === '/web/quicknote') return html(res, quicknotePage());
  if (pathname === '/web/status') return html(res, statusPage());

  // API endpoints
  if (pathname === '/api/kbs') {
    return json(res, dbRef.project.list('note').map(p => ({ id: p.id, name: p.name, path: p.dir || '' })));
  }
  if (pathname === '/api/notes/tree') {
    const dirPath = params.dir || getKbPath(params.kbId);
    if (!dirPath) return json(res, { error: '笔记库不存在' }, 404);
    return json(res, listDir(dirPath));
  }
  if (pathname === '/api/notes/read') {
    if (!params.path || !fs.existsSync(params.path)) return json(res, { error: '文件不存在' }, 404);
    try { return json(res, { ok: true, content: fs.readFileSync(params.path, 'utf-8') }); }
    catch (e) { return json(res, { error: e.message }, 500); }
  }
  if (pathname === '/api/tasks' && req.method === 'GET') {
    try { return json(res, dbRef.task.list()); } catch { return json(res, []); }
  }
  if (pathname === '/api/tasks' && req.method === 'POST') {
    try { const body = JSON.parse(await decodeBody(req)); const r = dbRef.task.add(body.name, body.cron_expression, body.task_type, body); return json(res, r); } catch (e) { return json(res, { error: e.message }, 400); }
  }
  const taskMatch = pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch && req.method === 'PUT') {
    try { const body = JSON.parse(await decodeBody(req)); dbRef.task.update(parseInt(taskMatch[1]), body); return json(res, { ok: true }); } catch (e) { return json(res, { error: e.message }, 400); }
  }
  if (taskMatch && req.method === 'DELETE') {
    try { dbRef.task.remove(parseInt(taskMatch[1])); try { require('./scheduler').removeTask(parseInt(taskMatch[1])); } catch {} return json(res, { ok: true }); } catch (e) { return json(res, { error: e.message }, 400); }
  }
  if (pathname === '/api/reminders' && req.method === 'GET') {
    try { return json(res, dbRef.reminder.list()); } catch { return json(res, []); }
  }
  if (pathname === '/api/reminders' && req.method === 'POST') {
    try { const body = JSON.parse(await decodeBody(req)); const r = dbRef.reminder.add(body); return json(res, r); } catch (e) { return json(res, { error: e.message }, 400); }
  }
  const remMatch = pathname.match(/^\/api\/reminders\/(.+)$/);
  if (remMatch && req.method === 'PUT') {
    try { const body = JSON.parse(await decodeBody(req)); dbRef.reminder.update(remMatch[1], body); return json(res, { ok: true }); } catch (e) { return json(res, { error: e.message }, 400); }
  }
  if (remMatch && req.method === 'DELETE') {
    try { dbRef.reminder.remove(remMatch[1]); try { require('./scheduler').removeReminder(remMatch[1]); } catch {} return json(res, { ok: true }); } catch (e) { return json(res, { error: e.message }, 400); }
  }
  if (pathname === '/api/reports') {
    try { return json(res, dbRef.q("SELECT id, type, report_date, content, substr(content, 1, 200) as summary, created_at FROM ai_analysis WHERE type = 'daily_report' ORDER BY created_at DESC LIMIT 30")); } catch { return json(res, []); }
  }
  if (pathname === '/api/reports/detail' && params.id) {
    try { return json(res, dbRef.qOne('SELECT * FROM ai_analysis WHERE id = ?', parseInt(params.id))); } catch { return json(res, null); }
  }
  if (pathname === '/api/todos' && req.method === 'GET') {
    try { return json(res, dbRef.todo.list()); } catch { return json(res, []); }
  }
  if (pathname === '/api/todos' && req.method === 'POST') {
    try { const body = JSON.parse(await decodeBody(req)); return json(res, dbRef.todo.add(body)); } catch (e) { return json(res, { error: e.message }, 400); }
  }
  const todoMatch = pathname.match(/^\/api\/todos\/(\d+)$/);
  if (todoMatch && req.method === 'PUT') {
    try { const body = JSON.parse(await decodeBody(req)); dbRef.todo.update(parseInt(todoMatch[1]), body); return json(res, { ok: true }); } catch (e) { return json(res, { error: e.message }, 400); }
  }
  if (todoMatch && req.method === 'DELETE') {
    try { dbRef.todo.remove(parseInt(todoMatch[1])); return json(res, { ok: true }); } catch (e) { return json(res, { error: e.message }, 400); }
  }
  if (pathname === '/api/notes/write' && req.method === 'POST') {
    try { const body = JSON.parse(await decodeBody(req)); const projectId = body.project_id; const content = body.content; const title = body.title || '随手记_' + Date.now();
      const project = dbRef.project.get(projectId); if (!project) return json(res, { error: '笔记库不存在' }, 404);
      const projectDir = project.dir; if (!projectDir || !fs.existsSync(projectDir)) return json(res, { error: '笔记库路径不存在' }, 404);
      const filePath = path.join(projectDir, title + '.md');
      fs.writeFileSync(filePath, content, 'utf-8');
      return json(res, { ok: true, path: filePath });
    } catch (e) { return json(res, { error: e.message }, 500); }
  }
  if (pathname === '/api/status') {
    let s = false, i = false, f = false;
    try { s = require('./scheduler').isRunning(); } catch {}
    try { i = require('./indexer').isRunning(); } catch {}
    try { f = require('./feishu').isRunning(); } catch {}
    return json(res, { httpserver: true, feishu: f, scheduler: s, indexer: i, version: '0.1.0', port: serverPort });
  }

  // Module CRUD
  if (pathname === '/api/modules' && req.method === 'GET') {
    return json(res, dbRef.dm.list());
  }
  if (pathname === '/api/modules' && req.method === 'POST') {
    const body = JSON.parse(await decodeBody(req));
    return json(res, dbRef.dm.add(body.name, body.description, body.icon));
  }
  if (pathname.startsWith('/api/modules/') && req.method === 'PUT') {
    const id = pathname.split('/')[3];
    const body = JSON.parse(await decodeBody(req));
    dbRef.dm.update(id, body);
    return json(res, { ok: true });
  }
  if (pathname.startsWith('/api/modules/') && req.method === 'DELETE') {
    dbRef.dm.remove(pathname.split('/')[3]);
    return json(res, { ok: true });
  }

  // Dataset CRUD
  if (pathname === '/api/datasets' && req.method === 'GET') {
    return json(res, dbRef.ds.list());
  }
  if (pathname === '/api/datasets' && req.method === 'POST') {
    const body = JSON.parse(await decodeBody(req));
    return json(res, dbRef.ds.add(body));
  }
  if (pathname.startsWith('/api/datasets/') && req.method === 'PUT') {
    const body = JSON.parse(await decodeBody(req));
    dbRef.ds.updateMeta(pathname.split('/')[3], body);
    return json(res, { ok: true });
  }
  if (pathname.startsWith('/api/datasets/') && req.method === 'DELETE') {
    dbRef.ds.remove(pathname.split('/')[3]);
    return json(res, { ok: true });
  }
  if (pathname.startsWith('/api/datasets/') && pathname.endsWith('/records') && req.method === 'GET') {
    return json(res, { records: dbRef.ds.query(pathname.split('/')[3], null) });
  }
  if (pathname.startsWith('/api/datasets/') && pathname.endsWith('/records') && req.method === 'POST') {
    const body = JSON.parse(await decodeBody(req));
    dbRef.ds.insert(pathname.split('/')[3], body);
    return json(res, { ok: true });
  }

  // Record CRUD
  if (pathname.startsWith('/api/records/') && req.method === 'PUT') {
    const body = JSON.parse(await decodeBody(req));
    dbRef.ds.updateRecord(pathname.split('/')[3], body);
    return json(res, { ok: true });
  }
  if (pathname.startsWith('/api/records/') && req.method === 'DELETE') {
    dbRef.ds.deleteRecord(pathname.split('/')[3]);
    return json(res, { ok: true });
  }

  // Vue SPA / static assets
  const hasDist = fs.existsSync(path.join(DIST_DIR, 'index.html'));
  if (hasDist) {
    if (serveStatic(res, pathname)) return;
    serveVueSpa(req, res);
    return;
  }

  // Dev mode: proxy non-API/web requests to Vite
  proxyToVite(req, res);
}

function start(port, db) {
  dbRef = db;
  serverPort = port;
  running = true;
  server = http.createServer(handleRequest);
  server.listen(port, '0.0.0.0', () => {
    console.log('[HttpServer] Running on http://0.0.0.0:' + port);
    console.log('[HttpServer] Vue SPA: http://localhost:' + port);
    console.log('[HttpServer] Remote admin: http://localhost:' + port + '/web');
  });
  server.on('error', (err) => {
    console.error('[HttpServer] Failed:', err.message);
    running = false;
  });
}

function stop() {
  if (server) { server.close(); server = null; running = false; console.log('[HttpServer] Stopped'); }
}

function isRunning() { return running; }

module.exports = { start, stop, isRunning };
