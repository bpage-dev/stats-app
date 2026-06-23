import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/auth';
import { getLevelInfo, MAX_LEVEL, type Threshold } from '../../lib/progress';
import { colors, formatInt, radius } from '../../lib/theme';
import { SkillIcon } from '../../components/SkillIcon';

type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY: Record<Difficulty, { label: string; color: string; order: number }> = {
  easy: { label: 'Easy', color: '#34d399', order: 0 },
  medium: { label: 'Medium', color: colors.gold, order: 1 },
  hard: { label: 'Hard', color: colors.danger, order: 2 },
};

type Activity = { id: string; name: string; difficulty: Difficulty; xp: number };
type Rank = { id: string; label: string; rank_order: number; milestone_desc: string | null; achieved: boolean };
type LogRow = { id: string; xp_awarded: number; logged_at: string; name: string | null };

type Detail = {
  name: string;
  icon: string | null;
  description: string | null;
  xp: number;
  level: number;
  fraction: number;
  xpIntoLevel: number;
  xpForLevel: number;
  isMax: boolean;
  rankLabel: string | null;
  ownerId: string | null;
  isPublic: boolean;
  deleteAfter: string | null;
  activities: Activity[];
  ranks: Rank[];
  recent: LogRow[];
};

export default function SkillDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logging, setLogging] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: skill } = await supabase
      .from('skills')
      .select('id, name, icon, description, xp_template_id, user_id, is_public, delete_after')
      .eq('id', id)
      .maybeSingle();

    if (!skill) {
      setDetail(null);
      return;
    }

    const [progressRes, thresholdsRes, activitiesRes, diffRes, ranksRes, milestonesRes, recentRes] =
      await Promise.all([
        supabase.from('user_skill_progress').select('current_xp, current_rank_id').eq('skill_id', id).maybeSingle(),
        supabase.from('level_thresholds').select('level_number, xp_required').eq('xp_template_id', skill.xp_template_id),
        supabase.from('activities').select('id, name, difficulty').eq('skill_id', id),
        supabase.from('difficulty_xp').select('difficulty, base_xp'),
        supabase.from('ranks').select('id, label, rank_order, milestone_desc').eq('skill_id', id).order('rank_order'),
        supabase.from('milestone_log').select('rank_id').eq('skill_id', id),
        supabase.from('activity_log').select('id, xp_awarded, logged_at, activities(name)').eq('skill_id', id).order('logged_at', { ascending: false }).limit(8),
      ]);

    const xp = progressRes.data?.current_xp ?? 0;
    const info = getLevelInfo(xp, (thresholdsRes.data ?? []) as Threshold[]);

    const xpByDifficulty = new Map(
      (diffRes.data ?? []).map((d) => [d.difficulty as Difficulty, d.base_xp]),
    );
    const activities: Activity[] = (activitiesRes.data ?? [])
      .map((a) => ({
        id: a.id,
        name: a.name,
        difficulty: a.difficulty as Difficulty,
        xp: xpByDifficulty.get(a.difficulty as Difficulty) ?? 0,
      }))
      .sort((a, b) => DIFFICULTY[a.difficulty].order - DIFFICULTY[b.difficulty].order);

    const achieved = new Set((milestonesRes.data ?? []).map((m) => m.rank_id));
    const ranks: Rank[] = (ranksRes.data ?? []).map((r) => ({
      id: r.id,
      label: r.label,
      rank_order: r.rank_order,
      milestone_desc: r.milestone_desc,
      achieved: achieved.has(r.id),
    }));

    const recent: LogRow[] = (recentRes.data ?? []).map((row) => {
      const activity = row.activities as { name: string } | { name: string }[] | null;
      const name = Array.isArray(activity) ? activity[0]?.name ?? null : activity?.name ?? null;
      return { id: row.id, xp_awarded: row.xp_awarded, logged_at: row.logged_at, name };
    });

    const currentRankId = progressRes.data?.current_rank_id ?? null;
    setDetail({
      name: skill.name,
      icon: skill.icon,
      description: skill.description,
      xp,
      level: info.level,
      fraction: info.fraction,
      xpIntoLevel: info.xpIntoLevel,
      xpForLevel: info.xpForLevel,
      isMax: info.isMax,
      rankLabel: currentRankId ? ranks.find((r) => r.id === currentRankId)?.label ?? null : null,
      ownerId: skill.user_id,
      isPublic: skill.is_public,
      deleteAfter: skill.delete_after,
      activities,
      ranks,
      recent,
    });
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function logActivity(activity: Activity) {
    setLogging(activity.id);
    const { data, error } = await supabase.rpc('log_activity', { p_activity_id: activity.id });
    setLogging(null);

    if (error) {
      Alert.alert('Could not log', error.message);
      return;
    }
    await load();

    const result = (data as { new_level: number; leveled_up: boolean }[] | null)?.[0];
    if (result?.leveled_up) {
      Alert.alert('Level up!', `${detail?.name} reached level ${result.new_level}.`);
    }
  }

  function confirmClaim(rank: Rank) {
    Alert.alert(
      'Log milestone',
      rank.milestone_desc
        ? `Mark "${rank.milestone_desc}" complete and unlock ${rank.label}?`
        : `Unlock the rank ${rank.label}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Claim', onPress: () => claimMilestone(rank) },
      ],
    );
  }

  async function claimMilestone(rank: Rank) {
    setClaiming(rank.id);
    const { data, error } = await supabase.rpc('log_milestone', { p_rank_id: rank.id });
    setClaiming(null);

    if (error) {
      Alert.alert('Could not claim', error.message);
      return;
    }
    await load();

    const result = (data as { out_became_current: boolean }[] | null)?.[0];
    if (result?.out_became_current) {
      Alert.alert('Rank up!', `You're now ${rank.label}.`);
    } else {
      Alert.alert('Milestone logged', `${rank.label} recorded.`);
    }
  }

  async function toggleShare(next: boolean) {
    if (!detail) return;
    setDetail({ ...detail, isPublic: next }); // optimistic
    const { error } = await supabase.from('skills').update({ is_public: next }).eq('id', id);
    if (error) {
      setDetail({ ...detail, isPublic: !next });
      Alert.alert('Could not update sharing', error.message);
    }
  }

  function confirmRemove() {
    Alert.alert(
      'Remove skill',
      `"${detail?.name}" will be deleted in 7 days. You can restore it from Character → Recently deleted until then.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: removeSkill },
      ],
    );
  }

  async function removeSkill() {
    const { error } = await supabase.rpc('request_skill_deletion', { p_skill_id: id });
    if (error) {
      Alert.alert('Could not remove', error.message);
      return;
    }
    router.back();
  }

  async function restoreSkill() {
    const { error } = await supabase.rpc('cancel_skill_deletion', { p_skill_id: id });
    if (error) {
      Alert.alert('Could not restore', error.message);
      return;
    }
    await load();
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.muted}>Skill not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />
      }
    >
      <Stack.Screen options={{ title: detail.name }} />

      <View style={styles.hero}>
        <View style={styles.heroChip}>
          <SkillIcon name={detail.icon} size={40} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.rankLabel}>{detail.rankLabel ?? 'Unranked'}</Text>
          <Text style={styles.heroName} numberOfLines={1}>
            {detail.name}
          </Text>
        </View>
        <View style={styles.levelBadge}>
          <Text style={styles.levelNum}>{detail.level}</Text>
          <Text style={styles.levelMax}>/ {MAX_LEVEL}</Text>
        </View>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(detail.fraction * 100)}%` }]} />
      </View>
      <Text style={styles.xpLabel}>
        {detail.isMax
          ? `Max level · ${formatInt(detail.xp)} xp total`
          : `${formatInt(detail.xpIntoLevel)} / ${formatInt(detail.xpForLevel)} xp to level ${detail.level + 1}`}
      </Text>

      {detail.ownerId && detail.ownerId === session?.user.id && (
        <View style={styles.shareRow}>
          <View style={styles.flex}>
            <Text style={styles.shareLabel}>Share publicly</Text>
            <Text style={styles.shareSub}>Let others find and add this skill.</Text>
          </View>
          <Switch
            value={detail.isPublic}
            onValueChange={toggleShare}
            trackColor={{ true: colors.gold, false: colors.track }}
            thumbColor={colors.textPrimary}
          />
        </View>
      )}

      <Text style={styles.sectionTitle}>Activities</Text>
      {detail.activities.map((a) => (
        <View key={a.id} style={styles.activityRow}>
          <View style={[styles.diffDot, { backgroundColor: DIFFICULTY[a.difficulty].color }]} />
          <View style={styles.flex}>
            <Text style={styles.activityName}>{a.name}</Text>
            <Text style={styles.activityMeta}>
              {DIFFICULTY[a.difficulty].label} · +{a.xp} xp
            </Text>
          </View>
          <Pressable
            style={[styles.logButton, logging === a.id && styles.logButtonBusy]}
            onPress={() => logActivity(a)}
            disabled={logging !== null}
          >
            {logging === a.id ? (
              <ActivityIndicator size="small" color={colors.bg} />
            ) : (
              <Text style={styles.logButtonText}>Log</Text>
            )}
          </Pressable>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Ranks</Text>
      {detail.ranks.map((r) => (
        <View key={r.id} style={styles.rankRow}>
          <Text style={[styles.rankDot, r.achieved && styles.rankDotOn]}>
            {r.achieved ? '●' : '○'}
          </Text>
          <View style={styles.flex}>
            <Text style={[styles.rankName, !r.achieved && styles.muted]}>{r.label}</Text>
            {r.milestone_desc ? <Text style={styles.rankDesc}>{r.milestone_desc}</Text> : null}
          </View>
          {r.achieved ? (
            <Text style={styles.achievedTag}>Achieved</Text>
          ) : (
            <Pressable
              style={[styles.claimButton, claiming === r.id && styles.logButtonBusy]}
              onPress={() => confirmClaim(r)}
              disabled={claiming !== null}
            >
              {claiming === r.id ? (
                <ActivityIndicator size="small" color={colors.gold} />
              ) : (
                <Text style={styles.claimButtonText}>Claim</Text>
              )}
            </Pressable>
          )}
        </View>
      ))}

      <Text style={styles.sectionTitle}>Recent</Text>
      {detail.recent.length === 0 ? (
        <Text style={styles.muted}>No activity logged yet.</Text>
      ) : (
        detail.recent.map((row) => (
          <View key={row.id} style={styles.recentRow}>
            <Text style={styles.recentName} numberOfLines={1}>
              {row.name ?? 'Activity'}
            </Text>
            <Text style={styles.recentTime}>{timeAgo(row.logged_at)}</Text>
            <Text style={styles.recentXp}>+{row.xp_awarded}</Text>
          </View>
        ))
      )}

      {detail.ownerId && detail.ownerId === session?.user.id ? (
        detail.deleteAfter ? (
          <View style={styles.deletePending}>
            <Text style={styles.deletePendingText}>
              Scheduled for deletion in {daysLeft(detail.deleteAfter)}.
            </Text>
            <Pressable style={styles.restoreButton} onPress={restoreSkill}>
              <Text style={styles.restoreText}>Restore</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.removeButton} onPress={confirmRemove}>
            <Text style={styles.removeText}>Remove skill</Text>
          </Pressable>
        )
      ) : null}
    </ScrollView>
  );
}

