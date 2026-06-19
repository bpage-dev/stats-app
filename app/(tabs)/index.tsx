import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { getLevelInfo, type Threshold } from '../../lib/progress';
import { colors, formatInt, radius } from '../../lib/theme';
import { SkillIcon } from '../../components/SkillIcon';

type Tile = {
  id: string;
  name: string;
  icon: string | null;
  level: number;
  fraction: number;
  xpIntoLevel: number;
  xpForLevel: number;
  rankLabel: string | null;
  isMax: boolean;
};

const ADD_TILE = { id: '__add__' } as const;

export default function SkillBoardScreen() {
  const router = useRouter();
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);

  const load = useCallback(async () => {
    setError(null);

    // Queue any scheduled sessions that came due while the app was closed.
    const { data: pendingCount } = await supabase.rpc('sync_due_sessions');
    setPending((pendingCount as number) ?? 0);

    const [skillsRes, progressRes, ranksRes, thresholdsRes] = await Promise.all([
      supabase.from('skills').select('id, name, icon, xp_template_id').order('created_at'),
      supabase.from('user_skill_progress').select('skill_id, current_xp, current_rank_id'),
      supabase.from('ranks').select('id, label, skill_id'),
      supabase.from('level_thresholds').select('xp_template_id, level_number, xp_required'),
    ]);

    const firstError =
      skillsRes.error || progressRes.error || ranksRes.error || thresholdsRes.error;
    if (firstError) {
      setError(firstError.message);
      setTiles([]);
      return;
    }

    const progressBySkill = new Map(
      (progressRes.data ?? []).map((p) => [p.skill_id, p]),
    );
    const rankById = new Map((ranksRes.data ?? []).map((r) => [r.id, r.label]));

    const thresholdsByTemplate = new Map<string, Threshold[]>();
    for (const t of thresholdsRes.data ?? []) {
      const list = thresholdsByTemplate.get(t.xp_template_id) ?? [];
      list.push({ level_number: t.level_number, xp_required: t.xp_required });
      thresholdsByTemplate.set(t.xp_template_id, list);
    }

    const next: Tile[] = (skillsRes.data ?? []).map((s) => {
      const progress = progressBySkill.get(s.id);
      const xp = progress?.current_xp ?? 0;
      const info = getLevelInfo(xp, thresholdsByTemplate.get(s.xp_template_id) ?? []);
      return {
        id: s.id,
        name: s.name,
        icon: s.icon,
        level: info.level,
        fraction: info.fraction,
        xpIntoLevel: info.xpIntoLevel,
        xpForLevel: info.xpForLevel,
        rankLabel: progress?.current_rank_id
          ? rankById.get(progress.current_rank_id) ?? null
          : null,
        isMax: info.isMax,
      };
    });

    setTiles(next);
  }, []);

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

  const totalLevel = tiles.reduce((sum, t) => sum + t.level, 0);

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={[...tiles, ADD_TILE]}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.gold}
          />
        }
        ListHeaderComponent={
          <View>
            {pending > 0 && (
              <Pressable style={styles.banner} onPress={() => router.navigate('/schedule')}>
                <Text style={styles.bannerText}>
                  {pending} {pending === 1 ? 'session' : 'sessions'} ready to claim
                </Text>
                <Text style={styles.bannerArrow}>›</Text>
              </Pressable>
            )}
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Skills</Text>
                <Text style={styles.subtitle}>
                  {tiles.length} {tiles.length === 1 ? 'skill' : 'skills'} tracked
                </Text>
              </View>
              <View style={styles.totalBadge}>
                <Text style={styles.totalStar}>★</Text>
                <Text style={styles.totalText}>Total {totalLevel}</Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          error ? (
            <Text style={styles.errorText}>Couldn't load skills: {error}</Text>
          ) : null
        }
        renderItem={({ item }) =>
          item.id === '__add__' ? (
            <Pressable
              style={[styles.tile, styles.addTile]}
              onPress={() => router.push('/skill/create')}
            >
              <Text style={styles.addPlus}>＋</Text>
              <Text style={styles.addLabel}>New skill</Text>
            </Pressable>
          ) : (
            <SkillTile tile={item as Tile} onPress={() => router.push(`/skill/${item.id}`)} />
          )
        }
      />
    </SafeAreaView>
  );
}

function SkillTile({ tile, onPress }: { tile: Tile; onPress: () => void }) {
  return (
    <Pressable style={styles.tile} onPress={onPress}>
      <View style={styles.tileTop}>
        <View style={styles.iconChip}>
          <SkillIcon name={tile.icon} size={22} />
        </View>
        <View style={styles.levelWrap}>
          <Text style={styles.levelNum}>{tile.level}</Text>
          <Text style={styles.levelMax}>/ 99</Text>
        </View>
      </View>

      <Text style={styles.tileName} numberOfLines={1}>
        {tile.name}
      </Text>
      <Text style={[styles.rank, !tile.rankLabel && styles.rankMuted]} numberOfLines={1}>
        {tile.rankLabel ?? 'Unranked'}
      </Text>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(tile.fraction * 100)}%` }]} />
      </View>
      <Text style={styles.xpLabel}>
        {tile.isMax
          ? 'Max level'
          : `${formatInt(tile.xpIntoLevel)} / ${formatInt(tile.xpForLevel)} xp`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 10 },
  row: { gap: 10 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.goldTint,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  bannerText: { color: colors.goldBright, fontSize: 14, fontWeight: '700' },
  bannerArrow: { color: colors.goldBright, fontSize: 20, fontWeight: '700' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  totalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.goldTint,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  totalStar: { fontSize: 13, color: colors.goldBright },
  totalText: { fontSize: 14, fontWeight: '700', color: colors.goldBright },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: 12,
  },
  tileTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.goldTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelWrap: { alignItems: 'flex-end' },
  levelNum: { fontSize: 24, fontWeight: '800', color: colors.goldBright, lineHeight: 26 },
  levelMax: { fontSize: 10, color: colors.textMuted },
  tileName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  rank: { fontSize: 11, color: colors.gold, marginTop: 2, marginBottom: 10 },
  rankMuted: { color: colors.textMuted },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.gold, borderRadius: 3 },
  xpLabel: { fontSize: 10, color: colors.textMuted, marginTop: 6 },
  addTile: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 132,
  },
  addPlus: { fontSize: 26, color: colors.textMuted, fontWeight: '300' },
  addLabel: { fontSize: 11, color: colors.textMuted },
  errorText: { color: colors.danger, fontSize: 13, textAlign: 'center', paddingVertical: 24 },
});
