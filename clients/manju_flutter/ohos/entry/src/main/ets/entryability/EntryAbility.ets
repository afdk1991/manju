/**
 * 鸿蒙端应用入口。
 *
 * 注意：鸿蒙端需要使用社区维护的 Flutter OHOS 分支
 * （https://gitee.com/openharmony-sig/flutter_flutter）才能运行 Flutter 页面。
 * 本 Ability 负责拉起 Flutter 页面容器，并在启动后触发一次 OTA 检查。
 */

import { UIAbility, Want, AbilityConstant } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import Logger from '../common/Logger';

const TAG: string = 'EntryAbility';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    Logger.info(TAG, '应用启动');
  }

  onDestroy(): void {
    Logger.info(TAG, '应用销毁');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    Logger.info(TAG, '加载页面');

    // 鸿蒙端加载 Flutter 页面容器
    // 使用 OHOS 版 Flutter 引擎时，这里加载的是 Flutter 的入口页面
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        Logger.error(TAG, `加载页面失败: ${JSON.stringify(err)}`);
        return;
      }
      Logger.info(TAG, '页面加载成功');
    });
  }

  onWindowStageDestroy(): void {
    Logger.info(TAG, '窗口销毁');
  }

  onForeground(): void {
    Logger.info(TAG, '应用进入前台');
  }

  onBackground(): void {
    Logger.info(TAG, '应用进入后台');
  }
}
