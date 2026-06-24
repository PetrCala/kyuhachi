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
  writeBatch,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
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
import { compareRoutes, routeOrderUpdates } from '@/lib/route-order';
import { firebaseErrorKey } from '@/lib/firebase-errors';
import RowActionsButton from '@/components/RowActionsButton';
import RouteDrawLoader from '@/components/RouteDrawLoader';
import DraggableList, { type DragRowState } from '@/components/DraggableList';
import { colors, spacing, typography, radii, shadows } from '@/theme';

interface RouteRow {
  id: string;
  data: RouteDocument;
}

// Result of importing one picked file. Drives both the single-file alerts and
// the bulk-import tally.
type ImportOutcome =
  | { status: 'ok'; routeId: string; name: string; points: { lat: number; lng: number }[] }
  | { status: 'unsupported' }
  | { status: 'failed'; code: 'noTrack' | 'parse' | 'save' };

type ImportFailure = Exclude<ImportOutcome, { status: 'ok' }>;

const METERS_PER_KM = 1000;

// Keep the draw overlay up a touch longer than the animation so the line
// finishes before we navigate (the Firestore write is usually faster).
const ROUTE_DRAW_DWELL_MS = 1250;

// Card geometry (fixed, not part of the spacing scale): a uniform row height is
// what lets the drag-reorder math map a finger offset to a slot index. The card
// fills the top of each slot; the leftover (ROW_HEIGHT − CARD_HEIGHT) is the gap
// below it, sized to match the select-mode list's marginBottom (spacing[3]).
const CARD_HEIGHT = 76;
const ROW_HEIGHT = CARD_HEIGHT + spacing[3];
const HANDLE_ICON_SIZE = 24;

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
  // While a bulk import runs, tracks which file we're on so the button can show
  // "Importing 3 of 7…". Null for single-file imports.
  const [importProgress, setImportProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [selecting, setSelecting] = useState(false);
  // Locks the surrounding ScrollView while a route is being dragged so the page
  // doesn't scroll out from under the gesture.
  const [dragging, setDragging] = useState(false);
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

  // Manual order first (set by drag-reorder), then any unordered routes newest
  // first — a just-imported route has no sortOrder and a null serverTimestamp,
  // so it surfaces at the top until the user places it. See compareRoutes.
  const sorted = useMemo(() => {
    return [...routes].sort((a, b) =>
      compareRoutes(
        { sortOrder: a.data.sortOrder, createdAtMillis: a.data.createdAt?.toMillis() ?? null },
        { sortOrder: b.data.sortOrder, createdAtMillis: b.data.createdAt?.toMillis() ?? null }
      )
    );
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

  // Parse one picked file (route-import module) and store the simplified track.
  // Never throws: every failure is reported as an ImportOutcome so a bulk import
  // can keep going. Only parse / no-track failures are the file's fault —
  // file-read, Firestore-write, permission and network errors map to `save`, so
  // a `permission-denied` from the routes rule isn't mislabelled as corruption.
  async function importOne(
    asset: DocumentPicker.DocumentPickerAsset
  ): Promise<ImportOutcome> {
    if (!user) return { status: 'failed', code: 'save' };
    // gpx/kml/tcx have no standard MIME type, so accept any file and branch on extension.
    const format = sourceFormatFromName(asset.name);
    if (!format) return { status: 'unsupported' };
    try {
      const text = await new File(asset.uri).text();
      const parsed = parseRoute(text, format, nameWithoutExtension(asset.name));
      const ref = await addDoc(
        collection(db, COLLECTIONS.USERS, user.uid, SUBCOLLECTIONS.ROUTES),
        { ...parsed, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
      );
      return { status: 'ok', routeId: ref.id, name: parsed.name, points: parsed.points };
    } catch (error) {
      if (__DEV__) console.warn('[routes] import failed', error);
      if (error instanceof RouteImportError) return { status: 'failed', code: error.code };
      return { status: 'failed', code: 'save' };
    }
  }

  // The single-file alert message for a failed/unsupported import.
  function failureMessage(o: ImportFailure): string {
    if (o.status === 'unsupported') return t('routes.importErrorFormat');
    if (o.code === 'noTrack') return t('routes.importErrorNoTrack');
    if (o.code === 'save') return t('routes.importErrorSave');
    return t('routes.importErrorParse');
  }

  // Pick file(s) and import them. Select mode attaches exactly one route to the
  // challenge; normal mode allows bulk selection. A single file keeps its
  // original payoff (open it on the map, or show the exact reason it failed);
  // several files stay on the list — the live query already shows the new
  // routes — and report a tally.
  async function handleImport() {
    if (!user || importing) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: !selectMode,
      });
      if (result.canceled) return;
      const assets = result.assets;

      setImporting(true);

      if (selectMode) {
        const outcome = await importOne(assets[0]);
        if (outcome.status === 'ok') {
          await setChallengeRoute(outcome.routeId, {
            name: outcome.name,
            points: outcome.points,
          });
        } else {
          Alert.alert(t('routes.importErrorTitle'), failureMessage(outcome));
        }
        return;
      }

      let imported = 0;
      let unsupported = 0;
      let failed = 0;
      let firstRouteId: string | null = null;
      let lastFailure: ImportFailure | null = null;
      for (let i = 0; i < assets.length; i++) {
        setImportProgress({ done: i + 1, total: assets.length });
        const outcome = await importOne(assets[i]);
        if (outcome.status === 'ok') {
          imported++;
          if (!firstRouteId) firstRouteId = outcome.routeId;
        } else {
          if (outcome.status === 'unsupported') unsupported++;
          else failed++;
          lastFailure = outcome;
        }
      }

      // Single file behaves exactly as before: open it, or explain the failure.
      if (assets.length === 1) {
        if (firstRouteId) {
          router.push({ pathname: '/map', params: { routeId: firstRouteId } });
        } else if (lastFailure) {
          Alert.alert(t('routes.importErrorTitle'), failureMessage(lastFailure));
        }
        return;
      }

      const lines = [t('routes.importedCount', { count: imported, total: assets.length })];
      if (unsupported > 0) lines.push(t('routes.importSkippedCount', { count: unsupported }));
      if (failed > 0) lines.push(t('routes.importFailedCount', { count: failed }));
      Alert.alert(t('routes.importSummaryTitle'), lines.join('\n'));
    } catch (error) {
      // Safety net for the picker itself; per-file errors are handled in importOne.
      if (__DEV__) console.warn('[routes] import failed', error);
      Alert.alert(t('routes.importErrorTitle'), t('routes.importErrorSave'));
    } finally {
      setImporting(false);
      setImportProgress(null);
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

  // Persist a drag-reorder. Writes sortOrder = new index to only the routes
  // whose position actually changed, in one batch. Firestore's offline cache
  // applies it immediately, so the live query re-sorts to the same order the
  // user just dropped — no visible jump.
  async function persistOrder(orderedIds: string[]) {
    if (!user) return;
    const currentById = new Map(routes.map((r) => [r.id, r.data.sortOrder]));
    const updates = routeOrderUpdates(orderedIds, currentById);
    if (updates.length === 0) return;
    try {
      const batch = writeBatch(db);
      for (const { id, sortOrder } of updates) {
        batch.update(
          doc(db, COLLECTIONS.USERS, user.uid, SUBCOLLECTIONS.ROUTES, id),
          { sortOrder, updatedAt: serverTimestamp() }
        );
      }
      await batch.commit();
    } catch (error) {
      Alert.alert(t('routes.errorReorder'), t(firebaseErrorKey(error)));
    }
  }

  function metaLine(data: RouteDocument): string {
    if (data.distanceMeters != null) {
      const km = (data.distanceMeters / METERS_PER_KM).toFixed(1);
      return t('routes.metaWithDistance', { points: data.pointCount, km });
    }
    return t('routes.metaPointsOnly', { points: data.pointCount });
  }

  // One card surface, used in both modes. `drag` is present only in manage mode:
  // it carries the grab handle's gesture props and whether this row is in hand.
  function renderCard({ id, data }: RouteRow, drag?: DragRowState) {
    return (
      <View
        key={id}
        style={[
          styles.card,
          !drag && styles.cardSpaced,
          drag?.isActive && styles.cardActive,
          drag?.isActive && shadows.md,
        ]}
      >
        {drag && (
          <View
            style={styles.dragHandle}
            accessibilityRole="button"
            accessibilityLabel={t('routes.dragHandle')}
            {...drag.dragHandleProps}
          >
            <Ionicons name="reorder-three" size={HANDLE_ICON_SIZE} color={colors.textTertiary} />
          </View>
        )}
        <Pressable
          style={styles.cardMain}
          disabled={selecting}
          onPress={() =>
            selectMode
              ? setChallengeRoute(id, { name: data.name, points: data.points })
              : router.push({ pathname: '/map', params: { routeId: id } })
          }
        >
          <Text style={styles.cardName} numberOfLines={1}>
            {data.name}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {metaLine(data)}
          </Text>
        </Pressable>
        {/* Rename/delete are available in both modes: the ⋯ trigger is a separate
            hit target from the row's select/open Pressable, so it never competes
            with the primary tap. */}
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
    );
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
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        scrollEnabled={!dragging}
      >
        {selectMode ? (
          <Text style={styles.selectHint}>{t('routes.selectHint')}</Text>
        ) : (
          sorted.length > 1 && <Text style={styles.reorderHint}>{t('routes.reorderHint')}</Text>
        )}

        {sorted.length === 0 ? (
          <Text style={styles.empty}>{t('routes.empty')}</Text>
        ) : selectMode ? (
          // Picker: tap-to-select, no reordering (the picker is transient and a
          // challenge takes exactly one route).
          sorted.map((row) => renderCard(row))
        ) : (
          <DraggableList
            items={sorted}
            keyExtractor={(row) => row.id}
            rowHeight={ROW_HEIGHT}
            onOrderChange={persistOrder}
            onDraggingChange={setDragging}
            renderItem={renderCard}
          />
        )}

        <Pressable
          style={[styles.importButton, (importing || selecting) && styles.importButtonDisabled]}
          onPress={handleImport}
          disabled={importing || selecting}
        >
          <Text style={styles.importButtonText}>
            {!importing
              ? t('routes.import')
              : importProgress && importProgress.total > 1
                ? t('routes.importingProgress', {
                    done: importProgress.done,
                    total: importProgress.total,
                  })
                : t('routes.importing')}
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
  reorderHint: {
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
    // Fixed height (not vertical padding) so every drag slot is uniform; the
    // single-line name + meta sit comfortably within it.
    height: CARD_HEIGHT,
  },
  // Gap between cards in the select-mode flow list. In manage mode the spacing
  // is built into ROW_HEIGHT instead (the empty strip below each card).
  cardSpaced: {
    marginBottom: spacing[3],
  },
  // The row currently under the finger: lift it off the page.
  cardActive: {
    backgroundColor: colors.backgroundElevated,
    transform: [{ scale: 1.02 }],
  },
  dragHandle: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingRight: spacing[3],
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
