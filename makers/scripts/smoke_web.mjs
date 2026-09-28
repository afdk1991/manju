/**
 * 前端渲染冒烟：在极简 DOM stub 上执行 index.html 的内联脚本，
 * 验证外部片单的「跳转提示页」链路与版权标注确实生效。
 *
 * 运行：node makers/scripts/smoke_web.mjs
 * 覆盖：卡片渲染 / 绑定 / 提示页 / 未找到兜底 / attribution 前置 / 已看过标记
 */
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = join(ROOT, 'static');

let passed = 0;
const ok = (name) => { passed += 1; console.log(`  ✓ ${name}`); };

/* ---------- 极简 DOM stub ---------- */
const mkEl = () => ({
  style: {}, textContent: '', dataset: {},
  _html: '',
  get innerHTML() { return this._html; },
  set innerHTML(v) { this._html = v; },
  querySelectorAll: () => [],
  insertAdjacentHTML(_pos, html) { this._html += html; },
});
const els = { app: mkEl(), back: mkEl(), out: mkEl() };
const document = { getElementById: (id) => (els[id] ||= mkEl()) };

const fetchStub = async (p) => {
  const rel = String(p).replace(/^\.\//, '').replace(/^\//, '');
  const text = await readFile(join(STATIC, rel), 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
};

const store = {};
const localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};

/* ---------- 取出内联脚本，去掉自动 route()，并导出内部函数 ---------- */
const html = readFileSync(join(STATIC, 'index.html'), 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
assert.strictEqual(blocks.length, 1, 'index.html 应只有 1 个内联 script 块');

const body = blocks[0][1]
  .replace(/^\s*route\(\);\s*$/m, '')
  + `\n return { route, viewHome, viewExternalIndex, viewExternalList, viewExtGate,
              extCardHtml, bindExtCards, seenSet, markSeen, attributionNotice };`;

const api = new Function(
  'document', 'location', 'window', 'localStorage', 'fetch',
  body,
)(document, { hash: '' }, { addEventListener() {} }, localStorage, fetchStub);

const idx = JSON.parse(await readFile(join(STATIC, 'external/index.json'), 'utf8'));
const cat = idx.catalogs[0].category;
const data = JSON.parse(await readFile(join(STATIC, `external/${cat}.json`), 'utf8'));
const item = data.items[0];

/* ---------- 1. 卡片渲染 ---------- */
const card = api.extCardHtml(item, cat);
assert.ok(!/data-url=/.test(card), '卡片不应再携带可直跳的 data-url');
assert.ok(card.includes(`data-cat="${cat}"`), '卡片应携带 data-cat');
assert.ok(card.includes(`data-id="${item.id}"`), '卡片应携带 data-id');
assert.ok(card.includes('class="src"'), '卡片应展示来源角标');
assert.ok(card.includes(item.source_label), '来源角标内容应为 source_label');
ok('卡片：改为携带 data-cat/data-id 并显示来源角标');

/* ---------- 2. 绑定后不再直接 window.open ---------- */
assert.ok(!/window\.open/.test(blocks[0][1]), '全局不应残留 window.open 直跳');
ok('绑定：已无 window.open 直跳逻辑');

/* ---------- 3. 跳转提示页 ---------- */
await api.viewExtGate(cat, item.id);
const gate = els.app.innerHTML;

assert.ok(gate.includes('不存储、不转码、不代理'), '提示页应声明不存储/不转码/不代理');
assert.ok(gate.includes(item.title), '提示页应展示标题');
assert.ok(gate.includes(item.source_label), '提示页应展示来源平台');
assert.ok(gate.includes(item.detail_url), '提示页应展示即将前往的完整地址');
ok('提示页：标题 / 来源 / 目标地址齐全');

assert.ok(gate.includes('rel="noopener external"'), '跳转链接需带 rel=noopener external');
assert.ok(gate.includes('referrerpolicy="strict-origin-when-cross-origin"'),
  '跳转链接需显式 referrerpolicy（保留来源以体现导流属性）');
assert.ok(gate.includes('target="_blank"'), '跳转链接应新标签打开');
assert.ok(!/rel="[^"]*noreferrer/.test(gate), '不应使用 noreferrer：需让原站看到流量来源');
ok('提示页：链接安全属性（noopener + 保留来源）');

assert.ok(gate.includes(idx.attribution), '提示页应展示 index.json 中的 attribution');
ok('提示页：正版归属声明来自 index.json.attribution');

/* ---------- 4. 已看过标记 ---------- */
assert.ok(api.seenSet().has(item.id), '进入提示页后应写入已看过标记');
assert.ok(api.extCardHtml(item, cat).includes('class="seen"'), '重复渲染的同条目卡片应显示已看过');
ok('提示页：已看过标记写入并在卡片生效');

/* ---------- 5. 未找到兜底 ---------- */
await api.viewExtGate(cat, 'hg-not-exist');
assert.ok(els.app.innerHTML.includes('未找到该条目'), '未知 id 应给出兜底提示');
ok('提示页：未知 id 优雅兜底');

/* ---------- 6. attribution 前置到列表与分类页 ---------- */
await api.viewExternalIndex();
assert.ok(els.app.innerHTML.includes(idx.attribution), '分类页应展示 attribution');
ok('分类页：attribution 前置');

await api.viewExternalList(cat);
assert.ok(els.app.innerHTML.includes(idx.attribution), '列表页应展示 attribution');
assert.ok(els.app.innerHTML.includes('版权与播放说明'), '列表页应有醒目的版权说明区块');
ok('列表页：attribution 前置');

/* ---------- 7. 首页仍正常渲染，且外部卡片带 data-cat ---------- */
await api.viewHome();
const home = els.app.innerHTML;
assert.ok(home.includes('class="src"'), '首页外部卡片应带来源角标');
assert.ok(!/data-url=/.test(home), '首页不应存在 data-url 直跳卡片');
assert.ok(home.includes('在线观影'), '首页主体应正常渲染');
ok('首页：正常渲染且外部卡片已改造');

console.log(`\n全部通过：${passed} 项断言。`);
