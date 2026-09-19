/**
 * 首页：分区推荐列表 + 分类入口。
 * 分区来自 /api/v1/home，分类来自 /api/v1/categories。
 */
import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native';

import {apiClient, HomeSection, Category, SeriesBase} from '../api/client';

type Nav = any;

interface Props {
  navigation: Nav;
}

export default function HomeScreen({navigation}: Props) {
  const [sections, setSections] = useState<HomeSection[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [home, cats] = await Promise.all([
        apiClient.home('zh-CN'),
        apiClient.categories(),
      ]);
      setSections(home.sections ?? []);
      setCategories(cats.items ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function openSeries(item: SeriesBase) {
    navigation.navigate('Detail', {seriesId: item.id});
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>漫剧 · 首页</Text>

      {categories.length > 0 && (
        <View style={styles.catRow}>
          {categories.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={styles.catChip}
              onPress={() =>
                navigation.navigate('Detail', {seriesId: c.id})
              }>
              <Text style={styles.catText}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading && <ActivityIndicator style={{marginTop: 24}} />}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {sections.map((section) => (
        <View key={section.id} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <FlatList
            horizontal
            data={section.items}
            keyExtractor={(it) => it.id}
            showsHorizontalScrollIndicator={false}
            renderItem={({item}) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => openSeries(item)}>
                <Image
                  source={{uri: item.cover}}
                  style={styles.cover}
                  defaultSource={undefined}
                />
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {item.is_vip ? '会员' : '免费'} · {item.total_episodes}集
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0f0f12', padding: 12},
  title: {color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 8},
  catRow: {flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8},
  catChip: {
    backgroundColor: '#23232b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  catText: {color: '#cfcfe0'},
  section: {marginTop: 12},
  sectionTitle: {color: '#fff', fontSize: 17, fontWeight: '600', marginBottom: 8},
  card: {width: 120, marginRight: 12},
  cover: {width: 120, height: 168, borderRadius: 8, backgroundColor: '#222'},
  cardTitle: {color: '#fff', marginTop: 6, fontSize: 13},
  cardMeta: {color: '#8a8a9a', fontSize: 11, marginTop: 2},
  error: {color: '#ff6b6b', marginTop: 16},
});
