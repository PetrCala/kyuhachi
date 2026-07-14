/**
 * Developer tools: mock-data generators and destructive resets.
 *
 * Intentionally NOT internationalized: this screen never reaches end users
 * (gated behind {@link DEV_TOOLS_ENABLED}, off in App Store builds), so the
 * CLAUDE.md i18n rule is deliberately waived here. The redirect below is what
 * keeps it unreachable in production even though Expo Router bundles the file.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, Redirect, router } from 'expo-router';
import {
  collection,
  query,
  where,
  onSnapshot,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import type { ChallengeTypeDocument, TransportMode } from '@kyuhachi/shared';
import { COLLECTIONS, TRANSPORT_MODES } from '@kyuhachi/shared';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/firebase';
import { DEV_TOOLS_ENABLED } from '@/lib/dev/flags';
import {
  createMockChallenge,
  addVisitsToActiveChallenge,
  deleteAllChallenges,
  type MockTransport,
} from '@/lib/dev/mock';
import { colors, spacing, typography, radii } from '@/theme';

interface TypeRow {
  id: string;
  type: ChallengeTypeDocument;
}

const TRANSPORT_OPTIONS: { value: MockTransport; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'mixed', label: 'Mixed' },
  ...TRANSPORT_MODES.map((m: TransportMode) => ({ value: m, label: m })),
];

const QUICK_ADD_COUNT = 10;

export default function DevTools() {
  const { user } = useAuth();
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [typeId, setTypeId] = useState<string | null>(null);
  const [count, setCount] = useState('44');
  const [transport, setTransport] = useState<MockTransport>('mixed');
  const [withRoute, setWithRoute] = useState(false);
  const [makeActive, setMakeActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, COLLECTIONS.CHALLENGE_TYPES), where('isActive', '==', true)),
      (snap: FirebaseFirestoreTypes.QuerySnapshot) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          type: d.data() as ChallengeTypeDocument,
        }));
        setTypes(rows);
        setTypeId((prev) => prev ?? rows[0]?.id ?? null);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsubscribe;
  }, []);

  const selected = useMemo(() => types.find((r) => r.id === typeId) ?? null, [types, typeId]);
  const poolSize = selected?.type.eligibleOnsenIds?.length ?? 0;
  const completionCount = selected?.type.completionCount ?? 0;

  // Expo Router bundles every file under app/, so the screen must redirect when
  // dev tools are disabled; hiding the menu entry is not enough on its own.
  if (!DEV_TOOLS_ENABLED) return <Redirect href="/" />;

  function applyCount(n: number) {
    setCount(String(Math.max(0, Math.min(n, poolSize || n))));
  }

  async function handleCreate() {
    if (!user || !selected) return;
    setBusy(true);
    try {
      const id = await createMockChallenge({
        uid: user.uid,
        typeId: selected.id,
        type: selected.type,
        visitedCount: Number(count) || 0,
        transport,
        withRoute,
        makeActive,
      });
      Alert.alert('Mock challenge created', `id: ${id}`, [
        { text: 'Stay', style: 'cancel' },
        { text: 'Go home', onPress: () => router.replace('/') },
      ]);
    } catch (error) {
      Alert.alert('Create failed', String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleQuickAdd() {
    if (!user) return;
    setBusy(true);
    try {
      const result = await addVisitsToActiveChallenge(user.uid, QUICK_ADD_COUNT, transport);
      if (!result) {
        Alert.alert('No active challenge', 'Create one first, or make it active.');
      } else {
        Alert.alert('Visits added', `+${result.added} (now ${result.total} on active challenge)`);
      }
    } catch (error) {
      Alert.alert('Add failed', String(error));
    } finally {
      setBusy(false);
    }
  }

  function handleDeleteAll() {
    if (!user) return;
    Alert.alert('Delete ALL challenges?', 'Removes every challenge and its visits. Cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete all',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const n = await deleteAllChallenges(user.uid);
            Alert.alert('Done', `Deleted ${n} challenge(s).`);
          } catch (error) {
            Alert.alert('Delete failed', String(error));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Developer', headerShown: true }} />
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Developer', headerShown: true }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.warning}>
          Dev only. Writes mock data to your account. Hidden from App Store builds.
        </Text>

        <Text style={styles.sectionHeader}>Mock challenge</Text>

        <Text style={styles.fieldLabel}>Type</Text>
        <View style={styles.chipRow}>
          {types.map(({ id, type }) => (
            <Chip
              key={id}
              label={`${type.name} (${type.eligibleOnsenIds?.length ?? 0})`}
              active={id === typeId}
              onPress={() => setTypeId(id)}
            />
          ))}
        </View>

        <Text style={styles.fieldLabel}>
          Visits ({completionCount} to complete, {poolSize} eligible)
        </Text>
        <TextInput
          style={styles.input}
          value={count}
          onChangeText={(v) => setCount(v.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={colors.textPlaceholder}
          editable={!busy}
        />
        <View style={styles.chipRow}>
          <Chip label="0" active={false} onPress={() => applyCount(0)} />
          <Chip label="Half" active={false} onPress={() => applyCount(Math.floor(completionCount / 2))} />
          <Chip label="Almost" active={false} onPress={() => applyCount(Math.max(0, completionCount - 1))} />
          <Chip label="Complete" active={false} onPress={() => applyCount(completionCount)} />
          <Chip label="All eligible" active={false} onPress={() => applyCount(poolSize)} />
        </View>

        <Text style={styles.fieldLabel}>Transport</Text>
        <View style={styles.chipRow}>
          {TRANSPORT_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              active={opt.value === transport}
              onPress={() => setTransport(opt.value)}
            />
          ))}
        </View>

        <ToggleRow label="Attach a route" value={withRoute} onValueChange={setWithRoute} />
        <ToggleRow label="Make it the active challenge" value={makeActive} onValueChange={setMakeActive} />

        <Pressable
          style={[styles.primaryButton, (busy || !selected) && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={busy || !selected}
        >
          <Text style={styles.primaryButtonText}>
            {busy ? 'Working…' : 'Create mock challenge'}
          </Text>
        </Pressable>

        <Text style={styles.sectionHeader}>Quick actions</Text>

        <Pressable
          style={[styles.secondaryButton, busy && styles.buttonDisabled]}
          onPress={handleQuickAdd}
          disabled={busy}
        >
          <Text style={styles.secondaryButtonText}>
            Add {QUICK_ADD_COUNT} visits to active challenge
          </Text>
        </Pressable>

        <Pressable
          style={[styles.destructiveButton, busy && styles.buttonDisabled]}
          onPress={handleDeleteAll}
          disabled={busy}
        >
          <Text style={styles.destructiveButtonText}>Delete all my challenges</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    paddingBottom: spacing[10],
  },
  warning: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginBottom: spacing[5],
  },
  sectionHeader: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textMuted,
    marginTop: spacing[6],
    marginBottom: spacing[3],
  },
  fieldLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
    marginBottom: spacing[2],
    marginTop: spacing[3],
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
    backgroundColor: colors.backgroundElevated,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  chip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  chipActive: {
    backgroundColor: colors.actionPrimary,
    borderColor: colors.actionPrimary,
  },
  chipText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.actionPrimaryText,
    fontWeight: typography.weights.semibold,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    marginTop: spacing[2],
  },
  toggleLabel: {
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
  },
  primaryButton: {
    marginTop: spacing[5],
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.md,
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.actionPrimaryText,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing[4],
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  secondaryButtonText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  destructiveButton: {
    borderWidth: 1,
    borderColor: colors.destructive,
    borderRadius: radii.md,
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  destructiveButtonText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.destructive,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});
