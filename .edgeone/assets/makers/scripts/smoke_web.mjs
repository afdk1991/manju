/**
 * 前端构建产物契约冒烟
 *
 * 背景：Web 站已从「910 行单文件内联 SPA」重建为 Vite + React + TS 工程
 * （源码在 web/，构建产物输出 makers/static）。旧版断言"仅 1 个内联 script 块"
 * 因此失效，本文件改为校验**构建产物**的契约。
 *
 * 用法：cd makers && node scripts/smoke_web.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const MAKERS = path.resolve(import.meta.dirname, '..');
const STATIC = path.join(MAKERS, 'static');

let passed = 0;
const ok = (msg) => { passed++; console.log('  \u2713 ' + msg); };
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/* ---------- 1. 构建产物结构 ---------- */
console.log('\n[1] 构建产物');
const indexHtml = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
ok('index.html 存在');
assert.match(indexHtml, /<script[^>]+type="module"[^>]*src="\/assets\/[^"]+\.js"/,
  'index.html 应引用 /assets/*.js 的 ES module');
ok('index.html 引用打包后的 ES module');

const assetsDir = path.join(STATIC, 'assets');
const assets = fs.readdirSync(assetsDir);
const jsFile = assets.find((f) => f.endsWith('.js'));
const cssFile = assets.find((f) => f.endsWith('.css'));
assert.ok(jsFile, 'assets 下应有 js bundle');
assert.ok(cssFile, 'assets 下应有 css bundle');
ok(`assets 产物完整（${jsFile} / ${cssFile}）`);

const bundle = fs.readFileSync(path.join(assetsDir, jsFile), 'utf8');

/* ---------- 2. 播放器与路由契约（在 bundle 中固化） ---------- */
console.log('\n[2] 播放器与路由');
assert.ok(bundle.includes('player-shell'), 'bundle 应含播放器外壳类');
ok('播放器组件已打包');
assert.ok(bundle.includes('manju:progress'), 'bundle 应含进度记忆键');
ok('进度记忆已打包');
assert.ok(bundle.includes('#/watch/'), 'bundle 应含播放页路由');
ok('播放页路由已打包');

/* ---------- 3. 跳转安全属性（合规红线） ---------- */
console.log('\n[3] 跳转安全属性');
assert.ok(bundle.includes('noopener external'), '跳转链接必须带 rel="noopener external"');
ok('rel="noopener external" 已固化');
assert.ok(bundle.includes('strict-origin-when-cross-origin'),
  '必须带 referrerpolicy=strict-origin-when-cross-origin');
ok('referrerpolicy 已固化');
assert.ok(!bundle.includes('noreferrer'),
  '禁止使用 noreferrer —— 本站是导流，抹掉 Referer 会丢掉导流证据');
ok('未使用 noreferrer');
assert.ok(!bundle.includes('window.open'),
  '禁止 window.open 直接跳转，必须经跳转提示页');
ok('无 window.open 直跳');

/* ---------- 4. 静态资产未被构建清空 ---------- */
console.log('\n[4] 静态资产');
for (const d of ['api', 'files', 'external', 'admin']) {
  assert.ok(fs.existsSync(path.join(STATIC, d)), `${d}/ 必须存在（构建不得清空 public 资产）`);
}
ok('api / files / external / admin 均在位');

/* ---------- 5. 内容契约 ---------- */
console.log('\n[5] 内容契约');
const series = readJson(path.join(STATIC, 'api/v1/series.json'));
assert.ok(series.items.length > 0, 'series.json 应有剧集');
ok(`series.json 含 ${series.items.length} 部剧集`);

const home = readJson(path.join(STATIC, 'api/v1/home.json'));
assert.ok(home.sections.length > 0, 'home.json 应有分区');
ok(`home.json 含 ${home.sections.length} 个分区`);

const demo = series.items.find((i) => i.id === 'demo_ai_rebirth');
assert.ok(demo, '应含自有内容剧集 demo_ai_rebirth');
ok('自有内容剧集 demo_ai_rebirth 在索引中');

const ep = readJson(path.join(STATIC, 'api/v1/episodes/demo_ai_rebirth_e001.json'));
assert.ok(ep.sources?.length, '单集必须有 sources');
ok(`单集含 ${ep.sources.length} 个片源`);
for (const s of ep.sources) {
  assert.ok(!s.url.startsWith('http'),
    `片源必须是站内相对路径，实际：${s.url}`);
}
ok('全部片源为站内相对路径（无境外 CDN 依赖）');

/* ---------- 6. 外部片单合规 ---------- */
console.log('\n[6] 外部片单');
const extIdx = readJson(path.join(STATIC, 'external/index.json'));
assert.ok(extIdx.attribution, '外部片单索引必须带 attribution');
ok('外部片单索引含版权标注');
const firstCat = extIdx.catalogs[0];
const extList = readJson(path.join(STATIC, `external/${firstCat.category}.json`));
assert.ok(extList.items.length > 0, '外部分类应有条目');
ok(`${firstCat.category_label} 含 ${extList.items.length} 条`);
const noVideoField = extList.items.every((i) => !i.play_url && !i.video_url && !i.m3u8);
assert.ok(noVideoField, '外部片单不得含任何视频直链字段');
ok('外部片单无视频直链字段（只做发现与跳转）');

/* ---------- 7. HLS 片源 ---------- */
console.log('\n[7] HLS 片源');
const m3u8 = path.join(STATIC, 'files/videos/demo_ai_rebirth/ep01/index.m3u8');
assert.ok(fs.existsSync(m3u8), 'HLS 清单应存在');
const m3u8Txt = fs.readFileSync(m3u8, 'utf8');
assert.match(m3u8Txt, /^#EXTM3U/, 'm3u8 应以 #EXTM3U 开头');
assert.ok(/#EXT-X-ENDLIST/.test(m3u8Txt), '应为 VOD 清单');
const segs = [...m3u8Txt.matchAll(/^(\d+\.ts)$/gm)].map((m) => m[1]);
assert.ok(segs.length > 0, '应解析出 ts 分片');
ok(`m3u8 为合法 VOD 清单，含 ${segs.length} 个分片`);
for (const seg of segs) {
  const p = path.join(STATIC, 'files/videos/demo_ai_rebirth/ep01', seg);
  assert.ok(fs.existsSync(p), `分片 ${seg} 应存在`);
}
ok(`${segs.length} 个 ts 分片全部落盘`);

console.log(`\n全部通过：${passed} 项断言。`);
