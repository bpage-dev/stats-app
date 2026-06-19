import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/auth';
import { colors, radius } from '../../lib/theme';
import { SkillIcon } from '../../components/SkillIcon';
import { dateKey, WEEKDAY_LETTERS, type Recurrence } from '../../lib/schedule';

type Skill = { id: string; name: string; icon: string | null };
type Activity = { id: string; skill_id: string; name: string; difficulty: 'easy' | 'medium' | 'hard' };

const DURATIONS: { value: string; label: string; weeks: number | null }[] = [
  { value: 'ongoing', label: 'Ongoing', weeks: null },
  { value: '4', label: '4 weeks', weeks: 4 },
  { value: '8', label: '8 weeks', weeks: 8 },
  { value: '12', label: '12 weeks', weeks: 12 },
];

export default function CreateScheduleScreen() {
  const router = useRouter();
  const { session } = useSession();

  const [skills, setSkills] = useState<Skill[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [skillId, setSkillId] = useState<string | null>(null);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [recurrence, setRecurrence] = useState<Recurrence>('weekly');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [intervalDays, setIntervalDays] = useState(2);
  const [duration, setDuration] = useState('ongoing');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const [skillsRes, actsRes] = await Promise.all([
          supabase.from('skills').select('id, name, icon').order('created_at'),
          supabase.from('activities').select('id, skill_id, name, difficulty'),
        ]);
        if (!active) return;
        const sk = skillsRes.data ?? [];
        setSkills(sk);
        setActivities((actsRes.data ?? []) as Activity[]);
        if (sk.length && !skillId) setSkillId(sk[0].id);
        setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [skillId]),
  );

  const skillActivities = activities.filter((a) => a.skill_id === skillId);
  const effectiveActivityId =
    activityId && skillActivities.some((a) => a.id === activityId)
      ? activityId
      : skillActivities[0]?.id ?? null;

  const canSave =
    !!skillId &&
    !!effectiveActivityId &&
    (recurrence === 'interval' ? intervalDays >= 1 : weekdays.length >= 1);

  function toggleWeekday(d: number) {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  async function save() {
    if (!canSave || !session) return;
    const weeks = DURATIONS.find((d) => d.value === duration)?.weeks ?? null;
    let endDate: string | null = null;
    if (weeks) {
      const end = new Date();
      end.setDate(end.getDate() + weeks * 7);
      endDate = dateKey(end);
    }

    setSaving(true);
    const { error } = await supabase.from('schedules').insert({
      user_id: session.user.id,
      skill_id: skillId,
      activity_id: effectiveActivityId,
      recurrence,
      weekdays: recurrence === 'weekly' ? weekdays : [],
      interval_days: recurrence === 'interval' ? intervalDays : null,
      start_date: dateKey(new Date()),
      end_date: endDate,
    });
    setSaving(false);

    if (error) {
      Alert.alert('Could not save schedule', error.message);
      return;
    }
    router.back();
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Skill</Text>
        <View style={styles.chipWrap}>
          {skills.map((s) => {
            const on = s.id === skillId;
            return (
              <Pressable
                key={s.id}
                style={[styles.skillChip, on && styles.skillChipOn]}
                onPress={() => {
                  setSkillId(s.id);
                  setActivityId(null);
                }}
              >
                <SkillIcon name={s.icon} size={16} color={on ? colors.bg : colors.textSecondary} />
                <Text style={[styles.skillChipText, on && styles.skillChipTextOn]}>{s.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Activity</Text>
        {skillActivities.length === 0 ? (
          <Text style={styles.hint}>This skill has no activities to schedule.</Text>
        ) : (
          skillActivities.map((a) => {
            const on = a.id === effectiveActivityId;
            return (
              <Pressable
                key={a.id}
                style={[styles.activityRow, on && styles.activityRowOn]}
                onPress={() => setActivityId(a.id)}
              >
                <Text style={[styles.activityName, on && styles.activityNameOn]}>{a.name}</Text>
                <Text style={styles.activityDiff}>{a.difficulty}</Text>
              </Pressable>
            );
          })
        )}

        <Text style={styles.label}>Repeats</Text>
        <View style={styles.segment}>
          {(['weekly', 'interval'] as Recurrence[]).map((r) => {
            const on = r === recurrence;
            return (
              <Pressable
                key={r}
                style={[styles.segmentItem, on && styles.segmentItemOn]}
                onPress={() => setRecurrence(r)}
              >
                <Text style={[styles.segmentText, on && styles.segmentTextOn]}>
                  {r === 'weekly' ? 'Weekly' : 'Every N days'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {recurrence === 'weekly' ? (
          <View style={styles.dayWrap}>
            {WEEKDAY_LETTERS.map((letter, d) => {
              const on = weekdays.includes(d);
              return (
                <Pressable
                  key={d}
                  style={[styles.dayChip, on && styles.dayChipOn]}
                  onPress={() => toggleWeekday(d)}
                >
                  <Text style={[styles.dayChipText, on && styles.dayChipTextOn]}>{letter}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.stepper}>
            <Pressable
              style={styles.stepBtn}
              onPress={() => setIntervalDays((n) => Math.max(1, n - 1))}
            >
              <Text style={styles.stepBtnText}>−</Text>
            </Pressable>
            <Text style={styles.stepValue}>Every {intervalDays} {intervalDays === 1 ? 'day' : 'days'}</Text>
            <Pressable
              style={styles.stepBtn}
              onPress={() => setIntervalDays((n) => Math.min(30, n + 1))}
            >
              <Text style={styles.stepBtnText}>＋</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.label}>Duration</Text>
        <View style={styles.chipWrap}>
          {DURATIONS.map((d) => {
            const on = d.value === duration;
            return (
              <Pressable
                key={d.value}
                style={[styles.durChip, on && styles.durChipOn]}
                onPress={() => setDuration(d.value)}
              >
                <Text style={[styles.durChipText, on && styles.durChipTextOn]}>{d.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>Starts today. Sessions log automatically as each date passes.</Text>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.saveButton, (!canSave || saving) && styles.disabled]}
          onPress={save}
          disabled={!canSave || saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.saveText}>Save schedule</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 32 },

  label: { fontSize: 13, color: colors.textSecondary, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 10 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12,
  },
  skillChipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  skillChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  skillChipTextOn: { color: colors.bg },

  activityRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm, padding: 14, marginBottom: 8,
  },
  activityRowOn: { borderColor: colors.gold },
  activityName: { fontSize: 15, color: colors.textPrimary, fontWeight: '600' },
  activityNameOn: { color: colors.goldBright },
  activityDiff: { fontSize: 12, color: colors.textMuted, textTransform: 'capitalize' },

  segment: {
    flexDirection: 'row', borderRadius: radius.sm, overflow: 'hidden',
    borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth,
  },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 11, backgroundColor: colors.surface },
  segmentItemOn: { backgroundColor: colors.gold },
  segmentText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  segmentTextOn: { color: colors.bg },

  dayWrap: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  dayChip: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth,
  },
  dayChipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  dayChipText: { fontSize: 14, color: colors.textSecondary, fontWeight: '700' },
  dayChipTextOn: { color: colors.bg },

  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  stepBtn: {
    width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth,
  },
  stepBtnText: { fontSize: 22, color: colors.gold, fontWeight: '300' },
  stepValue: { fontSize: 15, color: colors.textPrimary, fontWeight: '600' },

  durChip: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14,
  },
  durChipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  durChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  durChipTextOn: { color: colors.bg },

  footer: {
    padding: 20, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveButton: {
    backgroundColor: colors.gold, borderRadius: radius.sm, paddingVertical: 15, alignItems: 'center',
  },
  saveText: { color: colors.bg, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
