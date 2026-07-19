/**
 * InAppBrowser — tabbed in-app browser with persistent history.
 *
 * Features
 * ─────────
 * • Multiple tabs — always-mounted WebViews, inactive tabs hidden with
 *   display:'none' so back/forward history and page state survive switching.
 * • Tab strip — horizontal scrollable strip above the WebView; active tab
 *   highlighted; × to close each tab; + to open a new blank tab.
 * • Tab switcher — full-screen card grid (long-press the tab count badge or
 *   tap it when > 1 tab open).
 * • History — every page load is written to AsyncStorage; history panel
 *   slides up from the history button; grouped by day; tap to revisit.
 * • URL bar — tap to edit; plain text falls back to Google search.
 * • Back / forward / reload / stop / share — all scoped to the active tab.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import WebView, { type WebViewNavigation } from 'react-native-webview';
import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/contexts/DialogContext';
import {
  addHistoryEntry,
  clearBrowserHistory,
  historyDateLabel,
  historyTimeLabel,
  loadBrowserHistory,
  type HistoryEntry,
} from '@/lib/browserStorage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrowserTab {
  id: string;
  /** The URL the WebView was initialised with (never changes after creation). */
  initialUrl: string;
  /** Tracks the current URL as the user navigates inside the WebView. */
  currentUrl: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  progress: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _tabCounter = 0;
function makeTabId() { return `tab-${++_tabCounter}`; }

function createTab(url: string): BrowserTab {
  const normalised = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return {
    id: makeTabId(),
    initialUrl: normalised,
    currentUrl: normalised,
    title: '',
    canGoBack: false,
    canGoForward: false,
    progress: 0,
  };
}

