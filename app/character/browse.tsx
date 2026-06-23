import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/auth';
import { colors, radius } from '../../lib/theme';
import { SkillIcon } from '../../components/SkillIcon';

type PublicSkill = {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  mine: boolean;
  added: boolean;
  downloads: number;
  activities: { name: string; difficulty: string }[];
  ranks: { label: string; milestone_desc: string | null }[];
};

export default function BrowseSkillsScreen() {
  const { session } = useSession();
  const [skills, setSkills] = useState<PublicSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const me = session?.user.id;

    const [pubRes, mineRes] = await Promise.all([
      supabase
        .from('skills')
        .select('id, name, icon, description, user_id')
        .eq('is_public', true)
        .not('user_id', 'is', null)
        .order('created_at', { ascending: false }),
      supabase.from('skills').select('source_skill_id').not('source_skill_id', 'is', null),
    ]);

    const pub = pubRes.data ?? [];
    const ids = pub.map((s) => s.id);
    const addedSources = new Set((mineRes.data ?? []).map((r) => r.source_skill_id));

    const [ranksRes, actsRes, dlRes] = await Promise.all([
      ids.length
        ? supabase.from('ranks').select('skill_id, label, rank_order, milestone_desc').in('skill_id', ids).order('rank_order')
        : Promise.resolve({ data: [] as { skill_id: string; label: string; rank_order: number; milestone_desc: string | null }[] }),
      ids.length
        ? supabase.from('activities').select('skill_id, name, difficulty').in('skill_id', ids)
        : Promise.resolve({ data: [] as { skill_id: string; name: string; difficulty: string }[] }),
      ids.length
        ? supabase.rpc('skill_download_counts', { p_skill_ids: ids })
        : Promise.resolve({ data: [] as { source_id: string; downloads: number }[] }),
    ]);

    const downloadsBySkill = new Map(
      ((dlRes.data ?? []) as { source_id: string; downloads: number }[]).map((d) => [d.source_id, d.downloads]),
    );

    const ranksBySkill = new Map<string, { label: string; milestone_desc: string | null }[]>();
    for (const r of ranksRes.data ?? []) {
      const list = ranksBySkill.get(r.skill_id) ?? [];
      list.push({ label: r.label, milestone_desc: r.milestone_desc });
      ranksBySkill.set(r.skill_id, list);
    }
    const actsBySkill = new Map<string, { name: string; difficulty: string }[]>();
    for (const a of actsRes.data ?? []) {
      const list = actsBySkill.get(a.skill_id) ?? [];
      list.push({ name: a.name, difficulty: a.difficulty });
      actsBySkill.set(a.skill_id, list);
    }

    setSkills(
      pub.map((s) => ({
        id: s.id,
        name: s.name,
        icon: s.icon,
        description: s.description,
        mine: s.user_id === me,
        added: addedSources.has(s.id),
        downloads: downloadsBySkill.get(s.id) ?? 0,
        activities: actsBySkill.get(s.id) ?? [],
        ranks: ranksBySkill.get(s.id) ?? [],
      })),
    );
    setLoading(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = useMemo(
    () => skills.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase())),
    [skills, query],
  );

  async function add(skill: PublicSkill) {
    setBusyId(skill.id);
    const { error } = await supabase.rpc('clone_skill', { p_source_id: skill.id });
    setBusyId(null);
    if (error) {
      Alert.alert('Could not add', error.message);
      return;
    }
    setSkills((prev) => prev.map((s) => (s.id === skill.id ? { ...s, added: true } : s)));
    Alert.alert('Added', `“${skill.name}” is now in your skills.`);
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TextInput
        style={styles.search}
        placeholder="Search shared skills"
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />

      {filtered.length === 0 ? (
        <Text style={styles.empty}>
          {skills.length === 0
            ? 'No shared skills yet. Share one of your own from its detail screen, or check back later.'
            : 'No skills match your search.'}
        </Text>
      ) : (
        filtered.map((s) => {
          const expanded = expandedId === s.id;
          return (
            <View key={s.id} style={styles.card}>
              <Pressable style={styles.cardHead} onPress={() => setExpandedId(expanded ? null : s.id)}>
                <View style={styles.iconChip}>
                  <SkillIcon name={s.icon} size={20} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.name}>{s.name}</Text>
                  <Text style={styles.meta}>
                    {s.activities.length} {s.activities.length === 1 ? 'activity' : 'activities'} · {s.ranks.length} {s.ranks.length === 1 ? 'rank' : 'ranks'} · {s.downloads} {s.downloads === 1 ? 'download' : 'downloads'}
                  </Text>
                </View>
                <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textMuted} />
              </Pressable>

              {expanded && (
                <View style={styles.detail}>
                  {s.description ? <Text style={styles.desc}>{s.description}</Text> : null}
                  <Text style={styles.detailTitle}>Activities</Text>
                  {s.activities.map((a, i) => (
                    <Text key={i} style={styles.detailItem}>• {a.name} <Text style={styles.diff}>({a.difficulty})</Text></Text>
                  ))}
                  {s.ranks.length > 0 && (
                    <>
                      <Text style={styles.detailTitle}>Ranks</Text>
                      {s.ranks.map((r, i) => (
                        <Text key={i} style={styles.detailItem}>• {r.label}</Text>
                      ))}
                    </>
                  )}
                </View>
              )}

              <View style={styles.actions}>
                {s.mine ? (
                  <Text style={styles.yours}>Yours</Text>
                ) : s.added ? (
                  <Text style={styles.added}>✓ Added</Text>
                ) : (
                  <Pressable style={[styles.addButton, busyId === s.id && styles.dim]} onPress={() => add(s)} disabled={busyId !== null}>
                    {busyId === s.id ? (
                      <ActivityIndicator size="small" color={colors.bg} />
                    ) : (
                      <Text style={styles.addText}>Add to my skills</Text>
                    )}
                  </Pressable>
                )}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  flex: { flex: 1 },

  search: {
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  empty: { color: colors.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 32, lineHeight: 20 },

  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconChip: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.goldTint, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  detail: { marginTop: 12, gap: 2 },
  desc: { fontSize: 13, color: colors.textSecondary, marginBottom: 8 },
  detailTitle: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 4 },
  detailItem: { fontSize: 13, color: colors.textPrimary, lineHeight: 19 },
  diff: { color: colors.textMuted, textTransform: 'capitalize' },

  actions: { marginTop: 12, alignItems: 'flex-start' },
  addButton: { backgroundColor: colors.gold, borderRadius: radius.sm, paddingVertical: 9, paddingHorizontal: 16 },
  addText: { color: colors.bg, fontWeight: '700', fontSize: 13 },
  dim: { opacity: 0.6 },
  added: { color: colors.gold, fontWeight: '700', fontSize: 13 },
  yours: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
});
