/**
 * Lab Search Engine
 *
 * Full search engine powered by Engagera's AfuBot search backend, which
 * aggregates DuckDuckGo, Bing News RSS, Google News RSS, curated outlet
 * RSS feeds, Bing image search, and YouTube search.
 *
 * Features:
 *  - Real-time suggestions while typing (DuckDuckGo autocomplete)
 *  - Omnibox-style domain detection: single-word inputs surface a "Visit X.com"
 *    chip so users can navigate directly to websites just by typing a name
 *  - Full bare-domain resolution (e.g. "afuchat.com" → opens directly)
 *  - Tabbed results: AI · Web · Images · Videos · News · Finance
 *  - Persistent search history (AsyncStorage) with clear-all and per-item delete
 *  - Built-in WebView browser for all result links
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  fetchAiOverview,
  resolveDomain,
  probeOfficialSite,
  getPotentialDomain,
  loadSearchHistory,
  saveToHistory,
  clearSearchHistory,
  removeFromHistory,
  type WebResult,
  type ImageResult,
  type VideoResult,
  type NewsResult,
  type FinanceResult,
  type AiOverviewResult,
  type SearchHistoryItem,
} from '@/lib/search';

// Silence unused-import lint — FinanceResult is used in FinanceCard props
type _F = FinanceResult;

// ── Types ─────────────────────────────────────────────────────────────────────

type SearchTab = 'ai' | 'web' | 'images' | 'videos' | 'news' | 'finance';

interface SearchResults {
  ai: AiOverviewResult | null;
  web: WebResult[];
  images: ImageResult[];
  videos: VideoResult[];
  news: NewsResult[];
  finance: FinanceResult[];
}

type LoadingState = Record<SearchTab, boolean>;

const TABS: { key: SearchTab; label: string; icon: string }[] = [
  { key: 'ai', label: 'AI', icon: 'sparkles-outline' },
  { key: 'web', label: 'Web', icon: 'globe-outline' },
  { key: 'images', label: 'Images', icon: 'images-outline' },
  { key: 'videos', label: 'Videos', icon: 'play-circle-outline' },
  { key: 'news', label: 'News', icon: 'newspaper-outline' },
  { key: 'finance', label: 'Finance', icon: 'trending-up-outline' },
];

const empty: SearchResults = { ai: null, web: [], images: [], videos: [], news: [], finance: [] };
const notLoading: LoadingState = { ai: false, web: false, images: false, videos: false, news: false, finance: false };
const allLoading: LoadingState = { ai: false, web: true, images: true, videos: true, news: true, finance: true };

const { width: SCREEN_W } = Dimensions.get('window');
const IMG_SIZE = (SCREEN_W - 3) / 2;

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

function AiOverviewCard({ item, onPress }: { item: AiOverviewResult; onPress: (url: string) => void }) {
  const colors = useColors();
  const hasAnswer = item.answer.trim().length > 0;
  return (
    <ScrollView contentContainerStyle={styles.aiPad} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={[styles.aiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.aiHeader}>
          <Ionicons name="sparkles" size={16} color={colors.foreground} />
          <Text style={[styles.aiHeaderText, { color: colors.foreground }]}>Engagera AI</Text>
        </View>
        {hasAnswer ? (
          <Text style={[styles.aiAnswer, { color: colors.foreground }]}>{item.answer}</Text>
        ) : (
          <Text style={[styles.aiAnswer, { color: colors.mutedForeground }]}>
            Engagera AI couldn't generate an overview for this search. Try the Web tab instead.
          </Text>
        )}
      </View>

      {item.sources.length > 0 ? (
        <View style={styles.aiSourcesWrap}>
          {item.sources.map((s, i) => (
            <Pressable
              key={i}
              style={[styles.aiSourceChip, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => onPress(s.url)}
            >
              <Ionicons name="link-outline" size={11} color={colors.mutedForeground} />
              <Text style={[styles.aiSourceText, { color: colors.mutedForeground }]} numberOfLines={1}>
                {s.source || s.title}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function OfficialSiteCard({ url, onPress }: { url: string; onPress: (url: string) => void }) {
  const colors = useColors();
  let host = '';
  let displayUrl = url;
  try {
    const parsed = new URL(url);
    host = parsed.hostname.replace(/^www\./, '');
    displayUrl = parsed.hostname;
  } catch { /**/ }

  return (
    <Pressable
      style={[styles.officialCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => onPress(url)}
    >
      <View style={styles.officialHeader}>
        <View style={[styles.officialIconWrap, { backgroundColor: colors.background }]}>
          <Ionicons name="globe" size={14} color={colors.foreground} />
        </View>
        <View style={styles.officialMeta}>
          <Text style={[styles.officialHost, { color: colors.mutedForeground }]} numberOfLines={1}>
            {displayUrl}
          </Text>
        </View>
        <View style={[styles.officialBadge, { borderColor: colors.border }]}>
          <Text style={[styles.officialBadgeText, { color: colors.mutedForeground }]}>Official site</Text>
        </View>
      </View>
      <Text style={[styles.officialTitle, { color: colors.foreground }]} numberOfLines={1}>
        Visit {host}
      </Text>
      <Text style={[styles.officialSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
        {url}
      </Text>
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

// ── History section on the landing screen ─────────────────────────────────────

function HistorySection({
  history,
  onSelect,
  onRemove,
  onClearAll,
}: {
  history: SearchHistoryItem[];
  onSelect: (q: string) => void;
  onRemove: (q: string) => void;
  onClearAll: () => void;
}) {
  const colors = useColors();
  if (history.length === 0) return null;

  return (
    <View style={styles.historySection}>
      <View style={styles.historyHeader}>
        <Text style={[styles.historyHeading, { color: colors.mutedForeground }]}>Recent</Text>
        <Pressable onPress={onClearAll} hitSlop={10}>
          <Text style={[styles.historyClearAll, { color: colors.mutedForeground }]}>Clear all</Text>
        </Pressable>
      </View>
      {history.map((item) => (
        <Pressable
          key={item.query}
          style={({ pressed }) => [
            styles.historyRow,
            { borderBottomColor: colors.border },
            pressed && { opacity: 0.6 },
          ]}
          onPress={() => onSelect(item.query)}
        >
          <Ionicons name="time-outline" size={15} color={colors.mutedForeground} style={styles.historyRowIcon} />
          <Text style={[styles.historyRowText, { color: colors.foreground }]} numberOfLines={1}>
            {item.query}
          </Text>
          <Pressable
            hitSlop={10}
            onPress={() => onRemove(item.query)}
            style={styles.historyRowDelete}
          >
            <Ionicons name="close" size={15} color={colors.mutedForeground} />
          </Pressable>
        </Pressable>
      ))}
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
  const [inputFocused, setInputFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchTab>('web');
  const [results, setResults] = useState<SearchResults>(empty);
  const [loading, setLoading] = useState<LoadingState>(notLoading);
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [officialSiteUrl, setOfficialSiteUrl] = useState<string | null>(null);
  const searchIdRef = useRef(0);

  // ── Load history on mount ─────────────────────────────────────────────────
  useEffect(() => {
    loadSearchHistory().then(setHistory);
  }, []);

  // ── Real-time suggestions ─────────────────────────────────────────────────
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
      setShowSuggestions(s.length > 0 || !!getPotentialDomain(query));
    }, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // ── Search ────────────────────────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;

    const myId = ++searchIdRef.current;
    const isStale = () => searchIdRef.current !== myId;

    // A bare domain (e.g. "afuchat.com") is opened directly — no search step.
    const domainUrl = await resolveDomain(trimmed);
    if (isStale()) return;
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
    setOfficialSiteUrl(null);
    setLoading(allLoading);
    inputRef.current?.blur();

    // Persist to history
    saveToHistory(trimmed).then(() =>
      loadSearchHistory().then(setHistory)
    );

    // For single-word queries, probe for an official website in parallel with
    // the search — this surfaces afuchat.com at the top when you search "afuchat",
    // just like Google's knowledge panel for brand/platform names.
    const isSingleWord = !trimmed.includes(' ') && !trimmed.includes('.');
    const [web, images, videos, news, finance, probeResult] = await Promise.allSettled([
      fetchWebResults(trimmed),
      fetchImageResults(trimmed, ''),
      fetchVideoResults(trimmed, ''),
      fetchNewsResults(trimmed, ''),
      fetchFinanceResults(trimmed),
      isSingleWord ? probeOfficialSite(trimmed) : Promise.resolve(null),
    ]);

    if (isStale()) return;

    if (probeResult.status === 'fulfilled' && probeResult.value) {
      setOfficialSiteUrl(probeResult.value);
    }

    setResults({
      ai: null,
      web: web.status === 'fulfilled' ? web.value.results : [],
      images: images.status === 'fulfilled' ? images.value : [],
      videos: videos.status === 'fulfilled' ? videos.value : [],
      news: news.status === 'fulfilled' ? news.value : [],
      finance: finance.status === 'fulfilled' ? finance.value : [],
    });
    setLoading(notLoading);
  }, []);

  // ── Navigate directly to a potential domain ───────────────────────────────
  const openPotentialDomain = useCallback((domain: string) => {
    setShowSuggestions(false);
    setSuggestions([]);
    setQuery('');
    setSubmittedQuery('');
    inputRef.current?.blur();
    setBrowserUrl(`https://${domain}`);
  }, []);

  // ── Engagera AI overview (lazy) ───────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'ai' || !submittedQuery || results.ai || loading.ai) return;
    let cancelled = false;
    setLoading((l) => ({ ...l, ai: true }));
    fetchAiOverview(submittedQuery)
      .then((ai) => { if (!cancelled) setResults((r) => ({ ...r, ai })); })
      .catch(() => { if (!cancelled) setResults((r) => ({ ...r, ai: { answer: '', sources: [] } })); })
      .finally(() => { if (!cancelled) setLoading((l) => ({ ...l, ai: false })); });
    return () => { cancelled = true; };
  }, [activeTab, submittedQuery, results.ai, loading.ai]);

  const openBrowser = useCallback((url: string) => setBrowserUrl(url), []);

  // ── History actions ───────────────────────────────────────────────────────
  const handleHistorySelect = useCallback((q: string) => {
    setQuery(q);
    doSearch(q);
  }, [doSearch]);

  const handleHistoryRemove = useCallback((q: string) => {
    removeFromHistory(q).then(() => loadSearchHistory().then(setHistory));
  }, []);

  const handleHistoryClearAll = useCallback(() => {
    Alert.alert(
      'Clear search history',
      'Remove all recent searches?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: () => clearSearchHistory().then(() => setHistory([])),
        },
      ]
    );
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const hasSearch = submittedQuery.length > 0;
  const potentialDomain = getPotentialDomain(query);
  // Show the suggestion panel whenever the input is focused and there's a query
  const shouldShowSuggestions = inputFocused && query.trim().length >= 1 && (showSuggestions || !!potentialDomain);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={[styles.root, { paddingTop: topPad }]} behavior="padding">

      {/* ── Empty landing ──────────────────────────────────────────────── */}
      {!hasSearch ? (
        <ScrollView
          style={styles.landingScroll}
          contentContainerStyle={styles.landingContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.landingHero}>
            <View style={styles.landingIcon}>
              <Ionicons name="search" size={40} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.landingTitle, { color: colors.foreground }]}>Engagera Search</Text>
            <Text style={[styles.landingBody, { color: colors.mutedForeground }]}>
              AI · Web · Images · Videos · News · Finance{'\n'}powered by Engagera's AfuBot search
            </Text>
          </View>

          <HistorySection
            history={history}
            onSelect={handleHistorySelect}
            onRemove={handleHistoryRemove}
            onClearAll={handleHistoryClearAll}
          />
        </ScrollView>
      ) : null}

      {/* ── Results ──────────────────────────────────────────────────────── */}
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
          {activeTab === 'ai' ? (
            results.ai ? (
              <AiOverviewCard item={results.ai} onPress={openBrowser} />
            ) : (
              loading.ai ? (
                <View style={styles.aiLoading}>
                  <ActivityIndicator color={colors.foreground} />
                  <Text style={[styles.aiLoadingText, { color: colors.mutedForeground }]}>Engagera AI is thinking…</Text>
                </View>
              ) : (
                <EmptyTab loading={false} query={submittedQuery} />
              )
            )
          ) : null}

          {activeTab === 'web' ? (
            results.web.length > 0 || officialSiteUrl ? (
              <FlatList
                data={results.web}
                keyExtractor={(_, i) => `web-${i}`}
                ListHeaderComponent={
                  officialSiteUrl ? (
                    <OfficialSiteCard url={officialSiteUrl} onPress={openBrowser} />
                  ) : null
                }
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

      {/* ── Bottom search bar ──────────────────────────────────────────────── */}
      <View style={[styles.bottomWrap, { paddingBottom: insets.bottom + 10 }]}>

        {/* Suggestions + domain chip — float above the search bar */}
        {shouldShowSuggestions ? (
          <View style={[styles.suggestionsFloating, { backgroundColor: colors.card, borderColor: colors.border }]}>

            {/* Domain chip — always first when present */}
            {potentialDomain ? (
              <Pressable
                style={({ pressed }) => [
                  styles.suggestionRow,
                  styles.domainRow,
                  { borderBottomColor: colors.border },
                  pressed && { opacity: 0.7 },
                  suggestions.length === 0 && { borderBottomWidth: 0 },
                ]}
                onPress={() => openPotentialDomain(potentialDomain)}
              >
                <View style={[styles.domainIconWrap, { backgroundColor: colors.background }]}>
                  <Ionicons name="globe" size={13} color={colors.foreground} />
                </View>
                <View style={styles.domainTextCol}>
                  <Text style={[styles.domainVisitLabel, { color: colors.mutedForeground }]}>Visit website</Text>
                  <Text style={[styles.domainText, { color: colors.foreground }]}>{potentialDomain}</Text>
                </View>
                <Ionicons name="arrow-forward" size={15} color={colors.mutedForeground} />
              </Pressable>
            ) : null}

            {/* DuckDuckGo autocomplete suggestions */}
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
              placeholder="Search or enter a site…"
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
              onFocus={() => setInputFocused(true)}
              onBlur={() => {
                // Delay so tapping a suggestion fires before blur hides it
                setTimeout(() => setInputFocused(false), 150);
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

      {/* ── In-app browser ──────────────────────────────────────────────────── */}
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

  // Landing
  landingScroll: { flex: 1 },
  landingContent: { flexGrow: 1 },
  landingHero: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 40,
    paddingTop: 60,
    paddingBottom: 32,
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

  // History
  historySection: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  historyHeading: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  historyClearAll: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  historyRowIcon: { flexShrink: 0 },
  historyRowText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  historyRowDelete: {
    flexShrink: 0,
    padding: 4,
  },

  // Bottom-anchored search bar
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

  // Suggestions panel
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

  // Domain chip (inside suggestions panel)
  domainRow: {
    paddingVertical: 11,
    gap: 12,
  },
  domainIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  domainTextCol: {
    flex: 1,
    gap: 1,
  },
  domainVisitLabel: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  domainText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
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

  // Official site card
  officialCard: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 4,
  },
  officialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  officialIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  officialMeta: { flex: 1 },
  officialHost: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  officialBadge: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 7,
    paddingVertical: 2,
    flexShrink: 0,
  },
  officialBadgeText: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
  },
  officialTitle: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  officialSubtitle: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },

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

  // Engagera AI overview
  aiPad: { padding: 16, paddingBottom: 32 },
  aiCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 10,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiHeaderText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.2,
  },
  aiAnswer: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
  },
  aiSourcesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  aiSourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 160,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  aiSourceText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  aiLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 80,
  },
  aiLoadingText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
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
