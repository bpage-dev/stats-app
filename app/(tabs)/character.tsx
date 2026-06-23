import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radius } from '../../lib/theme';

export default function CharacterScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>Character</Text>

        {/* Avatar / equipment placeholder — the real screen comes with the avatar feature. */}
        <View style={styles.avatarCard}>
          <MaterialCommunityIcons name="human-handsup" size={72} color={colors.textMuted} />
          <Text style={styles.avatarText}>Your avatar & equipment</Text>
          <Text style={styles.avatarSub}>Earn gear by ranking up your skills — coming soon.</Text>
        </View>

        <MenuRow
          icon="compass-outline"
          label="Browse skills"
          sub="Find and add skills shared by others"
          onPress={() => router.push('/character/browse')}
        />
        <MenuRow
          icon="trash-can-outline"
          label="Recently deleted"
          sub="Restore skills within 7 days"
          onPress={() => router.push('/character/deleted')}
        />
        <MenuRow
          icon="cog-outline"
          label="Settings"
          sub="Account and sign out"
          onPress={() => router.push('/character/settings')}
        />
      </View>
    </SafeAreaView>
  );
}

function MenuRow({
  icon,
  label,
  sub,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowIcon}>
        <MaterialCommunityIcons name={icon} size={22} color={colors.gold} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, padding: 16 },
  flex: { flex: 1 },
  title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary, marginBottom: 16 },

  avatarCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingVertical: 36,
    paddingHorizontal: 20,
    gap: 6,
    marginBottom: 24,
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginTop: 8 },
  avatarSub: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.goldTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  rowSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
});
