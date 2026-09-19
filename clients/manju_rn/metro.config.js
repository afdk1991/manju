const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro 配置：默认即可满足本项目的打包需求。
 * 若日后引入.avif/.hdr等特殊资源，可在此扩展 assetExts。
 */
const config = {};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
