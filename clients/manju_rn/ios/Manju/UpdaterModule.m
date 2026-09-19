/**
 * 将 Swift 实现的 UpdaterModule 暴露给 React Native 的桥接文件。
 * 配合 Manju-Bridging-Header.h 使用；Xcode 中需把该 bridging header
 * 设置为 Target 的 "Objective-C Bridging Header"。
 */
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(UpdaterModule, NSObject)

RCT_EXTERN_METHOD(
  openStore:(NSString *)url
  resolve:(RCTPromiseResolveBlock)resolve
  reject:(RCTPromiseRejectBlock)reject
)

@end
