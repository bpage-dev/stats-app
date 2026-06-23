import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../../lib/auth';
import { colors, radius } from '../../lib/theme';

export default function SettingsScreen() {
  const { session, signOut } = useSession();

  function confirmSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.label}>Signed in as</Text>
      <Text style={styles.email}>{session?.user.email ?? 'Unknown'}</Text>

      <Pressable style={styles.button} onPress={confirmSignOut}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  label: { fontSize: 13, color: colors.textSecondary, marginTop: 8 },
  email: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginTop: 4, marginBottom: 28 },
  button: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: colors.danger, fontSize: 16, fontWeight: '700' },
});
