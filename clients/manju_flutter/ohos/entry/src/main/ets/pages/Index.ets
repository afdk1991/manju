/**
 * 鸿蒙端首页。
 *
 * 说明：本文件是 **ArkUI 原生实现**，用于展示鸿蒙端的更新逻辑与内容浏览。
 * 若接入 Flutter OHOS 引擎，这里应改为加载 Flutter 页面容器，
 * 更新逻辑则可复用 Dart 侧的 `store_updater.dart`。
 *
 * 这里保留原生实现，是为了保证即使没有 Flutter OHOS 引擎，
 * 鸿蒙端依然是一个能独立跑起来的完整应用。
 */

import { common } from '@kit.AbilityKit';
import { promptAction } from '@kit.ArkUI';
import Logger from '../common/Logger';
import { OtaCheckResult, UpdaterPlugin } from '../updater/UpdaterPlugin';

const TAG: string = 'Index';

/** 列表项数据。 */
interface SeriesItem {
  id: string;
  title: string;
  cover: string;
  episodes: number;
}

@Entry
@Component
struct Index {
  @State seriesList: SeriesItem[] = [];
  @State loading: boolean = true;
  @State checking: boolean = false;
  @State updateVisible: boolean = false;
  @State pendingUpdate: OtaCheckResult | null = null;

  private context: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
  private apiBase: string = 'http://localhost:8000';

  aboutToAppear(): void {
    this.loadSeries();
    this.checkUpdateOnStart();
  }

  /** 拉取剧集列表。 */
  async loadSeries(): Promise<void> {
    this.loading = true;
    try {
      const resp = await fetch(`${this.apiBase}/api/v1/series?page=1&size=20&sort=hot`);
      const data = JSON.parse(resp.result.toString()) as Record<string, Object>;
      const items = (data['items'] ?? []) as Array<Record<string, Object>>;
      this.seriesList = items.map((it) => ({
        id: (it['id'] as string) ?? '',
        title: (it['title'] as string) ?? '未知剧集',
        cover: (it['cover'] as string) ?? '',
        episodes: (it['total_episodes'] as number) ?? 0,
      }));
    } catch (err) {
      Logger.error(TAG, `加载剧集失败: ${JSON.stringify(err)}`);
      promptAction.showToast({ message: '加载失败，请检查网络' });
    } finally {
      this.loading = false;
    }
  }

  /** 启动时静默检查一次更新，有更新才弹窗。 */
  async checkUpdateOnStart(): Promise<void> {
    const updater = new UpdaterPlugin(this.context);
    const result = await updater.checkUpdate(this.apiBase);
    if (result !== null && result.hasUpdate) {
      this.pendingUpdate = result;
      this.updateVisible = true;
    }
  }

  /** 手动检查更新。 */
  async checkUpdateManually(): Promise<void> {
    if (this.checking) {
      return;
    }
    this.checking = true;
    try {
      const updater = new UpdaterPlugin(this.context);
      const result = await updater.checkUpdate(this.apiBase);
      if (result === null || !result.hasUpdate) {
        promptAction.showToast({ message: '当前已是最新版本' });
        return;
      }
      this.pendingUpdate = result;
      this.updateVisible = true;
    } finally {
      this.checking = false;
    }
  }

  /** 跳转应用市场升级 —— 鸿蒙端唯一的升级路径。 */
  async goToAppGallery(): Promise<void> {
    const result = this.pendingUpdate;
    if (result === null) {
      return;
    }
    const updater = new UpdaterPlugin(this.context);
    await updater.openAppGallery(result.storeUrl);
    this.updateVisible = false;
  }

  @Builder
  UpdateDialog() {
    Column() {
      Text(`发现新版本 ${this.pendingUpdate?.version ?? ''}`)
        .fontSize(18)
        .fontWeight(FontWeight.Bold)
        .margin({ bottom: 12 })

      Text(this.pendingUpdate?.notes ?? '本次更新包含问题修复与体验优化')
        .fontSize(14)
        .lineHeight(22)
        .margin({ bottom: 12 })

      // 平台限制说明：鸿蒙不支持应用内静默安装
      Text('受鸿蒙平台限制，应用无法自行安装更新，需前往华为应用市场完成升级。')
        .fontSize(12)
        .fontColor('#B26A00')
        .padding(10)
        .backgroundColor('#FFF7E6')
        .borderRadius(8)
        .margin({ bottom: 16 })

      Row() {
        Button('稍后再说')
          .onClick(() => {
            this.updateVisible = false;
          })
          .margin({ right: 12 })

        Button('前往应用市场')
          .onClick(() => {
            this.goToAppGallery();
          })
      }
    }
    .padding(20)
    .backgroundColor(Color.White)
    .borderRadius(16)
  }

  build() {
    Stack() {
      Column() {
        // 顶部栏
        Row() {
          Text('漫剧')
            .fontSize(22)
            .fontWeight(FontWeight.Bold)

          Blank()

          Button(this.checking ? '检查中…' : '检查更新')
            .fontSize(13)
            .onClick(() => {
              this.checkUpdateManually();
            })
        }
        .width('100%')
        .padding({ left: 16, right: 16, top: 12, bottom: 12 })

        // 内容区
        if (this.loading) {
          LoadingProgress()
            .width(40)
            .height(40)
            .layoutWeight(1)
        } else if (this.seriesList.length === 0) {
          Column() {
            Text('暂无内容')
              .fontSize(14)
              .fontColor('#999999')
          }
          .layoutWeight(1)
          .justifyContent(FlexAlign.Center)
        } else {
          Grid() {
            ForEach(this.seriesList, (item: SeriesItem) => {
              GridItem() {
                Column() {
                  Image(item.cover)
                    .width('100%')
                    .aspectRatio(0.75)
                    .borderRadius(8)
                    .backgroundColor('#EEEEEE')

                  Text(item.title)
                    .fontSize(13)
                    .maxLines(1)
                    .textOverflow({ overflow: TextOverflow.Ellipsis })
                    .margin({ top: 6 })

                  Text(`${item.episodes} 集`)
                    .fontSize(11)
                    .fontColor('#999999')
                }
                .width('100%')
              }
            }, (item: SeriesItem) => item.id)
          }
          .columnsTemplate('1fr 1fr 1fr')
          .columnsGap(10)
          .rowsGap(14)
          .padding(16)
          .layoutWeight(1)
        }
      }
      .width('100%')
      .height('100%')

      // 更新弹窗
      if (this.updateVisible) {
        Column() {
          this.UpdateDialog()
            .width('85%')
        }
        .width('100%')
        .height('100%')
        .backgroundColor('rgba(0,0,0,0.4)')
        .justifyContent(FlexAlign.Center)
      }
    }
  }
}
