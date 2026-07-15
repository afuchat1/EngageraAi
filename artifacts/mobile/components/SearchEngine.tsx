/**
 * Lab Search Engine
 *
 * Full search engine powered by Engagera's AfuBot crawler.
 * Real-time suggestions while typing, tabbed results
 * (Web · Images · Videos · News · Finance), and a built-in
 * WebView browser that opens when the user taps any result.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { InAppBrowser } from '@/components/InAppBrowser';
import {
  fetchSuggestions,
  fetchWebResults,
  fetchImageResults,
  fetchVideoResults,
  fetchNewsResults,
  fetchFinanceResults,
  resolveDomain,
  type WebResult,
  type ImageResult,
  type VideoResult,
  type NewsResult,
  type FinanceResult,
} from '@/lib/search';

// Silence unused-import lint — FinanceResult is used in FinanceCard props
type _F = FinanceResult;

// ── Types ─────────────────────────────────────────────────────────────────────

type SearchTab = 'web' | 'images' | 'videos' | 'news' | 'finance';

interface SearchResults {
  web: WebResult[];
  images: ImageResult[];
  videos: VideoResult[];
  news: NewsResult[];
  finance: FinanceResult[];
}

type LoadingState = Record<SearchTab, boolean>;

const TABS: { key: SearchTab; label: string; icon: string }[] = [
  { key: 'web', label: 'Web', icon: 'globe-outline' },
  { key: 'images', label: 'Images', icon: 'images-outline' },
  { key: 'videos', label: 'Videos', icon: 'play-circle-outline' },
  { key: 'news', label: 'News', icon: 'newspaper-outline' },
  { key: 'finance', label: 'Finance', icon: 'trending-up-outline' },
];

const empty: SearchResults = { web: [], images: [], videos: [], news: [], finance: [] };
const notLoading: LoadingState = { web: false, images: false, videos: false, news: false, finance: false };
const allLoading: LoadingState = { web: true, images: true, videos: true, news: true, finance: true };

const { width: SCREEN_W } = Dimensions.get('window');
const IMG_SIZE = (SCREEN_W - 3) / 2; // 2-col image grid with 3px gap

// ── Sub-components ────────────────────────────────────────────────────────────

function Favicon({ uri }: { uri: string }) {
  const [err, setErr] = useState(false);
  if (err) return <View style={styles.faviconFallback}><Ionicons name="globe-outline" size={13} color="rgba(255,255,255,0.3)" /></View>;
  return <Image source={{ uri }} style={styles.favicon} onError={() => setErr(true)} />;
}

function WebCard({ item, onPress }: { item: WebResult; onPress: (url: string) => void }) {
  const colors = useColors();
  let host = '';
  try { host = new URL(item.url).hostname; } catch { /**/ }
  return (
    <Pressable style={[styles.webCard, { borderBottomColor: colors.border }]} onPress={() => onPress(item.url)}>
      <View style={styles.webCardHeader}>
        <Favicon uri={item.favicon} />
        <View style={styles.webCardMeta}>
          <Text style={[styles.webHost, { color: colors.mutedForeground }]} numberOfLines={1}>{host}</Text>
          {item.age ? <Text style={[styles.webAge, { color: colors.mutedForeground }]}> · {item.age}</Text> : null}
        </View>
      </View>
      <Text style={[styles.webTitle, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
      <Text style={[styles.webDesc, { color: colors.mutedForeground }]} numberOfLines={3}>{item.description}</Text>
    </Pressable>
  );
}

function ImageCard({ item, onPress }: { item: ImageResult; onPress: (url: string) => void }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  return (
    <Pressable style={[styles.imageCell, { width: IMG_SIZE, height: IMG_SIZE }]} onPress={() => onPress(item.pageUrl)}>
      {err ? (
        <View style={[styles.imageCellFallback, { backgroundColor: colors.card }]}>
          <Ionicons name="image-outline" size={28} color={colors.mutedForeground} />
        </View>
      ) : (
        <Image source={{ uri: item.thumbnail || item.src }} style={styles.imageFull} onError={() => setErr(true)} resizeMode="cover" />
      )}
      <View style={styles.imageTitleBar}>
        <Text style={styles.imageTitleText} numberOfLines={1}>{item.source || item.title}</Text>
      </View>
    </Pressable>
  );
}

function VideoCard({ item, onPress }: { item: VideoResult; onPress: (url: string) => void }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  return (
    <Pressable style={[styles.videoCard, { borderBottomColor: colors.border }]} onPress={() => onPress(item.url)}>
      <View style={styles.videoThumbWrap}>
        {!err && item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={styles.videoThumb} onError={() => setErr(true)} resizeMode="cover" />
        ) : (
          <View style={[styles.videoThumb, styles.videoThumbFallback, { backgroundColor: colors.card }]}>
            <Ionicons name="play-circle-outline" size={32} color={colors.mutedForeground} />
          </View>
        )}
        {item.duration ? (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{item.duration}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.videoInfo}>
        <Text style={[styles.videoTitle, { color: colors.foreground }]} numberOfLines={3}>{item.title}</Text>
        {item.publisher ? <Text style={[styles.videoMeta, { color: colors.mutedForeground }]} numberOfLines={1}>{item.publisher}</Text> : null}
        {item.age ? <Text style={[styles.videoAge, { color: colors.mutedForeground }]}>{item.age}</Text> : null}
      </View>
    </Pressable>
  );
}

function NewsCard({ item, onPress }: { item: NewsResult; onPress: (url: string) => void }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  return (
    <Pressable style={[styles.newsCard, { borderBottomColor: colors.border }]} onPress={() => onPress(item.url)}>
      <View style={styles.newsContent}>
        <Text style={[styles.newsSource, { color: colors.mutedForeground }]}>{item.source}{item.age ? ` · ${item.age}` : ''}</Text>
        <Text style={[styles.newsTitle, { color: colors.foreground }]} numberOfLines={3}>{item.title}</Text>
        {item.description ? (
          <Text style={[styles.newsDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{item.description}</Text>
        ) : null}
      </View>
      {item.thumbnail && !err ? (
        <Image source={{ uri: item.thumbnail }} style={styles.newsThumb} onError={() => setErr(true)} resizeMode="cover" />
      ) : null}
    </Pressable>
  );
}

function FinanceCard({ item, onPress }: { item: FinanceResult; onPress: (url: string) => void }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  return (
    <Pressable style={[styles.newsCard, { borderBottomColor: colors.border }]} onPress={() => onPress(item.url)}>
      <View style={styles.newsContent}>
        <View style={styles.financeSourceRow}>
          {item.kind === 'news' ? (
            <View style={styles.financeBadge}><Text style={styles.financeBadgeText}>NEWS</Text></View>
          ) : (
            <View style={[styles.financeBadge, styles.financeBadgeWeb]}><Text style={styles.financeBadgeText}>WEB</Text></View>
          )}
          <Text style={[styles.newsSource, { color: colors.mutedForeground }]}>{item.source}{item.age ? ` · ${item.age}` : ''}</Text>
        </View>
        <Text style={[styles.newsTitle, { color: colors.foreground }]} numberOfLines={3}>{item.title}</Text>
        {item.description ? (
          <Text style={[styles.newsDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{item.description}</Text>
        ) : null}
      </View>
      {item.thumbnail && !err ? (
        <Image source={{ uri: item.thumbnail }} style={styles.newsThumb} onError={() => setErr(true)} resizeMode="cover" />
      ) : null}
    </Pressable>
  );
}

function EmptyTab({ loading, query }: { loading: boolean; query: string }) {
  const colors = useColors();
  if (loading) return <ActivityIndicator color={colors.foreground} style={styles.loader} />;
  if (!query) return null;
  return (
    <View style={styles.emptyTab}>
      <Ionicons name="search-outline" size={32} color={colors.mutedForeground} />
      <Text style={[styles.emptyTabText, { color: colors.mutedForeground }]}>No results for "{query}"</Text>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SearchEngine({ topPad }: { topPad: number }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchTab>('web');
  const [results, setResults] = useState<SearchResults>(empty);
  const [loading, setLoading] = useState<LoadingState>(notLoading);
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);

  // ── Real-time suggestions ──────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const s = await fetchSuggestions(query);
      setSuggestions(s);
      setShowSuggestions(s.length > 0);
    }, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // ── Search ─────────────────────────────────────────────────────────────────
  // AfuBot crawls once per query (cached briefly server-side) and all five
  // result types are read off that same crawl, so they can all run in parallel.
  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;

    // A bare domain (e.g. "afuchat.com") is opened directly — no search step.
    const domainUrl = await resolveDomain(trimmed);
    if (domainUrl) {
      setQuery('');
      setSubmittedQuery('');
      setShowSuggestions(false);
      setSuggestions([]);
      inputRef.current?.blur();
      setBrowserUrl(domainUrl);
      return;
    }

    setQuery(trimmed);
    setSubmittedQuery(trimmed);
    setShowSuggestions(false);
    setSuggestions([]);
    setActiveTab('web');
    setResults(empty);
    setLoading(allLoading);
    inputRef.current?.blur();

    const [web, images, videos, news, finance] = await Promise.allSettled([
      fetchWebResults(trimmed),
      fetchImageResults(trimmed, ''),
      fetchVideoResults(trimmed, ''),
      fetchNewsResults(trimmed, ''),
      fetchFinanceResults(trimmed),
    ]);

    setResults({
      web: web.status === 'fulfilled' ? web.value.results : [],
      images: images.status === 'fulfilled' ? images.value : [],
      videos: videos.status === 'fulfilled' ? videos.value : [],
      news: news.status === 'fulfilled' ? news.value : [],
      finance: finance.status === 'fulfilled' ? finance.value : [],
    });
    setLoading(notLoading);
  }, []);

  const openBrowser = useCallback((url: string) => setBrowserUrl(url), []);

  // ── Render ─────────────────────────────────────────────────────────────────
  const hasSearch = submittedQuery.length > 0;

  return (
    <KeyboardAvoidingView style={[styles.root, { paddingTop: topPad }]} behavior="padding">
      {/* ── Empty landing ────────────────────────────────────────────────── */}
      {!hasSearch ? (
        <View style={styles.landing}>
          <View style={styles.landingIcon}>
            <Ionicons name="search" size={40} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.landingTitle, { color: colors.foreground }]}>Engagera Search</Text>
          <Text style={[styles.landingBody, { color: colors.mutedForeground }]}>
            Web · Images · Videos · News · Finance{'\n'}powered by Engagera's AfuBot crawler
          </Text>
        </View>
      ) : null}

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {hasSearch ? (
        <View style={styles.results}>
          {/* Tab bar */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.tabBar, { borderBottomColor: colors.border }]}
            contentContainerStyle={styles.tabBarContent}
          >
            {TABS.map((tab) => {
              const active = tab.key === activeTab;
              return (
                <Pressable key={tab.key} style={styles.tab} onPress={() => setActiveTab(tab.key)}>
                  <View style={styles.tabInner}>
                    <Ionicons
                      name={tab.icon as any}
                      size={14}
                      color={active ? colors.foreground : colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.tabLabel,
                        { color: active ? colors.foreground : colors.mutedForeground },
                        active && styles.tabLabelActive,
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </View>
                  {active ? <View style={[styles.tabUnderline, { backgroundColor: colors.foreground }]} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Tab content */}
          {activeTab === 'web' ? (
            results.web.length > 0 ? (
              <FlatList
                data={results.web}
                keyExtractor={(_, i) => `web-${i}`}
                renderItem={({ item }) => <WebCard item={item} onPress={openBrowser} />}
                contentContainerStyle={styles.listPad}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              />
            ) : (
              <EmptyTab loading={loading.web} query={submittedQuery} />
            )
          ) : null}

          {activeTab === 'images' ? (
            results.images.length > 0 ? (
              <FlatList
                data={results.images}
                keyExtractor={(_, i) => `img-${i}`}
                numColumns={2}
                columnWrapperStyle={styles.imageRow}
                renderItem={({ item }) => <ImageCard item={item} onPress={openBrowser} />}
                contentContainerStyle={styles.imageListPad}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              />
            ) : (
              <EmptyTab loading={loading.images} query={submittedQuery} />
            )
          ) : null}

          {activeTab === 'videos' ? (
            results.videos.length > 0 ? (
              <FlatList
                data={results.videos}
                keyExtractor={(_, i) => `vid-${i}`}
                renderItem={({ item }) => <VideoCard item={item} onPress={openBrowser} />}
                contentContainerStyle={styles.listPad}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              />
            ) : (
              <EmptyTab loading={loading.videos} query={submittedQuery} />
            )
          ) : null}

          {activeTab === 'news' ? (
            results.news.length > 0 ? (
              <FlatList
                data={results.news}
                keyExtractor={(_, i) => `news-${i}`}
                renderItem={({ item }) => <NewsCard item={item} onPress={openBrowser} />}
                contentContainerStyle={styles.listPad}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              />
            ) : (
              <EmptyTab loading={loading.news} query={submittedQuery} />
            )
          ) : null}

          {activeTab === 'finance' ? (
            results.finance.length > 0 ? (
              <FlatList
                data={results.finance}
                keyExtractor={(_, i) => `fin-${i}`}
                renderItem={({ item }) => <FinanceCard item={item} onPress={openBrowser} />}
                contentContainerStyle={styles.listPad}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              />
            ) : (
              <EmptyTab loading={loading.finance} query={submittedQuery} />
            )
          ) : null}
        </View>
      ) : null}

      {/* ── Bottom search bar (matches Chat's input bar) ────────────────── */}
      <View style={[styles.bottomWrap, { paddingBottom: insets.bottom + 10 }]}>
        {showSuggestions && !hasSearch ? (
          <View style={[styles.suggestionsFloating, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {suggestions.map((s, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [
                  styles.suggestionRow,
                  { borderBottomColor: colors.border },
                  pressed && { backgroundColor: colors.background },
                  i === suggestions.length - 1 && { borderBottomWidth: 0 },
                ]}
                onPress={() => doSearch(s)}
              >
                <Ionicons name="search-outline" size={14} color={colors.mutedForeground} style={styles.suggestionIcon} />
                <Text style={[styles.suggestionText, { color: colors.foreground }]}>{s}</Text>
                <Pressable
                  hitSlop={8}
                  onPress={() => { setQuery(s); inputRef.current?.focus(); }}
                  style={styles.fillBtn}
                >
                  <Ionicons name="arrow-up-outline" size={14} color={colors.mutedForeground} />
                </Pressable>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.searchRow}>
          <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={18} color={colors.mutedForeground} style={styles.searchIcon} />
            <TextInput
              ref={inputRef}
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Search the web or enter a site…"
              placeholderTextColor={colors.mutedForeground}
              value={query}
              onChangeText={(t) => {
                setQuery(t);
                if (!t.trim()) {
                  setSubmittedQuery('');
                  setResults(empty);
                  setLoading(notLoading);
                }
              }}
              onSubmitEditing={() => doSearch(query)}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="never"
            />
            {query.length > 0 ? (
              <Pressable
                onPress={() => {
                  setQuery('');
                  setSubmittedQuery('');
                  setSuggestions([]);
                  setShowSuggestions(false);
                  setResults(empty);
                  setLoading(notLoading);
                  inputRef.current?.focus();
                }}
                hitSlop={8}
                style={styles.clearBtn}
              >
                <Ionicons name="close-circle" size={17} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
          </View>

          {query.trim() ? (
            <Pressable style={[styles.goBtn, { backgroundColor: colors.foreground }]} onPress={() => doSearch(query)}>
              <Ionicons name="arrow-forward" size={18} color={colors.background} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* ── In-app browser (all links open here — never an external browser) ── */}
      <InAppBrowser
        url={browserUrl}
        onClose={() => setBrowserUrl(null)}
        onSearchFallback={(q) => { setBrowserUrl(null); doSearch(q); }}
      />
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Bottom-anchored search bar (mirrors ChatInput's bottom pill treatment)
  bottomWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    borderRadius: 23,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    gap: 8,
  },
  searchIcon: { flexShrink: 0 },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    padding: 0,
  },
  clearBtn: {
    flexShrink: 0,
    padding: 2,
  },
  goBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Suggestions — float above the bottom search bar, like a dropdown.
  suggestionsFloating: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  suggestionIcon: { flexShrink: 0 },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  fillBtn: {
    flexShrink: 0,
    padding: 4,
  },

  // Landing
  landing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 40,
  },
  landingIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 4,
  },
  landingTitle: {
    fontSize: 22,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    letterSpacing: -0.3,
  },
  landingBody: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Results container
  results: { flex: 1 },

  // Tab bar
  tabBar: {
    height: 44,
    flexShrink: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBarContent: {
    paddingHorizontal: 12,
    gap: 4,
  },
  tab: {
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 10,
  },
  tabLabel: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  tabLabelActive: {
    fontFamily: 'Inter_600SemiBold',
  },
  tabUnderline: {
    height: 2,
    width: '100%',
    borderRadius: 1,
    marginTop: -1,
  },

  listPad: { paddingBottom: 32 },
  imageListPad: { paddingBottom: 32 },

  // Web results
  webCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  webCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 2,
  },
  favicon: { width: 16, height: 16, borderRadius: 3 },
  faviconFallback: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webCardMeta: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  webHost: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  webAge: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  webTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 21,
  },
  webDesc: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },

  // Images
  imageRow: { gap: 3, marginBottom: 3 },
  imageCell: { overflow: 'hidden', position: 'relative' },
  imageCellFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFull: { width: '100%', height: '100%' },
  imageTitleBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  imageTitleText: {
    color: 'white',
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
  },

  // Videos
  videoCard: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  videoThumbWrap: { position: 'relative', flexShrink: 0 },
  videoThumb: {
    width: 130,
    height: 78,
    borderRadius: 8,
    backgroundColor: '#111',
  },
  videoThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  durationText: {
    color: 'white',
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
  },
  videoInfo: { flex: 1, gap: 3 },
  videoTitle: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    lineHeight: 19,
  },
  videoMeta: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  videoAge: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },

  // News
  newsCard: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start',
  },
  newsContent: { flex: 1, gap: 4 },
  newsSource: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  newsTitle: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 20,
  },
  newsDesc: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 17,
  },
  newsThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    flexShrink: 0,
  },

  // Finance
  financeSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  financeBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: 'rgba(34,197,94,0.2)',
  },
  financeBadgeWeb: {
    backgroundColor: 'rgba(99,102,241,0.2)',
  },
  financeBadgeText: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: 'white',
    letterSpacing: 0.5,
  },

  // Empty / loader
  loader: { marginTop: 60 },
  emptyTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 80,
  },
  emptyTabText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
});
