/**
 * /api/v1/admin/* 兜底 —— Makers 版为静态只读内容中台
 *
 * 内容管理写操作（系列/集数增删改）在无服务器版中不支持（内容以静态 JSON 发布），
 * 统一返回 501 提示；修改内容请在本机 FastAPI 版操作后重新运行 export_static.py。
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
