import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import logger from './logger';

/**
 * 网络搜索服务
 * - 免费通道:多引擎聚合 DuckDuckGo / Bing / 百度,自动按序降级
 * - API 通道:博查 / Serper,配置 API Key 后优先使用,结构化且更稳定
 * - 内置短时缓存,避免重复查询
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  engine: string;
}

export interface SearchConfig {
  provider: 'auto' | 'bocha' | 'serper';
  apiKey: string;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; results: SearchResult[] }>();

function configFile(): string {
  if (process.env.QIHANG_CONFIG_PATH) return process.env.QIHANG_CONFIG_PATH.replace(/config\.json$/, 'search.json');
  return path.join(os.homedir(), '.qihang-ai-desktop', 'search.json');
}

/** 读取网络搜索配置(独立存储于 ~/.qihang-ai-desktop/search.json,不进 config.json) */
export function getSearchConfig(): SearchConfig {
  const file = configFile();
  try {
    if (!fs.existsSync(file)) return { provider: 'auto', apiKey: '' };
    const cfg = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return {
      provider: cfg.provider === 'bocha' || cfg.provider === 'serper' ? cfg.provider : 'auto',
      apiKey: typeof cfg.apiKey === 'string' ? cfg.apiKey : '',
    };
  } catch (e: any) {
    logger.warn('[Search] 读取配置失败: %s', e && e.message ? e.message : e);
    return { provider: 'auto', apiKey: '' };
  }
}

export function saveSearchConfig(cfg: { provider: string; apiKey: string }): void {
  const provider: SearchConfig['provider'] = cfg.provider === 'bocha' || cfg.provider === 'serper' ? cfg.provider : 'auto';
  const file = configFile();
  try {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ provider, apiKey: cfg.apiKey || '' }, null, 2), 'utf-8');
  } catch (e: any) {
    logger.warn('[Search] 写入配置失败: %s', e && e.message ? e.message : e);
    throw e;
  }
}

function cacheKey(query: string, limit: number): string {
  return `${query}::${limit}`;
}

function cacheGet(key: string): SearchResult[] | null {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.results;
  cache.delete(key);
  return null;
}

function cacheSet(key: string, results: SearchResult[]): void {
  try {
    if (cache.size > 300) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) cache.delete(oldest[0]);
    }
    cache.set(key, { at: Date.now(), results });
  } catch { /* ignore */ }
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeUrls(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const r of results) {
    const key = r.url.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/#.*$/, '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function normalizeResult(raw: { title?: string; url?: string; snippet?: string }, engine: string): SearchResult | null {
  if (!raw || !raw.url || !/^https?:\/\//.test(raw.url)) return null;
  const title = (raw.title ? stripTags(raw.title) : '').slice(0, 120);
  return {
    title: title || raw.url.slice(0, 80),
    url: raw.url,
    snippet: (raw.snippet ? stripTags(raw.snippet) : '').slice(0, 400),
    engine,
  };
}

async function fetchText(url: string, timeoutMs = 12000): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ========== 免费引擎 ==========

async function searchDuckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
  const html = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  const links: { url: string; title: string }[] = [];
  const snippets: string[] = [];
  const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRegex.exec(html)) !== null && links.length < limit) {
    links.push({ url: m[1].replace(/^\/\/?/, 'https://'), title: m[2] });
  }
  while ((m = snippetRegex.exec(html)) !== null && snippets.length < limit) {
    snippets.push(m[1]);
  }
  const out: SearchResult[] = [];
  links.forEach((l, i) => {
    const r = normalizeResult({ ...l, snippet: snippets[i] || '' }, 'ddg');
    if (r) out.push(r);
  });
  return out;
}

