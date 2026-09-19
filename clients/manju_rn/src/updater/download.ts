/**
 * 更新包下载（使用 react-native-fs）。
 * 下载到应用私有缓存目录，安装后由调用方负责清理。
 */
import RNFS from 'react-native-fs';

import {OtaArtifact} from './types';

export interface DownloadResult {
  ok: boolean;
  path?: string;
  error?: string;
}

/**
 * 下载产物到缓存目录。
 * @param onProgress 进度回调，ratio 取值 0~1
 */
export async function downloadArtifact(
  artifact: OtaArtifact,
  onProgress?: (ratio: number) => void,
): Promise<DownloadResult> {
  const ext = artifact.type === 'apk' ? 'apk' : artifact.type;
  const dest = `${RNFS.CachesDirectoryPath}/manju_ota_${Date.now()}.${ext}`;

  try {
    const job = RNFS.downloadFile({
      fromUrl: artifact.url,
      toFile: dest,
      begin: () => {},
      progress: (res) => {
        if (artifact.size > 0 && onProgress) {
          onProgress(Math.min(1, res.bytesWritten / artifact.size));
        } else if (onProgress) {
          onProgress(-1); // 未知总大小，UI 显示"下载中"
        }
      },
      progressDivider: 10,
      // 必须 HTTPS（协议 §7.1 要求）
      connectionTimeout: 30000,
      readTimeout: 30000,
    });
    const result = await job.promise;
    if (result.statusCode >= 200 && result.statusCode < 300) {
      return {ok: true, path: dest};
    }
    // 下载失败清理
    try {
      await RNFS.unlink(dest);
    } catch {
      /* noop */
    }
    return {ok: false, error: `HTTP ${result.statusCode}`};
  } catch (e) {
    return {ok: false, error: String(e)};
  }
}
