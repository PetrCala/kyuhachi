import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import type { RouteDocument } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS } from '@kyuhachi/shared';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/firebase';
import {
  parseRoute,
  sourceFormatFromName,
  nameWithoutExtension,
  RouteImportError,
} from '@/lib/route-import';
import { firebaseErrorKey } from '@/lib/firebase-errors';
import RowActionsButton from '@/components/RowActionsButton';
import RouteDrawLoader from '@/components/RouteDrawLoader';
import { colors, spacing, typography, radii } from '@/theme';

interface RouteRow {
  id: string;
  data: RouteDocument;
}

const METERS_PER_KM = 1000;

// Keep the draw overlay up a touch longer than the animation so the line
// finishes before we navigate (the Firestore write is usually faster).
const ROUTE_DRAW_DWELL_MS = 1250;

export default function RoutesList() {
  const { t } = useTranslation();
  const { user } = useAuth();
  // When opened with `selectFor`, the screen acts as a route picker for that
  // challenge: tapping a route sets it as the challenge's activeRouteId and
  // returns, instead of opening it on the map.
  const { selectFor } = useLocalSearchParams<{ selectFor?: string }>();
  const selectMode = !!selectFor;
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [drawing, setDrawing] = useState<{
    name: string;
    points: { lat: number; lng: number }[];
  } | null>(null);

  // Live subscription to the user's imported routes.
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      collection(db, COLLECTIONS.USERS, user.uid, SUBCOLLECTIONS.ROUTES),
      (snap: FirebaseFirestoreTypes.QuerySnapshot) => {
        setRoutes(
          snap.docs.map((d) => ({ id: d.id, data: d.data() as RouteDocument }))
        );
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsubscribe;
  }, [user]);

  // Newest first. A just-imported route has a null serverTimestamp until it syncs;
  // treat null as newest so it surfaces at the top immediately.
  const sorted = useMemo(() => {
    return [...routes].sort((a, b) => {
      const am = a.data.createdAt ? a.data.createdAt.toMillis() : Infinity;
      const bm = b.data.createdAt ? b.data.createdAt.toMillis() : Infinity;
      return bm - am;
    });
  }, [routes]);

  // Attach the active route on the challenge this picker was opened for, then
  // open it on the map. Cosmetic only — never touches completion logic.
  // Clearing a route lives on the challenge's route section, not here.
  async function setChallengeRoute(
    routeId: string,
    route?: { name: string; points: { lat: number; lng: number }[] }
  ) {
    // Re-entrancy guard: the write below goes through App Check + the network,
    // so it isn't instant. Without this, a second tap (or an import that also
    // selects) queues a second navigation that fires once the screen is gone.
    if (!user || !selectFor || selecting) return;
    setSelecting(true);
    // Show the route drawing itself in while the (optimistic, usually fast) write
    // resolves. Hold a minimum beat so the animation actually plays.
    const showDraw = !!route && route.points.length >= 2;
    if (showDraw && route) setDrawing(route);
    const minDwell = showDraw
      ? new Promise<void>((resolve) => setTimeout(resolve, ROUTE_DRAW_DWELL_MS))
      : Promise.resolve();
    try {
      await updateDoc(
        doc(db, COLLECTIONS.USERS, user.uid, SUBCOLLECTIONS.CHALLENGES, selectFor),
        { activeRouteId: routeId, updatedAt: serverTimestamp() }
      );
      await minDwell;
      // Land on the map showing the route the user just attached — the natural
      // payoff (and, for a fresh import, confirmation it parsed into a sensible
      // track). `replace` (not `back`) so this picker doesn't linger in the
      // stack behind the map tab; the routeId param renders it immediately.
      router.replace({ pathname: '/map', params: { routeId } });
    } catch (error) {
      setDrawing(null);
      Alert.alert(t('routes.errorAttach'), t(firebaseErrorKey(error)));
    } finally {
      setSelecting(false);
    }
  }

  // Import pipeline reused from PR 1: pick a file, parse it (route-import module),
  // store the simplified track. In normal mode open it on the map; in select mode
  // attach the freshly imported route to the challenge and return.
  async function handleImport() {
    if (!user || importing) return;
    try {
      // gpx/kml/tcx have no standard MIME type, so accept any file and branch on extension.
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      const format = sourceFormatFromName(asset.name);
      if (!format) {
        Alert.alert(t('routes.importErrorTitle'), t('routes.importErrorFormat'));
        return;
      }

      setImporting(true);
      const text = await new File(asset.uri).text();
      const parsed = parseRoute(text, format, nameWithoutExtension(asset.name));

      const ref = await addDoc(
        collection(db, COLLECTIONS.USERS, user.uid, SUBCOLLECTIONS.ROUTES),
        {
          ...parsed,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );

      if (selectMode) {
        await setChallengeRoute(ref.id, { name: parsed.name, points: parsed.points });
      } else {
        router.push({ pathname: '/map', params: { routeId: ref.id } });
      }
    } catch (error) {
      // Only parse / no-track failures are the file's fault. File-read,
      // Firestore-write, permission and network errors are not — don't
      // mislabel them as a corrupt-file error (which previously masked e.g.
      // a `permission-denied` from the routes security rule).
      if (__DEV__) console.warn('[routes] import failed', error);
      let message: string;
      if (!(error instanceof RouteImportError)) {
        message = t('routes.importErrorSave');
      } else if (error.code === 'noTrack') {
        message = t('routes.importErrorNoTrack');
      } else {
        message = t('routes.importErrorParse');
      }
      Alert.alert(t('routes.importErrorTitle'), message);
    } finally {
      setImporting(false);
    }
  }

  async function renameRoute(id: string, name: string) {
    if (!user) return;
    try {
      await updateDoc(
        doc(db, COLLECTIONS.USERS, user.uid, SUBCOLLECTIONS.ROUTES, id),
        { name, updatedAt: serverTimestamp() }
      );
    } catch (error) {
      Alert.alert(t('routes.errorRename'), t(firebaseErrorKey(error)));
    }
  }

  function promptRename(id: string, currentName: string) {
    Alert.prompt(
      t('routes.renameTitle'),
      t('routes.renameMessage'),
      [
        { text: t('routes.cancel'), style: 'cancel' },
        {
          text: t('routes.renameConfirm'),
          onPress: (value?: string) => {
            const name = value?.trim();
            if (name) renameRoute(id, name);
          },
        },
      ],
      'plain-text',
      currentName
    );
  }

  async function deleteRoute(id: string) {
    if (!user) return;
    try {
      await deleteDoc(doc(db, COLLECTIONS.USERS, user.uid, SUBCOLLECTIONS.ROUTES, id));
    } catch (error) {
      Alert.alert(t('routes.errorDelete'), t(firebaseErrorKey(error)));
    }
  }

  function confirmDelete(id: string, name: string) {
    Alert.alert(t('routes.deleteTitle'), t('routes.deleteMessage', { name }), [
      { text: t('routes.cancel'), style: 'cancel' },
      {
        text: t('routes.deleteConfirm'),
        style: 'destructive',
        onPress: () => deleteRoute(id),
      },
    ]);
  }

  function metaLine(data: RouteDocument): string {
    if (data.distanceMeters != null) {
      const km = (data.distanceMeters / METERS_PER_KM).toFixed(1);
      return t('routes.metaWithDistance', { points: data.pointCount, km });
    }
    return t('routes.metaPointsOnly', { points: data.pointCount });
  }

  const title = selectMode ? t('routes.selectTitle') : t('routes.title');

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title, headerShown: true }} />
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title, headerShown: true }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {selectMode && <Text style={styles.selectHint}>{t('routes.selectHint')}</Text>}

        {sorted.length === 0 ? (
          <Text style={styles.empty}>{t('routes.empty')}</Text>
        ) : (
          sorted.map(({ id, data }) => (
            <View key={id} style={styles.card}>
              <Pressable
                style={styles.cardMain}
                disabled={selecting}
                onPress={() =>
                  selectMode
                    ? setChallengeRoute(id, { name: data.name, points: data.points })
                    : router.push({ pathname: '/map', params: { routeId: id } })
                }
              >
                <Text style={styles.cardName}>{data.name}</Text>
                <Text style={styles.cardMeta}>{metaLine(data)}</Text>
              </Pressable>
              {/* Rename/delete are available in both modes: the ⋯ trigger is a
                  separate hit target from the row's select/open Pressable, so it
                  never competes with the primary tap. */}
              <RowActionsButton
                accessibilityLabel={t('routes.moreActions')}
                title={data.name}
                cancelLabel={t('routes.cancel')}
                actions={[
                  { label: t('routes.rename'), onPress: () => promptRename(id, data.name) },
                  {
                    label: t('routes.delete'),
                    destructive: true,
                    onPress: () => confirmDelete(id, data.name),
                  },
                ]}
              />
            </View>
          ))
        )}

        <Pressable
          style={[styles.importButton, (importing || selecting) && styles.importButtonDisabled]}
          onPress={handleImport}
          disabled={importing || selecting}
        >
          <Text style={styles.importButtonText}>
            {importing ? t('routes.importing') : t('routes.import')}
          </Text>
        </Pressable>
      </ScrollView>
      {drawing && <RouteDrawLoader name={drawing.name} points={drawing.points} />}
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    paddingBottom: spacing[8],
  },
  selectHint: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginBottom: spacing[4],
  },
  importButton: {
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.md,
    paddingVertical: spacing[4],
    alignItems: 'center',
    marginTop: spacing[4],
  },
  importButtonDisabled: {
    opacity: 0.6,
  },
  importButtonText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.actionPrimaryText,
  },
  empty: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing[6],
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    marginBottom: spacing[3],
  },
  cardMain: {
    flex: 1,
    marginRight: spacing[3],
  },
  cardName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing[1],
  },
  cardMeta: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
});
