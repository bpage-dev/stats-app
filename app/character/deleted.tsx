import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { colors, radius } from '../../lib/theme';
import { SkillIcon } from '../../components/SkillIcon';

type DeletedSkill = { id: string; name: string; icon: string | null; delete_after: string };

export default function RecentlyDeletedScreen() {
  const [skills, setSkills] = useState<DeletedSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Drop anything already past its grace period first.
    await supabase.rpc('purge_expired_skills');
    const { data } = await supabase
      .from('skills')
      .select('id, name, icon, delete_after')
      .not('delete_after', 'is', null)
      .order('delete_after');
    setSkills((data ?? []) as DeletedSkill[]);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function restore(id: string) {
    setBusy(id);
    await supabase.rpc('cancel_skill_deletion', { p_skill_id: id });
    setBusy(null);
    load();
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {skills.length === 0 ? (
        <Text style={styles.empty}>Nothing here. Removed skills wait 7 days before they're gone for good.</Text>
      ) : (
        skills.map((s) => (
          <View key={s.id} style={styles.row}>
            <View style={styles.iconChip}>
              <SkillIcon name={s.icon} size={18} color={colors.textSecondary} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.name}>{s.name}</Text>
              <Text style={styles.sub}>Deletes in {daysLeft(s.delete_after)}</Text>
            </View>
            <Pressable
              style={[styles.restoreButton, busy === s.id && styles.dim]}
              onPress={() => restore(s.id)}
              disabled={busy !== null}
            >
              {busy === s.id ? (
                <ActivityIndicator size="small" color={colors.bg} />
              ) : (
                <Text style={styles.restoreText}>Restore</Text>
              )}
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function daysLeft(iso: string): string {
  const days = Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  flex: { flex: 1 },
  empty: { color: colors.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 40, lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 10,
  },
  iconChip: { width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.danger, marginTop: 1 },
  restoreButton: { backgroundColor: colors.gold, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 16 },
  restoreText: { color: colors.bg, fontWeight: '700', fontSize: 13 },
  dim: { opacity: 0.6 },
});
