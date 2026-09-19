/**
 * 搜索页：输入关键词，调用 /api/v1/search，展示结果列表。
 */
import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {apiClient, SeriesBase} from '../api/client';

type Nav = any;

interface Props {
  navigation: Nav;
}

export default function SearchScreen({navigation}: Props) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SeriesBase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function doSearch() {
    if (!keyword.trim()) return;
    setLoading(true);
    setError('');
    try {
      const resp = await apiClient.search(keyword.trim(), 1);
      setResults(resp.items ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          placeholder="搜索漫剧名称"
          placeholderTextColor="#8a8a9a"
          value={keyword}
          onChangeText={setKeyword}
          onSubmitEditing={doSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchBtn} onPress={doSearch}>
          <Text style={styles.searchBtnText}>搜索</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={results}
        keyExtractor={(it) => it.id}
        contentContainerStyle={styles.list}
        renderItem={({item}) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('Detail', {seriesId: item.id})}>
            <Image source={{uri: item.cover}} style={styles.rowCover} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {item.is_vip ? '会员' : '免费'} · {item.total_episodes}集
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>没有结果，换个关键词试试</Text> : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0f0f12', padding: 12},
  searchBar: {flexDirection: 'row', marginBottom: 12},
  input: {
    flex: 1,
    backgroundColor: '#23232b',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchBtn: {marginLeft: 8, backgroundColor: '#3b6ef5', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center'},
  searchBtnText: {color: '#fff', fontWeight: '600'},
  list: {paddingBottom: 24},
  row: {flexDirection: 'row', marginBottom: 12},
  rowCover: {width: 64, height: 90, borderRadius: 6, backgroundColor: '#222'},
  rowInfo: {flex: 1, marginLeft: 12, justifyContent: 'center'},
  rowTitle: {color: '#fff', fontSize: 15, fontWeight: '600'},
  rowMeta: {color: '#8a8a9a', fontSize: 12, marginTop: 4},
  empty: {color: '#8a8a9a', textAlign: 'center', marginTop: 40},
  error: {color: '#ff6b6b', marginBottom: 8},
});
