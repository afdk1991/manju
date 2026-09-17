// 下载安装包：使用 Tauri http plugin 流式下载，支持进度回调，落盘到临时目录。
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { writeFile, mkdir, BaseDirectory } from "@tauri-apps/plugin-fs";
import type { Artifact } from "../api/types";

export interface DownloadProgress {
  received: number;
  total: number;
  ratio: number;
}

/**
 * 下载产物到临时目录（$TEMP/ota/）。
 * 注意：插件 http 在 2.x 已支持流式 `resp.body`（`ReadableStream<Uint8Array>`），
 * 我们按 chunk 累加以便上报进度，并限制写入 $TEMP 以降低权限面。
 */
export async function downloadArtifact(
  artifact: Artifact,
  onProgress?: (p: DownloadProgress) => void,
): Promise<Uint8Array> {
  const resp = await tauriFetch(artifact.url, { method: "GET" });
  if (!resp.ok) {
    throw new Error(`下载失败 HTTP ${resp.status}`);
  }

  const total = Number(resp.headers.get("content-length") ?? artifact.size ?? 0);
  const chunks: Uint8Array[] = [];
  let received = 0;

  if (resp.body) {
    const reader = resp.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        onProgress?.({ received, total, ratio: total ? received / total : 0 });
      }
    }
  } else {
    // 兜底：部分平台无流式 body，一次性读取。
    const buf = new Uint8Array(await resp.arrayBuffer());
    chunks.push(buf);
    received = buf.length;
    onProgress?.({ received, total: buf.length, ratio: 1 });
  }

  const bytes = concat(chunks, received);

  // 落盘到临时目录，便于安装器取用（部分平台安装器需文件路径）。
  const dir = "ota";
  await mkdir(dir, { baseDir: BaseDirectory.Temp, recursive: true }).catch(() => {});
  const fileName = `manju-update-${artifact.type}`;
  await writeFile(`${dir}/${fileName}`, bytes, {
    baseDir: BaseDirectory.Temp,
  }).catch(() => {
    /* 落盘失败不影响内存中的字节，安装器可改用内存方案 */
  });

  return bytes;
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
