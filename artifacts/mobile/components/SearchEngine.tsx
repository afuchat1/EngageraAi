/**
 * Lab Search Engine
 *
 * - "All" mixed SERP: official site + web + image strip + videos + news
 * - Dedicated Images / Videos / News / Finance tabs
 * - AI tab: live-streaming chat (state lifted to parent — never reloads on tab switch)
 *   • Search query becomes first user message
 *   • Follow-up chat via bottom input (replaces search bar on AI tab)
 * - Omnibox domain chip + bare-domain resolution
 * - Official-site card pinned at top for brand queries
 * - Persistent search history
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
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
import { streamChat, LAB_MODEL } from '@/lib/chat';
import {
  fetchSuggestions,
  fetchWebResults,
  fetchImageResults,
  fetchVideoResults,
  fetchNewsResults,
  fetchFinanceResults,
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
  type SearchHistoryItem,
} from '@/lib/search';

// ── Types ─────────────────────────────────────────────────────────────────────

type SearchTab = 'ai' | 'all' | 'images' | 'videos' | 'news' | 'finance';

interface AiMessage { role: 'user' | 'assistant'; content: string; }
interface AiSource  { title: string; url: string; host: string; }

interface SearchResults {
  web: WebResult[];
  images: ImageResult[];
  videos: VideoResult[];
  news: NewsResult[];
  finance: FinanceResult[];
}

type LoadingState = Record<'web' | 'images' | 'videos' | 'news' | 'finance', boolean>;

// ── Constants ─────────────────────────────────────────────────────────────────

const AI_CONTEXT_HINT = [
  'You are "Engagera AI" answering the user\'s query on a search-results page.',
  'For the opening message answer in 3–6 clear sentences of plain prose (no markdown headers).',
  'For follow-up questions keep the conversational context.',
  'Be concise and direct. If the topic is time-sensitive and you cannot verify it live, say so briefly.',
].join(' ');

const TABS: { key: SearchTab; label: string; icon: string }[] = [
  { key: 'ai',      label: 'AI',      icon: 'sparkles-outline'    },
  { key: 'all',     label: 'All',     icon: 'globe-outline'       },
  { key: 'images',  label: 'Images',  icon: 'images-outline'      },
  { key: 'videos',  label: 'Videos',  icon: 'play-circle-outline' },
  { key: 'news',    label: 'News',    icon: 'newspaper-outline'   },
  { key: 'finance', label: 'Finance', icon: 'trending-up-outline' },
];

const empty: SearchResults = { web: [], images: [], videos: [], news: [], finance: [] };
const notLoading: LoadingState = { web: false, images: false, videos: false, news: false, finance: false };
const allLoading: LoadingState = { web: true, images: true, videos: true, news: true, finance: true };

const { width: SCREEN_W } = Dimensions.get('window');
const IMG_THUMB = 110;
const IMG_GRID  = (SCREEN_W - 3) / 2;

// ── Shared sub-components ─────────────────────────────────────────────────────

function Favicon({ uri }: { uri: string }) {
  const [err, setErr] = useState(false);
  if (err) return (
    <View style={s.faviconFallback}>
      <Ionicons name="globe-outline" size={13} color="rgba(255,255,255,0.3)" />
    </View>
  );
  return <Image source={{ uri }} style={s.favicon} onError={() => setErr(true)} />;
}

function SectionHeader({ title, icon }: { title: string; icon: string }) {
  const colors = useColors();
  return (
    <View style={[s.sectionHeader, { borderBottomColor: colors.border }]}>
      <Ionicons name={icon as any} size={12} color={colors.mutedForeground} />
      <Text style={[s.sectionHeaderText, { color: colors.mutedForeground }]}>{title}</Text>
    </View>
  );
}

function WebCard({ item, onPress }: { item: WebResult; onPress: (url: string) => void }) {
  const colors = useColors();
  let host = '';
  try { host = new URL(item.url).hostname; } catch { /**/ }
  return (
    <Pressable style={[s.webCard, { borderBottomColor: colors.border }]} onPress={() => onPress(item.url)}>
      <View style={s.webCardHeader}>
        <Favicon uri={item.favicon} />
        <View style={s.webCardMeta}>
          <Text style={[s.webHost, { color: colors.mutedForeground }]} numberOfLines={1}>{host}</Text>
          {item.age ? <Text style={[s.webAge, { color: colors.mutedForeground }]}> · {item.age}</Text> : null}
        </View>
      </View>
      <Text style={[s.webTitle, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
      <Text style={[s.webDesc, { color: colors.mutedForeground }]} numberOfLines={3}>{item.description}</Text>
    </Pressable>
  );
}

function ImageThumb({ item, onPress }: { item: ImageResult; onPress: (url: string) => void }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  return (
    <Pressable style={[s.imageThumb, { width: IMG_THUMB, height: IMG_THUMB }]} onPress={() => onPress(item.pageUrl)}>
      {err ? (
        <View style={[s.imageThumbFallback, { backgroundColor: colors.card }]}>
          <Ionicons name="image-outline" size={22} color={colors.mutedForeground} />
        </View>
      ) : (
        <Image source={{ uri: item.thumbnail || item.src }} style={s.imageThumbImg} onError={() => setErr(true)} resizeMode="cover" />
      )}
    </Pressable>
  );
}

function ImageGridCard({ item, onPress }: { item: ImageResult; onPress: (url: string) => void }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  return (
    <Pressable style={[s.imageCell, { width: IMG_GRID, height: IMG_GRID }]} onPress={() => onPress(item.pageUrl)}>
      {err ? (
        <View style={[s.imageCellFallback, { backgroundColor: colors.card }]}>
          <Ionicons name="image-outline" size={28} color={colors.mutedForeground} />
        </View>
      ) : (
        <Image source={{ uri: item.thumbnail || item.src }} style={s.imageFull} onError={() => setErr(true)} resizeMode="cover" />
      )}
      <View style={s.imageTitleBar}>
        <Text style={s.imageTitleText} numberOfLines={1}>{item.source || item.title}</Text>
      </View>
    </Pressable>
  );
}

function VideoCard({ item, onPress }: { item: VideoResult; onPress: (url: string) => void }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  return (
    <Pressable style={[s.videoCard, { borderBottomColor: colors.border }]} onPress={() => onPress(item.url)}>
      <View style={s.videoThumbWrap}>
        {!err && item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={s.videoThumb} onError={() => setErr(true)} resizeMode="cover" />
        ) : (
          <View style={[s.videoThumb, s.videoThumbFallback, { backgroundColor: colors.card }]}>
            <Ionicons name="play-circle-outline" size={32} color={colors.mutedForeground} />
          </View>
        )}
        {item.duration ? (
          <View style={s.durationBadge}><Text style={s.durationText}>{item.duration}</Text></View>
        ) : null}
      </View>
      <View style={s.videoInfo}>
        <Text style={[s.videoTitle, { color: colors.foreground }]} numberOfLines={3}>{item.title}</Text>
        {item.publisher ? <Text style={[s.videoMeta, { color: colors.mutedForeground }]} numberOfLines={1}>{item.publisher}</Text> : null}
        {item.age ? <Text style={[s.videoAge, { color: colors.mutedForeground }]}>{item.age}</Text> : null}
      </View>
    </Pressable>
  );
}