async function searchBing(query: string, limit: number): Promise<SearchResult[]> {
  const html = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(query)}&mkt=zh-CN&setlang=zh-hans`);
  const out: SearchResult[] = [];
  const blockRegex = /<li class="b_algo"[\s\S]*?<\/li>/gi;
  const hrefRegex = /<h2[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i;
  const snippetRegex = /<p[^>]*>([\s\S]*?)<\/p>/i;
  let m;
  while ((m = blockRegex.exec(html)) !== null && out.length < limit) {
    const block = m[0];
    const h = block.match(hrefRegex);
    if (!h) continue;
    const snip = block.match(snippetRegex);
    const r = normalizeResult({ url: h[1], title: h[2], snippet: snip ? snip[1] : '' }, 'bing');
    if (r) out.push(r);
  }
  return out;
}

async function searchBaidu(query: string, limit: number): Promise<SearchResult[]> {
  const html = await fetchText(`https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${limit}`);
  const out: SearchResult[] = [];
  const blockRegex = /<div[^>]+class="[^"]*result[^"]*c-container[^"]*"[\s\S]*?<\/div>/gi;
  const hrefRegex = /<h3[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/i;
  const snipRegex = /<span[^>]*class="(?:[^"]*content-right[^"]*|c-abstract[^"]*)"[^>]*>([\s\S]*?)<\/span>/i;
  const snipDivRegex = /<div[^>]*class="c-abstract[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
  let m;
  while ((m = blockRegex.exec(html)) !== null && out.length < limit) {
    const block = m[0];
    const h = block.match(hrefRegex);
    if (!h) continue;
    const snip = block.match(snipRegex) || block.match(snipDivRegex);
    const url = await resolveBaiduLink(h[1]).catch(() => h[1]);
    const r = normalizeResult({ url, title: h[2], snippet: snip ? snip[1] : '' }, 'baidu');
    if (r) out.push(r);
  }
  if (!out.length) {
    const anyLinks = html.match(/<h3[^>]*>\s*<a[^>]*href="(http[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi) || [];
    for (const l of anyLinks.slice(0, limit)) {
      const href = l.match(/href="(http[^"]*)"/i);
      const title = l.replace(/<[^>]+>/g, '').trim();
      if (href && title) {
        const url = await resolveBaiduLink(href[1]);
        const r = normalizeResult({ url, title }, 'baidu');
        if (r) out.push(r);
      }
    }
  }
  return out;
}

/** 百度结果链接是 baidu.com/link 跳转，跟随重定向取真实 URL（失败则原样返回） */
async function resolveBaiduLink(url: string): Promise<string> {
  if (!url.includes('baidu.com/link')) return url;
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
    });
    return res.url || url;
  } catch {
    return url;
  }
}

// ========== API 通道 ==========

async function searchBocha(query: string, count: number, apiKey: string): Promise<SearchResult[]> {
  const res = await fetch('https://api.bochaai.com/v1/web-search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, count: Math.min(count, 20), freshness: 'noLimit' }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`博查搜索 HTTP ${res.status}`);
  const json: any = await res.json();
  const items: any[] = json?.data?.webPages?.value || [];
  const out: SearchResult[] = [];
  for (const it of items) {
    const r = normalizeResult({ url: it.url, title: it.name, snippet: it.snippet }, 'bocha');
    if (r) out.push(r);
    if (out.length >= count) break;
  }
  return out;
}

async function searchSerper(query: string, count: number, apiKey: string): Promise<SearchResult[]> {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, gl: 'cn', hl: 'zh-cn', num: Math.min(count, 20) }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Serper HTTP ${res.status}`);
  const json: any = await res.json();
  const items: any[] = json?.organic || [];
  const out: SearchResult[] = [];
  for (const it of items) {
    const r = normalizeResult({ url: it.link, title: it.title, snippet: it.snippet }, 'serper');
    if (r) out.push(r);
    if (out.length >= count) break;
  }
  return out;
}

// ========== 对外主入口 ==========

function engineOrder(query: string): string[] {
  const asciiRatio = (query.replace(/[^\x00-\x7f]/g, '').length || 0) / Math.max(query.length, 1);
  return asciiRatio > 0.5 ? ['ddg', 'bing', 'baidu'] : ['baidu', 'bing', 'ddg'];
}

/**
 * 搜索并返回格式化文本(直接供 agent 工具使用)。
 * 先尝试 API 通道(若配置),失败或未配置则走免费多引擎降级。
 */
