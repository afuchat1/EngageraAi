import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/hooks/useAuth';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

export default function AccountSheet() {
  const colors = useColors();
  const { user, displayName, signIn, signUp, signOut } = useAuth();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'signIn' | 'signUp'>(
    params.mode === 'signUp' ? 'signUp' : 'signIn',
  );
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
            router.replace('/account');
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
        router.replace('/');
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
          ? 'Sign in to continue using Engagera and keep your conversation history.'
          : 'Create an Engagera account to start chatting and save your history.'}
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

    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 32, gap: 12 },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold', letterSpacing: -0.3 },
  body: { fontSize: 13, lineHeight: 19, marginBottom: 8, fontFamily: 'Inter_400Regular' },
  input: {
    height: 52,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  error: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  primaryButton: {
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryButtonText: { fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: -0.1 },
  switchModeBtn: { alignItems: 'center', marginTop: 8 },
  switchModeText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  signedInHeader: { alignItems: 'center', gap: 10, marginTop: 48, marginBottom: 32 },
  email: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  secondaryButton: {
    marginHorizontal: 24,
    height: 52,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
