/**
 * 设置页：展示当前版本号，并提供「手动检查更新」入口。
 *
 * 平台红线提示：iOS 与 HarmonyOS 无法在应用内静默安装，只能引导跳转商店。
 * 这里的文案与交互均明确说明这一点，不向用户承诺"自动下载并安装"。
 */
import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';

import {useUpdater, UpdateProgress, showUpdateAlert} from '../updater';
import {getAppVersion, getAppBuild, currentOtaPlatform} from '../device';
import {OtaCheckResponse} from '../updater/types';

export default function SettingsScreen() {
  const updater = useUpdater();
  const [version, setVersion] = useState('');
  const [build, setBuild] = useState(0);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<UpdateProgress | null>(null);

  useEffect(() => {
    getAppVersion().then(setVersion);
    getAppBuild().then(setBuild);
  }, []);

  function platformHint(): string {
    const p = currentOtaPlatform();
    if (p === 'ios') {
      return 'iOS 受 Apple 限制，无法在应用内自动安装更新，检测后将跳转 App Store 升级。';
    }
    if (p === 'android') {
      return 'Android 检测到更新后将自动下载并安装，首次需你授权"允许安装未知来源应用"。';
    }
    return '当前平台更新需通过应用商店完成。';
  }

  async function onCheck() {
    setChecking(true);
    setMessage('');
    setProgress(null);
    try {
      const result = await updater.check();
      if (!result.hasUpdate) {
        setMessage(result.errorMessage ? `检查失败：${result.errorMessage}` : '已是最新版本');
        return;
      }
      const response: OtaCheckResponse = result.response!;
      showUpdateAlert(
        response,
        () => runInstall(response),
        () => updater.skip(response),
      );
    } finally {
      setChecking(false);
    }
  }

  async function runInstall(response: OtaCheckResponse) {
    await updater.downloadAndInstall(response, (p) => {
      setProgress(p);
      if (p.message) setMessage(p.message);
      if (p.error) setMessage(`更新失败：${p.error}`);
    });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>设置</Text>

      <View style={styles.block}>
        <Text style={styles.label}>当前版本</Text>
        <Text style={styles.value}>
          {version}（构建号 {build}）
        </Text>
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>更新说明</Text>
        <Text style={styles.hint}>{platformHint()}</Text>
      </View>

      <TouchableOpacity
        style={[styles.btn, checking && styles.btnDisabled]}
        onPress={onCheck}
        disabled={checking}>
        <Text style={styles.btnText}>{checking ? '正在检查…' : '检查更新'}</Text>
      </TouchableOpacity>

      {progress && (
        <View style={styles.progress}>
          <Text style={styles.progressText}>
            状态：{progress.phase}
            {progress.ratio > 0 && progress.ratio < 1
              ? `（${(progress.ratio * 100).toFixed(0)}%）`
              : ''}
          </Text>
        </View>
      )}

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Text style={styles.foot}>
        漫剧 · React Native 端 · {Platform.OS === 'ios' ? 'iOS' : 'Android'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0f0f12', padding: 16},
  title: {color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 16},
  block: {marginBottom: 16},
  label: {color: '#8a8a9a', fontSize: 13, marginBottom: 4},
  value: {color: '#fff', fontSize: 16},
  hint: {color: '#cfcfe0', fontSize: 13, lineHeight: 20},
  btn: {
    backgroundColor: '#3b6ef5',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: {opacity: 0.6},
  btnText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  progress: {marginTop: 16, padding: 12, backgroundColor: '#1a1a22', borderRadius: 8},
  progressText: {color: '#fff'},
  message: {color: '#8a8a9a', fontSize: 13, marginTop: 12, lineHeight: 20},
  foot: {color: '#5a5a6a', fontSize: 11, marginTop: 24, textAlign: 'center'},
});
