import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, router } from 'expo-router';
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
import { useActiveChallengeRoute } from '@/hooks/useActiveChallengeRoute';
import RowActionsButton, { type RowAction } from '@/components/RowActionsButton';
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
// below it.
const CARD_HEIGHT = 76;
const ROW_HEIGHT = CARD_HEIGHT + spacing[3];
const HANDLE_ICON_SIZE = 24;

export default function RoutesList() {
  const { t } = useTranslation();
  const { user } = useAuth();
  // The active/default challenge and its attached route, so each route's ⋯ menu
  // can offer "Use in challenge" / "Remove from challenge".
  const { challengeId, activeRouteId } = useActiveChallengeRoute();
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  // While a bulk import runs, tracks which file we're on so the button can show
  // "Importing 3 of 7…". Null for single-file imports.
  const [importProgress, setImportProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  // Locks the surrounding ScrollView while a route is being dragged so the page
  // doesn't scroll out from under the gesture.
  const [dragging, setDragging] = useState(false);
  // The route whose SVG preview is currently playing (tap-to-open). Null = none.
  const [drawing, setDrawing] = useState<{
    name: string;
    points: { lat: number; lng: number }[];
  } | null>(null);
  // Tap-to-preview plumbing: the pending route to open, a run-once guard so the
  // dwell timer and a skip tap can't both navigate, and the dwell timer handle.
  const pendingRouteId = useRef<string | null>(null);
  const navigated = useRef(false);
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards the ⋯-menu attach/remove write against a double-fire.
  const attaching = useRef(false);

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

  // Clear the dwell timer if the screen unmounts mid-preview.
  useEffect(() => {
    return () => {
      if (dwellTimer.current) clearTimeout(dwellTimer.current);
    };
  }, []);

  // Open the pending route on the map. Run-once: whichever fires first — the
  // dwell timer or a skip tap on the overlay — navigates; the other is a no-op.
  function goToMap() {
    if (navigated.current) return;
    const routeId = pendingRouteId.current;
    if (!routeId) return;
    navigated.current = true;
    if (dwellTimer.current) {
      clearTimeout(dwellTimer.current);
      dwellTimer.current = null;
    }
    setDrawing(null);
    // `push` (not `replace`): this is the routes list, not a transient picker —
    // Back should return here. The routeId param renders the route immediately.
    router.push({ pathname: '/map', params: { routeId } });
  }

  // Tapping a route is the one gesture: it uses the route in the active
  // challenge (if any), plays its SVG preview, then lands on the map showing it.
  // The select is an optimistic, offline-safe write fired in parallel so it
  // never blocks the preview; it's skipped when the route is already the active
  // one. The draw is skippable (tap the overlay) so browsing isn't forced to
  // wait out the animation.
  function selectAndPreview(routeId: string, route: { name: string; points: { lat: number; lng: number }[] }) {
    if (drawing) return; // a preview is already playing
    if (challengeId && routeId !== activeRouteId) void applyChallengeRoute(routeId);
    pendingRouteId.current = routeId;
    navigated.current = false;
    // Degenerate tracks have nothing to draw — skip straight to the map.
    if (route.points.length < 2) {
      goToMap();
      return;
    }
    setDrawing({ name: route.name, points: route.points });
    dwellTimer.current = setTimeout(goToMap, ROUTE_DRAW_DWELL_MS);
  }

  // Attach this route to the active challenge (or detach it). Used by tapping
  // (attach) and the active route's ⋯ "Remove from challenge" (detach). Cosmetic
  // only — never touches completion logic. Silent on success (the live challenge
  // subscription flips the badge/menu); the offline cache reflects it immediately.
  async function applyChallengeRoute(nextActiveRouteId: string | null) {
    if (!user || !challengeId || attaching.current) return;
    attaching.current = true;
    try {
      await updateDoc(
        doc(db, COLLECTIONS.USERS, user.uid, SUBCOLLECTIONS.CHALLENGES, challengeId),
        { activeRouteId: nextActiveRouteId, updatedAt: serverTimestamp() }
      );
    } catch (error) {
      Alert.alert(t('routes.errorAttach'), t(firebaseErrorKey(error)));
    } finally {
      attaching.current = false;
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

  // Pick file(s) and import them (bulk selection allowed). A single file keeps
  // its payoff — open it on the map, or show the exact reason it failed; several
  // files stay on the list (the live query already shows the new routes) and
  // report a tally.
  async function handleImport() {
    if (!user || importing) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) return;
      const assets = result.assets;

      setImporting(true);

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

  // One route card. `drag` carries the grab handle's gesture props and whether
  // this row is the one in hand.
  function renderCard({ id, data }: RouteRow, drag: DragRowState) {
    // The route in use by the active challenge gets the "Active" badge and a
    // ⋯ action to remove it. Selecting a route is done by tapping it, so there's
    // no "use in challenge" action — only the detach for the one already in use.
    const isActiveRoute = challengeId != null && id === activeRouteId;
    const actions: RowAction[] = [
      ...(isActiveRoute
        ? [{ label: t('routes.removeFromChallenge'), onPress: () => applyChallengeRoute(null) }]
        : []),
      { label: t('routes.rename'), onPress: () => promptRename(id, data.name) },
      {
        label: t('routes.delete'),
        destructive: true,
        onPress: () => confirmDelete(id, data.name),
      },
    ];
    return (
      <View
        key={id}
        style={[styles.card, drag.isActive && styles.cardActive, drag.isActive && shadows.md]}
      >
        <View
          style={styles.dragHandle}
          accessibilityRole="button"
          accessibilityLabel={t('routes.dragHandle')}
          {...drag.dragHandleProps}
        >
          <Ionicons name="reorder-three" size={HANDLE_ICON_SIZE} color={colors.textTertiary} />
        </View>
        <Pressable
          style={styles.cardMain}
          disabled={drawing != null}
          onPress={() => selectAndPreview(id, { name: data.name, points: data.points })}
        >
          <Text style={styles.cardName} numberOfLines={1}>
            {data.name}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {metaLine(data)}
          </Text>
        </Pressable>
        {isActiveRoute && <Text style={styles.activeBadge}>{t('routes.activeBadge')}</Text>}
        <RowActionsButton
          accessibilityLabel={t('routes.moreActions')}
          title={data.name}
          cancelLabel={t('routes.cancel')}
          actions={actions}
        />
      </View>
    );
  }

  const title = t('routes.title');

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
        {challengeId != null && sorted.length > 0 && (
          <Text style={styles.tapHint}>{t('routes.tapHint')}</Text>
        )}
        {sorted.length > 1 && <Text style={styles.reorderHint}>{t('routes.reorderHint')}</Text>}

        {sorted.length === 0 ? (
          <Text style={styles.empty}>{t('routes.empty')}</Text>
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
          style={[styles.importButton, importing && styles.importButtonDisabled]}
          onPress={handleImport}
          disabled={importing}
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
      {drawing && (
        <RouteDrawLoader name={drawing.name} points={drawing.points} onSkip={goToMap} />
      )}
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
  tapHint: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginBottom: spacing[2],
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
  // "Active" pill on the route in use by the active challenge — mirrors the
  // default-challenge badge in the challenge list.
  activeBadge: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.actionPrimaryText,
    backgroundColor: colors.actionPrimary,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radii.full,
    overflow: 'hidden',
    marginRight: spacing[2],
  },
});
