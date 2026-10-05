// HLS/m3u8 代理 —— 重写 m3u8 中的片段 URL 为代理路径
export async function onRequestGet(context) {
  const target = new URL(context.request.url).searchParams.get('url');
  if (!target) {
    return new Response('missing url', { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    const targetUrl = new URL(target);
    const resp = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.yayazy.net/',
        'Origin': 'https://www.yayazy.net'
      },
      redirect: 'follow'
    });

    const ct = resp.headers.get('content-type') || '';
    const isM3u8 = targetUrl.pathname.endsWith('.m3u8') || ct.includes('mpegurl') || ct.includes('octet-stream');

    if (isM3u8) {
      const text = await resp.text();
      // 检查是否是 m3u8 格式
      if (!text.includes('#EXTM3U')) {
        // 不是 m3u8，直接返回原始内容
        return new Response(text, {
          status: resp.status,
          headers: {
            'Content-Type': ct || 'application/octet-stream',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=300'
          }
        });
      }

      const lines = text.split('\n').map(line => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return line;
        // 片段 URL：解析为绝对 URL，再包装成代理 URL
        try {
          const abs = new URL(t, targetUrl).href;
          return '/api/proxy?url=' + encodeURIComponent(abs);
        } catch {
          return line;
        }
      });

      return new Response(lines.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300'
        }
      });
    }

    // ts 片段等二进制
    const body = await resp.arrayBuffer();
    return new Response(body, {
      status: resp.status,
      headers: {
        'Content-Type': ct || 'video/MP2T',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (e) {
    return new Response('proxy error: ' + e.message, {
      status: 502,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    }
  });
}
