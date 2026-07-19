import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/hooks/useAuth';
import { deleteConversation, listConversations } from '@/lib/conversations';
import { useDialog } from '@/contexts/DialogContext';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title}</Text>
      <View style={[styles.sectionBody, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  destructive,
  right,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  right?: React.ReactNode;
  last?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
    >
      <Ionicons name={icon} size={18} color={destructive ? colors.destructive : colors.foreground} />
      <Text style={[styles.rowLabel, { color: destructive ? colors.destructive : colors.foreground }]}>{label}</Text>
      <View style={styles.rowRight}>
        {value ? <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{value}</Text> : null}
        {right}
        {onPress && !right ? (
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        ) : null}
      </View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const { user, displayName, signOut } = useAuth();
  const { show: showDialog } = useDialog();
  const [clearing, setClearing] = useState(false);

  const clearHistory = () => {
    showDialog('Clear all conversations?', 'This deletes every saved chat in Chat and Lab. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear all',
        style: 'destructive',
        onPress: async () => {
          setClearing(true);
          try {
            const all = await listConversations();
            await Promise.all(all.map((c) => deleteConversation(c.id).catch(() => undefined)));
            showDialog('Done', 'Your conversation history has been cleared.');
          } catch {
            showDialog('Something went wrong', 'Could not clear history. Please try again.');
          } finally {
            setClearing(false);
          }
        },
      },
    ]);
  };

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <Section title="Account">
        {user ? (
          <>
            <Row icon="person-circle-outline" label={displayName ?? 'Signed in'} value={user.email ?? undefined} last />
          </>
        ) : (
          <Row
            icon="log-in-outline"
            label="Sign in for unlimited messages"
            onPress={() => router.push('/account')}
            last
          />
        )}
      </Section>

      <Section title="Data">
        <Row
          icon="trash-outline"
          label={clearing ? 'Clearing…' : 'Clear conversation history'}
          onPress={clearing ? undefined : clearHistory}
          destructive
          last
        />
      </Section>

      {user ? (
        <Section title="">
          <Row icon="log-out-outline" label="Sign out" onPress={() => signOut()} destructive last />
        </Section>
      ) : null}

      <Section title="About">
        <Row icon="information-circle-outline" label="Version" value={version} last />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 28, paddingBottom: 60, gap: 4 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: { fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: -0.3 },
  section: { marginBottom: 22 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionBody: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rowLabel: { flex: 1, fontSize: 14.5, fontFamily: 'Inter_500Medium' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { fontSize: 13, fontFamily: 'Inter_400Regular' },
});