export async function webSearch(query: string, maxResults?: number, cfg?: SearchConfig): Promise<string> {
  const limit = Math.min(maxResults || 8, 15);
  if (!query || !query.trim()) return '搜索关键词不能为空';

  const key = cacheKey(query.trim(), limit);
  const cached = cacheGet(key);
  if (cached) return formatResults(cached, `缓存(${cached[0]?.engine || 'free'})`);

  const config = cfg || getSearchConfig();

  // API 通道优先
  if (config.apiKey) {
    try {
      const results =
        config.provider === 'bocha'
          ? await searchBocha(query, limit, config.apiKey)
          : await searchSerper(query, limit, config.apiKey);
      const ok = dedupeUrls(results).slice(0, limit);
      if (ok.length) {
        cacheSet(key, ok);
        return formatResults(ok, config.provider);
      }
    } catch (e: any) {
      logger.warn('[Search] API 通道失败，回退免费引擎: %s', e && e.message ? e.message : e);
    }
  }

  // 免费多引擎按序降级
  const merged: SearchResult[] = [];
  const errors: string[] = [];
  for (const eng of engineOrder(query)) {
    try {
      const r = eng === 'bing' ? await searchBing(query, limit) : eng === 'baidu' ? await searchBaidu(query, limit) : await searchDuckDuckGo(query, limit);
      const before = merged.length;
      merged.push(...r);
      const hasSnippets = merged.slice(before).some((x) => x.snippet);
      // 已有结果且带摘要（或距上限还剩不足 1）则不再追加引擎；百度等无摘要时继续下一引擎补充
      if (merged.length >= limit && (hasSnippets || before + r.length >= limit)) break;
    } catch (e: any) {
      errors.push(`${eng}:${e && e.message ? e.message : e}`);
    }
  }
  const ok = dedupeUrls(merged).slice(0, limit);
  if (ok.length) {
    cacheSet(key, ok);
    return formatResults(ok, `${ok[0]?.engine || 'free'} 等${ok.length}条`);
  }
  return errors.length ? `搜索失败: ${errors.join(' | ')}` : `未找到 "${query}" 的相关结果，可尝试更换关键词。`;
}

function formatResults(results: SearchResult[], source: string): string {
  if (!results.length) return '未找到相关结果。';
  const lines = results.map(
    (r, i) => `[${i + 1}] ${r.title}\n    链接: ${r.url}\n    摘要: ${r.snippet || '(无摘要)'}`
  );
  return `(来源: ${source})\n\n${lines.join('\n\n')}`;
}

// ========== 网页抓取(web_fetch) ==========

/**
 * 抓取 URL 并提取正文纯文本。直接抓取成功且内容充足则直接返回;
 * 内容过短(JS 渲染/反爬)时自动经 r.jina.ai 代理重试。
 */
export async function fetchPage(url: string, maxLength?: number): Promise<string> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return '仅支持 http/https 协议';
  const limit = Math.min(maxLength || 8000, 50000);
  try {
    let text = '';
    let directError = '';
    try {
      text = await fetchDirect(url);
    } catch (e: any) {
      directError = e && e.message ? e.message : String(e);
    }
    // 直接抓取失败、或内容过少(JS 渲染/反爬)时经免费代理重试(多通道轮换)
    if (!text || text.trim().length < 100) {
      for (const proxy of ['jina', 'jsonreader']) {
        try {
          const url2 = proxy === 'jina' ? `https://r.jina.ai/${url}` : `https://jsonread.com/givemegpt?url=${encodeURIComponent(url)}`;
          const res = await fetch(url2, {
            headers: proxy === 'jina' ? { 'User-Agent': UA } : { 'User-Agent': UA, 'x-jsonreader-key': 'anonymous' },
            signal: AbortSignal.timeout(25000),
          });
          if (res.ok) {
            const md = await res.text();
            if (md.trim().length > text.trim().length) text = md;
            if (text.trim().length >= 100) break;
          }
        } catch (e: any) {
          logger.warn('[Search] %s 代理失败: %s', proxy, e && e.message ? e.message : e);
        }
      }
    }
    if (!text.trim()) {
      return directError ? `获取失败: ${directError}（已尝试代理）` : '(页面内容为空)';
    }
    const clean = cleanupHtml(text);
    if (!clean) return '(页面内容为空)';
    const out = clean.length > limit ? clean.slice(0, limit) + '\n\n...(内容已截断，全文过长)' : clean;
    return out;
  } catch (e: any) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return '请求超时，请检查 URL 或稍后重试。';
    return `获取失败: ${e.message}`;
  }
}

async function fetchDirect(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') || '';
  const isText =
    contentType.startsWith('text/') ||
    contentType.includes('json') ||
    contentType.includes('xml') ||
    contentType.includes('javascript');
  if (!isText) throw new Error(`不支持非文本内容: ${contentType}`);
  return res.text();
}

function cleanupHtml(text: string): string {
  return text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}