function displayHost(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '');
  } catch {
    return url;
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  url: string | null;
  onClose: () => void;
  /** Called when the user types plain text (not a URL) in the address bar. */
  onSearchFallback?: (query: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InAppBrowser({ url, onClose, onSearchFallback }: Props) {
  const colors   = useColors();
  const insets   = useSafeAreaInsets();

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [tabs, setTabs]               = useState<BrowserTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [visible, setVisible]         = useState(false);

  // ── URL bar ────────────────────────────────────────────────────────────────
  const [urlBarText, setUrlBarText]   = useState('');
  const [editingUrl, setEditingUrl]   = useState(false);
  const urlInputRef                   = useRef<TextInput>(null);

  // ── Overlays ───────────────────────────────────────────────────────────────
  const [showTabSwitcher, setShowTabSwitcher] = useState(false);
  const [showHistory,     setShowHistory]     = useState(false);
  const [history,         setHistory]         = useState<HistoryEntry[]>([]);

  // ── WebView refs (keyed by tab id) ─────────────────────────────────────────
  const webViewRefs = useRef<Map<string, WebView | null>>(new Map());

  // Tab-strip scroll ref — auto-scroll to new tab
  const tabStripRef = useRef<ScrollView>(null);

  // ── Active tab shortcut ────────────────────────────────────────────────────
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const wv = () => activeTabId ? webViewRefs.current.get(activeTabId) ?? null : null;

  // ── Open a URL (new tab each time) ────────────────────────────────────────
  const prevUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (!url || url === prevUrlRef.current) return;
    prevUrlRef.current = url;
    const tab = createTab(url);
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    setVisible(true);
    // Scroll tab strip to end after state settles
    setTimeout(() => tabStripRef.current?.scrollToEnd({ animated: true }), 100);
  }, [url]);

  // ── Sync URL bar text when active tab changes ─────────────────────────────
  useEffect(() => {
    if (!editingUrl) setUrlBarText(activeTab?.currentUrl ?? '');
  }, [activeTabId, activeTab?.currentUrl, editingUrl]);

  // ── Tab management ─────────────────────────────────────────────────────────
  const openNewTab = useCallback((dest = 'https://www.google.com') => {
    const tab = createTab(dest);
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    setShowTabSwitcher(false);
    setTimeout(() => tabStripRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const closeTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      const remaining = prev.filter((t) => t.id !== tabId);
      if (remaining.length === 0) {
        // All tabs gone — close the browser
        setVisible(false);
        setShowTabSwitcher(false);
        setShowHistory(false);
        onClose();
        return [];
      }
      // If the closed tab was active, pick the nearest one
      if (tabId === activeTabId) {
        const idx     = prev.findIndex((t) => t.id === tabId);
        const nextTab = remaining[Math.min(idx, remaining.length - 1)];
        setActiveTabId(nextTab.id);
      }
      return remaining;
    });
    webViewRefs.current.delete(tabId);
  }, [activeTabId, onClose]);

  const switchTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
    setShowTabSwitcher(false);
  }, []);

  // ── URL bar submit ─────────────────────────────────────────────────────────
  const handleUrlSubmit = useCallback(() => {
    const target = urlBarText.trim();
    if (!target) return;
    setEditingUrl(false);
    const isUrl = /^https?:\/\//i.test(target) || (target.includes('.') && !target.includes(' '));
    const dest = isUrl
      ? (/^https?:\/\//i.test(target) ? target : `https://${target}`)
      : `https://www.google.com/search?q=${encodeURIComponent(target)}`;

    const w = wv();
    if (w) {
      w.injectJavaScript(`window.location.href = ${JSON.stringify(dest)};`);
    } else {
      // No active webview yet — navigate the tab's initialUrl (shouldn't happen normally)
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, initialUrl: dest, currentUrl: dest } : t)),
      );
    }
  }, [urlBarText, activeTabId]);

  // ── Navigation state callback (per tab) ───────────────────────────────────
  const handleNavState = useCallback(
    (tabId: string, state: WebViewNavigation) => {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? {
                ...t,
                currentUrl:   state.url ?? t.currentUrl,
                title:        state.title || t.title,
                canGoBack:    state.canGoBack,
                canGoForward: state.canGoForward,
              }
            : t,
        ),
      );
      if (tabId === activeTabId && !editingUrl) {
        setUrlBarText(state.url ?? '');
      }
    },
    [activeTabId, editingUrl],
  );

  // ── Progress ───────────────────────────────────────────────────────────────
  const handleProgress = useCallback((tabId: string, progress: number) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, progress } : t)),
    );
  }, []);

  // ── History on page load ───────────────────────────────────────────────────
  const handleLoad = useCallback((tabId: string) => {
    setTabs((prev) => {
      const tab = prev.find((t) => t.id === tabId);
      if (tab?.currentUrl) {
        addHistoryEntry({
          url:       tab.currentUrl,
          title:     tab.title || displayHost(tab.currentUrl),
          visitedAt: Date.now(),
        });
      }
      return prev.map((t) => (t.id === tabId ? { ...t, progress: 1 } : t));
    });
  }, []);

  // ── Share ──────────────────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    const u = activeTab?.currentUrl;
    if (!u) return;
    try { await Share.share({ url: u, message: u }); } catch { /* ignored */ }
  }, [activeTab?.currentUrl]);

  // ── History panel ──────────────────────────────────────────────────────────
  const openHistory = useCallback(async () => {
    const h = await loadBrowserHistory();
    setHistory(h);
    setShowHistory(true);
  }, []);

  const { show: showDialog } = useDialog();

  const handleClearHistory = useCallback(() => {
    showDialog('Clear history', 'Remove all browsing history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => { await clearBrowserHistory(); setHistory([]); },
      },
    ]);
  }, [showDialog]);

  const openHistoryUrl = useCallback((entry: HistoryEntry) => {
    setShowHistory(false);
    openNewTab(entry.url);
  }, [openNewTab]);

  // ── Close entire browser ───────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    setVisible(false);
    setTabs([]);
    setActiveTabId(null);
    webViewRefs.current.clear();
    setShowTabSwitcher(false);
    setShowHistory(false);
    onClose();
  }, [onClose]);

  if (!visible || tabs.length === 0) return null;

  const isLoading = (activeTab?.progress ?? 1) < 1;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <View style={[s.container, { backgroundColor: colors.background }]}>

        {/* ── Nav bar ──────────────────────────────────────────────────────── */}
        <View style={[s.navBar, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
          {/* Back */}
          <Pressable
            onPress={() => wv()?.goBack()}
            disabled={!activeTab?.canGoBack}
            hitSlop={8} style={s.navBtn}
          >
            <Ionicons
              name="chevron-back" size={22}
              color={activeTab?.canGoBack ? colors.foreground : colors.mutedForeground}
            />
          </Pressable>

          {/* Forward */}
          <Pressable
            onPress={() => wv()?.goForward()}
            disabled={!activeTab?.canGoForward}
            hitSlop={8} style={s.navBtn}
          >
            <Ionicons
              name="chevron-forward" size={22}
              color={activeTab?.canGoForward ? colors.foreground : colors.mutedForeground}
            />
          </Pressable>

          {/* URL bar */}
          <Pressable
            style={[s.urlBar, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              setUrlBarText(activeTab?.currentUrl ?? '');
              setEditingUrl(true);
              setTimeout(() => urlInputRef.current?.focus(), 50);
            }}
          >
            {editingUrl ? (
              <TextInput
                ref={urlInputRef}
                style={[s.urlInput, { color: colors.foreground }]}
                value={urlBarText}
                onChangeText={setUrlBarText}
                onSubmitEditing={handleUrlSubmit}
                onBlur={() => setEditingUrl(false)}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                selectTextOnFocus
              />
            ) : (
              <Text style={[s.urlText, { color: colors.mutedForeground }]} numberOfLines={1}>
                {isLoading ? '⟳  Loading…' : `🔒  ${displayHost(activeTab?.currentUrl ?? '')}`}
              </Text>
            )}
          </Pressable>

          {/* Reload / Stop */}
          <Pressable
            onPress={isLoading ? () => wv()?.stopLoading() : () => wv()?.reload()}
            hitSlop={8} style={s.navBtn}
          >
            <Ionicons
              name={isLoading ? 'close-outline' : 'refresh-outline'}
              size={20} color={colors.foreground}
            />
          </Pressable>

          {/* History */}
          <Pressable onPress={openHistory} hitSlop={8} style={s.navBtn}>
            <Ionicons name="time-outline" size={20} color={colors.foreground} />
          </Pressable>

          {/* Tab count / switcher */}
          <Pressable onPress={() => setShowTabSwitcher(true)} hitSlop={8} style={s.tabCountBtn}>
            <Text style={[s.tabCountText, { color: colors.foreground, borderColor: colors.foreground }]}>
              {tabs.length}
            </Text>
          </Pressable>

          {/* Share */}
          <Pressable onPress={handleShare} hitSlop={8} style={s.navBtn}>
            <Ionicons
              name={Platform.OS === 'ios' ? 'share-outline' : 'share-social-outline'}
              size={20} color={colors.foreground}
            />
          </Pressable>

          {/* Close browser */}
          <Pressable onPress={handleClose} hitSlop={8} style={s.navBtn}>
            <Ionicons name="close" size={22} color={colors.foreground} />
          </Pressable>
        </View>

        {/* ── Tab strip ────────────────────────────────────────────────────── */}
        <View style={[s.tabStrip, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
          <ScrollView
            ref={tabStripRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.tabStripContent}
            keyboardShouldPersistTaps="handled"
          >
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => switchTab(tab.id)}
                  style={[
                    s.tabPill,
                    { borderColor: colors.border },
                    isActive && { backgroundColor: colors.background },
                  ]}
                >
                  <Text
                    style={[
                      s.tabPillText,
                      { color: isActive ? colors.foreground : colors.mutedForeground },
                    ]}
                    numberOfLines={1}
                  >
                    {tab.title || displayHost(tab.currentUrl) || 'New tab'}
                  </Text>
                  <Pressable
                    onPress={() => closeTab(tab.id)}
                    hitSlop={6}
                    style={s.tabClose}
                  >
                    <Ionicons name="close" size={12} color={isActive ? colors.foreground : colors.mutedForeground} />
                  </Pressable>
                </Pressable>
              );
            })}

            {/* New tab */}
            <Pressable onPress={() => openNewTab()} style={[s.newTabBtn, { borderColor: colors.border }]}>
              <Ionicons name="add" size={18} color={colors.mutedForeground} />
            </Pressable>
          </ScrollView>
        </View>

        {/* ── Progress bar ─────────────────────────────────────────────────── */}
        {isLoading && (activeTab?.progress ?? 0) > 0 && (activeTab?.progress ?? 0) < 1 ? (
          <View style={[s.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                s.progressFill,
                { width: `${(activeTab!.progress) * 100}%`, backgroundColor: colors.foreground },
              ]}
            />
          </View>
        ) : null}

        {/* ── WebViews — all always mounted ─────────────────────────────────── */}
        <View style={s.webViewContainer}>
          {tabs.map((tab) => (
            <WebView
              key={tab.id}
              ref={(ref) => {
                // Only store live refs; skip the null call React makes on unmount.
                // closeTab() already removes the entry when a tab is destroyed.
                if (ref) webViewRefs.current.set(tab.id, ref);
              }}
              source={{ uri: tab.initialUrl }}
              style={[s.webView, tab.id !== activeTabId && s.hiddenWebView]}
              onNavigationStateChange={(state) => handleNavState(tab.id, state)}
              onLoadProgress={({ nativeEvent }) => handleProgress(tab.id, nativeEvent.progress)}
              onLoad={() => handleLoad(tab.id)}
              onError={() => handleProgress(tab.id, 0)}
              allowsBackForwardNavigationGestures
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              sharedCookiesEnabled
              domStorageEnabled
              javaScriptEnabled
              userAgent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
            />
          ))}
        </View>

        {/* ── Tab switcher overlay ──────────────────────────────────────────── */}
        {showTabSwitcher ? (
          <View style={[s.overlay, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[s.overlayHeader, { paddingTop: insets.top + 10, borderBottomColor: colors.border }]}>
              <Text style={[s.overlayTitle, { color: colors.foreground }]}>
                {tabs.length} {tabs.length === 1 ? 'Tab' : 'Tabs'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <Pressable onPress={() => openNewTab()} style={s.overlayBtn}>
                  <Ionicons name="add" size={22} color={colors.foreground} />
                </Pressable>
                <Pressable onPress={() => setShowTabSwitcher(false)} style={s.overlayBtn}>
                  <Ionicons name="close" size={22} color={colors.foreground} />
                </Pressable>
              </View>
            </View>

            {/* Tab cards grid */}
            <FlatList
              data={tabs}
              keyExtractor={(t) => t.id}
              numColumns={2}
              contentContainerStyle={s.switcherGrid}
              renderItem={({ item }) => {
                const isActive = item.id === activeTabId;
                return (
                  <Pressable
                    onPress={() => switchTab(item.id)}
                    style={[
                      s.switcherCard,
                      { backgroundColor: colors.card, borderColor: isActive ? colors.foreground : colors.border },
                    ]}
                  >
                    {/* Card header */}
                    <View style={[s.switcherCardHeader, { backgroundColor: isActive ? colors.foreground : colors.border }]}>
                      <Text
                        style={[s.switcherCardHostname, { color: isActive ? colors.background : colors.mutedForeground }]}
                        numberOfLines={1}
                      >
                        {displayHost(item.currentUrl)}
                      </Text>
                      <Pressable onPress={() => closeTab(item.id)} hitSlop={6}>
                        <Ionicons name="close" size={14} color={isActive ? colors.background : colors.mutedForeground} />
                      </Pressable>
                    </View>
                    {/* Card body */}
                    <Text style={[s.switcherCardTitle, { color: colors.foreground }]} numberOfLines={2}>
                      {item.title || 'Loading…'}
                    </Text>
                    <Text style={[s.switcherCardUrl, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {displayHost(item.currentUrl)}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>
        ) : null}

        {/* ── History panel overlay ─────────────────────────────────────────── */}
        {showHistory ? (
          <View style={[s.overlay, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[s.overlayHeader, { paddingTop: insets.top + 10, borderBottomColor: colors.border }]}>
              <Text style={[s.overlayTitle, { color: colors.foreground }]}>History</Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <Pressable onPress={handleClearHistory} style={s.overlayBtn}>
                  <Ionicons name="trash-outline" size={20} color={colors.foreground} />
                </Pressable>
                <Pressable onPress={() => setShowHistory(false)} style={s.overlayBtn}>
                  <Ionicons name="close" size={22} color={colors.foreground} />
                </Pressable>
              </View>
            </View>

            {history.length === 0 ? (
              <View style={s.historyEmpty}>
                <Ionicons name="time-outline" size={40} color={colors.mutedForeground} />
                <Text style={[s.historyEmptyText, { color: colors.mutedForeground }]}>No history yet</Text>
              </View>
            ) : (
              <HistoryList entries={history} colors={colors} onOpen={openHistoryUrl} />
            )}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

// ─── HistoryList ───────────────────────────────────────────────────────────────

interface HistoryListProps {
  entries: HistoryEntry[];
  colors: ReturnType<typeof import('@/hooks/useColors').useColors>;
  onOpen: (entry: HistoryEntry) => void;
}

interface HistorySection {
  label: string;
  data: HistoryEntry[];
}

function buildSections(entries: HistoryEntry[]): HistorySection[] {
  const map = new Map<string, HistoryEntry[]>();
  for (const e of entries) {
    const label = historyDateLabel(e.visitedAt);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(e);
  }
  return Array.from(map.entries()).map(([label, data]) => ({ label, data }));
}

function HistoryList({ entries, colors, onOpen }: HistoryListProps) {
  const sections = buildSections(entries);

  // Flatten sections into a mixed list for FlatList performance
  type Row =
    | { kind: 'header'; label: string }
    | { kind: 'entry'; entry: HistoryEntry };

  const rows: Row[] = [];
  for (const sec of sections) {
    rows.push({ kind: 'header', label: sec.label });
    for (const e of sec.data) rows.push({ kind: 'entry', entry: e });
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(_, i) => String(i)}
      contentContainerStyle={{ paddingBottom: 40 }}
      renderItem={({ item }) => {
        if (item.kind === 'header') {
          return (
            <Text style={[histS.sectionLabel, { color: colors.mutedForeground }]}>
              {item.label}
            </Text>
          );
        }
        const { entry } = item;
        return (
          <Pressable
            onPress={() => onOpen(entry)}
            style={[histS.row, { borderBottomColor: colors.border }]}
          >
            <Ionicons name="globe-outline" size={16} color={colors.mutedForeground} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={[histS.entryTitle, { color: colors.foreground }]} numberOfLines={1}>
                {entry.title || displayHost(entry.url)}
              </Text>
              <Text style={[histS.entryUrl, { color: colors.mutedForeground }]} numberOfLines={1}>
                {displayHost(entry.url)}
              </Text>
            </View>
            <Text style={[histS.entryTime, { color: colors.mutedForeground }]}>
              {historyTimeLabel(entry.visitedAt)}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:       { flex: 1 },

  // Nav bar
  navBar: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal: 4,
    paddingBottom:   8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 0,
  },
  navBtn: {
    width: 34, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  urlBar: {
    flex: 1, height: 34, borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10, justifyContent: 'center',
    marginHorizontal: 2,
  },
  urlText:  { fontSize: 12, fontFamily: 'Inter_400Regular' },
  urlInput: { fontSize: 12, fontFamily: 'Inter_400Regular', padding: 0 },
  tabCountBtn: {
    width: 30, height: 30, alignItems: 'center', justifyContent: 'center',
  },
  tabCountText: {
    fontSize: 12, fontFamily: 'Inter_600SemiBold',
    borderWidth: 1.5, borderRadius: 5,
    paddingHorizontal: 4, paddingVertical: 1, minWidth: 20, textAlign: 'center',
  },

  // Tab strip
  tabStrip:        { borderBottomWidth: StyleSheet.hairlineWidth },
  tabStripContent: { alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5, gap: 6 },
  tabPill: {
    flexDirection: 'row', alignItems: 'center',
    height: 28, paddingLeft: 10, paddingRight: 6,
    borderRadius: 8, borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 140, gap: 4,
  },
  tabPillText: {
    flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular',
  },
  tabClose: {
    width: 18, height: 18, alignItems: 'center', justifyContent: 'center',
  },
  newTabBtn: {
    width: 32, height: 28, borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },

  // Progress
  progressTrack: { height: 2, width: '100%' },
  progressFill:  { height: 2 },

  // WebViews
  webViewContainer: { flex: 1 },
  webView:          { flex: 1 },
  hiddenWebView:    { display: 'none' },

  // Overlay (tab switcher + history)
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  overlayTitle: { fontSize: 17, fontFamily: 'SpaceGrotesk_600SemiBold' },
  overlayBtn:   { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  // Tab switcher
  switcherGrid:       { padding: 12, gap: 12 },
  switcherCard: {
    flex: 1, margin: 4, borderRadius: 12,
    borderWidth: 1.5, overflow: 'hidden',
  },
  switcherCardHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 8, gap: 6,
  },
  switcherCardHostname: { flex: 1, fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  switcherCardTitle: {
    fontSize: 13, fontFamily: 'Inter_500Medium',
    paddingHorizontal: 10, paddingTop: 8, lineHeight: 18,
  },
  switcherCardUrl: {
    fontSize: 11, fontFamily: 'Inter_400Regular',
    paddingHorizontal: 10, paddingBottom: 10, paddingTop: 4,
  },

  // History
  historyEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  historyEmptyText: { fontSize: 15, fontFamily: 'Inter_400Regular' },
});

const histS = StyleSheet.create({
  sectionLabel: {
    fontSize: 12, fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.4, textTransform: 'uppercase',
    paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6,
  },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingHorizontal: 16, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  entryTitle: { fontSize: 14, fontFamily: 'Inter_500Medium', lineHeight: 19 },
  entryUrl:   { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  entryTime:  { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
});
