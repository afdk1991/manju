/**
 * /api/v1/admin 只读兜底 —— Makers 版为静态只读内容中台
 *
 * 内容管理写操作（系列/集数增删改）在无服务器版中不支持（内容以静态 JSON 发布），
 * 统一返回 501 提示；修改内容请在本机 FastAPI 版操作后重新运行 export_static.py。
 *
 * ⚠️ 文件名红线：本文件原名 `[[default]].js`（catch-all 写法），会导致 EdgeOne
 *    云端构建失败（DescribePagesDeployments 返回 Code=18，约 14.7s 即 Failed）。
 *    经二分实测：构建器无法处理**含方括号的文件名**，与导出形式无关
 *    （改成同内容的 index.js 后部署即成功）。
 *    ⇒ 本项目 cloud-functions 目录内**禁止出现 [] 命名的文件**。
 *
 *    副作用：改为 index.js 后只匹配 `/api/v1/admin` 精确路径，不再覆盖
 *    `/api/v1/admin/*` 全部子路径。其余 admin 写路径未命中函数时会按平台默认
 *    404 处理；实际使用的 releases / reports/stats 均有独立 index.js 不受影响。
 */
import { json } from '../../../_lib/data.js';

export function onRequest(context) {
  return json(
    {
      code: 'readonly',
      message: 'EdgeOne Makers 版为只读内容中台：系列/集数请在本地 FastAPI 版维护后，'
        + '重新运行 makers/scripts/export_static.py 并重新部署。',
    },
    501,
  );
}
