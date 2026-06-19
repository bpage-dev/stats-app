import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../../lib/auth';

export default function LoginScreen() {
  const { signIn, signUp } = useSession();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const isSignup = mode === 'signup';

  async function submit() {
    if (!email.trim() || !password) {
      Alert.alert('Missing info', 'Enter both an email and a password.');
      return;
    }
    setBusy(true);
    const { error } = isSignup
      ? await signUp(email.trim(), password)
      : await signIn(email.trim(), password);
    setBusy(false);

    if (error) {
      Alert.alert(isSignup ? 'Sign up failed' : 'Sign in failed', error);
    } else if (isSignup) {
      Alert.alert(
        'Check your email',
        'If email confirmation is on, confirm your address before signing in.',
      );
    }
    // On success the session listener swaps to the app automatically.
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <Text style={styles.title}>Stats</Text>
          <Text style={styles.subtitle}>
            {isSignup ? 'Create your account' : 'Welcome back'}
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            editable={!busy}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!busy}
          />

          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={submit}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {isSignup ? 'Sign up' : 'Sign in'}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => setMode(isSignup ? 'signin' : 'signup')}
            disabled={busy}
          >
            <Text style={styles.toggle}>
              {isSignup
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f172a' },
  flex: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  title: {
    fontSize: 44,
    fontWeight: '800',
    color: '#fbbf24',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#cbd5e1',
    textAlign: 'center',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#f59e0b',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#1f2937', fontSize: 16, fontWeight: '700' },
  toggle: {
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 16,
    fontSize: 14,
  },
});
