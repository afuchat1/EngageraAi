import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/hooks/useAuth';
import { BrandMark, Wordmark } from '@/components/BrandMark';
import { LAB_MODEL } from '@/lib/chat';
import type { ChatMode } from '@/components/ModeSwitch';
import { ConversationSummary, deleteConversation, listConversations } from '@/lib/conversations';
import { useDialog } from '@/contexts/DialogContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PANEL_WIDTH = Math.min(320, SCREEN_WIDTH * 0.84);

export interface SidebarHandle {
  refresh: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelectConversation: (conversation: ConversationSummary) => void;
  activeConversationId?: number;
  refreshToken: number;
  currentMode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

const NAV_ITEMS: {
  mode: ChatMode;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  activeIcon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { mode: 'chat', label: 'Chat', icon: 'chatbubble-outline', activeIcon: 'chatbubble' },
  { mode: 'lab',  label: 'Lab',  icon: 'flask-outline',      activeIcon: 'flask'      },
];

export function Sidebar({
  open,
  onClose,
  onNewChat,
  onSelectConversation,
  activeConversationId,
  refreshToken,
  currentMode,
  onModeChange,
}: Props) {
  const colors = useColors();
  const { show: showDialog } = useDialog();
  const insets = useSafeAreaInsets();
  const { user, displayName, signOut } = useAuth();
  const translateX = useSharedValue(-PANEL_WIDTH);
  const backdropOpacity = useSharedValue(0);
  const [rendered, setRendered] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) {
      setRendered(true);
      translateX.value = withTiming(0, { duration: 260 });
      backdropOpacity.value = withTiming(1, { duration: 260 });
    } else {
      translateX.value = withTiming(-PANEL_WIDTH, { duration: 220 }, () => {
        runOnJS(setRendered)(false);
      });
      backdropOpacity.value = withTiming(0, { duration: 220 });
    }
  }, [open, translateX, backdropOpacity]);

  const refresh = useCallback(async () => {
    if (!user) { setConversations([]); return; }
    setLoading(true);
    try {
      const data = await listConversations();
      setConversations(data.filter((conversation) =>
        conversation.model !== LAB_MODEL &&
        conversation.model !== 'engagera-2.1' &&
        conversation.model !== 'engagera-reason'
      ));
    } catch {
      // silently keep last known list
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refreshToken, refresh]);

  const filtered = useMemo(() => {
    if (!query.trim()) return conversations;
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, query]);

  const confirmDelete = (conv: ConversationSummary) => {
    showDialog('Delete chat?', `"${conv.title}" will be permanently deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setConversations((prev) => prev.filter((c) => c.id !== conv.id));
          try { await deleteConversation(conv.id); } catch { refresh(); }
          if (conv.id === activeConversationId) onNewChat();
        },
      },
    ]);
  };

  const switchMode = (mode: ChatMode) => {
    onModeChange(mode);
    onClose();
  };

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationX < 0) translateX.value = Math.max(-PANEL_WIDTH, e.translationX);
    })
    .onEnd((e) => {
      if (e.translationX < -PANEL_WIDTH * 0.3) {
        translateX.value = withTiming(-PANEL_WIDTH, { duration: 200 }, () => runOnJS(onClose)());
      } else {
        translateX.value = withTiming(0, { duration: 200 });
      }
    });

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  if (!rendered) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.panel,
            panelStyle,
            { width: PANEL_WIDTH, backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          {/* ── Brand header ─────────────────────────────────── */}
          <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
            <View style={styles.brandRow}>
              <BrandMark size={18} />
              <Wordmark size={15} />
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* ── New Chat ─────────────────────────────────────── */}
          <Pressable
            onPress={onNewChat}
            style={({ pressed }) => [
              styles.newChatBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Ionicons name="add" size={18} color={colors.primaryForeground} />
            <Text style={[styles.newChatText, { color: colors.primaryForeground }]}>New chat</Text>
          </Pressable>

          {/* ── Navigation ───────────────────────────────────── */}
          <View style={[styles.section, { borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Navigate</Text>
            {NAV_ITEMS.map(({ mode, label, icon, activeIcon }) => {
              const active = currentMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => switchMode(mode)}
                  style={({ pressed }) => [
                    styles.navRow,
                    {
                      backgroundColor: active
                        ? colors.card
                        : pressed
                        ? colors.muted
                        : 'transparent',
                    },
                  ]}
                >
                  <Ionicons
                    name={active ? activeIcon : icon}
                    size={17}
                    color={active ? colors.foreground : colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.navLabel,
                      {
                        color: active ? colors.foreground : colors.mutedForeground,
                        fontFamily: active ? 'Inter_600SemiBold' : 'Inter_400Regular',
                      },
                    ]}
                  >
                    {label}
                  </Text>
                  {active && (
                    <View style={[styles.activePip, { backgroundColor: colors.primary }]} />
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* ── History ──────────────────────────────────────── */}
          <View style={styles.historySection}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, paddingHorizontal: 16 }]}>
              History
            </Text>

            {user ? (
              /* Signed-in: search + conversation list */
              <>
                <View
                  style={[
                    styles.searchRow,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <Ionicons name="search" size={15} color={colors.mutedForeground} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search chats"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.searchInput, { color: colors.foreground }]}
                  />
                </View>

                {loading && conversations.length === 0 ? (
                  <ActivityIndicator style={styles.loader} color={colors.mutedForeground} />
                ) : filtered.length === 0 ? (
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                    {query ? 'No matching chats.' : 'Your conversations will appear here.'}
                  </Text>
                ) : (
                  <FlatList
                    data={filtered}
                    keyExtractor={(item) => String(item.id)}
                    contentContainerStyle={styles.listContent}
                    renderItem={({ item }) => {
                      const active = item.id === activeConversationId;
                      return (
                        <Pressable
                          onPress={() => onSelectConversation(item)}
                          onLongPress={() => confirmDelete(item)}
                          style={({ pressed }) => [
                            styles.row,
                            {
                              backgroundColor: active
                                ? colors.card
                                : pressed
                                ? colors.muted
                                : 'transparent',
                            },
                          ]}
                        >
                          <Ionicons
                            name={
                              item.model === LAB_MODEL ||
                              item.model === 'engagera-2.1' ||
                              item.model === 'engagera-reason'
                                ? 'flask-outline'
                                : 'chatbubble-outline'
                            }
                            size={15}
                            color={colors.mutedForeground}
                          />
                          <Text
                            style={[styles.rowTitle, { color: colors.foreground }]}
                            numberOfLines={1}
                          >
                            {item.title || 'New conversation'}
                          </Text>
                          <Text style={[styles.rowTime, { color: colors.mutedForeground }]}>
                            {timeAgo(item.updatedAt)}
                          </Text>
                        </Pressable>
                      );
                    }}
                  />
                )}
              </>
            ) : (
              /* Guest: welcoming sign-in card */
              <View
                style={[
                  styles.guestCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Ionicons name="person-circle-outline" size={34} color={colors.mutedForeground} />
                <Text style={[styles.guestTitle, { color: colors.foreground }]}>
                  Save your chats
                </Text>
                <Text style={[styles.guestBody, { color: colors.mutedForeground }]}>
                  Create a free account to keep your history and unlock unlimited messages.
                </Text>
                <Pressable
                  onPress={() => { onClose(); router.push('/account'); }}
                  style={[styles.guestPrimaryBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.guestPrimaryBtnText, { color: colors.primaryForeground }]}>
                    Sign in
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    onClose();
                    router.push({ pathname: '/account', params: { mode: 'signUp' } });
                  }}
                  style={[styles.guestSecondaryBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.guestSecondaryBtnText, { color: colors.foreground }]}>
                    Create account
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* ── Footer ───────────────────────────────────────── */}
          <View
            style={[
              styles.footer,
              { borderColor: colors.border, paddingBottom: insets.bottom + 12 },
            ]}
          >
            <Pressable
              onPress={() => { onClose(); router.push('/settings'); }}
              style={styles.footerRow}
            >
              <Ionicons name="settings-outline" size={18} color={colors.foreground} />
              <Text style={[styles.footerText, { color: colors.foreground }]}>Settings</Text>
            </Pressable>

            <Pressable
              onPress={() => { onClose(); router.push('/account'); }}
              style={styles.footerRow}
            >
              <Ionicons
                name={user ? 'person-circle' : 'person-circle-outline'}
                size={18}
                color={colors.foreground}
              />
              <Text style={[styles.footerText, { color: colors.foreground }]} numberOfLines={1}>
                {user ? (displayName ?? user.email) : 'Sign in'}
              </Text>
            </Pressable>

            {user && (
              <Pressable onPress={() => signOut()} style={styles.footerRow}>
                <Ionicons name="log-out-outline" size={18} color={colors.destructive} />
                <Text style={[styles.footerText, { color: colors.destructive }]}>Sign out</Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 8, height: 0 } }
      : { elevation: 24 }),
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },

  // New Chat
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    height: 42,
    borderRadius: 999,
    marginBottom: 4,
  },
  newChatText: { fontSize: 14, fontFamily: 'Inter_700Bold' },

  // Navigation section
  section: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    marginTop: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 1,
  },
  navLabel: { flex: 1, fontSize: 14 },
  activePip: { width: 6, height: 6, borderRadius: 3 },

  // History section
  historySection: { flex: 1, overflow: 'hidden', marginTop: 10 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 6,
    height: 38,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },
  loader: { marginTop: 24 },
  emptyText: {
    fontSize: 12.5,
    fontFamily: 'Inter_400Regular',
    paddingHorizontal: 16,
    marginTop: 6,
    lineHeight: 18,
  },
  listContent: { paddingHorizontal: 8, paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderRadius: 12,
    marginBottom: 2,
  },
  rowTitle: { flex: 1, fontSize: 13.5, fontFamily: 'Inter_500Medium' },
  rowTime: { fontSize: 11, fontFamily: 'Inter_400Regular' },

  // Guest card
  guestCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  guestTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', letterSpacing: -0.2 },
  guestBody: {
    fontSize: 12.5,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 18,
  },
  guestPrimaryBtn: {
    width: '100%',
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  guestPrimaryBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  guestSecondaryBtn: {
    width: '100%',
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  guestSecondaryBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  // Footer
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingHorizontal: 16,
    gap: 4,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
  },
  footerText: { fontSize: 14, fontFamily: 'Inter_500Medium', flexShrink: 1 },
});
