/**
 * 详情页：分集网格 + 选集。点击某集进入播放页。
 * 数据来自 /api/v1/series/{id}（含 episodes）。
 */
import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native';
import {apiClient, Series, Episode} from '../api/client';

type Nav = any;

interface Props {
  navigation: Nav;
  route: {params: {seriesId: string}};
}

export default function DetailScreen({navigation, route}: Props) {
  const {seriesId} = route.params;
  const [series, setSeries] = useState<Series | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, [seriesId]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [detail, eps] = await Promise.all([
        apiClient.seriesDetail(seriesId),
        apiClient.episodes(seriesId),
      ]);
      setSeries(detail);
      setEpisodes(eps.items ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function play(ep: Episode) {
    navigation.navigate('Player', {episodeId: ep.id, title: ep.title});
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {series && (
        <View style={styles.header}>
          <Image source={{uri: series.cover}} style={styles.poster} />
          <View style={styles.headerInfo}>
            <Text style={styles.name}>{series.title}</Text>
            <Text style={styles.meta}>
              {series.status === 'ongoing' ? '连载中' : '已完结'} · 共
              {series.total_episodes}集
            </Text>
            <Text style={styles.meta}>评分 {series.score}</Text>
            <Text style={styles.synopsis} numberOfLines={4}>
              {series.synopsis}
            </Text>
          </View>
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionTitle}>选集</Text>
      <FlatList
        data={episodes}
        keyExtractor={(it) => it.id}
        numColumns={4}
        scrollEnabled={false}
        renderItem={({item}) => (
          <TouchableOpacity style={styles.epCell} onPress={() => play(item)}>
            <Text style={styles.epIndex}>{item.index}</Text>
            <Text style={styles.epTitle} numberOfLines={1}>
              {item.title}
            </Text>
          </TouchableOpacity>
        )}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0f0f12', padding: 12},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  header: {flexDirection: 'row', marginBottom: 12},
  poster: {width: 110, height: 154, borderRadius: 8, backgroundColor: '#222'},
  headerInfo: {flex: 1, marginLeft: 12},
  name: {color: '#fff', fontSize: 20, fontWeight: '700'},
  meta: {color: '#8a8a9a', fontSize: 12, marginTop: 4},
  synopsis: {color: '#cfcfe0', fontSize: 13, marginTop: 8, lineHeight: 20},
  sectionTitle: {color: '#fff', fontSize: 17, fontWeight: '600', marginVertical: 10},
  epCell: {
    width: '25%',
    padding: 6,
    alignItems: 'center',
  },
  epIndex: {color: '#fff', fontSize: 16, fontWeight: '700'},
  epTitle: {color: '#8a8a9a', fontSize: 10, marginTop: 2, textAlign: 'center' },
  error: {color: '#ff6b6b', marginTop: 16},
});
