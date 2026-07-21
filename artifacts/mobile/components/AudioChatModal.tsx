/**
 * AudioChatModal — Full-screen live voice conversation for Engagera mobile.
 *
 * Animated orb with 6 states, real-time conversation transcript,
 * voice selector, and VAD-triggered turn detection.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
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
import { useColors } from '@/hooks/useColors';


// ── State configuration ───────────────────────────────────────────────────────
const STATE_CONFIG: Record<VoiceState, {
  label:     string;
  sublabel:  string;
  orbColor:  string;
  rings:     number;
  pulse:     boolean;
  spin:      boolean;
}> = {
  idle: {
    label:    'Ready',
    sublabel: 'Tap the button below to start',
    orbColor: 'rgba(255,255,255,0.09)',
    rings: 0, pulse: false, spin: false,
  },
  connecting: {
    label:    'Connecting…',
    sublabel: 'Setting up microphone',
    orbColor: 'rgba(255,255,255,0.18)',
    rings: 1, pulse: true, spin: false,
  },
  listening: {
    label:    'Listening',
    sublabel: 'Speak now — I\'m paying attention',
    orbColor: '#22c55e',
    rings: 3, pulse: true, spin: false,
  },
  processing: {
    label:    'Processing',
    sublabel: 'Transcribing your voice…',
    orbColor: '#3b82f6',
    rings: 1, pulse: false, spin: true,
  },
  thinking: {
    label:    'Thinking',
    sublabel: 'Generating a response…',
    orbColor: '#a855f7',
    rings: 2, pulse: true, spin: false,
  },
  speaking: {
    label:    'Speaking',
    sublabel: 'Listen carefully',
    orbColor: '#f97316',
    rings: 2, pulse: true, spin: false,
  },
};

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Animated Orb ──────────────────────────────────────────────────────────────
function VoiceOrb({ state }: { state: VoiceState }) {
  const cfg = STATE_CONFIG[state];

  // Pulse scale (orb body)
  const pulseScale = useSharedValue(1);
  // Spin rotation (processing ring)
  const spinRot = useSharedValue(0);
  // Ring scales (ring 1, 2, 3)
  const ring1Scale = useSharedValue(1);
  const ring1Opacity = useSharedValue(0.6);
  const ring2Scale = useSharedValue(1);
  const ring2Opacity = useSharedValue(0.6);
  const ring3Scale = useSharedValue(1);
  const ring3Opacity = useSharedValue(0.6);

  useEffect(() => {
    // Reset all
    cancelAnimation(pulseScale); pulseScale.value = 1;
    cancelAnimation(spinRot);    spinRot.value    = 0;
    cancelAnimation(ring1Scale); ring1Scale.value = 1; ring1Opacity.value = 0;
    cancelAnimation(ring2Scale); ring2Scale.value = 1; ring2Opacity.value = 0;
    cancelAnimation(ring3Scale); ring3Scale.value = 1; ring3Opacity.value = 0;

    if (cfg.pulse) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 900,  easing: Easing.inOut(Easing.ease) }),
          withTiming(1,    { duration: 900,  easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    }

    if (cfg.spin) {
      spinRot.value = withRepeat(
        withTiming(360, { duration: 1400, easing: Easing.linear }),
        -1,
        false,
      );
    }

    const ringDuration = 2000;
    if (cfg.rings >= 1) {
      ring1Scale.value = withRepeat(
        withTiming(2.4, { duration: ringDuration, easing: Easing.out(Easing.ease) }),
        -1, false,
      );
      ring1Opacity.value = withRepeat(
        withTiming(0, { duration: ringDuration, easing: Easing.out(Easing.ease) }),
        -1, false,
      );
    }
    if (cfg.rings >= 2) {
      // Ring 2 starts 667 ms after ring 1 for a cascading ripple effect
      ring2Scale.value = withDelay(667, withRepeat(
        withTiming(2.4, { duration: ringDuration, easing: Easing.out(Easing.ease) }),
        -1, false,
      ));
      ring2Opacity.value = withDelay(667, withRepeat(
        withTiming(0, { duration: ringDuration, easing: Easing.out(Easing.ease) }),
        -1, false,
      ));
    }
    if (cfg.rings >= 3) {
      // Ring 3 starts 1333 ms after ring 1 (2/3 of period) for even spread
      ring3Scale.value = withDelay(1333, withRepeat(
        withTiming(2.4, { duration: ringDuration, easing: Easing.out(Easing.ease) }),
        -1, false,
      ));
      ring3Opacity.value = withDelay(1333, withRepeat(
        withTiming(0, { duration: ringDuration, easing: Easing.out(Easing.ease) }),
        -1, false,
      ));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));
  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinRot.value}deg` }],
  }));
  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring1Scale.value }],
    opacity: ring1Opacity.value,
  }));
  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring2Scale.value }],
    opacity: ring2Opacity.value,
  }));
  const ring3Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring3Scale.value }],
    opacity: ring3Opacity.value,
  }));

  const ringColor = cfg.orbColor;

  return (
    <View style={orbStyles.container}>
      {/* Expanding rings */}
      {cfg.rings >= 1 && (
        <Animated.View style={[orbStyles.ring, { borderColor: ringColor }, ring1Style]} />
      )}
      {cfg.rings >= 2 && (
        <Animated.View style={[orbStyles.ring, { borderColor: ringColor }, ring2Style]} />
      )}
      {cfg.rings >= 3 && (
        <Animated.View style={[orbStyles.ring, { borderColor: ringColor }, ring3Style]} />
      )}

      {/* Spinner ring (processing only) */}
      {cfg.spin && (
        <Animated.View style={[orbStyles.spinRing, { borderTopColor: ringColor }, spinStyle]} />
      )}

      {/* Core orb */}
      <Animated.View
        style={[
          orbStyles.orb,
          { backgroundColor: cfg.orbColor },
          orbStyle,
        ]}
      >
        {state === 'idle' || state === 'connecting' ? (
          <Ionicons name="mic-outline" size={40} color="rgba(255,255,255,0.5)" />
        ) : state === 'listening' ? (
          <Ionicons name="mic" size={40} color="#ffffff" />
        ) : state === 'speaking' ? (
          <Ionicons name="volume-high-outline" size={40} color="#ffffff" />
        ) : (
          // thinking / processing — dots
          <View style={orbStyles.dots}>
            {[0, 1, 2].map(i => (
              <View key={i} style={[orbStyles.dot, { opacity: 0.8 + i * 0.1 }]} />
            ))}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const orbStyles = StyleSheet.create({
  container: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
  },
  spinRing: {
    position: 'absolute',
    width: 224,
    height: 224,
    borderRadius: 112,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  orb: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
});

// ── Conversation log ──────────────────────────────────────────────────────────
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

  const isEmpty = history.length === 0 && !liveTranscript && !liveReply;

  if (isEmpty) {
    return (
      <View style={logStyles.empty}>
        <Text style={logStyles.emptyText}>Your conversation will appear here</Text>
      </View>
    );
  }

  return (
    <ScrollView ref={scrollRef} style={logStyles.scroll} contentContainerStyle={logStyles.content} showsVerticalScrollIndicator={false}>
      {history.map((turn, i) => (
        <View key={i} style={[logStyles.row, turn.role === 'user' ? logStyles.rowUser : logStyles.rowAI]}>
          <View style={[logStyles.bubble, turn.role === 'user' ? logStyles.bubbleUser : logStyles.bubbleAI]}>
            <Text style={logStyles.bubbleText}>{turn.content}</Text>
          </View>
        </View>
      ))}

      {/* Live user transcript */}
      {(state === 'processing' || state === 'thinking') && liveTranscript ? (
        <View style={[logStyles.row, logStyles.rowUser]}>
          <View style={[logStyles.bubble, logStyles.bubbleUser]}>
            <Text style={logStyles.bubbleText}>{liveTranscript}</Text>
          </View>
        </View>
      ) : null}

      {/* Live AI reply streaming */}
      {(state === 'thinking' || state === 'speaking') && liveReply ? (
        <View style={[logStyles.row, logStyles.rowAI]}>
          <View style={[logStyles.bubble, logStyles.bubbleAI]}>
            <Text style={logStyles.bubbleText}>{liveReply}<Text style={logStyles.cursor}>▌</Text></Text>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const logStyles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: 'rgba(255,255,255,0.2)', fontSize: 13, fontFamily: 'Inter_400Regular' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingVertical: 8, gap: 10 },
  row: { flexDirection: 'row' },
  rowUser: { justifyContent: 'flex-end' },
  rowAI:   { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '82%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: { backgroundColor: 'rgba(255,255,255,0.1)', borderBottomRightRadius: 6 },
  bubbleAI:   { backgroundColor: 'rgba(255,255,255,0.05)', borderBottomLeftRadius: 6 },
  bubbleText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19 },
  cursor: { color: 'rgba(255,255,255,0.6)' },
});

// ── Main modal ────────────────────────────────────────────────────────────────
interface AudioChatModalProps {
  visible:  boolean;
  onClose:  () => void;
}

export function AudioChatModal({ visible, onClose }: AudioChatModalProps) {
  const insets = useSafeAreaInsets();
  const colors = useColors(); // eslint-disable-line @typescript-eslint/no-unused-vars

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

  const isActive = state !== 'idle';
  const cfg      = STATE_CONFIG[state];

  const handleClose = () => {
    endCall();
    onClose();
  };

  const handleToggle = () => {
    if (isActive) endCall();
    else          beginCall();
  };

  // Derive label color — for idle/connecting use muted white, else use the orb color
  const labelColor =
    state === 'idle' || state === 'connecting'
      ? 'rgba(255,255,255,0.55)'
      : cfg.orbColor;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { backgroundColor: '#000000', paddingTop: insets.top }]}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Voice Chat</Text>
            {isActive && (
              <Text style={styles.headerDuration}>{formatDuration(callDuration)}</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <Pressable onPress={handleClose} style={styles.iconBtn} hitSlop={10}>
              <Ionicons name="close" size={22} color="rgba(255,255,255,0.5)" />
            </Pressable>
          </View>
        </View>

        {/* Orb + state label */}
        <View style={styles.orbSection}>
          <VoiceOrb state={state} />
          <View style={styles.stateLabel}>
            <Text style={[styles.stateName, { color: labelColor }]}>{cfg.label}</Text>
            <Text style={styles.stateSub}>{cfg.sublabel}</Text>
          </View>
          {error ? (
            <View style={styles.errorBubble}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </View>

        {/* Conversation log */}
        <ConversationLog
          history={conversationHistory}
          liveTranscript={transcript}
          liveReply={aiReply}
          state={state}
        />

        {/* Controls */}
        <View style={[styles.controls, { paddingBottom: insets.bottom + 24 }]}>
          {/* Interrupt button — appears only while the AI is speaking */}
          {state === 'speaking' && (
            <Pressable
              onPress={interruptSpeaking}
              style={({ pressed }) => [styles.interruptBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="mic-outline" size={18} color="#ffffff" />
              <Text style={styles.interruptBtnText}>Interrupt</Text>
            </Pressable>
          )}

          <Pressable
            onPress={handleToggle}
            style={({ pressed }) => [
              styles.callBtn,
              isActive ? styles.callBtnEnd : styles.callBtnStart,
              pressed && { opacity: 0.75 },
            ]}
          >
            <Ionicons
              name={isActive ? 'call' : 'mic'}
              size={22}
              color={isActive ? '#f87171' : '#000000'}
            />
            <Text style={[styles.callBtnText, { color: isActive ? '#f87171' : '#000000' }]}>
              {isActive ? 'End call' : 'Start voice chat'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical:   14,
  },
  headerTitle: {
    color:      '#ffffff',
    fontSize:   16,
    fontFamily: 'Inter_600SemiBold',
  },
  headerDuration: {
    color:      'rgba(255,255,255,0.35)',
    fontSize:   11,
    fontFamily: 'Inter_400Regular',
    fontVariant: ['tabular-nums'],
    marginTop:  2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  iconBtn: {
    width:  40,
    height: 40,
    alignItems:     'center',
    justifyContent: 'center',
  },
  picker: {
    marginHorizontal: 16,
    marginBottom:     10,
    padding:          14,
    backgroundColor:  'rgba(255,255,255,0.04)',
    borderRadius:     16,
    borderWidth:      StyleSheet.hairlineWidth,
    borderColor:      'rgba(255,255,255,0.1)',
  },
  pickerLabel: {
    color:          'rgba(255,255,255,0.3)',
    fontSize:       9,
    fontFamily:     'Inter_600SemiBold',
    letterSpacing:  1.5,
    marginBottom:   10,
  },
  pickerRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
  },
  pickerChip: {
    paddingHorizontal: 14,
    paddingVertical:    7,
    borderRadius:       999,
    backgroundColor:   'rgba(255,255,255,0.06)',
    borderWidth:        StyleSheet.hairlineWidth,
    borderColor:        'rgba(255,255,255,0.12)',
  },
  pickerChipActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor:     'rgba(255,255,255,0.4)',
  },
  pickerChipText: {
    color:      'rgba(255,255,255,0.5)',
    fontSize:   13,
    fontFamily: 'Inter_500Medium',
  },
  pickerChipTextActive: {
    color: '#ffffff',
  },
  orbSection: {
    alignItems:  'center',
    paddingTop:  20,
    paddingBottom: 16,
    gap:         14,
  },
  stateLabel: {
    alignItems: 'center',
    gap:        4,
  },
  stateName: {
    fontSize:   17,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: -0.2,
  },
  stateSub: {
    color:      'rgba(255,255,255,0.3)',
    fontSize:   12,
    fontFamily: 'Inter_400Regular',
  },
  errorBubble: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius:    12,
    paddingHorizontal: 14,
    paddingVertical:   8,
    maxWidth:          280,
  },
  errorText: {
    color:      '#f87171',
    fontSize:   12,
    fontFamily: 'Inter_400Regular',
    textAlign:  'center',
  },
  controls: {
    alignItems: 'center',
    paddingTop: 16,
    gap:        12,
  },
  callBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    paddingHorizontal: 32,
    paddingVertical:   16,
    borderRadius:      16,
  },
  callBtnStart: {
    backgroundColor: '#ffffff',
  },
  callBtnEnd: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth:      StyleSheet.hairlineWidth,
    borderColor:      'rgba(239,68,68,0.3)',
  },
  callBtnText: {
    fontSize:   15,
    fontFamily: 'Inter_600SemiBold',
  },
  interruptBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    paddingHorizontal: 22,
    paddingVertical:   11,
    borderRadius:      999,
    backgroundColor:   'rgba(255,255,255,0.08)',
    borderWidth:       StyleSheet.hairlineWidth,
    borderColor:       'rgba(255,255,255,0.18)',
  },
  interruptBtnText: {
    color:      '#ffffff',
    fontSize:   14,
    fontFamily: 'Inter_500Medium',
  },
  voiceHint: {
    color:      'rgba(255,255,255,0.2)',
    fontSize:   11,
    fontFamily: 'Inter_400Regular',
  },
  voiceHintLink: {
    textDecorationLine: 'underline',
  },
});
