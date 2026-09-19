/**
 * 鸿蒙端首页（ArkTS）。
 * 这里仅演示与更新相关的入口：展示版本号 + "检查更新"按钮。
 * 真正的漫剧内容列表实现与 RN 端一致，遵循 spec/openapi.yaml 契约。
 */
import { common } from '@kit.AbilityKit';
import { readAppVersion, checkForUpdate, openAppGallery, OtaCheckResponse } from '../updater/Updater';

const BASE_URL = 'https://manju-drama-hub-tkwcxlaw.edgeone.cool';
const DEVICE_ID = 'harmony_anon_0001'; // 生产环境应由持久化匿名指纹替代

@Entry
@Component
struct Index {
  @State message: string = '漫剧 · 鸿蒙端';
  @State appVersion: string = '0.0.0';
  @State appBuild: number = 0;
  @State updateTip: string = '点击右侧按钮检查更新';

  private context: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;

  aboutToAppear(): void {
    const v = readAppVersion();
    this.appVersion = v.version;
    this.appBuild = v.build;
  }

  // 检查更新：发现新版本后，仅引导跳转华为应用市场（鸿蒙不支持静默安装）。
  async onCheckUpdate(): Promise<void> {
    this.updateTip = '正在检查更新…';
    const resp: OtaCheckResponse | null = await checkForUpdate(BASE_URL, DEVICE_ID);
    if (!resp || !resp.has_update || !resp.release) {
      this.updateTip = '已是最新版本';
      return;
    }
    const notes = resp.release.notes_i18n['zh-CN'] ?? resp.release.notes_i18n['en'] ?? '';
    this.updateTip = `发现新版本 ${resp.release.version}：${notes}`;
    // 鸿蒙红线：只能跳转应用市场，不能自动安装
    const storeUrl = resp.store_fallback?.url;
    openAppGallery(this.context, storeUrl);
  }

  build() {
    Column() {
      Text(this.message)
        .fontSize(28)
        .fontWeight(FontWeight.Bold)
        .margin({ top: 40, bottom: 16 })

      Text(`当前版本：${this.appVersion}（构建号 ${this.appBuild}）`)
        .fontSize(16)
        .margin({ bottom: 8 })

      Text(this.updateTip)
        .fontSize(14)
        .fontColor('#888')
        .margin({ bottom: 24 })

      Button('检查更新')
        .onClick(() => this.onCheckUpdate())
        .width(200)
        .height(44)
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Start)
    .alignItems(HorizontalAlign.Center)
  }
}
