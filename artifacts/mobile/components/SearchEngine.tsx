/**
 * Lab Search Engine — v2
 *
 * Completely new UI/UX:
 * - Top-mounted persistent search bar
 * - Landing: animated hero + category chips + history chips
 * - AI overview auto-streams inline in "All" tab (no tab switch required)
 * - Pill-style tab bar
 * - 3-column image mosaic, editorial video + news cards
 * - Animated skeleton loading states
 * - AI tab: full conversational research with numbered citations
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
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

type SearchTab = 'all' | 'ai' | 'images' | 'videos' | 'news' | 'finance';

interface AiMessage { role: 'user' | 'assistant'; content: string }
interface AiSource  { title: string; url: string; host: string }

interface SearchResults {
  web:     WebResult[];
  images:  ImageResult[];
  videos:  VideoResult[];
  news:    NewsResult[];
  finance: FinanceResult[];
}

type LoadingState = Record<'web' | 'images' | 'videos' | 'news' | 'finance', boolean>;

// ── Constants ─────────────────────────────────────────────────────────────────

const AI_CONTEXT_HINT = [
  'You are "Engagera AI" answering the user\'s query on a search-results page.',
  'Answer in 4–7 clear sentences of plain prose (no markdown headers or bullet lists unless the query is a list request).',
  'Be concise, direct, and confident. For follow-up questions keep the conversational context.',
  'If the topic is time-sensitive and you cannot verify it live, say so briefly.',
].join(' ');

const TABS: { key: SearchTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all',     label: 'All',     icon: 'globe-outline'        },
  { key: 'ai',      label: 'AI',      icon: 'sparkles-outline'     },
  { key: 'images',  label: 'Images',  icon: 'images-outline'       },
  { key: 'videos',  label: 'Videos',  icon: 'play-circle-outline'  },
  { key: 'news',    label: 'News',    icon: 'newspaper-outline'    },
  { key: 'finance', label: 'Finance', icon: 'trending-up-outline'  },
];

const CATEGORIES: { label: string; icon: keyof typeof Ionicons.glyphMap; query: string }[] = [
  { label: 'Technology',  icon: 'hardware-chip-outline', query: 'latest technology news 2025'  },
  { label: 'Science',     icon: 'flask-outline',         query: 'science discoveries 2025'     },
  { label: 'Finance',     icon: 'bar-chart-outline',     query: 'financial markets today'      },
  { label: 'Health',      icon: 'heart-outline',         query: 'health and wellness tips'     },
  { label: 'World',       icon: 'earth-outline',         query: 'world news today'             },
  { label: 'Sports',      icon: 'football-outline',      query: 'sports highlights today'      },
  { label: 'AI',          icon: 'bulb-outline',          query: 'artificial intelligence news' },
  { label: 'Space',       icon: 'planet-outline',        query: 'space exploration news'       },
];

const empty: SearchResults = { web: [], images: [], videos: [], news: [], finance: [] };
const notLoading: LoadingState = { web: false, images: false, videos: false, news: false, finance: false };
const allLoading: LoadingState = { web: true, images: true, videos: true, news: true, finance: true };

const { width: SCREEN_W } = Dimensions.get('window');
const COL3 = Math.floor((SCREEN_W - 4) / 3);

// ── Skeleton loading ──────────────────────────────────────────────────────────

function SkeletonBox({ width, height, radius = 6, style }: {
  width?: number | string; height: number; radius?: number; style?: object;
}) {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return (
    <Animated.View style={[
      { width: width ?? '100%', height, borderRadius: radius, backgroundColor: 'rgba(255,255,255,0.08)', opacity: anim },
      style,
    ]} />
  );
}

function WebCardSkeleton() {
  return (
    <View style={sk.card}>
      <View style={sk.headerRow}>
        <SkeletonBox width={16} height={16} radius={4} />
        <SkeletonBox width={100} height={10} radius={4} style={{ marginLeft: 8 }} />
      </View>
      <SkeletonBox height={14} radius={4} style={{ marginTop: 8 }} />
      <SkeletonBox width="70%" height={14} radius={4} style={{ marginTop: 4 }} />
      <SkeletonBox height={10} radius={4} style={{ marginTop: 8 }} />
      <SkeletonBox width="85%" height={10} radius={4} style={{ marginTop: 4 }} />
    </View>
  );
}

const sk = StyleSheet.create({
  card: { paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)', gap: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
});

// ── Favicon ───────────────────────────────────────────────────────────────────

function Favicon({ uri, size = 15 }: { uri: string; size?: number }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  if (err || !uri) return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="globe-outline" size={size - 2} color={colors.mutedForeground} />
    </View>
  );
  return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 3 }} onError={() => setErr(true)} />;
}

// ── AI Overview Card ──────────────────────────────────────────────────────────

function AiOverviewCard({
  messages, streaming, error, sources, onOpenBrowser, onGoToAiTab,
}: {
  messages: AiMessage[]; streaming: boolean; error: string;
  sources: AiSource[]; onOpenBrowser: (url: string) => void; onGoToAiTab: () => void;
}) {
  const colors = useColors();
  const assistantMsg = messages.find((m) => m.role === 'assistant');
  const text = assistantMsg?.content ?? '';
  const cursorAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!streaming) { cursorAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(cursorAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [streaming, cursorAnim]);

  if (error && !text) return null;

  return (
    <View style={[aio.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Header */}
      <View style={aio.header}>
        <View style={aio.iconWrap}>
          <Ionicons name="sparkles" size={13} color={colors.foreground} />
        </View>
        <Text style={[aio.label, { color: colors.foreground }]}>AI Overview</Text>
        {streaming ? (
          <View style={aio.streamingBadge}>
            <ActivityIndicator size="small" color={colors.mutedForeground} style={{ transform: [{ scale: 0.65 }] }} />
            <Text style={[aio.streamingText, { color: colors.mutedForeground }]}>Generating</Text>
          </View>
        ) : null}
      </View>

      {/* Body */}
      {text ? (
        <View>
          <Text style={[aio.body, { color: colors.foreground }]}>
            {text}
            {streaming ? (
              <Animated.Text style={{ opacity: cursorAnim, color: colors.foreground }}> |</Animated.Text>
            ) : null}
          </Text>
        </View>
      ) : streaming ? (
        <View style={{ gap: 6, marginTop: 4 }}>
          <SkeletonBox height={12} radius={4} />
          <SkeletonBox width="88%" height={12} radius={4} />
          <SkeletonBox width="70%" height={12} radius={4} />
        </View>
      ) : null}

      {/* Sources */}
      {!streaming && sources.length > 0 ? (
        <View style={aio.sources}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {sources.map((src, i) => (
              <Pressable key={i}
                style={[aio.sourceChip, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => onOpenBrowser(src.url)}>
                <Text style={[aio.sourceNum, { color: colors.mutedForeground }]}>{i + 1}</Text>
                <Favicon uri={`https://${src.host}/favicon.ico`} size={12} />
                <Text style={[aio.sourceText, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {src.host || src.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Footer CTA */}
      {!streaming && text ? (
        <Pressable style={[aio.cta, { borderTopColor: colors.border }]} onPress={onGoToAiTab}>
          <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.mutedForeground} />
          <Text style={[aio.ctaText, { color: colors.mutedForeground }]}>Continue researching with AI</Text>
          <Ionicons name="arrow-forward" size={13} color={colors.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}

const aio = StyleSheet.create({
  card: { marginHorizontal: 14, marginTop: 14, marginBottom: 6, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 },
  iconWrap: { width: 22, height: 22, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontFamily: 'Inter_600SemiBold', flex: 1 },
  streamingBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  streamingText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  body: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 22, paddingHorizontal: 14, paddingBottom: 12 },
  sources: { paddingHorizontal: 14, paddingBottom: 12 },
  sourceChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  sourceNum: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  sourceText: { fontSize: 11, fontFamily: 'Inter_400Regular', maxWidth: 100 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  ctaText: { fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1 },
});

// ── Web Result Card ───────────────────────────────────────────────────────────

function WebResultCard({ item, index, onPress }: { item: WebResult; index: number; onPress: (url: string) => void }) {
  const colors = useColors();
  const [imgErr, setImgErr] = useState(false);
  let host = '';
  try { host = new URL(item.url).hostname.replace(/^www\./, ''); } catch { /**/ }

  return (
    <Pressable
      style={({ pressed }) => [wrc.card, { borderBottomColor: colors.border }, pressed && { opacity: 0.75 }]}
      onPress={() => onPress(item.url)}>
      <View style={wrc.row}>
        <View style={wrc.left}>
          <View style={wrc.meta}>
            <Favicon uri={item.favicon} />
            <Text style={[wrc.host, { color: colors.mutedForeground }]} numberOfLines={1}>{host}</Text>
            {item.age ? <Text style={[wrc.age, { color: colors.mutedForeground }]}> · {item.age}</Text> : null}
          </View>
          <Text style={[wrc.title, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
          <Text style={[wrc.desc, { color: colors.mutedForeground }]} numberOfLines={2}>{item.description}</Text>
        </View>
        {item.thumbnail && !imgErr ? (
          <Image
            source={{ uri: item.thumbnail }} style={wrc.thumb}
            resizeMode="cover" onError={() => setImgErr(true)} />
        ) : null}
      </View>
    </Pressable>
  );
}

const wrc = StyleSheet.create({
  card: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  left: { flex: 1, gap: 5 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  host: { fontSize: 11, fontFamily: 'Inter_400Regular', flex: 1 },
  age: { fontSize: 11, fontFamily: 'Inter_400Regular', flexShrink: 0 },
  title: { fontSize: 15, fontFamily: 'Inter_600SemiBold', lineHeight: 20 },
  desc: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  thumb: { width: 72, height: 72, borderRadius: 10, flexShrink: 0, backgroundColor: '#1a1a1a' },
});

// ── Image Mosaic ──────────────────────────────────────────────────────────────

function ImageMosaicStrip({ images, onPress }: { images: ImageResult[]; onPress: (url: string) => void }) {
  const colors = useColors();
  if (images.length === 0) return null;
  return (
    <View>
      <View style={[im.header, { borderBottomColor: colors.border }]}>
        <Ionicons name="images-outline" size={12} color={colors.mutedForeground} />
        <Text style={[im.headerText, { color: colors.mutedForeground }]}>Images</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={im.strip}>
        {images.slice(0, 14).map((item, i) => (
          <ImageStripThumb key={i} item={item} onPress={onPress} />
        ))}
      </ScrollView>
    </View>
  );
}

function ImageStripThumb({ item, onPress }: { item: ImageResult; onPress: (url: string) => void }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  const SIZE = 100;
  return (
    <Pressable style={[im.thumb, { width: SIZE, height: SIZE }]} onPress={() => onPress(item.pageUrl)}>
      {err ? (
        <View style={[im.thumbFallback, { backgroundColor: colors.card }]}>
          <Ionicons name="image-outline" size={20} color={colors.mutedForeground} />
        </View>
      ) : (
        <Image source={{ uri: item.thumbnail || item.src }} style={im.thumbImg} resizeMode="cover" onError={() => setErr(true)} />
      )}
    </Pressable>
  );
}

function ImageMosaicGrid({ images, onPress }: { images: ImageResult[]; onPress: (url: string) => void }) {
  const colors = useColors();
  if (images.length === 0) return (
    <View style={g.empty}>
      <Ionicons name="images-outline" size={32} color={colors.mutedForeground} />
      <Text style={[g.emptyText, { color: colors.mutedForeground }]}>No images found</Text>
    </View>
  );
  return (
    <FlatList
      data={images}
      keyExtractor={(_, i) => `img-${i}`}
      numColumns={3}
      columnWrapperStyle={{ gap: 2 }}
      ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
      contentContainerStyle={{ paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
      renderItem={({ item, index }) => <ImageMosaicCell item={item} index={index} onPress={onPress} />}
    />
  );
}

function ImageMosaicCell({ item, index, onPress }: { item: ImageResult; index: number; onPress: (url: string) => void }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  // Vary height slightly for visual interest (tall every 5th)
  const height = index % 5 === 0 ? COL3 * 1.4 : COL3;
  return (
    <Pressable style={[im.cell, { width: COL3, height }]} onPress={() => onPress(item.pageUrl)}>
      {err ? (
        <View style={[im.cellFallback, { backgroundColor: colors.card }]}>
          <Ionicons name="image-outline" size={24} color={colors.mutedForeground} />
        </View>
      ) : (
        <>
          <Image source={{ uri: item.thumbnail || item.src }} style={im.cellImg} resizeMode="cover" onError={() => setErr(true)} />
          <View style={im.cellOverlay} />
        </>
      )}
    </Pressable>
  );
}

const im = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  headerText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, textTransform: 'uppercase' },
  strip: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  thumb: { borderRadius: 10, overflow: 'hidden', flexShrink: 0 },
  thumbFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thumbImg: { width: '100%', height: '100%' },
  cell: { overflow: 'hidden', position: 'relative' },
  cellFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cellImg: { width: '100%', height: '100%' },
  cellOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.05)' },
});

// ── Video Cards ───────────────────────────────────────────────────────────────

function VideoEditorialCard({ item, onPress }: { item: VideoResult; onPress: (url: string) => void }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  const thumbH = (SCREEN_W - 32) * (9 / 16);
  return (
    <Pressable style={[vc.card, { borderBottomColor: colors.border }]} onPress={() => onPress(item.url)}>
      <View style={[vc.thumbWrap, { height: thumbH }]}>
        {!err && item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={vc.thumb} resizeMode="cover" onError={() => setErr(true)} />
        ) : (
          <View style={[vc.thumbFallback, { backgroundColor: colors.card }]}>
            <Ionicons name="play-circle-outline" size={40} color={colors.mutedForeground} />
          </View>
        )}
        {/* Play button overlay */}
        <View style={vc.playOverlay}>
          <View style={vc.playBtn}>
            <Ionicons name="play" size={16} color="white" style={{ marginLeft: 2 }} />
          </View>
        </View>
        {item.duration ? (
          <View style={vc.durationBadge}>
            <Text style={vc.durationText}>{item.duration}</Text>
          </View>
        ) : null}
      </View>
      <View style={vc.info}>
        <Text style={[vc.title, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
        <View style={vc.metaRow}>
          {item.publisher ? <Text style={[vc.meta, { color: colors.mutedForeground }]} numberOfLines={1}>{item.publisher}</Text> : null}
          {item.age ? <Text style={[vc.age, { color: colors.mutedForeground }]}>{item.age}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

const vc = StyleSheet.create({
  card: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  thumbWrap: { borderRadius: 12, overflow: 'hidden', position: 'relative', backgroundColor: '#111' },
  thumb: { width: '100%', height: '100%' },
  thumbFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  playOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  durationBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  durationText: { color: 'white', fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  info: { gap: 4 },
  title: { fontSize: 14, fontFamily: 'Inter_600SemiBold', lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 },
  age: { fontSize: 11, fontFamily: 'Inter_400Regular', flexShrink: 0 },
});

// ── News Cards ────────────────────────────────────────────────────────────────

function NewsHeroCard({ item, onPress }: { item: NewsResult; onPress: (url: string) => void }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  return (
    <Pressable style={({ pressed }) => [nc.hero, { borderColor: colors.border }, pressed && { opacity: 0.75 }]} onPress={() => onPress(item.url)}>
      {item.thumbnail && !err ? (
        <Image source={{ uri: item.thumbnail }} style={nc.heroImg} resizeMode="cover" onError={() => setErr(true)} />
      ) : (
        <View style={[nc.heroImgFallback, { backgroundColor: colors.card }]}>
          <Ionicons name="newspaper-outline" size={32} color={colors.mutedForeground} />
        </View>
      )}
      <View style={nc.heroBody}>
        <Text style={[nc.heroSource, { color: colors.mutedForeground }]}>
          {item.source}{item.age ? ` · ${item.age}` : ''}
        </Text>
        <Text style={[nc.heroTitle, { color: colors.foreground }]} numberOfLines={3}>{item.title}</Text>
        {item.description ? (
          <Text style={[nc.heroDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{item.description}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function NewsListCard({ item, onPress }: { item: NewsResult; onPress: (url: string) => void }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  return (
    <Pressable
      style={({ pressed }) => [nc.listCard, { borderBottomColor: colors.border }, pressed && { opacity: 0.75 }]}
      onPress={() => onPress(item.url)}>
      <View style={nc.listLeft}>
        <Text style={[nc.listSource, { color: colors.mutedForeground }]}>
          {item.source}{item.age ? ` · ${item.age}` : ''}
        </Text>
        <Text style={[nc.listTitle, { color: colors.foreground }]} numberOfLines={3}>{item.title}</Text>
      </View>
      {item.thumbnail && !err ? (
        <Image source={{ uri: item.thumbnail }} style={nc.listThumb} resizeMode="cover" onError={() => setErr(true)} />
      ) : null}
    </Pressable>
  );
}

function FinanceCard({ item, onPress }: { item: FinanceResult; onPress: (url: string) => void }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  return (
    <Pressable
      style={({ pressed }) => [nc.listCard, { borderBottomColor: colors.border }, pressed && { opacity: 0.75 }]}
      onPress={() => onPress(item.url)}>
      <View style={nc.listLeft}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[nc.badge, item.kind === 'news' ? nc.badgeNews : nc.badgeWeb]}>
            <Text style={nc.badgeText}>{item.kind === 'news' ? 'NEWS' : 'WEB'}</Text>
          </View>
          <Text style={[nc.listSource, { color: colors.mutedForeground }]} numberOfLines={1}>
            {item.source}{item.age ? ` · ${item.age}` : ''}
          </Text>
        </View>
        <Text style={[nc.listTitle, { color: colors.foreground }]} numberOfLines={3}>{item.title}</Text>
      </View>
      {item.thumbnail && !err ? (
        <Image source={{ uri: item.thumbnail }} style={nc.listThumb} resizeMode="cover" onError={() => setErr(true)} />
      ) : null}
    </Pressable>
  );
}

const nc = StyleSheet.create({
  hero: { marginHorizontal: 14, marginBottom: 2, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  heroImg: { width: '100%', height: 180 },
  heroImgFallback: { width: '100%', height: 180, alignItems: 'center', justifyContent: 'center' },
  heroBody: { padding: 14, gap: 6 },
  heroSource: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  heroTitle: { fontSize: 17, fontFamily: 'SpaceGrotesk_600SemiBold', lineHeight: 23 },
  heroDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  listCard: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'flex-start' },
  listLeft: { flex: 1, gap: 5 },
  listSource: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  listTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', lineHeight: 20 },
  listThumb: { width: 76, height: 76, borderRadius: 10, flexShrink: 0, backgroundColor: '#1a1a1a' },
  badge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  badgeNews: { backgroundColor: 'rgba(34,197,94,0.18)' },
  badgeWeb: { backgroundColor: 'rgba(99,102,241,0.18)' },
  badgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', color: 'white', letterSpacing: 0.4 },
});

// ── Official Site Card ────────────────────────────────────────────────────────

function OfficialSiteCard({ url, onPress }: { url: string; onPress: (url: string) => void }) {
  const colors = useColors();
  let host = '', displayUrl = url;
  try { const p = new URL(url); host = p.hostname.replace(/^www\./, ''); displayUrl = p.hostname; } catch { /**/ }
  return (
    <Pressable
      style={({ pressed }) => [osc.card, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.75 }]}
      onPress={() => onPress(url)}>
      <View style={osc.row}>
        <View style={[osc.iconWrap, { backgroundColor: colors.background }]}>
          <Ionicons name="globe" size={15} color={colors.foreground} />
        </View>
        <View style={osc.info}>
          <Text style={[osc.host, { color: colors.mutedForeground }]} numberOfLines={1}>{displayUrl}</Text>
          <Text style={[osc.title, { color: colors.foreground }]} numberOfLines={1}>Visit {host}</Text>
        </View>
        <View style={[osc.badge, { borderColor: colors.border }]}>
          <Text style={[osc.badgeText, { color: colors.mutedForeground }]}>Official</Text>
        </View>
        <Ionicons name="arrow-forward" size={14} color={colors.mutedForeground} />
      </View>
    </Pressable>
  );
}

const osc = StyleSheet.create({
  card: { marginHorizontal: 14, marginTop: 10, marginBottom: 4, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  info: { flex: 1 },
  host: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  title: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  badge: { borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 7, paddingVertical: 3, flexShrink: 0 },
  badgeText: { fontSize: 10, fontFamily: 'Inter_500Medium' },
});

// ── All Feed ──────────────────────────────────────────────────────────────────

function AllFeed({
  results, officialSiteUrl, loading, query, aiMessages, aiStreaming, aiError, aiSources,
  onPress, onGoToAiTab,
}: {
  results: SearchResults; officialSiteUrl: string | null; loading: LoadingState; query: string;
  aiMessages: AiMessage[]; aiStreaming: boolean; aiError: string; aiSources: AiSource[];
  onPress: (url: string) => void; onGoToAiTab: () => void;
}) {
  const colors = useColors();
  const anyLoading = loading.web || loading.images;
  const hasAI = aiMessages.some((m) => m.role === 'assistant');
  const hasContent = officialSiteUrl || results.web.length > 0 || results.images.length > 0
    || results.videos.length > 0 || results.news.length > 0;

  if (anyLoading && !hasContent && !hasAI) {
    return (
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View style={{ padding: 14 }}>
          <SkeletonBox height={140} radius={14} style={{ marginBottom: 8 }} />
        </View>
        <WebCardSkeleton />
        <WebCardSkeleton />
        <WebCardSkeleton />
      </ScrollView>
    );
  }

  if (!hasContent && !hasAI && !anyLoading) {
    return (
      <View style={g.empty}>
        <Ionicons name="search-outline" size={32} color={colors.mutedForeground} />
        <Text style={[g.emptyText, { color: colors.mutedForeground }]}>No results for "{query}"</Text>
      </View>
    );
  }

  const topWeb  = results.web.slice(0, 4);
  const restWeb = results.web.slice(4);

  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
      {/* AI Overview */}
      <AiOverviewCard
        messages={aiMessages} streaming={aiStreaming} error={aiError}
        sources={aiSources} onOpenBrowser={onPress} onGoToAiTab={onGoToAiTab} />

      {/* Official site */}
      {officialSiteUrl ? <OfficialSiteCard url={officialSiteUrl} onPress={onPress} /> : null}

      {/* Top web results */}
      {topWeb.map((item, i) => <WebResultCard key={`w-${i}`} item={item} index={i} onPress={onPress} />)}

      {/* Image strip */}
      {results.images.length > 0 ? (
        <ImageMosaicStrip images={results.images} onPress={onPress} />
      ) : null}

      {/* Videos (2 max) */}
      {results.videos.length > 0 ? (
        <View>
          <View style={[g.sectionHeader, { borderBottomColor: colors.border }]}>
            <Ionicons name="play-circle-outline" size={12} color={colors.mutedForeground} />
            <Text style={[g.sectionHeaderText, { color: colors.mutedForeground }]}>Videos</Text>
          </View>
          {results.videos.slice(0, 2).map((item, i) => (
            <VideoEditorialCard key={`v-${i}`} item={item} onPress={onPress} />
          ))}
        </View>
      ) : null}

      {/* News */}
      {results.news.length > 0 ? (
        <View>
          <View style={[g.sectionHeader, { borderBottomColor: colors.border }]}>
            <Ionicons name="newspaper-outline" size={12} color={colors.mutedForeground} />
            <Text style={[g.sectionHeaderText, { color: colors.mutedForeground }]}>News</Text>
          </View>
          {results.news.slice(0, 1).map((item, i) => (
            <View key={`nh-${i}`} style={{ paddingVertical: 10 }}>
              <NewsHeroCard item={item} onPress={onPress} />
            </View>
          ))}
          {results.news.slice(1, 4).map((item, i) => (
            <NewsListCard key={`nl-${i}`} item={item} onPress={onPress} />
          ))}
        </View>
      ) : null}

      {/* More web */}
      {restWeb.length > 0 ? (
        <View>
          <View style={[g.sectionHeader, { borderBottomColor: colors.border }]}>
            <Ionicons name="globe-outline" size={12} color={colors.mutedForeground} />
            <Text style={[g.sectionHeaderText, { color: colors.mutedForeground }]}>More results</Text>
          </View>
          {restWeb.map((item, i) => <WebResultCard key={`rw-${i}`} item={item} index={i + 4} onPress={onPress} />)}
        </View>
      ) : null}
    </ScrollView>
  );
}

const g = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionHeaderText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, textTransform: 'uppercase' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 80 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
});

// ── AI Research Tab ───────────────────────────────────────────────────────────

function AiResearchTab({
  messages, streaming, error, sources, followInput, setFollowInput, onSend, onOpenBrowser,
}: {
  messages: AiMessage[]; streaming: boolean; error: string; sources: AiSource[];
  followInput: string; setFollowInput: (v: string) => void;
  onSend: () => void; onOpenBrowser: (url: string) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);
  const cursorAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!streaming) { cursorAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(cursorAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [streaming, cursorAnim]);

  if (error && messages.length === 0) return (
    <View style={art.error}>
      <Ionicons name="alert-circle-outline" size={30} color={colors.mutedForeground} />
      <Text style={[art.errorText, { color: colors.mutedForeground }]}>{error}</Text>
    </View>
  );

  const renderItem = ({ item: msg, index: i }: { item: AiMessage; index: number }) => {
    if (msg.role === 'user') return (
      <View style={art.userRow}>
        <View style={[art.userBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[art.userText, { color: colors.foreground }]}>{msg.content}</Text>
        </View>
      </View>
    );

    const isLast = i === messages.length - 1;
    const showHeader = i === 1 || (i > 1 && messages[i - 1]?.role === 'user');
    return (
      <View style={art.assistantRow}>
        {showHeader ? (
          <View style={art.assistantHeader}>
            <View style={[art.assistantIcon, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
              <Ionicons name="sparkles" size={11} color={colors.foreground} />
            </View>
            <Text style={[art.assistantLabel, { color: colors.foreground }]}>Engagera AI</Text>
            {streaming && isLast ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} style={{ transform: [{ scale: 0.7 }] }} />
            ) : null}
          </View>
        ) : null}

        {msg.content ? (
          <Text style={[art.assistantText, { color: colors.foreground }]}>
            {msg.content}
            {streaming && isLast ? (
              <Animated.Text style={{ opacity: cursorAnim, color: colors.foreground }}> ▋</Animated.Text>
            ) : null}
          </Text>
        ) : streaming && isLast ? (
          <View style={{ gap: 6 }}>
            <SkeletonBox height={12} radius={4} />
            <SkeletonBox width="80%" height={12} radius={4} />
          </View>
        ) : null}

        {/* Numbered citations */}
        {!streaming && isLast && sources.length > 0 ? (
          <View style={art.citations}>
            <Text style={[art.citationsLabel, { color: colors.mutedForeground }]}>Sources</Text>
            {sources.map((src, si) => (
              <Pressable key={si}
                style={[art.citation, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => onOpenBrowser(src.url)}>
                <View style={[art.citationNum, { backgroundColor: colors.background }]}>
                  <Text style={[art.citationNumText, { color: colors.mutedForeground }]}>{si + 1}</Text>
                </View>
                <View style={art.citationInfo}>
                  <Text style={[art.citationTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {src.title || src.host}
                  </Text>
                  <Text style={[art.citationHost, { color: colors.mutedForeground }]} numberOfLines={1}>{src.host}</Text>
                </View>
                <Ionicons name="open-outline" size={13} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_, i) => `ai-msg-${i}`}
        renderItem={renderItem}
        style={{ flex: 1 }}
        contentContainerStyle={art.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => { if (streaming) listRef.current?.scrollToEnd({ animated: true }); }}
        ListFooterComponent={<View style={{ height: 8 }} />}
      />

      {/* Follow-up input */}
      <View style={[art.inputWrap, { paddingBottom: insets.bottom + 12, borderTopColor: colors.border }]}>
        <View style={[art.inputBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="sparkles-outline" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[art.input, { color: colors.foreground }]}
            placeholder="Ask a follow-up…"
            placeholderTextColor={colors.mutedForeground}
            value={followInput}
            onChangeText={setFollowInput}
            onSubmitEditing={onSend}
            returnKeyType="send"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!streaming}
          />
          {followInput.length > 0 ? (
            <Pressable onPress={() => setFollowInput('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          style={[art.sendBtn, { backgroundColor: streaming ? colors.card : colors.foreground }]}
          onPress={onSend}
          disabled={streaming || !followInput.trim()}>
          {streaming ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          ) : (
            <Ionicons name="arrow-up" size={18} color={colors.background} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const art = StyleSheet.create({
  content: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 12 },
  userRow: { alignItems: 'flex-end', marginBottom: 20 },
  userBubble: { maxWidth: '82%', borderRadius: 18, borderBottomRightRadius: 4, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 10 },
  userText: { fontSize: 15, fontFamily: 'Inter_400Regular', lineHeight: 22 },
  assistantRow: { marginBottom: 24 },
  assistantHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  assistantIcon: { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  assistantLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', flex: 1 },
  assistantText: { fontSize: 15, fontFamily: 'Inter_400Regular', lineHeight: 25 },
  citations: { marginTop: 16, gap: 8 },
  citationsLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  citation: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 10 },
  citationNum: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  citationNumText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  citationInfo: { flex: 1 },
  citationTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  citationHost: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  error: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40, paddingBottom: 80 },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  inputWrap: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  inputBar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 23, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular', padding: 0 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});

// ── Landing ───────────────────────────────────────────────────────────────────

function CategoryGrid({ onSearch }: { onSearch: (q: string) => void }) {
  const colors = useColors();
  return (
    <View style={land.catWrap}>
      <Text style={[land.catLabel, { color: colors.mutedForeground }]}>Explore</Text>
      <View style={land.catGrid}>
        {CATEGORIES.map((cat) => (
          <Pressable key={cat.label}
            style={({ pressed }) => [land.catChip, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.7 }]}
            onPress={() => onSearch(cat.query)}>
            <Ionicons name={cat.icon} size={16} color={colors.foreground} />
            <Text style={[land.catText, { color: colors.foreground }]}>{cat.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function HistorySection({ history, onSelect, onRemove, onClearAll }: {
  history: SearchHistoryItem[];
  onSelect: (q: string) => void;
  onRemove: (q: string) => void;
  onClearAll: () => void;
}) {
  const colors = useColors();
  if (history.length === 0) return null;
  return (
    <View style={land.histWrap}>
      <View style={land.histHeader}>
        <Text style={[land.histLabel, { color: colors.mutedForeground }]}>Recent</Text>
        <Pressable onPress={onClearAll} hitSlop={10}>
          <Text style={[land.histClear, { color: colors.mutedForeground }]}>Clear all</Text>
        </Pressable>
      </View>
      <View style={land.histChips}>
        {history.slice(0, 12).map((item) => (
          <View key={item.query} style={[land.histChipWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Pressable
              style={land.histChipText}
              onPress={() => onSelect(item.query)}>
              <Ionicons name="time-outline" size={12} color={colors.mutedForeground} />
              <Text style={[land.histChipLabel, { color: colors.foreground }]} numberOfLines={1}>{item.query}</Text>
            </Pressable>
            <Pressable hitSlop={8} onPress={() => onRemove(item.query)} style={land.histChipClose}>
              <Ionicons name="close" size={13} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

const land = StyleSheet.create({
  catWrap: { paddingHorizontal: 16, marginTop: 24 },
  catLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 40, borderWidth: StyleSheet.hairlineWidth },
  catText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  histWrap: { paddingHorizontal: 16, marginTop: 28 },
  histHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  histLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, textTransform: 'uppercase' },
  histClear: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  histChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  histChipWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, maxWidth: SCREEN_W * 0.65 },
  histChipText: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 6, paddingVertical: 8, flex: 1 },
  histChipLabel: { fontSize: 13, fontFamily: 'Inter_400Regular', flexShrink: 1 },
  histChipClose: { paddingRight: 10, paddingLeft: 4, paddingVertical: 8 },
});

// ── Tab Bar ───────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: SearchTab; onChange: (t: SearchTab) => void }) {
  const colors = useColors();
  return (
    <ScrollView
      horizontal showsHorizontalScrollIndicator={false}
      style={[tb.bar, { borderBottomColor: colors.border }]}
      contentContainerStyle={tb.content}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable key={tab.key} onPress={() => onChange(tab.key)}
            style={[tb.pill, isActive && { backgroundColor: colors.foreground }]}>
            <Ionicons name={tab.icon} size={12} color={isActive ? colors.background : colors.mutedForeground} />
            <Text style={[tb.label, { color: isActive ? colors.background : colors.mutedForeground },
              isActive && tb.labelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const tb = StyleSheet.create({
  bar: { height: 48, flexShrink: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  content: { paddingHorizontal: 12, paddingVertical: 0, gap: 6, alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  label: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  labelActive: { fontFamily: 'Inter_600SemiBold' },
});

// ── Empty Tab State ───────────────────────────────────────────────────────────

function TabEmpty({ loading: isLoading, icon, label }: { loading: boolean; icon: string; label: string }) {
  const colors = useColors();
  if (isLoading) return <ActivityIndicator color={colors.foreground} style={{ marginTop: 60 }} />;
  return (
    <View style={g.empty}>
      <Ionicons name={icon as any} size={32} color={colors.mutedForeground} />
      <Text style={[g.emptyText, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function SearchEngine({ topPad }: { topPad: number }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const inputRef   = useRef<TextInput>(null);
  const debRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search state
  const [query, setQuery]               = useState('');
  const [submittedQuery, setSubmitted]  = useState('');
  const [suggestions, setSuggestions]  = useState<string[]>([]);
  const [showSug, setShowSug]          = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [activeTab, setActiveTab]       = useState<SearchTab>('all');
  const [results, setResults]           = useState<SearchResults>(empty);
  const [loading, setLoading]           = useState<LoadingState>(notLoading);
  const [officialSiteUrl, setOfficial]  = useState<string | null>(null);
  const [browserUrl, setBrowserUrl]     = useState<string | null>(null);
  const [history, setHistory]           = useState<SearchHistoryItem[]>([]);
  const searchIdRef = useRef(0);

  // AI state — lives here so it persists across tab switches
  const [aiMessages, setAiMessages]   = useState<AiMessage[]>([]);
  const [aiSources, setAiSources]     = useState<AiSource[]>([]);
  const [aiStreaming, setAiStreaming]  = useState(false);
  const [aiError, setAiError]         = useState('');
  const [aiInput, setAiInput]         = useState('');
  const aiAbortRef = useRef<AbortController | null>(null);
  const aiInitRef  = useRef('');

  useEffect(() => { loadSearchHistory().then(setHistory); }, []);

  // Suggestions debounce
  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    if (!query.trim() || query.length < 2) { setSuggestions([]); setShowSug(false); return; }
    debRef.current = setTimeout(async () => {
      const sug = await fetchSuggestions(query);
      setSuggestions(sug);
      setShowSug(sug.length > 0 || !!getPotentialDomain(query));
    }, 160);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [query]);

  // AI streaming helper
  const startAiStream = useCallback((msgs: AiMessage[]) => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = new AbortController();
    setAiStreaming(true);
    setAiError('');

    const withPlaceholder: AiMessage[] = [...msgs, { role: 'assistant', content: '' }];
    setAiMessages(withPlaceholder);

    streamChat(
      { messages: msgs.map((m) => ({ role: m.role, content: m.content })), model: LAB_MODEL, stream: true, contextHint: AI_CONTEXT_HINT },
      {
        onToken: (token) => {
          setAiMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + token };
            return next;
          });
        },
        onMeta: (searchInfo) => {
          const mapped = searchInfo.sources
            .filter((s) => !!s.url).slice(0, 8)
            .map((s) => { let host = ''; try { host = new URL(s.url).hostname; } catch { /**/ } return { title: s.title, url: s.url, host }; });
          setAiSources(mapped);
        },
        onDone: () => setAiStreaming(false),
      },
      aiAbortRef.current.signal,
    ).catch((err) => {
      if (aiAbortRef.current?.signal.aborted) return;
      setAiError(err?.message ?? 'Something went wrong.');
      setAiStreaming(false);
    });
  }, []);

  // Auto-start AI when a new search is submitted
  useEffect(() => {
    if (!submittedQuery) return;
    if (aiInitRef.current === submittedQuery) return;
    aiInitRef.current = submittedQuery;
    startAiStream([{ role: 'user', content: submittedQuery }]);
  }, [submittedQuery, startAiStream]);

  // Follow-up send
  const handleAiSend = useCallback(() => {
    const text = aiInput.trim();
    if (!text || aiStreaming) return;
    setAiInput('');
    Keyboard.dismiss();
    const userMsg: AiMessage = { role: 'user', content: text };
    startAiStream([...aiMessages, userMsg]);
  }, [aiInput, aiMessages, aiStreaming, startAiStream]);

  // Main search
  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    const myId = ++searchIdRef.current;
    const stale = () => searchIdRef.current !== myId;

    const domainUrl = await resolveDomain(trimmed);
    if (stale()) return;
    if (domainUrl) {
      setQuery(''); setSubmitted(''); setShowSug(false); setSuggestions([]);
      inputRef.current?.blur(); setBrowserUrl(domainUrl); return;
    }

    aiAbortRef.current?.abort();
    aiInitRef.current = '';
    setAiMessages([]); setAiSources([]); setAiStreaming(false); setAiError(''); setAiInput('');

    setQuery(trimmed); setSubmitted(trimmed);
    setShowSug(false); setSuggestions([]);
    setActiveTab('all');
    setResults(empty); setOfficial(null); setLoading(allLoading);
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

    if (stale()) return;
    if (probe.status === 'fulfilled' && probe.value) setOfficial(probe.value);
    setResults({
      web:     web.status     === 'fulfilled' ? web.value.results : [],
      images:  images.status  === 'fulfilled' ? images.value      : [],
      videos:  videos.status  === 'fulfilled' ? videos.value      : [],
      news:    news.status    === 'fulfilled' ? news.value        : [],
      finance: finance.status === 'fulfilled' ? finance.value     : [],
    });
    setLoading(notLoading);
  }, []);

  const openBrowser = useCallback((url: string) => setBrowserUrl(url), []);
  const potentialDomain = getPotentialDomain(query);
  const shouldShowSug = inputFocused && query.trim().length >= 1 && (showSug || !!potentialDomain);
  const hasSearch = submittedQuery.length > 0;

  const clearSearch = useCallback(() => {
    setQuery(''); setSubmitted(''); setSuggestions([]); setShowSug(false);
    setResults(empty); setLoading(notLoading); setOfficial(null);
    aiAbortRef.current?.abort();
    aiInitRef.current = '';
    setAiMessages([]); setAiSources([]); setAiStreaming(false); setAiError('');
  }, []);

  return (
    <View style={[ms.root, { paddingTop: topPad }]}>

      {/* ── Search bar ─────────────────────────────────────────────────────── */}
      <View style={[ms.searchWrap, { borderBottomColor: colors.border }]}>
        {hasSearch ? (
          <Pressable style={ms.backBtn} onPress={clearSearch} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color={colors.foreground} />
          </Pressable>
        ) : null}
        <View style={[ms.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {!hasSearch ? (
            <Ionicons name="search-outline" size={17} color={colors.mutedForeground} style={ms.searchIcon} />
          ) : null}
          <TextInput
            ref={inputRef}
            style={[ms.searchInput, { color: colors.foreground }]}
            placeholder={hasSearch ? '' : 'Search or ask anything…'}
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              if (!t.trim() && hasSearch) clearSearch();
            }}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setTimeout(() => setInputFocused(false), 150)}
            onSubmitEditing={() => doSearch(query)}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => { setQuery(''); if (!hasSearch) { setSuggestions([]); setShowSug(false); } inputRef.current?.focus(); }} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
        {query.trim() && !hasSearch ? (
          <Pressable style={[ms.goBtn, { backgroundColor: colors.foreground }]} onPress={() => doSearch(query)}>
            <Ionicons name="arrow-forward" size={17} color={colors.background} />
          </Pressable>
        ) : hasSearch ? (
          <Pressable style={[ms.goBtn, { backgroundColor: colors.foreground }]} onPress={() => doSearch(query)}>
            <Ionicons name="search" size={15} color={colors.background} />
          </Pressable>
        ) : null}
      </View>

      {/* ── Suggestions (absolute overlay — never affects flow layout) ────── */}
      {shouldShowSug ? (
        <View style={[ms.sugBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {potentialDomain ? (
            <Pressable
              style={[ms.sugRow, ms.domainRow, { borderBottomColor: colors.border }, suggestions.length === 0 && { borderBottomWidth: 0 }]}
              onPress={() => { setShowSug(false); setSuggestions([]); setQuery(''); setSubmitted(''); inputRef.current?.blur(); setBrowserUrl(`https://${potentialDomain}`); }}>
              <View style={[ms.domainIcon, { backgroundColor: colors.background }]}>
                <Ionicons name="globe" size={13} color={colors.foreground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[ms.domainVisit, { color: colors.mutedForeground }]}>Visit website</Text>
                <Text style={[ms.domainUrl, { color: colors.foreground }]}>{potentialDomain}</Text>
              </View>
              <Ionicons name="arrow-forward" size={14} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
          {suggestions.map((sug, i) => (
            <Pressable key={i}
              style={({ pressed }) => [ms.sugRow, { borderBottomColor: colors.border }, pressed && { backgroundColor: colors.background }, i === suggestions.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => doSearch(sug)}>
              <Ionicons name="search-outline" size={14} color={colors.mutedForeground} />
              <Text style={[ms.sugText, { color: colors.foreground }]}>{sug}</Text>
              <Pressable hitSlop={8} onPress={() => { setQuery(sug); inputRef.current?.focus(); }}>
                <Ionicons name="arrow-up-outline" size={14} color={colors.mutedForeground} />
              </Pressable>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* ── Landing ────────────────────────────────────────────────────────── */}
      {!hasSearch ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={ms.landingContent}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={ms.hero}>
            <View style={[ms.heroIcon, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
              <Ionicons name="search" size={32} color={colors.foreground} />
            </View>
            <Text style={[ms.heroTitle, { color: colors.foreground }]}>Lab Research</Text>
            <Text style={[ms.heroSub, { color: colors.mutedForeground }]}>
              AI · Web · Images · Videos · News · Finance
            </Text>
          </View>
          <CategoryGrid onSearch={doSearch} />
          <HistorySection
            history={history}
            onSelect={(q) => { setQuery(q); doSearch(q); }}
            onRemove={(q) => removeFromHistory(q).then(() => loadSearchHistory().then(setHistory))}
            onClearAll={() => Alert.alert('Clear history', 'Remove all recent searches?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear all', style: 'destructive', onPress: () => clearSearchHistory().then(() => setHistory([])) },
            ])} />
          <View style={{ height: insets.bottom + 32 }} />
        </ScrollView>
      ) : null}

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {hasSearch ? (
        <View style={{ flex: 1 }}>
          <TabBar active={activeTab} onChange={setActiveTab} />

          {activeTab === 'all' ? (
            <AllFeed
              results={results} officialSiteUrl={officialSiteUrl}
              loading={loading} query={submittedQuery}
              aiMessages={aiMessages} aiStreaming={aiStreaming}
              aiError={aiError} aiSources={aiSources}
              onPress={openBrowser} onGoToAiTab={() => setActiveTab('ai')} />
          ) : null}

          {activeTab === 'ai' ? (
            <AiResearchTab
              messages={aiMessages} streaming={aiStreaming} error={aiError}
              sources={aiSources} followInput={aiInput} setFollowInput={setAiInput}
              onSend={handleAiSend} onOpenBrowser={openBrowser} />
          ) : null}

          {activeTab === 'images' ? (
            results.images.length > 0
              ? <ImageMosaicGrid images={results.images} onPress={openBrowser} />
              : <TabEmpty loading={loading.images} icon="images-outline" label="No images found" />
          ) : null}

          {activeTab === 'videos' ? (
            results.videos.length > 0
              ? <FlatList data={results.videos} keyExtractor={(_, i) => `v-${i}`}
                  renderItem={({ item }) => <VideoEditorialCard item={item} onPress={openBrowser} />}
                  contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled" />
              : <TabEmpty loading={loading.videos} icon="play-circle-outline" label="No videos found" />
          ) : null}

          {activeTab === 'news' ? (
            results.news.length > 0
              ? <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 10, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
                  {results.news.slice(0, 1).map((item, i) => <NewsHeroCard key={i} item={item} onPress={openBrowser} />)}
                  <View style={{ height: 10 }} />
                  {results.news.slice(1).map((item, i) => <NewsListCard key={i} item={item} onPress={openBrowser} />)}
                </ScrollView>
              : <TabEmpty loading={loading.news} icon="newspaper-outline" label="No news found" />
          ) : null}

          {activeTab === 'finance' ? (
            results.finance.length > 0
              ? <FlatList data={results.finance} keyExtractor={(_, i) => `fin-${i}`}
                  renderItem={({ item }) => <FinanceCard item={item} onPress={openBrowser} />}
                  contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled" />
              : <TabEmpty loading={loading.finance} icon="trending-up-outline" label="No finance results found" />
          ) : null}
        </View>
      ) : null}

      <InAppBrowser
        url={browserUrl} onClose={() => setBrowserUrl(null)}
        onSearchFallback={(q) => { setBrowserUrl(null); doSearch(q); }} />
    </View>
  );
}

// ── Root styles ────────────────────────────────────────────────────────────────

const ms = StyleSheet.create({
  root: { flex: 1 },
  // Search bar
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 10 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 42, borderRadius: 21, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, gap: 8 },
  searchIcon: { flexShrink: 0 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular', padding: 0 },
  goBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  // Suggestions — absolute overlay so it never shifts the tab bar or results below
  sugBox: { position: 'absolute', top: 62, left: 14, right: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', zIndex: 100, elevation: 10 },
  sugRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  sugText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },
  domainRow: { paddingVertical: 11, gap: 12 },
  domainIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  domainVisit: { fontSize: 10, fontFamily: 'Inter_500Medium', letterSpacing: 0.2, textTransform: 'uppercase' },
  domainUrl: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  // Landing
  landingContent: { flexGrow: 1 },
  hero: { alignItems: 'center', paddingTop: 48, paddingBottom: 8, paddingHorizontal: 40, gap: 10 },
  heroIcon: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  heroTitle: { fontSize: 24, fontFamily: 'SpaceGrotesk_600SemiBold', letterSpacing: -0.5 },
  heroSub: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 19 },
});
