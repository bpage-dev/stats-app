import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../../lib/auth';
import { colors, radius } from '../../lib/theme';

export default function ProfileScreen() {
  const { session, signOut } = useSession();

  function confirmSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.center}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.email}>{session?.user.email ?? 'Unknown'}</Text>

        <Pressable style={styles.button} onPress={confirmSignOut}>
          <Text style={styles.buttonText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 6 },
  label: { fontSize: 13, color: colors.textSecondary },
  email: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 24 },
  button: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  buttonText: { color: colors.danger, fontSize: 16, fontWeight: '700' },
});
