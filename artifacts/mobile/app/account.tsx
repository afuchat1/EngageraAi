import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/hooks/useAuth';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

export default function AccountSheet() {
  const colors = useColors();
  const { user, displayName, signIn, signUp, signOut } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.signedInHeader}>
          <Ionicons name="person-circle" size={56} color={colors.foreground} />
          <Text style={[styles.email, { color: colors.foreground }]}>{displayName ?? user.email}</Text>
        </View>
        <Pressable
          onPress={async () => {
            await signOut();
            router.back();
          }}
          style={[styles.secondaryButton, { borderColor: colors.border }]}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const { error: authError } = mode === 'signIn' ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
      if (authError) {
        setError(authError.message);
      } else {
        router.back();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      bottomOffset={40}
    >
      <Text style={[styles.title, { color: colors.foreground }]}>
        {mode === 'signIn' ? 'Sign in' : 'Create account'}
      </Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        {mode === 'signIn'
          ? 'Sign in for unlimited messages and to keep your conversation history.'
          : 'Create a free account for unlimited messages.'}
      </Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="none"
        keyboardType="email-address"
        style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={colors.mutedForeground}
        secureTextEntry
        style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
      />

      {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

      <Pressable
        onPress={submit}
        disabled={loading}
        style={[styles.primaryButton, { backgroundColor: colors.primary }]}
      >
        {loading ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
            {mode === 'signIn' ? 'Sign in' : 'Sign up'}
          </Text>
        )}
      </Pressable>

      <Pressable onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')} style={styles.switchModeBtn}>
        <Text style={[styles.switchModeText, { color: colors.mutedForeground }]}>
          {mode === 'signIn' ? "Don't have an account? " : 'Already have an account? '}
          <Text style={{ color: colors.foreground, fontWeight: '600' }}>
            {mode === 'signIn' ? 'Sign up' : 'Sign in'}
          </Text>
        </Text>
      </Pressable>

      <Pressable onPress={() => router.back()} style={styles.continueGuestBtn}>
        <Text style={[styles.switchModeText, { color: colors.mutedForeground }]}>Continue as guest</Text>
      </Pressable>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 32, gap: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 19, marginBottom: 8 },
  input: {
    height: 50,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  error: { fontSize: 12 },
  primaryButton: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryButtonText: { fontSize: 16, fontWeight: '600' },
  switchModeBtn: { alignItems: 'center', marginTop: 8 },
  continueGuestBtn: { alignItems: 'center', marginTop: 4 },
  switchModeText: { fontSize: 13 },
  signedInHeader: { alignItems: 'center', gap: 10, marginTop: 48, marginBottom: 32 },
  email: { fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    marginHorizontal: 24,
    height: 50,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { fontSize: 15, fontWeight: '600' },
});
