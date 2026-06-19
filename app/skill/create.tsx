import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { colors, radius } from '../../lib/theme';
import { SKILL_ICONS, DEFAULT_SKILL_ICON } from '../../lib/icons';

type Difficulty = 'easy' | 'medium' | 'hard';
type Template = 'casual' | 'standard' | 'hardcore';

const DIFFICULTIES: { value: Difficulty; label: string; color: string }[] = [
  { value: 'easy', label: 'Easy', color: '#34d399' },
  { value: 'medium', label: 'Medium', color: colors.gold },
  { value: 'hard', label: 'Hard', color: colors.danger },
];

const TEMPLATES: { value: Template; label: string; blurb: string }[] = [
  { value: 'casual', label: 'Casual', blurb: 'Faster leveling · ~65k XP to level 99' },
  { value: 'standard', label: 'Standard', blurb: 'Balanced · ~130k XP to level 99' },
  { value: 'hardcore', label: 'Hardcore', blurb: 'Grindier · ~261k XP to level 99' },
];

type ActivityDraft = { name: string; difficulty: Difficulty };
type RankDraft = { label: string; milestone_desc: string };

const TOTAL_STEPS = 4;

export default function CreateSkillScreen() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState<string>(DEFAULT_SKILL_ICON);
  const [template, setTemplate] = useState<Template>('standard');
  const [activities, setActivities] = useState<ActivityDraft[]>([{ name: '', difficulty: 'easy' }]);
  const [ranks, setRanks] = useState<RankDraft[]>([{ label: '', milestone_desc: '' }]);

  const canProceed =
    step === 1 ? name.trim().length > 0
      : step === 3 ? activities.some((a) => a.name.trim().length > 0)
        : true;

  async function submit() {
    const cleanActivities = activities
      .filter((a) => a.name.trim())
      .map((a) => ({ name: a.name.trim(), difficulty: a.difficulty }));
    const cleanRanks = ranks
      .filter((r) => r.label.trim())
      .map((r) => ({ label: r.label.trim(), milestone_desc: r.milestone_desc.trim() }));

    setSubmitting(true);
    const { data, error } = await supabase.rpc('create_skill', {
      p_name: name.trim(),
      p_icon: icon,
      p_description: description.trim(),
      p_template_name: template,
      p_activities: cleanActivities,
      p_ranks: cleanRanks,
    });
    setSubmitting(false);

    if (error) {
      Alert.alert('Could not create skill', error.message);
      return;
    }
    router.replace(`/skill/${data as string}`);
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.progress}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <View key={i} style={[styles.progressDot, i < step && styles.progressDotOn]} />
        ))}
      </View>
      <Text style={styles.stepLabel}>Step {step} of {TOTAL_STEPS}</Text>

      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 1 && (
          <StepDetails
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            icon={icon}
            setIcon={setIcon}
          />
        )}
        {step === 2 && <StepTemplate template={template} setTemplate={setTemplate} />}
        {step === 3 && <StepActivities activities={activities} setActivities={setActivities} />}
        {step === 4 && <StepRanks ranks={ranks} setRanks={setRanks} />}
      </ScrollView>

      <View style={styles.footer}>
        {step > 1 ? (
          <Pressable style={styles.backButton} onPress={() => setStep(step - 1)} disabled={submitting}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : (
          <View style={styles.flex} />
        )}
        {step < TOTAL_STEPS ? (
          <Pressable
            style={[styles.nextButton, !canProceed && styles.disabled]}
            onPress={() => canProceed && setStep(step + 1)}
            disabled={!canProceed}
          >
            <Text style={styles.nextText}>Next</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.nextButton, submitting && styles.disabled]} onPress={submit} disabled={submitting}>
            {submitting ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.nextText}>Create skill</Text>}
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function StepDetails(props: {
  name: string; setName: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  icon: string; setIcon: (v: string) => void;
}) {
  return (
    <View>
      <Text style={styles.heading}>Name your skill</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Bouldering"
        placeholderTextColor={colors.textMuted}
        value={props.name}
        onChangeText={props.setName}
        maxLength={40}
      />
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Short description (optional)"
        placeholderTextColor={colors.textMuted}
        value={props.description}
        onChangeText={props.setDescription}
        multiline
        maxLength={120}
      />

      <Text style={styles.label}>Icon</Text>
      <View style={styles.iconGrid}>
        {SKILL_ICONS.map((g) => {
          const selected = g === props.icon;
          return (
            <Pressable
              key={g}
              style={[styles.iconCell, selected && styles.iconCellOn]}
              onPress={() => props.setIcon(g)}
            >
              <MaterialCommunityIcons
                name={g as never}
                size={24}
                color={selected ? colors.bg : colors.textSecondary}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function StepTemplate(props: { template: Template; setTemplate: (v: Template) => void }) {
  return (
    <View>
      <Text style={styles.heading}>Choose a difficulty</Text>
      <Text style={styles.subheading}>This sets how much XP each level takes. You can't change it later.</Text>
      {TEMPLATES.map((t) => {
        const selected = t.value === props.template;
        return (
          <Pressable
            key={t.value}
            style={[styles.templateCard, selected && styles.templateCardOn]}
            onPress={() => props.setTemplate(t.value)}
          >
            <View style={styles.flex}>
              <Text style={[styles.templateName, selected && styles.templateNameOn]}>{t.label}</Text>
              <Text style={styles.templateBlurb}>{t.blurb}</Text>
            </View>
            <MaterialCommunityIcons
              name={selected ? 'radiobox-marked' : 'radiobox-blank'}
              size={22}
              color={selected ? colors.gold : colors.textMuted}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

function StepActivities(props: {
  activities: ActivityDraft[];
  setActivities: (v: ActivityDraft[]) => void;
}) {
  const update = (i: number, patch: Partial<ActivityDraft>) =>
    props.setActivities(props.activities.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const remove = (i: number) => props.setActivities(props.activities.filter((_, idx) => idx !== i));

  return (
    <View>
      <Text style={styles.heading}>Add activities</Text>
      <Text style={styles.subheading}>Things you'll log to earn XP. Harder ones award more.</Text>
      {props.activities.map((a, i) => (
        <View key={i} style={styles.draftCard}>
          <View style={styles.draftHeader}>
            <TextInput
              style={[styles.input, styles.flex, styles.noMargin]}
              placeholder="Activity name"
              placeholderTextColor={colors.textMuted}
              value={a.name}
              onChangeText={(v) => update(i, { name: v })}
              maxLength={50}
            />
            {props.activities.length > 1 && (
              <Pressable style={styles.removeButton} onPress={() => remove(i)}>
                <MaterialCommunityIcons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
          <View style={styles.segment}>
            {DIFFICULTIES.map((d) => {
              const on = d.value === a.difficulty;
              return (
                <Pressable
                  key={d.value}
                  style={[styles.segmentItem, on && { backgroundColor: d.color }]}
                  onPress={() => update(i, { difficulty: d.value })}
                >
                  <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{d.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <Pressable
        style={styles.addRow}
        onPress={() => props.setActivities([...props.activities, { name: '', difficulty: 'easy' }])}
      >
        <MaterialCommunityIcons name="plus" size={18} color={colors.gold} />
        <Text style={styles.addRowText}>Add activity</Text>
      </Pressable>
    </View>
  );
}

function StepRanks(props: { ranks: RankDraft[]; setRanks: (v: RankDraft[]) => void }) {
  const update = (i: number, patch: Partial<RankDraft>) =>
    props.setRanks(props.ranks.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => props.setRanks(props.ranks.filter((_, idx) => idx !== i));

  return (
    <View>
      <Text style={styles.heading}>Add ranks</Text>
      <Text style={styles.subheading}>Titles you unlock by logging milestones, lowest first. Optional.</Text>
      {props.ranks.map((r, i) => (
        <View key={i} style={styles.draftCard}>
          <View style={styles.draftHeader}>
            <Text style={styles.rankIndex}>Rank {i + 1}</Text>
            {props.ranks.length > 1 && (
              <Pressable style={styles.removeButton} onPress={() => remove(i)}>
                <MaterialCommunityIcons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
          <TextInput
            style={[styles.input, styles.noMargin]}
            placeholder="Rank title (e.g. Novice)"
            placeholderTextColor={colors.textMuted}
            value={r.label}
            onChangeText={(v) => update(i, { label: v })}
            maxLength={40}
          />
          <TextInput
            style={[styles.input, styles.noMarginTop]}
            placeholder="Milestone to unlock it (optional)"
            placeholderTextColor={colors.textMuted}
            value={r.milestone_desc}
            onChangeText={(v) => update(i, { milestone_desc: v })}
            maxLength={80}
          />
        </View>
      ))}
      <Pressable
        style={styles.addRow}
        onPress={() => props.setRanks([...props.ranks, { label: '', milestone_desc: '' }])}
      >
        <MaterialCommunityIcons name="plus" size={18} color={colors.gold} />
        <Text style={styles.addRowText}>Add rank</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 32 },

  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingTop: 12 },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.track },
  progressDotOn: { backgroundColor: colors.gold },
  stepLabel: { fontSize: 12, color: colors.textMuted, paddingHorizontal: 20, paddingTop: 8 },

  heading: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 },
  subheading: { fontSize: 13, color: colors.textSecondary, marginBottom: 16 },
  label: { fontSize: 13, color: colors.textSecondary, marginTop: 8, marginBottom: 10 },

  input: {
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginTop: 12,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  noMargin: { marginTop: 0 },
  noMarginTop: { marginTop: 8 },

  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  iconCell: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCellOn: { backgroundColor: colors.gold, borderColor: colors.gold },

  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 10,
  },
  templateCardOn: { borderColor: colors.gold },
  templateName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  templateNameOn: { color: colors.goldBright },
  templateBlurb: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  draftCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 10,
  },
  draftHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  removeButton: { padding: 6 },
  rankIndex: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.textSecondary },

  segment: {
    flexDirection: 'row',
    marginTop: 10,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 9, backgroundColor: colors.surface },
  segmentText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  segmentTextOn: { color: colors.bg },

  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  addRowText: { color: colors.gold, fontWeight: '700', fontSize: 14 },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 20,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  backButton: { paddingVertical: 14, paddingHorizontal: 24 },
  backText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  nextButton: {
    flex: 1,
    backgroundColor: colors.gold,
    borderRadius: radius.sm,
    paddingVertical: 15,
    alignItems: 'center',
  },
  nextText: { color: colors.bg, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
