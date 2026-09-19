import Foundation
import UIKit

/**
 * iOS 端 OTA 原生模块（可选 / 兜底）。
 *
 * ⚠️ 平台红线（对应 spec/ota-protocol.v1.md §4）：
 *    Apple **禁止**应用自行下载并安装可执行文件（侧载）。任何绕过 App Store 的
 *    静默安装都会导致应用下架、开发者账号封禁。TestFlight / 企业分发同样需要
 *    用户在系统弹窗中确认。
 *    因此 iOS 端**严禁**实现"下载 APK/IPA 并安装"。正确行为只有一种：
 *    检测更新 → 展示说明 → 用户确认 → 跳转 App Store（store_fallback.url）。
 *
 * 真正的跳转统一由 RN 侧 `Linking.openURL` 完成（见 src/updater/index.tsx），
 * 本原生模块仅作为"在原生侧打开商店地址"的兜底能力，并向 JS 暴露平台常量。
 *
 * 通道名 "Updater" 与 RN 侧 src/updater/native.ts 约定一致（仅 iOS 下本模块未承载安装逻辑）。
 */
@objc(UpdaterModule)
class UpdaterModule: NSObject {
  // 标记该模块需在主线程初始化（涉及 UIApplication）。
  @objc static func requiresMainQueueSetup() -> Bool { true }

  // 暴露给 JS 的常量：明确告知 iOS 不支持应用内安装。
  @objc func constantsToExport() -> [String: Any]! {
    return [
      "canSelfInstall": false,
      "platform": "ios",
      "note": "iOS 仅支持跳转 App Store 升级，禁止静默安装"
    ]
  }

  /**
   * 兜底：在原生侧用 UIApplication 打开商店地址。
   * 参数 url 来自服务端下发的 store_fallback.url（App Store 链接）。
   * 实际发起跳转的仍是 JS 侧 Linking.openURL；本方法用于需要原生上下文的场景。
   */
  @objc(openStore:resolve:reject:)
  func openStore(
    _ url: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let u = URL(string: url), UIApplication.shared.canOpenURL(u) else {
      reject("E_OPEN_STORE", "无法打开商店地址: \(url)", nil)
      return
    }
    UIApplication.shared.open(u, options: [:]) { ok in
      resolve(ok)
    }
  }
}
