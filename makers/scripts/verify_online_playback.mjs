/**
 * 线上播放链路端到端验证（EdgeOne Makers 预览域名）
 *
 * 用法：
 *   node scripts/verify_online_playback.mjs <baseUrl> <eo_token> <eo_time>
 * 例：
 *   node scripts/verify_online_playback.mjs https://manju-h58srdik.edgeone.cool 43aff16e... 1790847138
 *
 * 关键点（踩过坑，勿删）：
 *   EdgeOne 预览域名在路由之前有 SSO 鉴权。eo_token 必须放进 **Cookie** 才能通过；
 *   放在 query 参数会被 302 剥离，请求落到 SSO 中间页返回 401，导致所有脚本化验证
 *   都误判成"线上没部署"。本项目长期记录里"脚本请求一律 401，只能浏览器验证"的结论
 *   就是错在这里 —— 用 Cookie 即可全自动验证。
 *
 * 检查链路：
 *   index.html → series.json → series/{id}.json → episodes/{eid}.json
 *   → sources[].url（m3u8 / mp4）→ m3u8 内 ts 分片可达 + MPEG-TS 同步字节
 */

const BASE = (process.argv[2] || '').replace(/\/+$/, '');
const TOKEN = process.argv[3] || '';
const TIME = process.argv[4] || '';

if (!BASE || !TOKEN || !TIME) {
  console.error('用法: node verify_online_playback.mjs <baseUrl> <eo_token> <eo_time>');
  process.exit(2);
}

const COOKIE = `eo_token=${TOKEN}; eo_time=${TIME}`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let pass = 0, fail = 0, warn = 0;
const ok = (m) => { pass++; console.log('  \u2713 ' + m); };
const bad = (m) => { fail++; console.log('  \u2718 ' + m); };
const wr = (m) => { warn++; console.log('  \u26a0 ' + m); };

async function get(path) {
  const url = BASE + path;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: COOKIE } });
  return { status: res.status, url, buf: Buffer.from(await res.arrayBuffer()) };
}

/** 取一个资源并断言状态码 200 */
async function need(path, label, expectMinBytes = 0) {
  const r = await get(path);
  if (r.status !== 200) { bad(`${label} -> HTTP ${r.status}  (${path})`); return null; }
  if (r.buf.length < expectMinBytes) { bad(`${label} -> 体积过小 ${r.buf.length}B  (${path})`); return null; }
  ok(`${label} 200 (${r.buf.length}B)`);
  return r.buf;
}

const j = (b) => JSON.parse(b.toString('utf8'));

(async () => {
  console.log(`\n线上播放链路验证：${BASE}\n${'-'.repeat(52)}`);

  // 0. 页面本体（新架构下 index.html 是 SPA 骨架，体积很小，阈值放低）
  console.log('\n[0] 页面');
  const htmlBuf = await need('/index.html', 'index.html', 200);
  if (!htmlBuf) { console.log('\n中断：连 index.html 都拿不到，检查 token 是否过期'); process.exit(1); }

  // 1. 索引
  console.log('\n[1] 内容索引');
  const seriesBuf = await need('/api/v1/series.json', 'series.json', 100);
  if (!seriesBuf) { console.log('\n中断：连 series.json 都拿不到，检查 token 是否过期'); process.exit(1); }
  const items = j(seriesBuf).items || [];
  ok(`series.json 含 ${items.length} 部剧集`);
  if (!items.length) { console.log('\n中断：无剧集'); process.exit(1); }

  // 2. 逐部剧集校验详情 + 首集片源（默认只查前 3 部，避免耗时）
  console.log('\n[2] 详情 / 单集 manifest');
  const targets = items.slice(0, 3);
  for (const it of targets) {
    const sBuf = await need(`/api/v1/series/${it.id}.json`, `series/${it.id}.json`, 50);
    if (!sBuf) continue;
    const eps = j(sBuf).episodes || [];
    if (!eps.length) { bad(`series/${it.id}.json 无分集`); continue; }
    const eid = eps[0].id;
    const eBuf = await need(`/api/v1/episodes/${eid}.json`, `episodes/${eid}.json`, 50);
    if (!eBuf) continue;
    const ep = j(eBuf);
    const srcs = ep.sources || [];
    if (!srcs.length) { bad(`episodes/${eid}.json 无 sources`); continue; }

    // 3. 片源可达性
    console.log(`\n[3] 片源（${it.id} / ${eid}）`);
    for (const s of srcs) {
      const rel = String(s.url || '');
      const p = rel.startsWith('http') ? null : '/' + rel.replace(/^\/+/, '');
      if (!p) {
        // 站外片源不计失败，但要点名：境外 CDN 在大陆不稳定，属已知占位
        wr(`站外片源（非站内，不计失败）：${rel}`);
        continue;
      }
      const isHls = (s.container || '').toLowerCase() === 'hls';
      const buf = await need(p, `${s.container} 片源`, isHls ? 50 : 5000);
      if (!buf) continue;

      if (isHls) {
        const m = buf.toString('utf8');
        const segs = [...m.matchAll(/^(\d+\.ts)\s*$/gm)].map((x) => x[1]);
        if (!segs.length) { bad('m3u8 未解析出 ts 分片'); continue; }
        ok(`m3u8 含 ${segs.length} 个分片` + (/#EXT-X-ENDLIST/.test(m) ? '（VOD 清单）' : '（LIVE 清单）'));
        // 只抽查首尾两片，控制耗时
        const dir = p.replace(/\/[^/]+$/, '');
        for (const seg of [segs[0], segs[segs.length - 1]]) {
          const sb = await need(`${dir}/${seg}`, `  分片 ${seg}`, 1000);
          if (!sb) continue;
          // MPEG-TS 同步字节：每 188 字节一个包，包首应为 0x47
          const good = sb.length > 188 && sb[0] === 0x47 && sb[188] === 0x47;
          if (good) ok(`  分片 ${seg} MPEG-TS 同步字节正确`);
          else bad(`  分片 ${seg} 非标准 MPEG-TS（首字节 ${sb[0]}）`);
        }
      }
    }
  }

  // 4. 播放器依赖
  // 新架构：hls.js 走 npm 依赖随 bundle 打包，不再自托管 js/hls.min.js。
  // 因此从 index.html 解析出真实 bundle 路径再校验。
  console.log('\n[4] 播放器依赖');
  const html = (await get('/index.html')).buf.toString('utf8');
  const m = html.match(/src="\/assets\/([^"]+\.js)"/);
  if (!m) {
    bad('index.html 未引用 /assets/*.js bundle');
  } else {
    const bundle = await need(`/assets/${m[1]}`, `bundle ${m[1]}`, 100000);
    if (bundle) {
      const s = bundle.toString('utf8');
      if (s.includes('player-shell')) ok('bundle 含播放器（player-shell）');
      else bad('bundle 缺少播放器实现');
      if (s.includes('noopener external')) ok('bundle 含跳转安全属性');
      else bad('bundle 缺少 rel="noopener external"');
    }
  }

  console.log(`\n${'-'.repeat(52)}`);
  console.log(fail === 0
    ? `全部通过：${pass} 项。线上播放链路健康。` + (warn ? `（另有 ${warn} 条站外片源警告）` : '')
    : `存在 ${fail} 项失败（通过 ${pass} 项` + (warn ? `，另有 ${warn} 条站外片源警告` : '') + '）。');
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('运行异常:', e); process.exit(1); });
