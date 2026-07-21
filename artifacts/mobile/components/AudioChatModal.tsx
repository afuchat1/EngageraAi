/**
 * AudioChatModal — Engagera voice conversation UI.
 *
 * Fully automatic: call begins the moment the modal opens.
 * VAD handles turn-taking — no manual Send button.
 * Conversation is saved and AI recalls previous sessions.
 */

import React, { useEffect, useRef } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVoiceChat, type VoiceState, type ConversationTurn } from '@/hooks/useVoiceChat';

// ── State configuration ───────────────────────────────────────────────────────
const STATE_CONFIG: Record<VoiceState, {
  label:    string;
  sublabel: string;
  orbColor: string;
  rings:    number;
  pulse:    boolean;
  spin:     boolean;
}> = {
  idle: {
    label: 'Engagera',
    sublabel: 'Starting…',
    orbColor: 'rgba(255,255,255,0.07)',
    rings: 0, pulse: false, spin: false,
  },
  connecting: {
    label: 'Engagera',
    sublabel: 'Setting up…',
    orbColor: 'rgba(255,255,255,0.14)',
    rings: 1, pulse: true, spin: false,
  },
  listening: {
    label: 'Listening',
    sublabel: 'Speak now',
    orbColor: '#22c55e',
    rings: 3, pulse: true, spin: false,
  },
  processing: {
    label: 'Transcribing',
    sublabel: 'One moment…',
    orbColor: '#3b82f6',
    rings: 1, pulse: false, spin: true,
  },
  thinking: {
    label: 'Thinking',
    sublabel: 'Generating reply…',
    orbColor: '#8b5cf6',
    rings: 2, pulse: true, spin: false,
  },
  speaking: {
    label: 'Speaking',
    sublabel: 'Tap to interrupt',
    orbColor: '#f59e0b',
    rings: 2, pulse: true, spin: false,
  },
};

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Animated Orb ──────────────────────────────────────────────────────────────
function VoiceOrb({ state, onPress }: { state: VoiceState; onPress?: () => void }) {
  const cfg = STATE_CONFIG[state];

  const pulseScale   = useSharedValue(1);
  const spinRot      = useSharedValue(0);
  const ring1Scale   = useSharedValue(1);
  const ring1Opacity = useSharedValue(0);
  const ring2Scale   = useSharedValue(1);
  const ring2Opacity = useSharedValue(0);
  const ring3Scale   = useSharedValue(1);
  const ring3Opacity = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(pulseScale); pulseScale.value = 1;
    cancelAnimation(spinRot);    spinRot.value    = 0;
    cancelAnimation(ring1Scale); ring1Scale.value = 1; ring1Opacity.value = 0;
    cancelAnimation(ring2Scale); ring2Scale.value = 1; ring2Opacity.value = 0;
    cancelAnimation(ring3Scale); ring3Scale.value = 1; ring3Opacity.value = 0;

    if (cfg.pulse) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.09, { duration: 850, easing: Easing.inOut(Easing.ease) }),
          withTiming(1,    { duration: 850, easing: Easing.inOut(Easing.ease) }),
        ),
        -1, false,
      );
    }

    if (cfg.spin) {
      spinRot.value = withRepeat(
        withTiming(360, { duration: 1200, easing: Easing.linear }),
        -1, false,
      );
    }

    const D = 2200;
    if (cfg.rings >= 1) {
      ring1Scale.value   = withRepeat(withTiming(2.6, { duration: D, easing: Easing.out(Easing.ease) }), -1, false);
      ring1Opacity.value = withRepeat(withTiming(0,   { duration: D, easing: Easing.out(Easing.ease) }), -1, false);
    }
    if (cfg.rings >= 2) {
      ring2Scale.value   = withDelay(730, withRepeat(withTiming(2.6, { duration: D, easing: Easing.out(Easing.ease) }), -1, false));
      ring2Opacity.value = withDelay(730, withRepeat(withTiming(0,   { duration: D, easing: Easing.out(Easing.ease) }), -1, false));
    }
    if (cfg.rings >= 3) {
      ring3Scale.value   = withDelay(1460, withRepeat(withTiming(2.6, { duration: D, easing: Easing.out(Easing.ease) }), -1, false));
      ring3Opacity.value = withDelay(1460, withRepeat(withTiming(0,   { duration: D, easing: Easing.out(Easing.ease) }), -1, false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const orbStyle  = useAnimatedStyle(() => ({ transform: [{ scale: pulseScale.value }] }));
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spinRot.value}deg` }] }));
  const r1Style   = useAnimatedStyle(() => ({ transform: [{ scale: ring1Scale.value }], opacity: ring1Opacity.value }));
  const r2Style   = useAnimatedStyle(() => ({ transform: [{ scale: ring2Scale.value }], opacity: ring2Opacity.value }));
  const r3Style   = useAnimatedStyle(() => ({ transform: [{ scale: ring3Scale.value }], opacity: ring3Opacity.value }));

  const isInteractable = state === 'speaking';

  return (
    <Pressable
      onPress={isInteractable ? onPress : undefined}
      style={({ pressed }) => [orbStyles.container, pressed && isInteractable && { opacity: 0.8 }]}
    >
      {cfg.rings >= 1 && <Animated.View style={[orbStyles.ring, { borderColor: cfg.orbColor }, r1Style]} />}
      {cfg.rings >= 2 && <Animated.View style={[orbStyles.ring, { borderColor: cfg.orbColor }, r2Style]} />}
      {cfg.rings >= 3 && <Animated.View style={[orbStyles.ring, { borderColor: cfg.orbColor }, r3Style]} />}

      {cfg.spin && (
        <Animated.View style={[orbStyles.spinRing, { borderTopColor: cfg.orbColor }, spinStyle]} />
      )}

      <Animated.View style={[orbStyles.orb, { backgroundColor: cfg.orbColor }, orbStyle]}>
        {state === 'idle' || state === 'connecting' ? (
          <Ionicons name="mic-outline" size={36} color="rgba(255,255,255,0.4)" />
        ) : state === 'listening' ? (
          <Ionicons name="mic" size={36} color="#ffffff" />
        ) : state === 'speaking' ? (
          <Ionicons name="pause-circle-outline" size={36} color="#ffffff" />
        ) : (
          <View style={orbStyles.dots}>
            {[0, 1, 2].map(i => (
              <View key={i} style={[orbStyles.dot, { opacity: 0.6 + i * 0.2 }]} />
            ))}
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const orbStyles = StyleSheet.create({
  container: {
    width: 200, height: 200,
    alignItems: 'center', justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 200, height: 200, borderRadius: 100,
    borderWidth: 1,
  },
  spinRing: {
    position: 'absolute',
    width: 220, height: 220, borderRadius: 110,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  orb: {
    width: 136, height: 136, borderRadius: 68,
    alignItems: 'center', justifyContent: 'center',
  },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot:  { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#ffffff' },
});

// ── Conversation transcript ────────────────────────────────────────────────────
function ConversationLog({
  history,
  liveTranscript,
  liveReply,
  state,
}: {
  history:        ConversationTurn[];
  liveTranscript: string;
  liveReply:      string;
  state:          VoiceState;
}) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [history, liveTranscript, liveReply]);

  // Show only new turns this session (filter out recalled context from previous sessions)
  // history from hook already includes recalled context — display all for recall transparency
  const isEmpty = history.length === 0 && !liveTranscript && !liveReply;

  if (isEmpty) {
    return (
      <View style={logStyles.empty}>
        <Ionicons name="chatbubbles-outline" size={28} color="rgba(255,255,255,0.1)" />
        <Text style={logStyles.emptyText}>Conversation will appear here</Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={logStyles.scroll}
      contentContainerStyle={logStyles.content}
      showsVerticalScrollIndicator={false}
    >
      {history.map((turn, i) => (
        <View key={i} style={[logStyles.row, turn.role === 'user' ? logStyles.rowUser : logStyles.rowAI]}>
          {turn.role === 'assistant' && (
            <View style={logStyles.avatar}>
              <Text style={logStyles.avatarText}>E</Text>
            </View>
          )}
          <View style={[logStyles.bubble, turn.role === 'user' ? logStyles.bubbleUser : logStyles.bubbleAI]}>
            <Text style={logStyles.bubbleText}>{turn.content}</Text>
          </View>
        </View>
      ))}

      {(state === 'processing' || state === 'thinking') && liveTranscript ? (
        <View style={[logStyles.row, logStyles.rowUser]}>
          <View style={[logStyles.bubble, logStyles.bubbleUser, logStyles.bubbleLive]}>
            <Text style={logStyles.bubbleText}>{liveTranscript}</Text>
          </View>
        </View>
      ) : null}

      {(state === 'thinking' || state === 'speaking') && liveReply ? (
        <View style={[logStyles.row, logStyles.rowAI]}>
          <View style={logStyles.avatar}>
            <Text style={logStyles.avatarText}>E</Text>
          </View>
          <View style={[logStyles.bubble, logStyles.bubbleAI, logStyles.bubbleLive]}>
            <Text style={logStyles.bubbleText}>{liveReply}</Text>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const logStyles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { color: 'rgba(255,255,255,0.15)', fontSize: 13, fontFamily: 'Inter_400Regular' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  rowUser: { justifyContent: 'flex-end' },
  rowAI:   { justifyContent: 'flex-start' },
  avatar: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  avatarText: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  bubble: {
    maxWidth: '78%', borderRadius: 18,
    paddingHorizontal: 13, paddingVertical: 9,
  },
  bubbleUser: { backgroundColor: 'rgba(255,255,255,0.09)', borderBottomRightRadius: 5 },
  bubbleAI:   { backgroundColor: 'rgba(255,255,255,0.04)', borderBottomLeftRadius: 5 },
  bubbleLive: { opacity: 0.7 },
  bubbleText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 19,
  },
});

// ── Main modal ────────────────────────────────────────────────────────────────
interface AudioChatModalProps {
  visible: boolean;
  onClose: () => void;
}

export function AudioChatModal({ visible, onClose }: AudioChatModalProps) {
  const insets = useSafeAreaInsets();

  const {
    state,
    transcript,
    aiReply,
    callDuration,
    error,
    conversationHistory,
    beginCall,
    endCall,
    interruptSpeaking,
  } = useVoiceChat({});

  const cfg        = STATE_CONFIG[state];
  const isActive   = state !== 'idle';
  const labelColor = (state === 'idle' || state === 'connecting')
    ? 'rgba(255,255,255,0.45)'
    : cfg.orbColor;

  // Auto-start when modal opens, auto-stop on close
  useEffect(() => {
    if (visible) {
      beginCall();
    }
    // beginCall is stable — safe to ignore exhaustive-deps warning
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleClose = async () => {
    await endCall();
    onClose();
  };

  const handleOrbPress = () => {
    if (state === 'speaking') interruptSpeaking();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerBrand}>Engagera</Text>
            <View style={styles.headerMeta}>
              <View style={[
                styles.statusDot,
                { backgroundColor: isActive ? cfg.orbColor : 'rgba(255,255,255,0.2)' }
              ]} />
              <Text style={styles.headerDuration}>
                {isActive ? formatDuration(callDuration) : 'Voice AI'}
              </Text>
            </View>
          </View>
          <Pressable onPress={handleClose} style={styles.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.4)" />
          </Pressable>
        </View>

        {/* ── Orb + state label ── */}
        <View style={styles.orbSection}>
          <VoiceOrb state={state} onPress={handleOrbPress} />

          <View style={styles.stateLabel}>
            <Text style={[styles.stateName, { color: labelColor }]}>{cfg.label}</Text>
            <Text style={styles.stateSub}>{cfg.sublabel}</Text>
          </View>

          {error ? (
            <View style={styles.errorBubble}>
              <Ionicons name="warning-outline" size={13} color="#f87171" style={{ marginRight: 5 }} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Transcript ── */}
        <ConversationLog
          history={conversationHistory}
          liveTranscript={transcript}
          liveReply={aiReply}
          state={state}
        />

        {/* ── Controls ── */}
        <View style={[styles.controls, { paddingBottom: insets.bottom + 28 }]}>
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [styles.endBtn, pressed && { opacity: 0.75 }]}
          >
            <Ionicons name="call" size={20} color="#f87171" />
            <Text style={styles.endBtnText}>End call</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerLeft: { gap: 3 },
  headerBrand: {
    color: '#ffffff',
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 6, height: 6, borderRadius: 3,
  },
  headerDuration: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    fontVariant: ['tabular-nums'],
  },
  closeBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18,
  },

  // Orb section
  orbSection: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 20,
    gap: 16,
  },
  stateLabel: {
    alignItems: 'center',
    gap: 5,
  },
  stateName: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: -0.2,
  },
  stateSub: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  errorBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: 290,
  },
  errorText: {
    color: '#f87171',
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    flexShrink: 1,
  },

  // Controls
  controls: {
    alignItems: 'center',
    paddingTop: 16,
  },
  endBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  endBtnText: {
    color: '#f87171',
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
});
