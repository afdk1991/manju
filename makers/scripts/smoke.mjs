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
assert.strictEqual(seriesList.items.length, 22, 'series 全量应为 22 部');
ok('series.json：22 部剧集');

const s1 = json('static/api/v1/series/s_10001.json');
assert.ok(Array.isArray(s1.episodes) && s1.episodes.length >= 12, 's_10001 至少 12 集');
ok('series/s_10001.json：详情含分集');

const ep = json('static/api/v1/episodes/s_10001_e001.json');
assert.ok(ep.id && ep.series_id && Array.isArray(ep.sources), '单集结构完整');
ok('episodes/s_10001_e001.json：单集结构');

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
const s1r = await call(searchGet, 'http://x/api/v1/search?q=%E5%BC%80%E5%B1%80&size=5');
const sd1 = await s1r.json();
assert.ok(sd1.items.length > 0, '搜索「开局」应有结果');
assert.ok(sd1.items.every((i) => i.title && i.id), '结果字段完整');
ok('search：关键词命中');

const s2r = await call(searchGet, 'http://x/api/v1/search?q=zzzzzznotfound');
const sd2 = await s2r.json();
assert.strictEqual(sd2.items.length, 0, '无匹配返回空');
ok('search：无结果空数组');

const s3r = await call(searchGet, 'http://x/api/v1/search');
const sd3 = await s3r.json();
assert.strictEqual(sd3.items.length, 0, '空 q 返回空');
ok('search：空 q 容错');

console.log(`\n全部通过：${passed} 项断言。`);
