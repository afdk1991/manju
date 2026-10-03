---
name: manju-review-gates
description: 漫剧 Manju（项目007）五节点评审的机检执行与准出把关。当需要跑评审门禁命令、准备或复核 review 记录、判断某版本能否准出、启用专家/连接器视角做评审、或做每期开工前检查时使用。含四 job 门禁的本地等价命令、五节点 × 专家视角映射、准出判据唯一原则、扩展机制启用前检查。
version: 1.0.0
---

# 项目007 · 评审门禁与准出把关

> 对应方案A 第三章（分布式多人评审体系）与 `docs/评审体系落地清单（项目007版）.md`。
> 扩展机制部分见 `docs/扩展机制整合方案（方案A补充章节）.md`。

## 🔴 第一原则：准出判据唯一

**准出只看两样**：① CI 门禁（`.github/workflows/review-gates.yml` 四个 job）
② `review/` 五份填写完整的记录。

专家、**工作伙伴（Agent）**、插件的意见**都是输入，不是结论**（风险 R-14）。
合规签字、法律责任、平台上架终审**必须由真人完成**。

## 四 job 门禁与本地等价命令

| Job | 覆盖 | 判据 | 门槛 | 本地等价命令 |
|---|---|---|---|---|
| `web-quality` | `npm ci` → `tsc --noEmit` → `vite build` → `smoke_web.mjs` | smoke_web **21/21** | 🔴 Hard | `cd web && npm run build && cd ../makers && node scripts/smoke_web.mjs` |
| `backend-quality` | 装依赖 → 启 uvicorn → `smoke_test.py` | **19/19** | 🟡 Soft | `python scripts/smoke_test.py` |
| `security-gates` | `check_ota_keys.py` + 私钥扫描 + 过期域名 + 红线 rewrite | 无命中 | 🔴 Hard | `python scripts/check_ota_keys.py` + 下方扫描命令 |
| `contract-guard` | `spec/` 是否被改、`edgeone.json` 红线 rewrite | 无违规 | 🔴 Hard | `git diff --name-only -- spec/ makers/edgeone.json` |

```bash
# security-gates 本地等价（宽匹配，勿在仓库文件里写私钥头完整字面量）
git grep -nI -E 'BEGIN [A-Z ]*PRIVATE KEY' -- . || echo "OK"
python scripts/check_ota_keys.py
```

**CI 侧已知坑**
- `server/data/artifacts` 必须先 mkdir（`main.py` 导入期就 `StaticFiles`，缺目录启动即崩）
- seed 必须在 **API 启动之后**跑
- `scripts/seed_content_library.py --manifest` 是**必填**参数，缺参退出码 2 会被 `continue-on-error` 吞掉
- 沙箱会**静默吞 `git add`** → 提交推送用 `dangerouslyDisableSandbox: true`

> 线上真机判据（`verify_online_playback.mjs`）**不进 CI**（依赖 3 小时过期的预览域 token），
> 每次部署后手工跑，见 `manju-online-verify` 技能。

## 五节点 × 专家视角映射（启用一个专家/会话）

| 节点 | 记录模板 | 建议专家视角 | 机检动作 |
|---|---|---|---|
| ① 需求评审 | `review/01-需求评审记录.md` | 产品 / 业务视角 | 派 Explore 子代理核对需求是否建立在过期事实上 |
| ② 技术方案评审 | `review/02-技术方案评审记录.md` | 架构视角（Flutter + FastAPI） | `contract-guard` + 依赖风险扫描 |
| ③ 代码评审 | `review/03-代码评审记录.md` | 同技术栈交叉评审视角 | `web-quality` + `security-gates` + 派对抗式复核 Agent（只挑刺、不改码） |
| ④ 测试验收评审 | `review/04-测试验收评审记录.md` | 测试视角 | 全量测试报告 + 灰度数据；核心流程无阻塞 Bug，一般 Bug 修复率 ≥95% |
| ⑤ 上线前合规评审 | `review/05-上线合规评审记录.md` | 法务 / 合规视角 | 合规清单逐项勾选；内容授权一票否决 |

**专家硬约束**：同一会话**只能启用一个专家或专家团队**；跨节点换视角需结束当前专家或另起会话。
模板本体保持空白，**复制到 `review/records/<版本>/` 后填写**。

## 扩展机制启用前检查（每期开工前）

- [ ] 本期要启用哪些插件 / MCP / 专家？是否已登记在案
- [ ] 新装技能是否通过安全审计（R-12）；本地型 MCP 是否未挂载 `keys/`、`.ssh/`、`.env`（R-13）
- [ ] 新增 MCP 前确认生效配置文件：`~/.workbuddy/connectors/default/mcp.json`（R-18）
- [ ] 派发给子代理的 prompt 是否写全：绝对路径、红线、判据、产出路径、`max_turns`
- [ ] 外包任务书是否已脱敏（见 `manju-outsourcing-pack`）
- [ ] 部署是否走 EdgeOne Makers 连接器（本项目部署最高优先级通道）

## 评审触发规则

- **小版本**：仅跑自动化门禁 + 主控复核，填 `03`。
- **大版本（每期交付）**：五节点全跑，五份模板各填一份，全部准出才允许打 tag。
- **上线前**：五节点之外追加 `05` 合规清单全项通过，缺一项不放行。
