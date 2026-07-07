import { useState, useEffect, type ComponentProps } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  query,
  where,
  onSnapshot,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import type { ChallengeTypeDocument, TransportMode } from '@kyuhachi/shared';
import { COLLECTIONS, TRANSPORT_MODES } from '@kyuhachi/shared';
import { db } from '@/firebase';
import { transportColor } from '@/components/charts/series';
import { challengeTypeHook, localizeChallengeType } from '@/lib/challenge-i18n';
import { colors, spacing, typography, radii } from '@/theme';

interface ChallengeTypeRow {
  id: string;
  type: ChallengeTypeDocument;
}

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// Solid transport glyphs: a filled mark reads better than the -outline variant
// on the saturated mode-colored disc (same choice as the ChallengeBadge emblem).
const TRANSPORT_ICONS: Record<TransportMode, IoniconName> = {
  foot: 'walk',
  bicycle: 'bicycle',
  public: 'bus',
  car: 'car',
};

// Tile-disc geometry — component-local, like the badge diameters in ChallengeBadge.
const DISC_SIZE = 64;
const DISC_ICON_RATIO = 0.55;

export default function ChooseChallengeType() {
  const { t } = useTranslation();
  const [types, setTypes] = useState<ChallengeTypeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, COLLECTIONS.CHALLENGE_TYPES), where('isActive', '==', true)),
      (snap: FirebaseFirestoreTypes.QuerySnapshot) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          type: d.data() as ChallengeTypeDocument,
        }));
        // Easiest first: a higher baseMode rank means a more permissive
        // challenge (car > public > bicycle > foot).
        rows.sort(
          (a, b) =>
            TRANSPORT_MODES.indexOf(b.type.baseMode) -
            TRANSPORT_MODES.indexOf(a.type.baseMode)
        );
        setTypes(rows);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: t('challengeNew.title'), headerShown: true }} />
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      </>
    );
  }

  if (types.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: t('challengeNew.title'), headerShown: true }} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{t('challenge.errorLoad')}</Text>
        </View>
      </>
    );
  }

  // Two tiles per row; a lone tile in the last row keeps its half-width slot.
  const gridRows: ChallengeTypeRow[][] = [];
  for (let i = 0; i < types.length; i += 2) {
    gridRows.push(types.slice(i, i + 2));
  }

  return (
    <>
      <Stack.Screen options={{ title: t('challengeNew.title'), headerShown: true }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.heading}>{t('challengeNew.heading')}</Text>
        <Text style={styles.hint}>{t('challengeNew.hint')}</Text>

        <View style={styles.grid}>
          {gridRows.map((row) => (
            <View key={row[0].id} style={styles.gridRow}>
              {row.map(({ id, type }) => {
                const display = localizeChallengeType(id, type, t);
                return (
                  <Pressable
                    key={id}
                    style={styles.tile}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({ pathname: '/challenge/preview', params: { typeId: id } })
                    }
                  >
                    <View
                      style={[styles.disc, { backgroundColor: transportColor(type.baseMode) }]}
                    >
                      <Ionicons
                        name={TRANSPORT_ICONS[type.baseMode]}
                        size={DISC_SIZE * DISC_ICON_RATIO}
                        color={colors.textInverted}
                      />
                    </View>
                    <Text style={styles.tileName}>{display.name}</Text>
                    <Text style={styles.tileHook} numberOfLines={3}>
                      {challengeTypeHook(id, display.description, t)}
                    </Text>
                  </Pressable>
                );
              })}
              {row.length === 1 ? <View style={styles.tileSpacer} /> : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorText: {
    fontSize: typography.sizes.md,
    color: colors.textMuted,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    paddingBottom: spacing[6],
  },
  heading: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing[2],
  },
  hint: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginBottom: spacing[5],
  },
  grid: {
    flexGrow: 1,
    gap: spacing[3],
  },
  gridRow: {
    flexGrow: 1,
    flexDirection: 'row',
    gap: spacing[3],
  },
  tile: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.xl,
    paddingVertical: spacing[5],
    paddingHorizontal: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  tileSpacer: {
    flex: 1,
  },
  disc: {
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  tileHook: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
