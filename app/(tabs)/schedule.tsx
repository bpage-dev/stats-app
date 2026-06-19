import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { colors, formatInt, radius } from '../../lib/theme';
import { SkillIcon } from '../../components/SkillIcon';
import {
  dateKey,
  describeRecurrence,
  parseDate,
  scheduleMatchesDate,
  startOfDay,
  WEEKDAY_LETTERS,
  WEEKDAY_SHORT,
  type ScheduleRow,
} from '../../lib/schedule';

type Difficulty = 'easy' | 'medium' | 'hard';
type Status = 'pending' | 'completed' | 'skipped';

type SchedView = ScheduleRow & { skillName: string; icon: string | null; activityName: string };
type SessionItem = {
  id: string;
  date: string;
  status: Status;
  skillName: string;
  icon: string | null;
  activityName: string;
  xp: number;
};
type ClaimRow = {
  out_skill_name: string;
  out_sessions: number;
  out_xp_gained: number;
  out_old_level: number;
  out_new_level: number;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function one<T>(v: unknown): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : ((v as T) ?? null);
}

function dayLabel(key: string): string {
  const d = parseDate(key);
  return `${WEEKDAY_SHORT[d.getDay()]} ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

export default function ScheduleScreen() {
  const router = useRouter();
  const today = startOfDay(new Date());

  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selectedKey, setSelectedKey] = useState(dateKey(today));
  const [schedules, setSchedules] = useState<SchedView[]>([]);
  const [pending, setPending] = useState<SessionItem[]>([]);
  const [monthByKey, setMonthByKey] = useState<Map<string, SessionItem[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const monthStart = dateKey(new Date(view.year, view.month, 1));
    const nextMonth = dateKey(new Date(view.year, view.month + 1, 1));

    const [schedRes, pendRes, monthRes, diffRes] = await Promise.all([
      supabase
        .from('schedules')
        .select('id, skill_id, activity_id, recurrence, weekdays, interval_days, start_date, end_date, active, skills(name, icon), activities(name)')
        .eq('active', true),
      supabase
        .from('scheduled_sessions')
        .select('id, occurrence_date, status, skills(name, icon), activities(name, difficulty)')
        .eq('status', 'pending')
        .order('occurrence_date'),
      supabase
        .from('scheduled_sessions')
        .select('id, occurrence_date, status, skills(name, icon), activities(name, difficulty)')
        .gte('occurrence_date', monthStart)
        .lt('occurrence_date', nextMonth),
      supabase.from('difficulty_xp').select('difficulty, base_xp'),
    ]);

    const xpByDiff = new Map((diffRes.data ?? []).map((d) => [d.difficulty as Difficulty, d.base_xp]));

    const toItem = (row: Record<string, unknown>): SessionItem => {
      const sk = one<{ name: string; icon: string | null }>(row.skills);
      const act = one<{ name: string; difficulty: Difficulty }>(row.activities);
      return {
        id: row.id as string,
        date: row.occurrence_date as string,
        status: row.status as Status,
        skillName: sk?.name ?? 'Skill',
        icon: sk?.icon ?? null,
        activityName: act?.name ?? 'Activity',
        xp: act ? xpByDiff.get(act.difficulty) ?? 0 : 0,
      };
    };

    setPending((pendRes.data ?? []).map(toItem));

    const map = new Map<string, SessionItem[]>();
    for (const row of monthRes.data ?? []) {
      const item = toItem(row);
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    setMonthByKey(map);

    setSchedules(
      (schedRes.data ?? []).map((s) => {
        const sk = one<{ name: string; icon: string | null }>(s.skills);
        const act = one<{ name: string }>(s.activities);
        return {
          ...(s as unknown as ScheduleRow),
          skillName: sk?.name ?? 'Skill',
          icon: sk?.icon ?? null,
          activityName: act?.name ?? 'Activity',
        };
      }),
    );
    setLoading(false);
  }, [view]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      supabase.rpc('sync_due_sessions').then(() => load());
    }, [load]),
  );

  async function claim(ids: string[] | null, key: string) {
    setBusy(key);
    const { data, error } = await supabase.rpc('claim_sessions', { p_session_ids: ids });
    setBusy(null);
    if (error) {
      Alert.alert('Could not claim', error.message);
      return;
    }
    await load();
    const rows = (data as ClaimRow[] | null) ?? [];
    if (ids && ids.length === 1) {
      const r = rows[0];
      if (r && r.out_new_level > r.out_old_level) {
        Alert.alert('Level up!', `${r.out_skill_name} reached level ${r.out_new_level}.`);
      }
    } else if (rows.length) {
      const sessions = rows.reduce((n, r) => n + r.out_sessions, 0);
      const xp = rows.reduce((n, r) => n + r.out_xp_gained, 0);
      Alert.alert('Claimed', `${sessions} ${sessions === 1 ? 'session' : 'sessions'} (+${formatInt(xp)} XP).`);
    }
  }

  async function skip(id: string) {
    await supabase.rpc('skip_session', { p_session_id: id });
    load();
  }

  function shiftMonth(delta: number) {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.gold} />
      </SafeAreaView>
    );
  }

  const firstWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedDate = parseDate(selectedKey);
  const selectedItems = monthByKey.get(selectedKey) ?? [];
  const selectedPlanned =
    startOfDay(selectedDate) > today ? schedules.filter((s) => scheduleMatchesDate(s, selectedDate)) : [];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Schedule</Text>
          <Pressable style={styles.addButton} onPress={() => router.push('/schedule/create')}>
            <MaterialCommunityIcons name="plus" size={22} color={colors.bg} />
          </Pressable>
        </View>

        {pending.length > 0 && (
          <>
            <View style={styles.claimHeader}>
              <Text style={styles.sectionTitle}>To claim ({pending.length})</Text>
              <Pressable
                style={[styles.claimAll, busy === 'all' && styles.dim]}
                onPress={() => claim(null, 'all')}
                disabled={busy !== null}
              >
                {busy === 'all' ? (
                  <ActivityIndicator size="small" color={colors.bg} />
                ) : (
                  <Text style={styles.claimAllText}>Claim all</Text>
                )}
              </Pressable>
            </View>
            {pending.map((item) => (
              <Swipeable
                key={item.id}
                renderRightActions={() => (
                  <View style={styles.skipAction}>
                    <MaterialCommunityIcons name="close" size={18} color="#fff" />
                    <Text style={styles.skipText}>Skip</Text>
                  </View>
                )}
                onSwipeableOpen={() => skip(item.id)}
              >
                <Pressable
                  style={[styles.pendingCard, busy === item.id && styles.dim]}
                  onPress={() => claim([item.id], item.id)}
                  disabled={busy !== null}
                >
                  <View style={styles.iconChip}>
                    <SkillIcon name={item.icon} size={18} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.cardActivity}>{item.activityName}</Text>
                    <Text style={styles.cardSub}>{item.skillName} · {dayLabel(item.date)}</Text>
                  </View>
                  {busy === item.id ? (
                    <ActivityIndicator size="small" color={colors.gold} />
                  ) : (
                    <Text style={styles.claimXp}>+{formatInt(item.xp)}</Text>
                  )}
                </Pressable>
              </Swipeable>
            ))}
            <Text style={styles.hint}>Tap to claim · swipe left to skip</Text>
          </>
        )}

        <View style={styles.monthBar}>
          <Pressable onPress={() => shiftMonth(-1)} hitSlop={10}>
            <MaterialCommunityIcons name="chevron-left" size={26} color={colors.textSecondary} />
          </Pressable>
          <Text style={styles.monthLabel}>{MONTHS[view.month]} {view.year}</Text>
          <Pressable onPress={() => shiftMonth(1)} hitSlop={10}>
            <MaterialCommunityIcons name="chevron-right" size={26} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.weekHeader}>
          {WEEKDAY_LETTERS.map((l, i) => (
            <Text key={i} style={styles.weekHeaderText}>{l}</Text>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((day, i) => {
            if (day === null) return <View key={i} style={styles.cell} />;
            const date = new Date(view.year, view.month, day);
            const key = dateKey(date);
            const items = monthByKey.get(key) ?? [];
            const hasCompleted = items.some((x) => x.status === 'completed');
            const hasPending = items.some((x) => x.status === 'pending');
            const hasSkipped = items.some((x) => x.status === 'skipped');
            const planned = startOfDay(date) > today && schedules.some((s) => scheduleMatchesDate(s, date));
            const isToday = key === dateKey(today);
            const isSelected = key === selectedKey;
            return (
              <Pressable key={i} style={styles.cell} onPress={() => setSelectedKey(key)}>
                <View style={[styles.dayCircle, isSelected && styles.dayCircleSel, isToday && !isSelected && styles.dayCircleToday]}>
                  <Text style={[styles.dayText, isSelected && styles.dayTextSel]}>{day}</Text>
                </View>
                <View style={styles.dotRow}>
                  {hasCompleted && <View style={styles.dotDone} />}
                  {hasPending && <View style={styles.dotPending} />}
                  {hasSkipped && <View style={styles.dotSkipped} />}
                  {planned && <View style={styles.dotPlanned} />}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.agendaDate}>{dayLabel(selectedKey)}</Text>
        {selectedItems.length === 0 && selectedPlanned.length === 0 ? (
          <Text style={styles.muted}>Nothing on this day.</Text>
        ) : (
          <>
            {selectedItems.map((item) => (
              <View key={item.id} style={styles.agendaRow}>
                <View style={styles.iconChip}>
                  <SkillIcon name={item.icon} size={16} color={item.status === 'completed' ? colors.goldBright : colors.textSecondary} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.cardActivity}>{item.activityName}</Text>
                  <Text style={styles.cardSub}>{item.skillName}</Text>
                </View>
                <Text style={[styles.statusTag, statusStyle(item.status)]}>{statusLabel(item.status)}</Text>
              </View>
            ))}
            {selectedPlanned.map((s) => (
              <View key={s.id} style={styles.agendaRow}>
                <View style={styles.iconChip}>
                  <SkillIcon name={s.icon} size={16} color={colors.textSecondary} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.cardActivity}>{s.activityName}</Text>
                  <Text style={styles.cardSub}>{s.skillName}</Text>
                </View>
                <Text style={[styles.statusTag, styles.tagPlanned]}>Planned</Text>
              </View>
            ))}
          </>
        )}

        <Text style={styles.sectionTitle}>Your schedules</Text>
        {schedules.length === 0 ? (
          <Text style={styles.muted}>No schedules yet. Tap + to add one.</Text>
        ) : (
          schedules.map((s) => (
            <View key={s.id} style={styles.schedRow}>
              <View style={styles.iconChip}>
                <SkillIcon name={s.icon} size={16} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.cardActivity}>{s.activityName}</Text>
                <Text style={styles.cardSub}>{s.skillName} · {describeRecurrence(s)}</Text>
              </View>
              <Pressable onPress={() => confirmDelete(s.id)} hitSlop={8} style={styles.deleteBtn}>
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );

  function confirmDelete(id: string) {
    Alert.alert('Delete schedule', 'Stop auto-queuing this activity? Past logs are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('schedules').delete().eq('id', id);
          load();
        },
      },
    ]);
  }
}

function statusLabel(s: Status): string {
  return s === 'completed' ? 'Done' : s === 'pending' ? 'Pending' : 'Skipped';
}
function statusStyle(s: Status) {
  return s === 'completed' ? styles.tagDone : s === 'pending' ? styles.tagPending : styles.tagSkipped;
}

const CELL = `${100 / 7}%`;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  flex: { flex: 1 },
  muted: { color: colors.textMuted, fontSize: 13, paddingVertical: 8 },
  hint: { fontSize: 11, color: colors.textMuted, fontStyle: 'italic', marginTop: 2, marginBottom: 4 },
  dim: { opacity: 0.6 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary },
  addButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },

  claimHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  claimAll: { backgroundColor: colors.gold, borderRadius: radius.sm, paddingVertical: 7, paddingHorizontal: 16, minWidth: 84, alignItems: 'center' },
  claimAllText: { color: colors.bg, fontWeight: '700', fontSize: 13 },

  pendingCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderColor: colors.gold, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  claimXp: { fontSize: 15, fontWeight: '800', color: colors.gold },
  skipAction: {
    backgroundColor: colors.danger, justifyContent: 'center', alignItems: 'center',
    width: 88, borderRadius: radius.md, marginBottom: 8, gap: 2,
  },
  skipText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  iconChip: { width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.goldTint, alignItems: 'center', justifyContent: 'center' },
  cardActivity: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  cardSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },

  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, marginTop: 12 },
  monthLabel: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  weekHeader: { flexDirection: 'row', marginTop: 4 },
  weekHeaderText: { width: CELL as never, textAlign: 'center', fontSize: 11, color: colors.textMuted },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL as never, alignItems: 'center', paddingVertical: 4 },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dayCircleSel: { backgroundColor: colors.gold },
  dayCircleToday: { borderWidth: 1, borderColor: colors.gold },
  dayText: { fontSize: 14, color: colors.textPrimary },
  dayTextSel: { color: colors.bg, fontWeight: '700' },
  dotRow: { flexDirection: 'row', gap: 2, height: 8, marginTop: 2, alignItems: 'center' },
  dotDone: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.gold },
  dotPending: { width: 5, height: 5, borderRadius: 3, borderWidth: 1, borderColor: colors.gold },
  dotSkipped: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.textMuted },
  dotPlanned: { width: 5, height: 5, borderRadius: 3, borderWidth: 1, borderColor: colors.textMuted },

  agendaDate: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginTop: 20, marginBottom: 10 },
  agendaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  statusTag: { fontSize: 12, fontWeight: '600' },
  tagDone: { color: colors.gold },
  tagPending: { color: colors.goldBright },
  tagSkipped: { color: colors.textMuted },
  tagPlanned: { color: colors.textSecondary },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 24, marginBottom: 12 },
  schedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  deleteBtn: { padding: 4 },
});