function daysLeft(iso: string): string {
  const days = Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  muted: { color: colors.textMuted, fontSize: 13 },

  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  heroChip: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.goldTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankLabel: { fontSize: 12, color: colors.gold, marginBottom: 2 },
  heroName: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  levelBadge: { alignItems: 'flex-end' },
  levelNum: { fontSize: 30, fontWeight: '800', color: colors.goldBright, lineHeight: 32 },
  levelMax: { fontSize: 11, color: colors.textMuted },

  track: { height: 8, borderRadius: 4, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.gold, borderRadius: 4 },
  xpLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 8 },

  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: 14,
    marginTop: 20,
  },
  shareLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  shareSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 28,
    marginBottom: 12,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
  },
  diffDot: { width: 10, height: 10, borderRadius: 5 },
  activityName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  activityMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  logButton: {
    backgroundColor: colors.gold,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 18,
    minWidth: 56,
    alignItems: 'center',
  },
  logButtonBusy: { opacity: 0.7 },
  logButtonText: { color: colors.bg, fontWeight: '700', fontSize: 14 },

  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rankDot: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  rankDotOn: { color: colors.gold },
  rankName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  rankDesc: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  claimButton: {
    borderColor: colors.gold,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingVertical: 7,
    paddingHorizontal: 16,
    minWidth: 64,
    alignItems: 'center',
  },
  claimButtonText: { color: colors.gold, fontWeight: '700', fontSize: 13 },
  achievedTag: { color: colors.gold, fontSize: 12, fontWeight: '600' },

  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentName: { flex: 1, fontSize: 14, color: colors.textPrimary },
  recentTime: { fontSize: 12, color: colors.textMuted },
  recentXp: { fontSize: 13, fontWeight: '700', color: colors.gold, minWidth: 40, textAlign: 'right' },

  removeButton: {
    marginTop: 32,
    borderColor: colors.danger,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingVertical: 13,
    alignItems: 'center',
  },
  removeText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
  deletePending: {
    marginTop: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: radius.md,
    padding: 14,
  },
  deletePendingText: { flex: 1, color: colors.danger, fontSize: 13, fontWeight: '600' },
  restoreButton: {
    backgroundColor: colors.gold,
    borderRadius: radius.sm,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  restoreText: { color: colors.bg, fontWeight: '700', fontSize: 13 },
});
