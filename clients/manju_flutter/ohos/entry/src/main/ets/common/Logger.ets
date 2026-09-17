/**
 * 轻量日志工具（鸿蒙端）。
 *
 * 与 Flutter 端的 print / debugPrint 保持同样的分级习惯，
 * 便于跨端排查问题时对照日志。
 */

import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN: number = 0x4D414E4A; // 'MANJ'
const PREFIX: string = '[Manju]';

export default class Logger {
  static debug(tag: string, msg: string): void {
    hilog.debug(DOMAIN, tag, `${PREFIX} ${msg}`);
  }

  static info(tag: string, msg: string): void {
    hilog.info(DOMAIN, tag, `${PREFIX} ${msg}`);
  }

  static warn(tag: string, msg: string): void {
    hilog.warn(DOMAIN, tag, `${PREFIX} ${msg}`);
  }

  static error(tag: string, msg: string): void {
    hilog.error(DOMAIN, tag, `${PREFIX} ${msg}`);
  }
}
