/**
 * Lab Search Engine — v3 "Signal"
 * Ground-up rebuild. Key differences from v2:
 *  - AI tab: inverted FlatList (standard chat pattern — no scroll bugs possible)
 *  - All tab: AI snippet hard-capped at 150 chars with "Full answer →" CTA
 *  - Tab bar: underline-indicator style (not pills)
 *  - Suggestions: absolute overlay (never affects flow)
 *  - Landing: vertical history list + horizontal category scroll
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
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
  getPotentialDomain,
  probeOfficialSite,
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

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'all' | 'ai' | 'images' | 'videos' | 'news' | 'finance';

interface AiMsg  { role: 'user' | 'assistant'; content: string }
interface AiSrc  { title: string; url: string; host: string }
interface Results {
  web:     WebResult[];
  images:  ImageResult[];
  videos:  VideoResult[];
  news:    NewsResult[];
  finance: FinanceResult[];
}
type Loading = Record<'web' | 'images' | 'videos' | 'news' | 'finance', boolean>;

const EMPTY_RESULTS: Results  = { web: [], images: [], videos: [], news: [], finance: [] };
const NOT_LOADING:  Loading   = { web: false, images: false, videos: false, news: false, finance: false };
const AI_SNIPPET_LIMIT = 150;
const AI_PROMPT = [
  'You are "Engagera AI" on a search-results page.',
  'Answer in 4–6 clear sentences of plain prose (no markdown headers or bullet lists unless asked).',
  'Be concise and direct. For follow-ups keep the context.',
  'If time-sensitive and unverifiable, say so briefly.',
].join(' ');

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all',     label: 'All',     icon: 'globe-outline'       },
  { key: 'ai',      label: 'AI',      icon: 'sparkles-outline'    },
  { key: 'images',  label: 'Images',  icon: 'images-outline'      },
  { key: 'videos',  label: 'Videos',  icon: 'play-circle-outline' },
  { key: 'news',    label: 'News',    icon: 'newspaper-outline'   },
  { key: 'finance', label: 'Finance', icon: 'trending-up-outline' },
];

const CATEGORIES = [
  { label: 'Technology',  icon: 'hardware-chip-outline' as const, q: 'latest technology news 2025'  },
  { label: 'Science',     icon: 'flask-outline'         as const, q: 'science discoveries 2025'     },
  { label: 'Finance',     icon: 'bar-chart-outline'     as const, q: 'financial markets today'      },
  { label: 'Health',      icon: 'heart-outline'         as const, q: 'health and wellness tips'     },
  { label: 'World',       icon: 'earth-outline'         as const, q: 'world news today'             },
  { label: 'Sports',      icon: 'football-outline'      as const, q: 'sports highlights today'      },
  { label: 'AI',          icon: 'bulb-outline'          as const, q: 'artificial intelligence news' },
  { label: 'Space',       icon: 'planet-outline'        as const, q: 'space exploration news'       },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Bone({ w, h = 14, r = 6 }: { w?: string | number; h?: number; r?: number }) {
  const anim = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.7, duration: 750, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.35, duration: 750, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return (
    <Animated.View style={[{ height: h, borderRadius: r, backgroundColor: 'rgba(255,255,255,0.08)' }, w ? { width: w } : { alignSelf: 'stretch' }, { opacity: anim }] as any} />
  );
}

// ─── Favicon ──────────────────────────────────────────────────────────────────

function Favicon({ url, size = 14 }: { url?: string; size?: number }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  const uri = url ? `https://${hostOf(url)}/favicon.ico` : '';
  if (err || !uri) return <Ionicons name="globe-outline" size={size} color={colors.mutedForeground} />;
  return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 3 }} onError={() => setErr(true)} />;
}

// ─── Blinking cursor ──────────────────────────────────────────────────────────

function Cursor({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return <Animated.Text style={{ opacity: anim, color }}> ▋</Animated.Text>;
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const colors = useColors();
  return (
    <View style={[tb.wrap, { borderBottomColor: colors.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={tb.row}>
        {TABS.map((t) => {
          const on = t.key === active;
          return (
            <Pressable key={t.key} style={[tb.item, on && { borderBottomColor: colors.foreground, borderBottomWidth: 2 }]} onPress={() => onChange(t.key)}>
              <Ionicons name={t.icon} size={13} color={on ? colors.foreground : colors.mutedForeground} />
              <Text style={[tb.label, { color: on ? colors.foreground : colors.mutedForeground }, on && tb.labelOn]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const tb = StyleSheet.create({
  wrap: { height: 44, borderBottomWidth: StyleSheet.hairlineWidth },
  row:  { flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 44, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  label:   { fontSize: 13, fontFamily: 'Inter_500Medium' },
  labelOn: { fontFamily: 'Inter_600SemiBold' },
});

// ─── AI Snippet Card (All tab — hard-capped at 150 chars) ────────────────────

function AiSnippet({
  messages, streaming, error, sources, onGoAi, onOpenBrowser,
}: {
  messages: AiMsg[]; streaming: boolean; error: string;
  sources: AiSrc[]; onGoAi: () => void; onOpenBrowser: (url: string) => void;
}) {
  const colors = useColors();
  const assistantText = messages.find((m) => m.role === 'assistant')?.content ?? '';
  const snippet = assistantText.slice(0, AI_SNIPPET_LIMIT);
  const isTruncated = assistantText.length > AI_SNIPPET_LIMIT;

  if (error && !assistantText) return null;
  if (!assistantText && !streaming) return null;

  return (
    <View style={[snip.card, { borderColor: colors.border }]}>
      {/* Header row */}
      <View style={snip.header}>
        <View style={[snip.dot, { backgroundColor: colors.foreground }]}>
          <Ionicons name="sparkles" size={10} color={colors.background} />
        </View>
        <Text style={[snip.headerLabel, { color: colors.foreground }]}>AI Overview</Text>
        {streaming ? (
          <View style={snip.genBadge}>
            <ActivityIndicator size="small" color={colors.mutedForeground} style={{ transform: [{ scale: 0.6 }] }} />
            <Text style={[snip.genText, { color: colors.mutedForeground }]}>generating</Text>
          </View>
        ) : null}
      </View>

      {/* Snippet body */}
      {assistantText ? (
        <Text style={[snip.body, { color: colors.foreground }]}>
          {snippet}{isTruncated ? '…' : null}
          {streaming && !isTruncated ? <Cursor color={colors.foreground} /> : null}
        </Text>
      ) : (
        <View style={{ gap: 6 }}>
          <Bone h={12} />
          <Bone w="80%" h={12} />
          <Bone w="60%" h={12} />
        </View>
      )}

      {/* Source chips */}
      {!streaming && sources.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ gap: 6 }}>
          {sources.map((src, i) => (
            <Pressable key={i} style={[snip.chip, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => onOpenBrowser(src.url)}>
              <Text style={[snip.chipNum, { color: colors.mutedForeground }]}>{i + 1}</Text>
              <Favicon url={src.url} size={11} />
              <Text style={[snip.chipHost, { color: colors.mutedForeground }]} numberOfLines={1}>{src.host || src.title}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {/* Full answer CTA */}
      {!streaming && assistantText ? (
        <Pressable style={[snip.cta, { borderTopColor: colors.border }]} onPress={onGoAi}>
          <Ionicons name="sparkles-outline" size={13} color={colors.mutedForeground} />
          <Text style={[snip.ctaText, { color: colors.mutedForeground }]}>Full AI answer</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}

const snip = StyleSheet.create({
  card:        { marginHorizontal: 14, marginTop: 12, marginBottom: 4, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  header:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  dot:         { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  headerLabel: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  genBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  genText:     { fontSize: 11, fontFamily: 'Inter_400Regular' },
  body:        { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 22, paddingHorizontal: 14, paddingBottom: 10 },
  chip:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  chipNum:     { fontSize: 10, fontFamily: 'Inter_700Bold' },
  chipHost:    { fontSize: 11, fontFamily: 'Inter_400Regular', maxWidth: 80 },
  cta:         { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6 },
  ctaText:     { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
});

// ─── AI Chat Tab ──────────────────────────────────────────────────────────────
// Uses inverted FlatList — the standard React Native chat pattern.
// Content anchors to bottom, no scrollToEnd calls, no layout gaps.

function AiChatTab({
  messages, streaming, sources, error, onSend, onOpenBrowser,
}: {
  messages: AiMsg[]; streaming: boolean; sources: AiSrc[];
  error: string; onSend: (text: string) => void; onOpenBrowser: (url: string) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState('');

  // inverted FlatList needs data reversed
  const reversed = useMemo(() => [...messages].reverse(), [messages]);

  const renderItem = useCallback(({ item: msg, index }: { item: AiMsg; index: number }) => {
    if (msg.role === 'user') {
      return (
        <View style={ch.userRow}>
          <View style={[ch.userBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[ch.userText, { color: colors.foreground }]}>{msg.content}</Text>
          </View>
        </View>
      );
    }

    // assistant — index 0 in reversed = most recent (bottom-most when inverted)
    const isLatest = index === 0;
    const showSources = isLatest && !streaming && sources.length > 0;

    return (
      <View style={ch.aiRow}>
        <View style={ch.aiMeta}>
          <View style={[ch.aiIcon, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
            <Ionicons name="sparkles" size={10} color={colors.foreground} />
          </View>
          <Text style={[ch.aiName, { color: colors.mutedForeground }]}>Engagera AI</Text>
          {streaming && isLatest ? <ActivityIndicator size="small" color={colors.mutedForeground} style={{ transform: [{ scale: 0.65 }] }} /> : null}
        </View>

        {msg.content ? (
          <Text style={[ch.aiText, { color: colors.foreground }]}>
            {msg.content}
            {streaming && isLatest ? <Cursor color={colors.foreground} /> : null}
          </Text>
        ) : streaming && isLatest ? (
          <View style={{ gap: 5, marginTop: 4 }}>
            <Bone h={13} />
            <Bone w="75%" h={13} />
          </View>
        ) : null}

        {showSources ? (
          <View style={ch.sources}>
            <Text style={[ch.sourcesLabel, { color: colors.mutedForeground }]}>Sources</Text>
            {sources.map((src, si) => (
              <Pressable key={si} style={[ch.sourceRow, { borderColor: colors.border }]} onPress={() => onOpenBrowser(src.url)}>
                <View style={[ch.srcNum, { backgroundColor: colors.card }]}>
                  <Text style={[ch.srcNumTxt, { color: colors.mutedForeground }]}>{si + 1}</Text>
                </View>
                <Favicon url={src.url} size={13} />
                <View style={{ flex: 1 }}>
                  <Text style={[ch.srcTitle, { color: colors.foreground }]} numberOfLines={1}>{src.title || src.host}</Text>
                  <Text style={[ch.srcHost, { color: colors.mutedForeground }]} numberOfLines={1}>{src.host}</Text>
                </View>
                <Ionicons name="open-outline" size={12} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  }, [streaming, sources, onOpenBrowser, colors]);

  const handleSend = () => {
    const t = input.trim();
    if (!t || streaming) return;
    setInput('');
    Keyboard.dismiss();
    onSend(t);
  };

  if (error && messages.length === 0) {
    return (
      <View style={ch.errWrap}>
        <Ionicons name="alert-circle-outline" size={28} color={colors.mutedForeground} />
        <Text style={[ch.errText, { color: colors.mutedForeground }]}>{error}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <FlatList
        inverted
        data={reversed}
        keyExtractor={(_, i) => `aim-${i}`}
        renderItem={renderItem}
        style={{ flex: 1 }}
        contentContainerStyle={ch.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={<View style={{ height: 8 }} />}
      />
      <View style={[ch.inputWrap, { paddingBottom: insets.bottom + 10, borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <View style={[ch.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="sparkles-outline" size={15} color={colors.mutedForeground} />
          <TextInput
            style={[ch.input, { color: colors.foreground }]}
            placeholder="Ask a follow-up…"
            placeholderTextColor={colors.mutedForeground}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!streaming}
            multiline={false}
          />
          {input.length > 0 && !streaming ? (
            <Pressable hitSlop={10} onPress={() => setInput('')}>
              <Ionicons name="close-circle" size={15} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          style={[ch.sendBtn, { backgroundColor: streaming || !input.trim() ? colors.card : colors.foreground }]}
          onPress={handleSend}
          disabled={streaming || !input.trim()}>
          {streaming ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          ) : (
            <Ionicons name="arrow-up" size={17} color={colors.background} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const ch = StyleSheet.create({
  listContent: { paddingHorizontal: 14, paddingTop: 14, gap: 18 },
  // user
  userRow:    { alignItems: 'flex-end' },
  userBubble: { maxWidth: '80%', borderRadius: 18, borderBottomRightRadius: 4, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 10 },
  userText:   { fontSize: 15, fontFamily: 'Inter_400Regular', lineHeight: 22 },
  // assistant
  aiRow:  { gap: 8 },
  aiMeta: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  aiIcon: { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  aiName: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  aiText: { fontSize: 15, fontFamily: 'Inter_400Regular', lineHeight: 25 },
  // sources
  sources:      { marginTop: 10, gap: 7 },
  sourcesLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, textTransform: 'uppercase' },
  sourceRow:    { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 10 },
  srcNum:       { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  srcNumTxt:    { fontSize: 10, fontFamily: 'Inter_700Bold' },
  srcTitle:     { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  srcHost:      { fontSize: 11, fontFamily: 'Inter_400Regular' },
  // error
  errWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40, paddingBottom: 80 },
  errText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  // input
  inputWrap: { paddingHorizontal: 12, paddingTop: 10, gap: 8, flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  inputRow:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14 },
  input:     { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular', padding: 0 },
  sendBtn:   { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});

// ─── Web Result Card ──────────────────────────────────────────────────────────

function WebCard({ item, onPress }: { item: WebResult; onPress: (url: string) => void }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  const host = hostOf(item.url);
  return (
    <Pressable style={({ pressed }) => [wc.card, { borderBottomColor: colors.border }, pressed && { opacity: 0.7 }]} onPress={() => onPress(item.url)}>
      <View style={wc.meta}>
        <Favicon url={item.url} size={13} />
        <Text style={[wc.host, { color: colors.mutedForeground }]} numberOfLines={1}>{host}</Text>
        {item.age ? <Text style={[wc.age, { color: colors.mutedForeground }]}>· {item.age}</Text> : null}
      </View>
      <View style={wc.body}>
        <View style={{ flex: 1 }}>
          <Text style={[wc.title, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
          {item.description ? <Text style={[wc.desc, { color: colors.mutedForeground }]} numberOfLines={2}>{item.description}</Text> : null}
        </View>
        {item.thumbnail && !err ? (
          <Image source={{ uri: item.thumbnail }} style={wc.thumb} resizeMode="cover" onError={() => setErr(true)} />
        ) : null}
      </View>
    </Pressable>
  );
}
const wc = StyleSheet.create({
  card:  { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  meta:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  host:  { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular' },
  age:   { fontSize: 11, fontFamily: 'Inter_400Regular', flexShrink: 0 },
  body:  { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  title: { fontSize: 15, fontFamily: 'Inter_600SemiBold', lineHeight: 20, marginBottom: 4 },
  desc:  { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  thumb: { width: 70, height: 70, borderRadius: 10, flexShrink: 0, backgroundColor: '#1a1a1a' },
});

// ─── Official Site Card ───────────────────────────────────────────────────────

function OfficialCard({ url, onPress }: { url: string; onPress: (url: string) => void }) {
  const colors = useColors();
  const host = hostOf(url);
  return (
    <Pressable style={[ofc.card, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => onPress(url)}>
      <View style={[ofc.icon, { backgroundColor: colors.background }]}>
        <Ionicons name="globe" size={14} color={colors.foreground} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[ofc.label, { color: colors.mutedForeground }]}>Official site</Text>
        <Text style={[ofc.url, { color: colors.foreground }]}>{host}</Text>
      </View>
      <View style={[ofc.badge, { borderColor: colors.border }]}>
        <Text style={[ofc.badgeTxt, { color: colors.mutedForeground }]}>Official</Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
    </Pressable>
  );
}
const ofc = StyleSheet.create({
  card:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 14, marginVertical: 8, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  icon:     { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:    { fontSize: 10, fontFamily: 'Inter_400Regular' },
  url:      { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  badge:    { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  badgeTxt: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
});

// ─── Image grid ───────────────────────────────────────────────────────────────

const IMG_COL = (Dimensions.get('window').width - 28 - 8) / 3;

function ImageGrid({ images, onPress }: { images: ImageResult[]; onPress: (url: string) => void }) {
  const colors = useColors();
  const rows: ImageResult[][] = [];
  for (let i = 0; i < images.length; i += 3) rows.push(images.slice(i, i + 3));
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, gap: 4 }}>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: 4 }}>
          {row.map((img, ci) => (
            <Pressable key={ci} onPress={() => onPress(img.pageUrl)} style={{ borderRadius: 8, overflow: 'hidden', backgroundColor: colors.card }}>
              <Image source={{ uri: img.thumbnail || img.src }} style={{ width: IMG_COL, height: IMG_COL }} resizeMode="cover" />
            </Pressable>
          ))}
        </View>
      ))}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ─── Video card ───────────────────────────────────────────────────────────────

function VideoCard({ item, onPress }: { item: VideoResult; onPress: (url: string) => void }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  return (
    <Pressable style={({ pressed }) => [vc.wrap, pressed && { opacity: 0.8 }]} onPress={() => onPress(item.url)}>
      <View style={[vc.thumb, { backgroundColor: colors.card }]}>
        {item.thumbnail && !err ? (
          <Image source={{ uri: item.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setErr(true)} />
        ) : null}
        <View style={vc.playOverlay}>
          <Ionicons name="play-circle" size={42} color="rgba(255,255,255,0.9)" />
        </View>
        {item.duration ? <View style={vc.dur}><Text style={vc.durTxt}>{item.duration}</Text></View> : null}
      </View>
      <View>
        <Text style={[vc.title, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
        <Text style={[vc.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
          {[item.publisher, item.age].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </Pressable>
  );
}
const vc = StyleSheet.create({
  wrap:        { marginHorizontal: 14, marginBottom: 18 },
  thumb:       { width: '100%', aspectRatio: 16 / 9, borderRadius: 14, overflow: 'hidden', marginBottom: 10 },
  playOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  dur:         { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  durTxt:      { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  title:       { fontSize: 15, fontFamily: 'Inter_600SemiBold', lineHeight: 20, marginBottom: 4 },
  meta:        { fontSize: 12, fontFamily: 'Inter_400Regular' },
});

// ─── News cards ───────────────────────────────────────────────────────────────

function NewsHero({ item, onPress }: { item: NewsResult; onPress: (url: string) => void }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  return (
    <Pressable style={[nh.card, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => onPress(item.url)}>
      {item.thumbnail && !err ? (
        <Image source={{ uri: item.thumbnail }} style={nh.img} resizeMode="cover" onError={() => setErr(true)} />
      ) : null}
      <View style={nh.body}>
        <Text style={[nh.src, { color: colors.mutedForeground }]}>{item.source}</Text>
        <Text style={[nh.title, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
        {item.description ? <Text style={[nh.desc, { color: colors.mutedForeground }]} numberOfLines={2}>{item.description}</Text> : null}
      </View>
    </Pressable>
  );
}
const nh = StyleSheet.create({
  card: { marginHorizontal: 14, marginTop: 10, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  img:  { width: '100%', height: 180 },
  body: { padding: 14, gap: 5 },
  src:  { fontSize: 11, fontFamily: 'Inter_500Medium' },
  title:{ fontSize: 17, fontFamily: 'SpaceGrotesk_600SemiBold', lineHeight: 24 },
  desc: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19 },
});

function NewsRow({ item, onPress }: { item: NewsResult; onPress: (url: string) => void }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  return (
    <Pressable style={[nr.card, { borderBottomColor: colors.border }]} onPress={() => onPress(item.url)}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[nr.src, { color: colors.mutedForeground }]}>{item.source}</Text>
        <Text style={[nr.title, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
        {item.age ? <Text style={[nr.age, { color: colors.mutedForeground }]}>{item.age}</Text> : null}
      </View>
      {item.thumbnail && !err ? (
        <Image source={{ uri: item.thumbnail }} style={nr.thumb} resizeMode="cover" onError={() => setErr(true)} />
      ) : null}
    </Pressable>
  );
}
const nr = StyleSheet.create({
  card:  { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  src:   { fontSize: 11, fontFamily: 'Inter_400Regular' },
  title: { fontSize: 14, fontFamily: 'Inter_600SemiBold', lineHeight: 19 },
  age:   { fontSize: 11, fontFamily: 'Inter_400Regular' },
  thumb: { width: 72, height: 72, borderRadius: 10, flexShrink: 0, backgroundColor: '#1a1a1a' },
});

// ─── Finance card ─────────────────────────────────────────────────────────────

function FinCard({ item, onPress }: { item: FinanceResult; onPress: (url: string) => void }) {
  const colors = useColors();
  const [err, setErr] = useState(false);
  return (
    <Pressable style={({ pressed }) => [fin.card, { borderBottomColor: colors.border }, pressed && { opacity: 0.7 }]} onPress={() => onPress(item.url)}>
      <View style={fin.left}>
        <Text style={[fin.src, { color: colors.mutedForeground }]}>{item.source}</Text>
        <Text style={[fin.title, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
        {item.description ? <Text style={[fin.desc, { color: colors.mutedForeground }]} numberOfLines={1}>{item.description}</Text> : null}
        {item.age ? <Text style={[fin.age, { color: colors.mutedForeground }]}>{item.age}</Text> : null}
      </View>
      {item.thumbnail && !err ? (
        <Image source={{ uri: item.thumbnail }} style={fin.thumb} resizeMode="cover" onError={() => setErr(true)} />
      ) : null}
    </Pressable>
  );
}
const fin = StyleSheet.create({
  card:  { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  left:  { flex: 1, gap: 4 },
  src:   { fontSize: 11, fontFamily: 'Inter_400Regular' },
  title: { fontSize: 14, fontFamily: 'Inter_600SemiBold', lineHeight: 19 },
  desc:  { fontSize: 12, fontFamily: 'Inter_400Regular' },
  age:   { fontSize: 11, fontFamily: 'Inter_400Regular' },
  thumb: { width: 72, height: 72, borderRadius: 10, flexShrink: 0, backgroundColor: '#1a1a1a' },
});

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHead({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const colors = useColors();
  return (
    <View style={[sh.wrap, { borderBottomColor: colors.border }]}>
      <Ionicons name={icon} size={12} color={colors.mutedForeground} />
      <Text style={[sh.label, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}
const sh = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.6, textTransform: 'uppercase' },
});

// ─── Empty state ──────────────────────────────────────────────────────────────

function Empty({ loading: isLoading, icon, label }: { loading: boolean; icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const colors = useColors();
  if (isLoading) return <ActivityIndicator color={colors.foreground} style={{ marginTop: 60 }} />;
  return (
    <View style={em.wrap}>
      <Ionicons name={icon} size={30} color={colors.mutedForeground} />
      <Text style={[em.txt, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}
const em = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 80 },
  txt:  { fontSize: 14, fontFamily: 'Inter_400Regular' },
});

// ─── Web skeleton ─────────────────────────────────────────────────────────────

function WebSkeleton() {
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <Bone w={14} h={14} r={3} />
        <Bone w={100} h={11} r={4} />
      </View>
      <Bone h={15} r={5} />
      <Bone w="70%" h={15} r={5} />
      <Bone h={12} r={4} />
      <Bone w="85%" h={12} r={4} />
    </View>
  );
}

// ─── All-tab feed ─────────────────────────────────────────────────────────────

function AllFeed({
  results, officialSiteUrl, loading, aiMessages, aiStreaming, aiError, aiSources,
  onGoAi, onPress,
}: {
  results: Results; officialSiteUrl: string | null; loading: Loading;
  aiMessages: AiMsg[]; aiStreaming: boolean; aiError: string; aiSources: AiSrc[];
  onGoAi: () => void; onPress: (url: string) => void;
}) {
  const colors = useColors();
  const hasContent = officialSiteUrl || results.web.length > 0 || results.videos.length > 0 || results.news.length > 0;
  const anyLoading = loading.web || loading.images;
  const hasAi = aiMessages.some((m) => m.role === 'assistant');

  if (anyLoading && !hasContent && !hasAi) {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 14, paddingTop: 12, marginBottom: 4 }}>
          <Bone h={120} r={16} />
        </View>
        <WebSkeleton /><WebSkeleton /><WebSkeleton />
      </ScrollView>
    );
  }

  const topWeb  = results.web.slice(0, 4);
  const restWeb = results.web.slice(4);

  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 48 }}>
      <AiSnippet
        messages={aiMessages} streaming={aiStreaming} error={aiError}
        sources={aiSources} onGoAi={onGoAi} onOpenBrowser={onPress} />

      {officialSiteUrl ? <OfficialCard url={officialSiteUrl} onPress={onPress} /> : null}

      {topWeb.map((item, i) => <WebCard key={`w${i}`} item={item} onPress={onPress} />)}

      {results.images.length > 0 ? (
        <>
          <SectionHead icon="images-outline" label="Images" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
            {results.images.slice(0, 8).map((img, i) => (
              <Pressable key={i} onPress={() => onPress(img.pageUrl)} style={{ borderRadius: 10, overflow: 'hidden', backgroundColor: colors.card }}>
                <Image source={{ uri: img.thumbnail || img.src }} style={{ width: 110, height: 110 }} resizeMode="cover" />
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      {results.videos.length > 0 ? (
        <>
          <SectionHead icon="play-circle-outline" label="Videos" />
          {results.videos.slice(0, 2).map((v, i) => <VideoCard key={`v${i}`} item={v} onPress={onPress} />)}
        </>
      ) : null}

      {results.news.length > 0 ? (
        <>
          <SectionHead icon="newspaper-outline" label="News" />
          {results.news.slice(0, 1).map((n, i) => <NewsHero key={`nh${i}`} item={n} onPress={onPress} />)}
          {results.news.slice(1, 4).map((n, i) => <NewsRow key={`nr${i}`} item={n} onPress={onPress} />)}
        </>
      ) : null}

      {restWeb.length > 0 ? (
        <>
          <SectionHead icon="globe-outline" label="More results" />
          {restWeb.map((item, i) => <WebCard key={`rw${i}`} item={item} onPress={onPress} />)}
        </>
      ) : null}

      {!hasContent && !anyLoading && !hasAi ? (
        <View style={{ alignItems: 'center', paddingTop: 80, gap: 12 }}>
          <Ionicons name="search-outline" size={28} color={colors.mutedForeground} />
          <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>No results found</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

// ─── Landing ──────────────────────────────────────────────────────────────────

function Landing({ history, onSearch, onRemove, onClearHistory }: {
  history: SearchHistoryItem[]; onSearch: (q: string) => void;
  onRemove: (q: string) => void; onClearHistory: () => void;
}) {
  const colors = useColors();
  return (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 60 }}>
      {/* Categories */}
      <View style={land.section}>
        <Text style={[land.sectionTitle, { color: colors.mutedForeground }]}>Explore</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 14 }}>
          {CATEGORIES.map((cat) => (
            <Pressable key={cat.label} style={[land.catChip, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => onSearch(cat.q)}>
              <Ionicons name={cat.icon} size={14} color={colors.foreground} />
              <Text style={[land.catLabel, { color: colors.foreground }]}>{cat.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* History */}
      {history.length > 0 ? (
        <View style={land.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 10 }}>
            <Text style={[land.sectionTitle, { color: colors.mutedForeground, flex: 1, marginBottom: 0 }]}>Recent</Text>
            <Pressable onPress={onClearHistory} hitSlop={10}>
              <Text style={[land.clearTxt, { color: colors.mutedForeground }]}>Clear all</Text>
            </Pressable>
          </View>
          {history.slice(0, 8).map((h, i) => (
            <View key={i} style={[land.histRow, { borderBottomColor: colors.border }]}>
              <Pressable style={land.histLeft} onPress={() => onSearch(h.query)}>
                <Ionicons name="time-outline" size={14} color={colors.mutedForeground} />
                <Text style={[land.histText, { color: colors.foreground }]} numberOfLines={1}>{h.query}</Text>
              </Pressable>
              <Pressable hitSlop={12} onPress={() => onRemove(h.query)}>
                <Ionicons name="close" size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
          <Ionicons name="flask-outline" size={44} color={colors.mutedForeground} style={{ opacity: 0.4 }} />
          <Text style={{ fontSize: 20, fontFamily: 'SpaceGrotesk_600SemiBold', color: colors.foreground }}>Lab Research</Text>
          <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, textAlign: 'center', lineHeight: 21, paddingHorizontal: 48 }}>
            Search the web, explore with AI, browse images, videos, news and markets.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const land = StyleSheet.create({
  section:      { marginTop: 20 },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 14, marginBottom: 10 },
  catChip:      { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, marginLeft: 14 },
  catLabel:     { fontSize: 13, fontFamily: 'Inter_500Medium' },
  histRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  histLeft:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  histText:     { fontSize: 15, fontFamily: 'Inter_400Regular', flex: 1 },
  clearTxt:     { fontSize: 13, fontFamily: 'Inter_400Regular' },
});

// ─── Main Component ───────────────────────────────────────────────────────────

export function SearchEngine({ topPad }: { topPad: number }) {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const debRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search state
  const [query,       setQuery]       = useState('');
  const [submitted,   setSubmitted]   = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSug,     setShowSug]     = useState(false);
  const [focused,     setFocused]     = useState(false);
  const [activeTab,   setActiveTab]   = useState<Tab>('all');
  const [results,     setResults]     = useState<Results>(EMPTY_RESULTS);
  const [loading,     setLoading]     = useState<Loading>(NOT_LOADING);
  const [official,    setOfficial]    = useState<string | null>(null);
  const [browserUrl,  setBrowserUrl]  = useState<string | null>(null);
  const [history,     setHistory]     = useState<SearchHistoryItem[]>([]);
  const searchIdRef = useRef(0);

  // AI state
  const [aiMsgs,      setAiMsgs]      = useState<AiMsg[]>([]);
  const [aiSources,   setAiSources]   = useState<AiSrc[]>([]);
  const [aiStreaming, setAiStreaming]  = useState(false);
  const [aiError,     setAiError]     = useState('');
  const aiAbortRef = useRef<AbortController | null>(null);
  const aiInitRef  = useRef('');

  const hasSearch = submitted.length > 0;
  const potentialDomain = getPotentialDomain(query);
  const shouldShowSug = focused && query.trim().length >= 1 && (showSug || !!potentialDomain);

  useEffect(() => { loadSearchHistory().then(setHistory); }, []);

  // Suggestion debounce
  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    if (!query.trim() || query.length < 2) { setSuggestions([]); setShowSug(false); return; }
    debRef.current = setTimeout(async () => {
      const s = await fetchSuggestions(query);
      setSuggestions(s);
      setShowSug(s.length > 0 || !!getPotentialDomain(query));
    }, 160);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [query]);

  // AI stream helper
  const startAi = useCallback((msgs: AiMsg[]) => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = new AbortController();
    setAiStreaming(true);
    setAiError('');
    setAiMsgs([...msgs, { role: 'assistant', content: '' }]);
    streamChat(
      { messages: msgs.map((m) => ({ role: m.role, content: m.content })), model: LAB_MODEL, stream: true, contextHint: AI_PROMPT },
      {
        onToken: (tok) => setAiMsgs((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + tok };
          return next;
        }),
        onMeta: (info) => {
          const mapped = (info.sources ?? []).filter((s: any) => !!s.url).slice(0, 8).map((s: any) => {
            let host = ''; try { host = new URL(s.url).hostname; } catch { /**/ }
            return { title: s.title ?? '', url: s.url, host };
          });
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

  // Auto-start AI on new search
  useEffect(() => {
    if (!submitted) return;
    if (aiInitRef.current === submitted) return;
    aiInitRef.current = submitted;
    startAi([{ role: 'user', content: submitted }]);
  }, [submitted, startAi]);

  // Follow-up send (from AI tab)
  const handleFollowUp = useCallback((text: string) => {
    startAi([...aiMsgs, { role: 'user', content: text }]);
  }, [aiMsgs, startAi]);

  // Perform search
  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setShowSug(false);
    setSuggestions([]);
    setQuery(trimmed);
    setSubmitted(trimmed);
    setActiveTab('all');
    setResults(EMPTY_RESULTS);
    setOfficial(null);
    setAiMsgs([]);
    setAiSources([]);
    setAiStreaming(false);
    setAiError('');
    aiInitRef.current = '';
    setLoading({ web: true, images: true, videos: true, news: true, finance: true });
    saveToHistory(trimmed).then(() => loadSearchHistory().then(setHistory));

    const id = ++searchIdRef.current;
    const upd = (key: keyof Results, data: any) => {
      if (searchIdRef.current !== id) return;
      setResults((r) => ({ ...r, [key]: data }));
      setLoading((l) => ({ ...l, [key === 'web' ? 'web' : key]: false }));
    };

    fetchWebResults(trimmed).then(({ results: web }) => {
      if (searchIdRef.current !== id) return;
      upd('web', web);
    }).catch(() => upd('web', []));
    probeOfficialSite(trimmed).then((url) => {
      if (searchIdRef.current !== id || !url) return;
      setOfficial(url);
    }).catch(() => {});
    fetchImageResults(trimmed, '').then((r) => upd('images', r)).catch(() => upd('images', []));
    fetchVideoResults(trimmed, '').then((r) => upd('videos', r)).catch(() => upd('videos', []));
    fetchNewsResults(trimmed, '').then((r) => upd('news', r)).catch(() => upd('news', []));
    fetchFinanceResults(trimmed).then((r) => upd('finance', r)).catch(() => upd('finance', []));
  }, []);

  const clearSearch = useCallback(() => {
    aiAbortRef.current?.abort();
    aiInitRef.current = '';
    setQuery('');
    setSubmitted('');
    setResults(EMPTY_RESULTS);
    setLoading(NOT_LOADING);
    setOfficial(null);
    setActiveTab('all');
    setAiMsgs([]);
    setAiSources([]);
    setAiStreaming(false);
    setAiError('');
  }, []);

  const openBrowser = useCallback((url: string) => setBrowserUrl(url), []);

  return (
    <View style={[root.wrap, { paddingTop: topPad }]}>

      {/* ── Search bar ─────────────────────────────────────────────────────── */}
      <View style={[root.searchRow, { borderBottomColor: colors.border }]}>
        {hasSearch ? (
          <Pressable style={root.backBtn} onPress={clearSearch} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={colors.foreground} />
          </Pressable>
        ) : null}
        <View style={[root.bar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {!hasSearch ? <Ionicons name="search-outline" size={16} color={colors.mutedForeground} /> : null}
          <TextInput
            ref={inputRef}
            style={[root.barInput, { color: colors.foreground }]}
            placeholder={hasSearch ? '' : 'Search or ask anything…'}
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={(t) => { setQuery(t); if (!t.trim() && hasSearch) clearSearch(); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onSubmitEditing={() => doSearch(query)}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <Pressable hitSlop={10} onPress={() => { setQuery(''); setSuggestions([]); setShowSug(false); inputRef.current?.focus(); }}>
              <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
        {(query.trim() && !hasSearch) || hasSearch ? (
          <Pressable style={[root.goBtn, { backgroundColor: colors.foreground }]} onPress={() => doSearch(query)}>
            <Ionicons name={hasSearch ? 'search' : 'arrow-forward'} size={15} color={colors.background} />
          </Pressable>
        ) : null}
      </View>

      {/* ── Suggestions overlay ────────────────────────────────────────────── */}
      {shouldShowSug ? (
        <View style={[root.sugBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {potentialDomain ? (
            <Pressable
              style={[root.sugRow, { borderBottomColor: colors.border }, suggestions.length === 0 && { borderBottomWidth: 0 }]}
              onPress={() => { setShowSug(false); setQuery(''); setSubmitted(''); inputRef.current?.blur(); setBrowserUrl(`https://${potentialDomain}`); }}>
              <View style={[root.sugDomIcon, { backgroundColor: colors.background }]}>
                <Ionicons name="globe" size={12} color={colors.foreground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[root.sugDomLabel, { color: colors.mutedForeground }]}>Visit website</Text>
                <Text style={[root.sugDomUrl, { color: colors.foreground }]}>{potentialDomain}</Text>
              </View>
              <Ionicons name="arrow-forward" size={13} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
          {suggestions.map((s, i) => (
            <Pressable key={i}
              style={({ pressed }) => [root.sugRow, { borderBottomColor: colors.border }, pressed && { backgroundColor: colors.background }, i === suggestions.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => doSearch(s)}>
              <Ionicons name="search-outline" size={14} color={colors.mutedForeground} />
              <Text style={[root.sugText, { color: colors.foreground }]}>{s}</Text>
              <Pressable hitSlop={10} onPress={() => { setQuery(s); inputRef.current?.focus(); }}>
                <Ionicons name="arrow-up-outline" size={13} color={colors.mutedForeground} />
              </Pressable>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* ── Landing ────────────────────────────────────────────────────────── */}
      {!hasSearch ? (
        <Landing
          history={history}
          onSearch={(q) => { setQuery(q); doSearch(q); }}
          onRemove={(q) => removeFromHistory(q).then(() => loadSearchHistory().then(setHistory))}
          onClearHistory={() => Alert.alert('Clear history', 'Remove all recent searches?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear all', style: 'destructive', onPress: () => clearSearchHistory().then(() => setHistory([])) },
          ])} />
      ) : null}

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {hasSearch ? (
        <View style={{ flex: 1 }}>
          <TabBar active={activeTab} onChange={setActiveTab} />

          {activeTab === 'all' ? (
            <AllFeed
              results={results} officialSiteUrl={official} loading={loading}
              aiMessages={aiMsgs} aiStreaming={aiStreaming} aiError={aiError} aiSources={aiSources}
              onGoAi={() => setActiveTab('ai')} onPress={openBrowser} />
          ) : null}

          {activeTab === 'ai' ? (
            <AiChatTab
              messages={aiMsgs} streaming={aiStreaming} sources={aiSources}
              error={aiError} onSend={handleFollowUp} onOpenBrowser={openBrowser} />
          ) : null}

          {activeTab === 'images' ? (
            results.images.length > 0
              ? <ImageGrid images={results.images} onPress={openBrowser} />
              : <Empty loading={loading.images} icon="images-outline" label="No images found" />
          ) : null}

          {activeTab === 'videos' ? (
            results.videos.length > 0
              ? <FlatList
                  data={results.videos}
                  keyExtractor={(_, i) => `v${i}`}
                  renderItem={({ item }) => <VideoCard item={item} onPress={openBrowser} />}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingTop: 14, paddingBottom: 40 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled" />
              : <Empty loading={loading.videos} icon="play-circle-outline" label="No videos found" />
          ) : null}

          {activeTab === 'news' ? (
            results.news.length > 0
              ? <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
                  {results.news.slice(0, 1).map((n, i) => <NewsHero key={i} item={n} onPress={openBrowser} />)}
                  {results.news.slice(1).map((n, i) => <NewsRow key={i} item={n} onPress={openBrowser} />)}
                </ScrollView>
              : <Empty loading={loading.news} icon="newspaper-outline" label="No news found" />
          ) : null}

          {activeTab === 'finance' ? (
            results.finance.length > 0
              ? <FlatList
                  data={results.finance}
                  keyExtractor={(_, i) => `f${i}`}
                  renderItem={({ item }) => <FinCard item={item} onPress={openBrowser} />}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: 40 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled" />
              : <Empty loading={loading.finance} icon="trending-up-outline" label="No finance results" />
          ) : null}
        </View>
      ) : null}

      <InAppBrowser
        url={browserUrl} onClose={() => setBrowserUrl(null)}
        onSearchFallback={(q) => { setBrowserUrl(null); doSearch(q); }} />
    </View>
  );
}

// ─── Root styles ──────────────────────────────────────────────────────────────

const root = StyleSheet.create({
  wrap:       { flex: 1 },
  searchRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 10 },
  backBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  bar:        { flex: 1, flexDirection: 'row', alignItems: 'center', height: 42, borderRadius: 21, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, gap: 8 },
  barInput:   { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular', padding: 0 },
  goBtn:      { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  // suggestions — absolute, never in flow
  sugBox:     { position: 'absolute', top: 62, left: 14, right: 14, zIndex: 100, elevation: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  sugRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  sugText:    { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },
  sugDomIcon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sugDomLabel:{ fontSize: 10, fontFamily: 'Inter_500Medium', letterSpacing: 0.2, textTransform: 'uppercase' },
  sugDomUrl:  { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
