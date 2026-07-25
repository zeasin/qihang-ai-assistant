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

function getKbPath(kbId) {
  const kb = dbRef.kb.get(kbId);
  return kb ? kb.path : null;
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

const LAYOUT_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;color:#1e293b;padding:20px}
.container{max-width:1200px;margin:0 auto}
h1{font-size:22px;font-weight:700;margin-bottom:20px}
.card{background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:20px;margin-bottom:16px}
.card h2{font-size:16px;font-weight:600;margin-bottom:12px;color:#475569}
.nav{display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap}
.nav a{padding:8px 16px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500;background:#fff;color:#6366f1;border:1px solid #e2e8f0;transition:.15s}
.nav a:hover{background:#6366f1;color:#fff;border-color:#6366f1}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #e2e8f0}
th{background:#f8fafc;font-weight:600;color:#64748b;font-size:12px}
tr:hover{background:#f8fafc}
.file-tree{margin:0;padding:0;list-style:none}
.file-tree li{padding:6px 0;font-size:13px}
.file-tree .folder{font-weight:500;color:#6366f1;cursor:pointer}
.file-tree .file{color:#334155;cursor:pointer;margin-left:16px}
.file-tree .file:hover{color:#6366f1}
.file-tree .children{padding-left:20px;display:none}
.file-tree .children.open{display:block}
.badge{display:inline-flex;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500}
.badge-green{background:#dcfce7;color:#16a34a}
.badge-gray{background:#f1f5f9;color:#64748b}
.preview{background:#f8fafc;border-radius:8px;padding:16px;font-size:13px;line-height:1.6;border:1px solid #e2e8f0;white-space:pre-wrap;font-family:monospace}
.empty{text-align:center;padding:40px;color:#94a3b8;font-size:14px}
.back{display:inline-block;margin-bottom:16px;color:#6366f1;text-decoration:none;font-size:13px;font-weight:500}
.back:hover{text-decoration:underline}
.status-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}
.status-dot.on{background:#22c55e}
.status-dot.off{background:#94a3b8}
`;

function remoteIndex() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>笔灵 AI - 远程管理</title><style>${LAYOUT_CSS}</style></head><body>
<div class="container">
<h1>📘 笔灵 AI 远程管理</h1>
<div class="nav">
  <a href="/web/notes">📝 笔记浏览</a>
  <a href="/web/datacenter">🗂️ 数据中心</a>
  <a href="/web/planner">📋 任务提醒</a>
  <a href="/web/status">⚡ 服务状态</a>
</div>
<div class="card"><p style="font-size:14px;color:#64748b">选择上方功能查看数据。</p></div>
</div></body></html>`;
}

function notesPage() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>笔记浏览 - 笔灵 AI</title><style>${LAYOUT_CSS}</style></head><body>
<div class="container">
<a class="back" href="/web">← 返回</a>
<h1>📝 笔记浏览</h1>
<div id="content">加载中...</div>
</div>
<script>
async function init(){const r=await fetch('/api/kbs');const kbs=await r.json()
if(!kbs.length){document.getElementById('content').innerHTML='<div class="empty">暂无笔记库</div>';return}
let h='<div class="card"><h2>笔记库</h2>'+kbs.map(k=>'<p style="margin:4px 0"><a href="/web/notes?kbId='+k.id+'" style="color:#6366f1;text-decoration:none;font-weight:500">'+k.name+'</a> <span style="color:#94a3b8;font-size:12px">'+k.path+'</span></p>').join('')+'</div>'
const kbId=new URLSearchParams(location.search).get('kbId')
if(kbId){h+='<div class="card"><h2>文件浏览</h2><div id="tree">加载目录...</div></div><div id="file-view"></div>';loadTree(kbId)}
document.getElementById('content').innerHTML=h}
async function loadTree(kbId){const r=await fetch('/api/notes/tree?kbId='+kbId);renderTree(await r.json(),document.getElementById('tree'))}
function renderTree(items,el){if(!items.length){el.innerHTML='<div class="empty">空目录</div>';return}
const ul=document.createElement('ul');ul.className='file-tree'
items.forEach(item=>{const li=document.createElement('li')
if(item.type==='folder'){li.innerHTML='<div class="folder">📁 '+item.name+'</div>';const cu=document.createElement('ul');cu.className='children'
li.querySelector('.folder').onclick=async()=>{const o=cu.classList.toggle('open')
if(o&&!cu.children.length){(await(await fetch('/api/notes/tree?dir='+encodeURIComponent(item.path))).json()).forEach(k=>{const c=document.createElement('li');c.innerHTML=k.type==='folder'?'<div class="folder">📁 '+k.name+'</div>':'<div class="file" onclick="openFile(\''+encodeURIComponent(k.path)+'\')">📄 '+k.name+'</div>';cu.appendChild(c)})}}
li.appendChild(cu)}else{li.innerHTML='<div class="file" onclick="openFile(\''+encodeURIComponent(item.path)+'\')">📄 '+item.name+'</div>'}
ul.appendChild(li)});el.appendChild(ul)}
async function openFile(p){const d=await(await fetch('/api/notes/read?path='+p)).json()
document.getElementById('file-view').innerHTML=d.ok?'<div class="card"><h2>📄 '+decodeURIComponent(p).split('/').pop()+'</h2><div class="preview">'+d.content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div></div>':'<div class="card"><p style="color:#dc2626">'+d.error+'</p></div>'}
init()
</script></body></html>`;
}

function datacenterPage() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>数据中心 - 笔灵 AI</title><style>
body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#1e293b;background:#f5f5f7;overflow:hidden;height:100vh}
*,*::before,*::after{box-sizing:border-box}
.split{display:flex;height:100vh}
.left{width:260px;min-width:260px;background:#fafbfc;border-right:1px solid #e2e8f0;display:flex;flex-direction:column}
.left-header{padding:12px 16px;font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;border-bottom:1px solid #e2e8f0;background:#fff}
.left-body{flex:1;overflow-y:auto;padding:6px 0}
.mod-group{margin-bottom:2px}
.mod-head{display:flex;align-items:center;gap:6px;padding:7px 16px;cursor:pointer;font-size:13px;user-select:none}
.mod-head:hover{background:#e8eaed}
.mod-arrow{font-size:10px;color:#94a3b8;width:12px;flex-shrink:0}
.mod-icon{font-size:16px;flex-shrink:0}
.mod-name{flex:1;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mod-cnt{font-size:11px;color:#94a3b8;white-space:nowrap}
.ds-list{padding:0 0 4px 34px}
.ds-item{display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:13px;margin-bottom:1px}
.ds-item:hover{background:#e8eaed}
.ds-item.active{background:#6366f1;color:#fff}
.ds-item.active .ds-cnt{background:rgba(255,255,255,.2);color:rgba(255,255,255,.7)}
.ds-icon{font-size:14px;flex-shrink:0}
.ds-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ds-cnt{font-size:11px;background:rgba(0,0,0,.08);padding:0 6px;border-radius:8px;color:#64748b}
.empty-hint{padding:24px;text-align:center;font-size:13px;color:#94a3b8}
.right{flex:1;display:flex;flex-direction:column;overflow:hidden;background:#fff}
.toolbar{display:flex;align-items:center;gap:8px;padding:10px 20px;border-bottom:1px solid #e2e8f0;flex-wrap:wrap}
.toolbar .search-box{position:relative;flex:1;min-width:160px;max-width:260px}
.toolbar .search-box input{width:100%;padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;outline:none}
.toolbar .search-box input:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.1)}
.record-area{flex:1;overflow-y:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:10px 14px;background:#f8fafc;border-bottom:2px solid #e2e8f0;font-weight:600;color:#64748b;position:sticky;top:0;z-index:1}
td{padding:10px 14px;border-bottom:1px solid #e2e8f0}
tr:hover{background:#f8fafc}
.empty-right{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#94a3b8}
.empty-right .eicon{font-size:40px;margin-bottom:8px;opacity:.4}
.empty-right .etitle{font-size:14px;margin-bottom:12px}
.action-cell{white-space:nowrap}
.action-btn{background:none;border:none;cursor:pointer;font-size:12px;color:#94a3b8;padding:2px 6px}
.action-btn:hover{color:#6366f1}
.action-btn.danger:hover{color:#ef4444}
.badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:12px;font-weight:500}
.badge-gray{background:#f5f5f7;color:#909296}
.detail-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e2e8f0}
.detail-row:last-child{border-bottom:none}
.detail-row .dl{font-size:13px;color:#64748b;font-weight:500}
.detail-row .dv{font-size:13px;color:#1e293b}

.modal{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.4);z-index:100;justify-content:center;align-items:center}
.modal.show{display:flex}.modal-box{background:#fff;border-radius:10px;padding:20px;width:480px;max-width:90%;max-height:90vh;overflow-y:auto}
.modal-box h3{margin:0 0 16px;font-size:15px}.modal-box label{display:block;font-size:12px;font-weight:500;color:#64748b;margin-bottom:4px}
.modal-box input,.modal-box textarea,.modal-box select{width:100%;padding:7px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;margin-bottom:12px;outline:none;font-family:inherit;box-sizing:border-box}
.modal-box input:focus,.modal-box textarea:focus,.modal-box select:focus{border-color:#6366f1}
.modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}
.btn{padding:8px 16px;border-radius:6px;border:none;font-size:13px;cursor:pointer}.btn-primary{background:#6366f1;color:#fff}
.btn-secondary{background:#e2e8f0;color:#475569}.btn-danger{background:#ef4444;color:#fff}.btn-sm{padding:4px 10px;font-size:12px}
.top-bar{display:flex;align-items:center;gap:12px;padding:12px 20px;background:#fff;border-bottom:1px solid #e2e8f0}
.top-bar h1{margin:0;font-size:16px;font-weight:600}
.top-bar .mla{margin-left:auto}
</style></head><body>
<div class="split">
  <div class="left">
    <div class="left-header">模块列表</div>
    <div class="left-body" id="leftBody"></div>
  </div>
  <div class="right">
    <div class="top-bar">
      <a href="/web" style="color:#64748b;text-decoration:none;font-size:13px">← 返回</a>
      <h1>🗂️ 数据中心</h1>
      <button class="btn btn-primary btn-sm mla" onclick="showModuleModal()">+ 新建模块</button>
    </div>
    <div id="rightContent" class="right-content" style="flex:1;display:flex;flex-direction:column;overflow:hidden"></div>
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
<label>类型选项（每行一个）</label><textarea id="dsTypeOptions" rows="2" placeholder="需求&#10;Bug&#10;优化"></textarea>
<label>状态选项（每行一个）</label><textarea id="dsStatusOptions" rows="2" placeholder="待办&#10;进行中&#10;已完成"></textarea>
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
  let h='<div class="toolbar">'
  h+='<div class="search-box"><input id="searchInput" placeholder="搜索记录..." onkeyup="if(event.key===\'Enter\')loadRecs()"></div>'
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
    let h='<table><thead><tr><th>状态</th>'+cols.map(c=>'<th>'+c+'</th>').join('')+'<th>操作</th></tr></thead><tbody>'
    data.records.forEach((rec,i)=>{
      h+='<tr><td><span class="badge badge-gray">'+(rec.status||'无')+'</span></td>'
      cols.forEach(c=>h+='<td>'+(rec[c]||'')+'</td>')
      h+='<td class="action-cell"><button class="action-btn" onclick="viewRec(\\''+rec.id+'\\',\''+encodeURIComponent(JSON.stringify(rec))+'\\')">👁️</button> <button class="action-btn" onclick="editRec(\\''+rec.id+'\\',\''+encodeURIComponent(JSON.stringify(rec))+'\\')">✏️</button> <button class="action-btn danger" onclick="deleteRec(\\''+rec.id+'\\')">🗑️</button></td></tr>'
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
  renderRight()
  // refresh left active highlight
  loadLeft()
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
  document.getElementById('detailActions').innerHTML='<button class="btn btn-danger" onclick="closeDetail();deleteRec(\\''+rec.id+'\\')">🗑️ 删除</button><button class="btn btn-primary" onclick="closeDetail();editRec(\\''+rec.id+'\\',\''+recStr+'\\')">✏️ 编辑</button><button class="btn btn-secondary" onclick="closeDetail()">关闭</button>'
  document.getElementById('detailModal').classList.add('show')
}
function closeDetail(){document.getElementById('detailModal').classList.remove('show')}

async function init(){
  state.lastId=ls('webLastDatasetId')
  await loadLeft()
  if(!state.currentDs&&state.lastId&&state.allDs[state.lastId]) selectDs(state.lastId)
}
init()
</script></body></html>`;
}

function plannerPage() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>任务提醒 - 笔灵 AI</title><style>${LAYOUT_CSS}</style></head><body>
<div class="container">
<a class="back" href="/web">← 返回</a>
<h1>📋 任务提醒</h1>
<div id="tasks">加载中...</div>
<div id="reminders" style="margin-top:12px">加载中...</div>
</div>
<script>
async function init(){
try{const t=await(await fetch('/api/tasks')).json()
document.getElementById('tasks').innerHTML='<div class="card"><h2>📌 定时任务</h2>'+(t.length?'<table><thead><tr><th>名称</th><th>类型</th><th>Cron</th><th>状态</th></tr></thead><tbody>'+t.map(r=>'<tr><td>'+r.name+'</td><td>'+(r.task_type||'-')+'</td><td><code>'+(r.cron_expression||'-')+'</code></td><td><span class="badge '+(r.enabled?'badge-green':'badge-gray')+'">'+(r.enabled?'启用':'停用')+'</span></td></tr>').join('')+'</tbody></table>':'<div class="empty">暂无任务</div>')+'</div>'}catch(e){document.getElementById('tasks').innerHTML='<div class="card"><div class="empty">加载失败</div></div>'}
try{const r=await(await fetch('/api/reminders')).json()
document.getElementById('reminders').innerHTML='<div class="card"><h2>⏰ 提醒</h2>'+(r.length?'<table><thead><tr><th>名称</th><th>消息</th><th>时间</th><th>状态</th></tr></thead><tbody>'+r.map(x=>'<tr><td>'+x.name+'</td><td>'+x.message+'</td><td>'+(x.time||'-')+'</td><td><span class="badge '+(x.enabled?'badge-green':'badge-gray')+'">'+(x.enabled?'启用':'停用')+'</span></td></tr>').join('')+'</tbody></table>':'<div class="empty">暂无提醒</div>')+'</div>'}catch(e){document.getElementById('reminders').innerHTML='<div class="card"><div class="empty">加载失败</div></div>'}}
init()
</script></body></html>`;
}

function statusPage() {
  let f = false, s = false, i = false;
  try { const x = require('./scheduler'); s = x.isRunning(); } catch {}
  try { const x = require('./indexer'); i = x.isRunning(); } catch {}
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>服务状态 - 笔灵 AI</title><style>${LAYOUT_CSS}</style></head><body>
<div class="container">
<a class="back" href="/web">← 返回</a>
<h1>⚡ 服务状态</h1>
<div class="card"><table><thead><tr><th>服务</th><th>状态</th></tr></thead><tbody>
<tr><td>飞书机器人</td><td><span class="status-dot ${f?'on':'off'}"></span>${f?'运行中':'已停止'}</td></tr>
<tr><td>定时任务</td><td><span class="status-dot ${s?'on':'off'}"></span>${s?'运行中':'已停止'}</td></tr>
<tr><td>索引器</td><td><span class="status-dot ${i?'on':'off'}"></span>${i?'运行中':'已停止'}</td></tr>
<tr><td>HTTP 服务</td><td><span class="status-dot on"></span>运行中 :${serverPort}</td></tr>
</tbody></table></div>
</div></body></html>`;
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
  if (pathname === '/web/status') return html(res, statusPage());

  // API endpoints
  if (pathname === '/api/kbs') {
    return json(res, dbRef.kb.list().map(k => ({ id: k.id, name: k.name, path: k.path || '' })));
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
  if (pathname === '/api/tasks') {
    try { return json(res, dbRef.task.list()); } catch { return json(res, []); }
  }
  if (pathname === '/api/reminders') {
    try { return json(res, dbRef.task.list()); } catch { return json(res, []); }
  }
  if (pathname === '/api/status') {
    let s = false, i = false;
    try { s = require('./scheduler').isRunning(); } catch {}
    try { i = require('./indexer').isRunning(); } catch {}
    return json(res, { httpserver: true, feishu: false, scheduler: s, indexer: i, version: '0.1.0', port: serverPort });
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
  server = http.createServer(handleRequest);
  server.listen(port, '0.0.0.0', () => {
    running = true;
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
