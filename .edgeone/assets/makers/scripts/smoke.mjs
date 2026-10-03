/**
 * 本地冒烟测试：验证 Cloud Functions 逻辑与静态数据契约
 *
 * 运行：node makers/scripts/smoke.mjs
 * 覆盖：OTA check（策略矩阵/灰度/错误码）、search、静态 JSON 契约
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert';

import { onRequestGet as checkGet } from '../cloud-functions/api/v1/ota/check/index.js';
import { onRequestGet as searchGet } from '../cloud-functions/api/v1/search/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

let passed = 0;
const ok = (name) => { passed += 1; console.log(`  ✓ ${name}`); };

async function call(handler, url, headers = {}) {
  return handler({ request: new Request(url, { headers }), env: {}, params: {} });
}

// ---------- 静态数据契约 ----------
const home = json('static/api/v1/home.json');
assert.ok(home.sections.length >= 3, 'home.sections 至少 3 个分区');
ok('home.json：sections 结构');

const seriesList = json('static/api/v1/series.json');
// 不要写死数量：内容库会随导入的真实内容变化（占位数据被替换后数量已不是 22）。
// 这里只校验「有内容」，并额外校验封面不是占位域名——那正是曾经导致页面空白的根因。
assert.ok(seriesList.items.length >= 1, 'series 至少 1 部');
ok(`series.json：${seriesList.items.length} 部剧集`);

const badCover = seriesList.items.filter((s) => !s.cover || /example\.(com|org)/.test(s.cover));
assert.strictEqual(badCover.length, 0, `仍有占位封面：${badCover.map((s) => s.id).join(',')}`);
ok('series.json：无 example.com 占位封面');

// 取库里真实存在的第一部，而不是写死 s_10001（占位数据已被真实内容替换）
const firstId = seriesList.items[0].id;
const s1 = json(`static/api/v1/series/${firstId}.json`);
assert.ok(Array.isArray(s1.episodes) && s1.episodes.length >= 1, `${firstId} 至少 1 集`);
ok(`series/${firstId}.json：详情含分集`);

const firstEp = json(`static/api/v1/episodes/${s1.episodes[0].id}.json`);
assert.ok(firstEp.id && firstEp.series_id && Array.isArray(firstEp.sources), '单集结构完整');
assert.ok(firstEp.sources.length >= 1, '单集至少 1 个播放源');
ok(`episodes/${s1.episodes[0].id}.json：单集结构`);

const pub = json('static/api/v1/ota/public-key.json');
assert.match(pub.key, /^[A-Za-z0-9+/=]+$/, '公钥为 base64');
ok('ota/public-key.json：公钥 base64');

// ---------- OTA check ----------
const r1 = await call(checkGet,
  'http://x/api/v1/ota/check?platform=windows&arch=x86_64&channel=stable&version=9.8.0&build=980&device_id=smoke-1');
assert.strictEqual(r1.status, 200, 'windows 有更新应为 200');
const d1 = await r1.json();
assert.strictEqual(d1.has_update, true);
assert.strictEqual(d1.policy, 'silent', '桌面端默认 silent');
assert.strictEqual(d1.store_fallback.enabled, false);
assert.match(d1.release.artifact.signature, /^ed25519:/, '签名格式');
assert.strictEqual(d1.release.version, '9.9.9');
ok('check：windows 更新 + silent 策略 + 签名');

const r2 = await call(checkGet,
  'http://x/api/v1/ota/check?platform=windows&arch=x86_64&channel=stable&version=9.9.9&build=999&device_id=smoke-1');
assert.strictEqual(r2.status, 204, '已是最新应为 204');
ok('check：windows 无更新 204');

const r3 = await call(checkGet,
  'http://x/api/v1/ota/check?platform=ios&arch=arm64&channel=stable&version=9.8.0&build=980&device_id=smoke-1');
assert.strictEqual(r3.status, 200);
const d3 = await r3.json();
assert.strictEqual(d3.policy, 'suggest', 'iOS 策略为 suggest');
assert.strictEqual(d3.store_fallback.enabled, true, 'iOS 必须有 store_fallback');
assert.match(d3.store_fallback.url, /^https:\/\/apps\.apple\.com/, '商店地址');
ok('check：iOS 跳商店 fallback');

const r4 = await call(checkGet,
  'http://x/api/v1/ota/check?platform=android&arch=arm64&channel=stable&version=1.0.0&build=100&device_id=smoke-1');
assert.strictEqual(r4.status, 404, 'android 无发布应为 404');
ok('check：android no_artifact 404');

const r5 = await call(checkGet,
  'http://x/api/v1/ota/check?platform=windows&arch=x86_64&channel=stable&version=9.9.9&build=999&device_id=smoke-1',
  { 'If-None-Match': '"999-9.9.9"' });
assert.strictEqual(r5.status, 304, 'ETag 命中应为 304');
ok('check：ETag 304');

const r6 = await call(checkGet,
  'http://x/api/v1/ota/check?platform=windows&arch=x86_64&channel=stable&version=0.9.0&build=50&device_id=smoke-1');
assert.strictEqual(r6.status, 200);
const d6 = await r6.json();
assert.strictEqual(d6.policy, 'forced', '低于 min_supported_version 应为 forced');
ok('check：降级保护 forced');

const r7 = await call(checkGet,
  'http://x/api/v1/ota/check?platform=watchos&arch=x86_64&channel=stable&version=1.0.0&build=100&device_id=smoke-1');
assert.strictEqual(r7.status, 400, '非法平台应为 400');
ok('check：invalid_platform 400');

// ---------- search ----------
// 关键词取自库里真实存在的剧名，不再写死「开局」（那是旧占位数据里的虚构剧名）
const kw = seriesList.items[0].title.slice(0, 2);
const s1r = await call(searchGet, `http://x/api/v1/search?q=${encodeURIComponent(kw)}&size=5`);
const sd1 = await s1r.json();
assert.ok(sd1.items.length > 0, `搜索「${kw}」应有结果`);
assert.ok(sd1.items.every((i) => i.title && i.id), '结果字段完整');
ok(`search：关键词「${kw}」命中`);

const s2r = await call(searchGet, 'http://x/api/v1/search?q=zzzzzznotfound');
const sd2 = await s2r.json();
assert.strictEqual(sd2.items.length, 0, '无匹配返回空');
ok('search：无结果空数组');

const s3r = await call(searchGet, 'http://x/api/v1/search');
const sd3 = await s3r.json();
assert.strictEqual(sd3.items.length, 0, '空 q 返回空');
ok('search：空 q 容错');

console.log(`\n全部通过：${passed} 项断言。`);
