/**
 * 播放页：使用 react-native-video 播放 HLS（container=hls）。
 * 数据来自 /api/v1/episodes/{id}，优先选择 hls 源。
 */
import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import Video from 'react-native-video';
import {apiClient, Episode, VideoSource} from '../api/client';

type Nav = any;

interface Props {
  navigation: Nav;
  route: {params: {episodeId: string; title?: string}};
}

export default function PlayerScreen({navigation, route}: Props) {
  const {episodeId, title} = route.params;
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [source, setSource] = useState<VideoSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, [episodeId]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const ep = await apiClient.episode(episodeId);
      setEpisode(ep);
      // 优先 hls 源，其次 mp4，再次任意
      const pick =
        ep.sources.find((s) => s.container === 'hls') ??
        ep.sources.find((s) => s.container === 'mp4') ??
        ep.sources[0];
      setSource(pick ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (error || !source) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error || '暂无可用播放源'}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>返回</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Video
        source={{uri: source.url}}
        style={styles.video}
        controls
        resizeMode="contain"
        onLoad={(d: any) => console.log('视频时长', d.duration)}
        onError={(e) => setError('播放失败：' + JSON.stringify(e))}
      />
      <View style={styles.bar}>
        <Text style={styles.title}>{title ?? episode?.title}</Text>
        <Text style={styles.hint}>
          清晰度：{source.quality}（{source.container}）
        </Text>
      </View>
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>返回</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#000'},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000'},
  video: {flex: 1, backgroundColor: '#000'},
  bar: {padding: 12, backgroundColor: '#0f0f12'},
  title: {color: '#fff', fontSize: 16, fontWeight: '600'},
  hint: {color: '#8a8a9a', fontSize: 12, marginTop: 4},
  backBtn: {
    position: 'absolute',
    top: 40,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  backText: {color: '#fff'},
  error: {color: '#ff6b6b', marginBottom: 16},
});