function NewsCard({ item, onPress }: { item: NewsResult; onPress: (url: string) => void }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  return (
    <Pressable style={[s.newsCard, { borderBottomColor: colors.border }]} onPress={() => onPress(item.url)}>
      <View style={s.newsContent}>
        <Text style={[s.newsSource, { color: colors.mutedForeground }]}>{item.source}{item.age ? ` · ${item.age}` : ''}</Text>
        <Text style={[s.newsTitle, { color: colors.foreground }]} numberOfLines={3}>{item.title}</Text>
        {item.description ? <Text style={[s.newsDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{item.description}</Text> : null}
      </View>
      {item.thumbnail && !err ? (
        <Image source={{ uri: item.thumbnail }} style={s.newsThumb} onError={() => setErr(true)} resizeMode="cover" />
      ) : null}
    </Pressable>
  );
}

function FinanceCard({ item, onPress }: { item: FinanceResult; onPress: (url: string) => void }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  return (
    <Pressable style={[s.newsCard, { borderBottomColor: colors.border }]} onPress={() => onPress(item.url)}>
      <View style={s.newsContent}>
        <View style={s.financeSourceRow}>
          <View style={[s.financeBadge, item.kind === 'web' && s.financeBadgeWeb]}>
            <Text style={s.financeBadgeText}>{item.kind === 'news' ? 'NEWS' : 'WEB'}</Text>
          </View>
          <Text style={[s.newsSource, { color: colors.mutedForeground }]}>{item.source}{item.age ? ` · ${item.age}` : ''}</Text>
        </View>
        <Text style={[s.newsTitle, { color: colors.foreground }]} numberOfLines={3}>{item.title}</Text>
        {item.description ? <Text style={[s.newsDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{item.description}</Text> : null}
      </View>
      {item.thumbnail && !err ? (
        <Image source={{ uri: item.thumbnail }} style={s.newsThumb} onError={() => setErr(true)} resizeMode="cover" />
      ) : null}
    </Pressable>
  );
}

function OfficialSiteCard({ url, onPress }: { url: string; onPress: (url: string) => void }) {
  const colors = useColors();
  let host = '', displayUrl = url;
  try { const p = new URL(url); host = p.hostname.replace(/^www\./, ''); displayUrl = p.hostname; } catch { /**/ }
  return (
    <Pressable style={[s.officialCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => onPress(url)}>
      <View style={s.officialHeader}>
        <View style={[s.officialIconWrap, { backgroundColor: colors.background }]}>
          <Ionicons name="globe" size={14} color={colors.foreground} />
        </View>
        <Text style={[s.officialHost, { color: colors.mutedForeground }]} numberOfLines={1}>{displayUrl}</Text>
        <View style={[s.officialBadge, { borderColor: colors.border }]}>
          <Text style={[s.officialBadgeText, { color: colors.mutedForeground }]}>Official site</Text>
        </View>
      </View>
      <Text style={[s.officialTitle, { color: colors.foreground }]} numberOfLines={1}>Visit {host}</Text>
      <Text style={[s.officialSub, { color: colors.mutedForeground }]} numberOfLines={1}>{url}</Text>
    </Pressable>
  );
}

function EmptyState({ loading: isLoading, query }: { loading: boolean; query: string }) {
  const colors = useColors();
  if (isLoading) return <ActivityIndicator color={colors.foreground} style={s.loader} />;
  if (!query) return null;
  return (
    <View style={s.emptyTab}>
      <Ionicons name="search-outline" size={32} color={colors.mutedForeground} />
      <Text style={[s.emptyTabText, { color: colors.mutedForeground }]}>No results for "{query}"</Text>
    </View>
  );
}

// ── Mixed "All" SERP feed ─────────────────────────────────────────────────────

function MixedFeed({
  results, officialSiteUrl, loading, query, onPress,
}: {
  results: SearchResults; officialSiteUrl: string | null;
  loading: LoadingState; query: string; onPress: (url: string) => void;
}) {
  const colors = useColors();
  const anyLoading = loading.web || loading.images || loading.videos || loading.news;
  const hasAny = officialSiteUrl || results.web.length > 0 || results.images.length > 0
    || results.videos.length > 0 || results.news.length > 0;

  if (anyLoading && !hasAny) return <ActivityIndicator color={colors.foreground} style={s.loader} />;
  if (!hasAny) return <EmptyState loading={false} query={query} />;

  const topWeb  = results.web.slice(0, 4);
  const restWeb = results.web.slice(4);

  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.mixedPad}>
      {officialSiteUrl ? <OfficialSiteCard url={officialSiteUrl} onPress={onPress} /> : null}
      {topWeb.map((item, i) => <WebCard key={`tw-${i}`} item={item} onPress={onPress} />)}

      {results.images.length > 0 ? (
        <View>
          <SectionHeader title="Images" icon="images-outline" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.imageStrip}>
            {results.images.slice(0, 12).map((item, i) => (
              <ImageThumb key={`it-${i}`} item={item} onPress={onPress} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {results.videos.slice(0, 2).length > 0 ? (
        <View>
          <SectionHeader title="Videos" icon="play-circle-outline" />
          {results.videos.slice(0, 2).map((item, i) => <VideoCard key={`v-${i}`} item={item} onPress={onPress} />)}
        </View>
      ) : null}

      {results.news.slice(0, 4).length > 0 ? (
        <View>
          <SectionHeader title="News" icon="newspaper-outline" />
          {results.news.slice(0, 4).map((item, i) => <NewsCard key={`n-${i}`} item={item} onPress={onPress} />)}
        </View>
      ) : null}

      {restWeb.length > 0 ? (
        <View>
          <View style={[s.moreDivider, { borderBottomColor: colors.border }]}>
            <Text style={[s.moreDividerText, { color: colors.mutedForeground }]}>More results</Text>
          </View>
          {restWeb.map((item, i) => <WebCard key={`rw-${i}`} item={item} onPress={onPress} />)}
        </View>
      ) : null}
    </ScrollView>
  );
}

// ── History section ───────────────────────────────────────────────────────────

function HistorySection({ history, onSelect, onRemove, onClearAll }: {
  history: SearchHistoryItem[];
  onSelect: (q: string) => void;
  onRemove: (q: string) => void;
  onClearAll: () => void;
}) {
  const colors = useColors();
  if (history.length === 0) return null;
  return (
    <View style={s.historySection}>
      <View style={s.historyHeader}>
        <Text style={[s.historyHeading, { color: colors.mutedForeground }]}>Recent</Text>
        <Pressable onPress={onClearAll} hitSlop={10}>
          <Text style={[s.historyClearAll, { color: colors.mutedForeground }]}>Clear all</Text>
        </Pressable>
      </View>
      {history.map((item) => (
        <Pressable key={item.query}
          style={({ pressed }) => [s.historyRow, { borderBottomColor: colors.border }, pressed && { opacity: 0.6 }]}
          onPress={() => onSelect(item.query)}>
          <Ionicons name="time-outline" size={15} color={colors.mutedForeground} style={s.historyRowIcon} />
          <Text style={[s.historyRowText, { color: colors.foreground }]} numberOfLines={1}>{item.query}</Text>
          <Pressable hitSlop={10} onPress={() => onRemove(item.query)} style={s.historyRowDelete}>
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
  const inputRef    = useRef<TextInput>(null);
  const aiInputRef  = useRef<TextInput>(null);
  const aiScrollRef = useRef<ScrollView>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Search state ───────────────────────────────────────────────────────────
  const [query, setQuery]                   = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [suggestions, setSuggestions]       = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [inputFocused, setInputFocused]     = useState(false);
  const [activeTab, setActiveTab]           = useState<SearchTab>('all');
  const [results, setResults]               = useState<SearchResults>(empty);
  const [loading, setLoading]               = useState<LoadingState>(notLoading);
  const [browserUrl, setBrowserUrl]         = useState<string | null>(null);
  const [history, setHistory]               = useState<SearchHistoryItem[]>([]);
  const [officialSiteUrl, setOfficialSiteUrl] = useState<string | null>(null);
  const searchIdRef = useRef(0);

  // ── AI state (lifted here so it NEVER resets on tab switch) ───────────────
  // aiInitializedForQuery tracks which query we've already started streaming
  // for — prevents double-fetch on tab re-focus without resetting conversation.
  const [aiMessages, setAiMessages]   = useState<AiMessage[]>([]);
  const [aiSources, setAiSources]     = useState<AiSource[]>([]);
  const [aiStreaming, setAiStreaming]  = useState(false);
  const [aiError, setAiError]         = useState('');
  const [aiInput, setAiInput]         = useState('');
  const aiAbortRef = useRef<AbortController | null>(null);
  const aiInitializedForQuery = useRef('');

  // ── Load history on mount ─────────────────────────────────────────────────
  useEffect(() => { loadSearchHistory().then(setHistory); }, []);

  // ── Real-time suggestions ─────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.length < 2) {
      setSuggestions([]); setShowSuggestions(false); return;
    }
    debounceRef.current = setTimeout(async () => {
      const sug = await fetchSuggestions(query);
      setSuggestions(sug);
      setShowSuggestions(sug.length > 0 || !!getPotentialDomain(query));
    }, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // ── AI streaming helper ───────────────────────────────────────────────────
  const startAiStream = useCallback((msgs: AiMessage[]) => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = new AbortController();
    setAiStreaming(true);
    setAiError('');

    // Add empty assistant placeholder — tokens will be appended to it
    const withPlaceholder: AiMessage[] = [...msgs, { role: 'assistant', content: '' }];
    setAiMessages(withPlaceholder);

    // Small delay so the scroll can settle before new content pushes it down
    setTimeout(() => aiScrollRef.current?.scrollToEnd({ animated: true }), 80);

    streamChat(
      {
        messages: msgs.map((m) => ({ role: m.role, content: m.content })),
        model: LAB_MODEL,
        stream: true,
        contextHint: AI_CONTEXT_HINT,
      },
      {
        onToken: (token) => {
          setAiMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, content: last.content + token };
            }
            return next;
          });
          // Keep scrolled to bottom as tokens stream in
          aiScrollRef.current?.scrollToEnd({ animated: false });
        },
        onMeta: (searchInfo) => {
          const mapped = searchInfo.sources
            .filter((src) => !!src.url)
            .slice(0, 8)
            .map((src) => {
              let host = '';
              try { host = new URL(src.url).hostname; } catch { /**/ }
              return { title: src.title, url: src.url, host };
            });
          setAiSources(mapped);
        },
        onDone: () => {
          setAiStreaming(false);
          setTimeout(() => aiScrollRef.current?.scrollToEnd({ animated: true }), 50);
        },
      },
      aiAbortRef.current.signal,
    ).catch((err) => {
      if (aiAbortRef.current?.signal.aborted) return;
      setAiError(err?.message ?? 'Something went wrong. Please try again.');
      setAiStreaming(false);
    });
  }, []);

  // ── Start AI when the AI tab is first opened for a query ─────────────────
  useEffect(() => {
    if (activeTab !== 'ai' || !submittedQuery) return;
    // Guard: only run once per submitted query
    if (aiInitializedForQuery.current === submittedQuery) return;
    aiInitializedForQuery.current = submittedQuery;
    startAiStream([{ role: 'user', content: submittedQuery }]);
  }, [activeTab, submittedQuery, startAiStream]);

  // ── Send AI follow-up ─────────────────────────────────────────────────────
  const handleAiSend = useCallback(() => {
    const text = aiInput.trim();
    if (!text || aiStreaming) return;
    setAiInput('');
    Keyboard.dismiss();
    // Build the full conversation to send (existing messages + new user message)
    const userMsg: AiMessage = { role: 'user', content: text };
    const msgsToSend = [...aiMessages, userMsg];
    startAiStream(msgsToSend);
  }, [aiInput, aiMessages, aiStreaming, startAiStream]);

  // ── Search ────────────────────────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;

    const myId = ++searchIdRef.current;
    const isStale = () => searchIdRef.current !== myId;

    // Bare domain → open directly, no search
    const domainUrl = await resolveDomain(trimmed);
    if (isStale()) return;
    if (domainUrl) {
      setQuery(''); setSubmittedQuery('');
      setShowSuggestions(false); setSuggestions([]);
      inputRef.current?.blur();
      setBrowserUrl(domainUrl);
      return;
    }

    // Reset AI state for the new query
    aiAbortRef.current?.abort();
    aiInitializedForQuery.current = '';
    setAiMessages([]);
    setAiSources([]);
    setAiStreaming(false);
    setAiError('');
    setAiInput('');

    setQuery(trimmed); setSubmittedQuery(trimmed);
    setShowSuggestions(false); setSuggestions([]);
    setActiveTab('all');
    setResults(empty); setOfficialSiteUrl(null);
    setLoading(allLoading);
    inputRef.current?.blur();

    saveToHistory(trimmed).then(() => loadSearchHistory().then(setHistory));

    const isSingleWord = !trimmed.includes(' ') && !trimmed.includes('.');
    const [web, images, videos, news, finance, probe] = await Promise.allSettled([
      fetchWebResults(trimmed),
      fetchImageResults(trimmed, ''),
      fetchVideoResults(trimmed, ''),
      fetchNewsResults(trimmed, ''),
      fetchFinanceResults(trimmed),
      isSingleWord ? probeOfficialSite(trimmed) : Promise.resolve(null),
    ]);

    if (isStale()) return;

    if (probe.status === 'fulfilled' && probe.value) setOfficialSiteUrl(probe.value);
    setResults({
      web:     web.status     === 'fulfilled' ? web.value.results : [],
      images:  images.status  === 'fulfilled' ? images.value      : [],
      videos:  videos.status  === 'fulfilled' ? videos.value      : [],
      news:    news.status    === 'fulfilled' ? news.value        : [],
      finance: finance.status === 'fulfilled' ? finance.value     : [],
    });
    setLoading(notLoading);
  }, []);

  const openPotentialDomain = useCallback((domain: string) => {
    setShowSuggestions(false); setSuggestions([]);
    setQuery(''); setSubmittedQuery('');
    inputRef.current?.blur();
    setBrowserUrl(`https://${domain}`);
  }, []);

  const openBrowser = useCallback((url: string) => setBrowserUrl(url), []);

  const handleHistorySelect = useCallback((q: string) => { setQuery(q); doSearch(q); }, [doSearch]);
  const handleHistoryRemove = useCallback((q: string) => {
    removeFromHistory(q).then(() => loadSearchHistory().then(setHistory));
  }, []);
  const handleHistoryClearAll = useCallback(() => {
    Alert.alert('Clear search history', 'Remove all recent searches?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: () => clearSearchHistory().then(() => setHistory([])) },
    ]);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const hasSearch = submittedQuery.length > 0;
  const isAiTab   = hasSearch && activeTab === 'ai';
  const potentialDomain = getPotentialDomain(query);
  // Suppress search suggestions while on AI tab (bottom bar is chat input there)
  const shouldShowSuggestions = !isAiTab && inputFocused && query.trim().length >= 1
    && (showSuggestions || !!potentialDomain);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={[s.root, { paddingTop: topPad }]} behavior="padding">

      {/* ── Landing ─────────────────────────────────────────────────────── */}
      {!hasSearch ? (
        <ScrollView style={s.flex} contentContainerStyle={s.landingContent}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={s.landingHero}>
            <View style={s.landingIcon}>
              <Ionicons name="search" size={40} color={colors.mutedForeground} />
            </View>
            <Text style={[s.landingTitle, { color: colors.foreground }]}>Engagera Search</Text>
            <Text style={[s.landingBody, { color: colors.mutedForeground }]}>
              AI · Web · Images · Videos · News · Finance{'\n'}powered by AfuBot search
            </Text>
          </View>
          <HistorySection history={history} onSelect={handleHistorySelect}
            onRemove={handleHistoryRemove} onClearAll={handleHistoryClearAll} />
        </ScrollView>
      ) : null}

      {/* ── Results ──────────────────────────────────────────────────────── */}
      {hasSearch ? (
        <View style={s.flex}>

          {/* Tab bar — always flush at the top */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={[s.tabBar, { borderBottomColor: colors.border }]}
            contentContainerStyle={s.tabBarContent}>
            {TABS.map((tab) => {
              const active = tab.key === activeTab;
              return (
                <Pressable key={tab.key} style={s.tab} onPress={() => setActiveTab(tab.key)}>
                  <View style={s.tabInner}>
                    <Ionicons name={tab.icon as any} size={14}
                      color={active ? colors.foreground : colors.mutedForeground} />
                    <Text style={[s.tabLabel,
                      { color: active ? colors.foreground : colors.mutedForeground },
                      active && s.tabLabelActive]}>
                      {tab.label}
                    </Text>
                  </View>
                  {active ? <View style={[s.tabUnderline, { backgroundColor: colors.foreground }]} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>

          {/* ── AI chat (always rendered when hasSearch so state is kept) ── */}
          {/* Using visibility trick instead of conditional unmount */}
          <View style={[s.flex, activeTab !== 'ai' && s.hidden]}>
            {aiError && aiMessages.length === 0 ? (
              <View style={s.aiErrorWrap}>
                <Ionicons name="alert-circle-outline" size={28} color={colors.mutedForeground} />
                <Text style={[s.aiErrorText, { color: colors.mutedForeground }]}>{aiError}</Text>
              </View>
            ) : (
              <ScrollView
                ref={aiScrollRef}
                style={s.flex}
                contentContainerStyle={s.aiChatPad}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {aiMessages.map((msg, i) => {
                  const isUser = msg.role === 'user';
                  const isLastAssistant = !isUser && i === aiMessages.length - 1;

                  if (isUser) {
                    return (
                      <View key={i} style={s.aiUserRow}>
                        <View style={[s.aiUserBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
                          <Text style={[s.aiUserText, { color: colors.foreground }]}>{msg.content}</Text>
                        </View>
                      </View>
                    );
                  }

                  return (
                    <View key={i} style={s.aiAssistantRow}>
                      {/* Header only on first assistant message */}
                      {i === 1 ? (
                        <View style={s.aiAssistantHeader}>
                          <Ionicons name="sparkles" size={13} color={colors.foreground} />
                          <Text style={[s.aiAssistantLabel, { color: colors.foreground }]}>Engagera AI</Text>
                          {aiStreaming && isLastAssistant ? (
                            <ActivityIndicator size="small" color={colors.mutedForeground} />
                          ) : null}
                        </View>
                      ) : (
                        aiStreaming && isLastAssistant ? (
                          <View style={s.aiAssistantHeader}>
                            <ActivityIndicator size="small" color={colors.mutedForeground} />
                          </View>
                        ) : null
                      )}
                      {msg.content ? (
                        <Text style={[s.aiAssistantText, { color: colors.foreground }]}>{msg.content}</Text>
                      ) : aiStreaming && isLastAssistant ? (
                        <Text style={[s.aiAssistantText, { color: colors.mutedForeground }]}>Thinking…</Text>
                      ) : null}

                      {/* Sources below the last completed assistant message */}
                      {!aiStreaming && isLastAssistant && aiSources.length > 0 ? (
                        <View style={s.aiSourcesWrap}>
                          <Text style={[s.aiSourcesLabel, { color: colors.mutedForeground }]}>Sources</Text>
                          <View style={s.aiSourceChips}>
                            {aiSources.map((src, si) => (
                              <Pressable key={si}
                                style={[s.aiSourceChip, { backgroundColor: colors.card, borderColor: colors.border }]}
                                onPress={() => openBrowser(src.url)}>
                                <Ionicons name="link-outline" size={11} color={colors.mutedForeground} />
                                <Text style={[s.aiSourceText, { color: colors.mutedForeground }]} numberOfLines={1}>
                                  {src.host || src.title}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                {/* Spacer so last message isn't hidden behind input bar */}
                <View style={{ height: 16 }} />
              </ScrollView>
            )}
          </View>

          {/* ── All tab ──────────────────────────────────────────────────── */}
          {activeTab === 'all' ? (
            <MixedFeed results={results} officialSiteUrl={officialSiteUrl}
              loading={loading} query={submittedQuery} onPress={openBrowser} />
          ) : null}

          {/* ── Images tab ───────────────────────────────────────────────── */}
          {activeTab === 'images' ? (
            results.images.length > 0 ? (
              <FlatList data={results.images} keyExtractor={(_, i) => `img-${i}`}
                numColumns={2} columnWrapperStyle={s.imageRow}
                renderItem={({ item }) => <ImageGridCard item={item} onPress={openBrowser} />}
                contentContainerStyle={s.listPad} showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled" />
            ) : <EmptyState loading={loading.images} query={submittedQuery} />
          ) : null}

          {/* ── Videos tab ───────────────────────────────────────────────── */}
          {activeTab === 'videos' ? (
            results.videos.length > 0 ? (
              <FlatList data={results.videos} keyExtractor={(_, i) => `vid-${i}`}
                renderItem={({ item }) => <VideoCard item={item} onPress={openBrowser} />}
                contentContainerStyle={s.listPad} showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled" />
            ) : <EmptyState loading={loading.videos} query={submittedQuery} />
          ) : null}

          {/* ── News tab ─────────────────────────────────────────────────── */}
          {activeTab === 'news' ? (
            results.news.length > 0 ? (
              <FlatList data={results.news} keyExtractor={(_, i) => `news-${i}`}
                renderItem={({ item }) => <NewsCard item={item} onPress={openBrowser} />}
                contentContainerStyle={s.listPad} showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled" />
            ) : <EmptyState loading={loading.news} query={submittedQuery} />
          ) : null}

          {/* ── Finance tab ──────────────────────────────────────────────── */}
          {activeTab === 'finance' ? (
            results.finance.length > 0 ? (
              <FlatList data={results.finance} keyExtractor={(_, i) => `fin-${i}`}
                renderItem={({ item }) => <FinanceCard item={item} onPress={openBrowser} />}
                contentContainerStyle={s.listPad} showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled" />
            ) : <EmptyState loading={loading.finance} query={submittedQuery} />
          ) : null}

        </View>
      ) : null}

      {/* ── Bottom bar ───────────────────────────────────────────────────────
           On the AI tab this becomes a chat input; everywhere else it's the
           search bar. Keeps the same visual footprint so layout doesn't jump. */}
      <View style={[s.bottomWrap, { paddingBottom: insets.bottom + 10 }]}>

        {/* Search suggestions (hidden on AI tab) */}
        {shouldShowSuggestions ? (
          <View style={[s.suggestionsFloating, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {potentialDomain ? (
              <Pressable
                style={({ pressed }) => [s.suggestionRow, s.domainRow, { borderBottomColor: colors.border },
                  pressed && { opacity: 0.7 }, suggestions.length === 0 && { borderBottomWidth: 0 }]}
                onPress={() => openPotentialDomain(potentialDomain)}>
                <View style={[s.domainIconWrap, { backgroundColor: colors.background }]}>
                  <Ionicons name="globe" size={13} color={colors.foreground} />
                </View>
                <View style={s.domainTextCol}>
                  <Text style={[s.domainVisitLabel, { color: colors.mutedForeground }]}>Visit website</Text>
                  <Text style={[s.domainText, { color: colors.foreground }]}>{potentialDomain}</Text>
                </View>
                <Ionicons name="arrow-forward" size={15} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
            {suggestions.map((sug, i) => (
              <Pressable key={i}
                style={({ pressed }) => [s.suggestionRow, { borderBottomColor: colors.border },
                  pressed && { backgroundColor: colors.background },
                  i === suggestions.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => doSearch(sug)}>
                <Ionicons name="search-outline" size={14} color={colors.mutedForeground} style={s.suggestionIcon} />
                <Text style={[s.suggestionText, { color: colors.foreground }]}>{sug}</Text>
                <Pressable hitSlop={8} onPress={() => { setQuery(sug); inputRef.current?.focus(); }} style={s.fillBtn}>
                  <Ionicons name="arrow-up-outline" size={14} color={colors.mutedForeground} />
                </Pressable>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* ── AI chat input (only when on AI tab with an active search) ── */}
        {isAiTab ? (
          <View style={s.searchRow}>
            <View style={[s.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="sparkles-outline" size={17} color={colors.mutedForeground} style={s.searchIcon} />
              <TextInput
                ref={aiInputRef}
                style={[s.searchInput, { color: colors.foreground }]}
                placeholder="Ask a follow-up…"
                placeholderTextColor={colors.mutedForeground}
                value={aiInput}
                onChangeText={setAiInput}
                onSubmitEditing={handleAiSend}
                returnKeyType="send"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!aiStreaming}
              />
              {aiInput.length > 0 ? (
                <Pressable onPress={() => setAiInput('')} hitSlop={8} style={s.clearBtn}>
                  <Ionicons name="close-circle" size={17} color={colors.mutedForeground} />
                </Pressable>
              ) : null}
            </View>
            <Pressable
              style={[s.goBtn, { backgroundColor: aiStreaming ? colors.card : colors.foreground }]}
              onPress={handleAiSend}
              disabled={aiStreaming || !aiInput.trim()}>
              {aiStreaming ? (
                <ActivityIndicator size="small" color={colors.mutedForeground} />
              ) : (
                <Ionicons name="arrow-up" size={18} color={colors.background} />
              )}
            </Pressable>
          </View>
        ) : (
          /* ── Normal search bar ─────────────────────────────────────── */
          <View style={s.searchRow}>
            <View style={[s.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="search-outline" size={18} color={colors.mutedForeground} style={s.searchIcon} />
              <TextInput
                ref={inputRef}
                style={[s.searchInput, { color: colors.foreground }]}
                placeholder="Search or enter a site…"
                placeholderTextColor={colors.mutedForeground}
                value={query}
                onChangeText={(t) => {
                  setQuery(t);
                  if (!t.trim()) { setSubmittedQuery(''); setResults(empty); setLoading(notLoading); }
                }}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setTimeout(() => setInputFocused(false), 150)}
                onSubmitEditing={() => doSearch(query)}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="never"
              />
              {query.length > 0 ? (
                <Pressable onPress={() => {
                  setQuery(''); setSubmittedQuery(''); setSuggestions([]);
                  setShowSuggestions(false); setResults(empty); setLoading(notLoading);
                  inputRef.current?.focus();
                }} hitSlop={8} style={s.clearBtn}>
                  <Ionicons name="close-circle" size={17} color={colors.mutedForeground} />
                </Pressable>
              ) : null}
            </View>
            {query.trim() ? (
              <Pressable style={[s.goBtn, { backgroundColor: colors.foreground }]} onPress={() => doSearch(query)}>
                <Ionicons name="arrow-forward" size={18} color={colors.background} />
              </Pressable>
            ) : null}
          </View>
        )}
      </View>

      <InAppBrowser url={browserUrl} onClose={() => setBrowserUrl(null)}
        onSearchFallback={(q) => { setBrowserUrl(null); doSearch(q); }} />
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1 },
  flex:   { flex: 1 },
  // Used to keep the AI view in the tree (preserves state) but invisible
  hidden: { position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 },

  // Landing
  landingContent: { flexGrow: 1 },
  landingHero: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40, paddingTop: 60, paddingBottom: 32 },
  landingIcon: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 4 },
  landingTitle: { fontSize: 22, fontFamily: 'SpaceGrotesk_600SemiBold', letterSpacing: -0.3 },
  landingBody: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },

  // History
  historySection: { paddingHorizontal: 16, paddingBottom: 24 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  historyHeading: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.6, textTransform: 'uppercase' },
  historyClearAll: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  historyRowIcon: { flexShrink: 0 },
  historyRowText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },
  historyRowDelete: { flexShrink: 0, padding: 4 },

  // Tab bar
  tabBar: { height: 44, flexShrink: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  tabBarContent: { paddingHorizontal: 12, gap: 4 },
  tab: { paddingHorizontal: 10, alignItems: 'center' },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 10 },
  tabLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  tabLabelActive: { fontFamily: 'Inter_600SemiBold' },
  tabUnderline: { height: 2, width: '100%', borderRadius: 1, marginTop: -1 },

  // AI chat
  aiChatPad: { paddingTop: 6, paddingHorizontal: 14, paddingBottom: 8 },

  // User bubble (right-aligned)
  aiUserRow: { alignItems: 'flex-end', marginBottom: 16 },
  aiUserBubble: { maxWidth: '80%', borderRadius: 18, borderBottomRightRadius: 5, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 10 },
  aiUserText: { fontSize: 15, fontFamily: 'Inter_400Regular', lineHeight: 22 },

  // Assistant message (left-aligned, no bubble — clean prose)
  aiAssistantRow: { marginBottom: 20 },
  aiAssistantHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  aiAssistantLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  aiAssistantText: { fontSize: 15, fontFamily: 'Inter_400Regular', lineHeight: 24 },

  // Sources
  aiSourcesWrap: { marginTop: 14 },
  aiSourcesLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  aiSourceChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  aiSourceChip: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 160, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 6 },
  aiSourceText: { fontSize: 11, fontFamily: 'Inter_400Regular' },

  // AI error
  aiErrorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 80, paddingHorizontal: 40 },
  aiErrorText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },

  // Mixed feed
  mixedPad: { paddingBottom: 32 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionHeaderText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, textTransform: 'uppercase' },
  moreDivider: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  moreDividerText: { fontSize: 11, fontFamily: 'Inter_500Medium', letterSpacing: 0.3 },

  // Official site card
  officialCard: { marginHorizontal: 16, marginTop: 10, marginBottom: 2, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 4 },
  officialHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  officialIconWrap: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  officialHost: { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular' },
  officialBadge: { borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 7, paddingVertical: 2, flexShrink: 0 },
  officialBadgeText: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  officialTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  officialSub: { fontSize: 11, fontFamily: 'Inter_400Regular' },

  // Web cards
  webCard: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  webCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 },
  favicon: { width: 16, height: 16, borderRadius: 3 },
  faviconFallback: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  webCardMeta: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  webHost: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  webAge: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  webTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', lineHeight: 21 },
  webDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },

  // Image strip (horizontal)
  imageStrip: { paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  imageThumb: { borderRadius: 8, overflow: 'hidden', flexShrink: 0 },
  imageThumbFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imageThumbImg: { width: '100%', height: '100%' },

  // Image grid (Images tab)
  imageRow: { gap: 3, marginBottom: 3 },
  imageCell: { overflow: 'hidden', position: 'relative' },
  imageCellFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imageFull: { width: '100%', height: '100%' },
  imageTitleBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 6, paddingVertical: 4 },
  imageTitleText: { color: 'white', fontSize: 10, fontFamily: 'Inter_400Regular' },

  // Video cards
  videoCard: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  videoThumbWrap: { position: 'relative', flexShrink: 0 },
  videoThumb: { width: 130, height: 78, borderRadius: 8, backgroundColor: '#111' },
  videoThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  durationBadge: { position: 'absolute', bottom: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  durationText: { color: 'white', fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  videoInfo: { flex: 1, gap: 3 },
  videoTitle: { fontSize: 14, fontFamily: 'Inter_500Medium', lineHeight: 19 },
  videoMeta: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  videoAge: { fontSize: 11, fontFamily: 'Inter_400Regular' },

  // News / Finance cards
  newsCard: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'flex-start' },
  newsContent: { flex: 1, gap: 4 },
  newsSource: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  newsTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', lineHeight: 20 },
  newsDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  newsThumb: { width: 80, height: 80, borderRadius: 8, flexShrink: 0 },
  financeSourceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  financeBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, backgroundColor: 'rgba(34,197,94,0.2)' },
  financeBadgeWeb: { backgroundColor: 'rgba(99,102,241,0.2)' },
  financeBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', color: 'white', letterSpacing: 0.5 },

  // Bottom bar
  bottomWrap: { paddingHorizontal: 16, paddingTop: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 46, borderRadius: 23, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, gap: 8 },
  searchIcon: { flexShrink: 0 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular', padding: 0 },
  clearBtn: { flexShrink: 0, padding: 2 },
  goBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // Suggestions
  suggestionsFloating: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8, overflow: 'hidden' },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  suggestionIcon: { flexShrink: 0 },
  suggestionText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },
  fillBtn: { flexShrink: 0, padding: 4 },
  domainRow: { paddingVertical: 11, gap: 12 },
  domainIconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  domainTextCol: { flex: 1, gap: 1 },
  domainVisitLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', letterSpacing: 0.2, textTransform: 'uppercase' },
  domainText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  // Empty / loader
  loader: { marginTop: 60 },
  listPad: { paddingBottom: 32 },
  emptyTab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 80 },
  emptyTabText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
});
