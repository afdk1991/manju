/**
 * Objective-C 桥接头文件：让 Swift 代码能访问 React Native 的 ObjC 类型
 * （RCTPromiseResolveBlock / RCTPromiseRejectBlock 等）。
 *
 * 在 Xcode 中将该文件设置为 Manju Target 的
 * "Build Settings → Swift Compiler - General → Objective-C Bridging Header"。
 */
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <React/RCTConvert.h>
