/**
 * Publish a walked day to the public journey site, from the phone.
 *
 * The path that keeps the site current without the Strava API: export the day
 * from the watch's own app (COROS: activity, ⋯, Export Data, GPX), pick the file
 * here, and it is live. No laptop, and the same privacy trimming as every other
 * writer, which happens server-side in the publishJourneyDay callable.
 *
 * The screen also lists what is currently on the site and can delete a day, the
 * one repair republishing cannot make: the trim only covers each recording's
 * start and end, so a stop made mid-walk without stopping the watch goes out at
 * full fidelity and the document has to go away entirely.
 *
 * Reachable only by the journey uid: the row in the menu is gated and so is this
 * screen (Expo Router bundles every file under app/, so hiding the row is not
 * enough on its own; the redirect is what makes it unreachable). Both are UX
 * only. The real boundary is the callable's own uid check, since the uid is
 * readable in the app bundle and any account could call the function directly.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { httpsCallable } from '@react-native-firebase/functions';
import {
  collection,
  getDocs,
  orderBy,
  query,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import {
  COLLECTIONS,
  JOURNEY_UID,
  type DeleteJourneyDayRequest,
  type DeleteJourneyDayResponse,
  type JourneyDayDocument,
  type PublishJourneyDayResponse,
} from '@kyuhachi/shared';
import { useAuth } from '@/context/AuthContext';
import { db, functions } from '@/firebase';
import {
  parseTrack,
  sourceFormatFromName,
  RouteImportError,
} from '@/lib/route-import';
import { groupTracksByDay, type PickedTrack } from '@/lib/journey-publish';
import { firebaseErrorKey } from '@/lib/firebase-errors';
import { colors, spacing, typography, radii } from '@/theme';

const METERS_PER_KM = 1000;

/** One published (or failed) day, newest first, kept for the session only. */
type DayResult =
  | { status: 'ok'; date: string; km: string; replaced: boolean }
  | { status: 'failed'; date: string; message: string };

/** A day that is on the site right now, as read back from Firestore. */
interface PublishedDay {
  date: string;
  km: string;
}

export default function PublishJourneyDay() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState<DayResult[]>([]);
  // null while the first fetch is in flight, so the list can show a spinner
  // rather than claiming the site is empty.
  const [days, setDays] = useState<PublishedDay[] | null>(null);
  const [daysFailed, setDaysFailed] = useState(false);
  /** The date currently being deleted, which also serves as the busy flag. */
  const [deleting, setDeleting] = useState<string | null>(null);

  const isJourneyUser = user?.uid === JOURNEY_UID;

  /**
   * Read the published days back from Firestore, newest first. A one-shot get
   * rather than onSnapshot: this screen is the only thing that writes the
   * collection, so there is no third party to watch for, and the website reads
   * it the same way for the same reason.
   *
   * Reads of /journey_days are public in the rules, so this needs no auth beyond
   * the screen's own gate.
   */
  const loadDays = useCallback(async () => {
    try {
      const snap = await getDocs(
        query(collection(db, COLLECTIONS.JOURNEY_DAYS), orderBy('date', 'desc'))
      );
      setDays(
        snap.docs.map((docSnap: FirebaseFirestoreTypes.QueryDocumentSnapshot) => {
          const data = docSnap.data() as JourneyDayDocument;
          return {
            // The document id is what the delete callable takes, so key the row
            // on it rather than on the mirrored `date` field.
            date: docSnap.id,
            km: (data.distanceMeters / METERS_PER_KM).toFixed(1),
          };
        })
      );
      setDaysFailed(false);
    } catch (error) {
      if (__DEV__) console.warn('[journey] days fetch failed', error);
      setDays([]);
      setDaysFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!isJourneyUser) return;
    void loadDays();
  }, [isJourneyUser, loadDays]);

  // Deny by default. Waiting on `isLoading` first matters: `user` is null while
  // auth resolves, so a "redirect only when the uid mismatches" check would let
  // the form render for a moment on any account that deep-linked here, which
  // reads as a bug even though the callable would refuse the write.
  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: t('journeyPublish.title'), headerShown: true }} />
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      </>
    );
  }
  if (!isJourneyUser) return <Redirect href="/" />;

  /**
   * Read and parse one picked file. Returns null (and counts as unreadable) for
   * anything that is not a track file we can use, so one bad file in a batch
   * never aborts the rest.
   */
  async function readOne(
    asset: DocumentPicker.DocumentPickerAsset
  ): Promise<PickedTrack | { error: 'unsupported' | 'parse' }> {
    // gpx/kml/tcx have no standard MIME type, so accept any file and branch on extension.
    const format = sourceFormatFromName(asset.name);
    if (!format) return { error: 'unsupported' };
    try {
      const text = await new File(asset.uri).text();
      return { fileName: asset.name, track: parseTrack(text, format) };
    } catch (error) {
      if (__DEV__) console.warn('[journey] parse failed', error);
      if (error instanceof RouteImportError) return { error: 'parse' };
      return { error: 'parse' };
    }
  }

  /**
   * Pick track files, group them into days, and publish one call per day. Days
   * are independent: one failing day is reported and the others still land.
   */
  async function handlePublish() {
    if (publishing) return;
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (picked.canceled) return;

      setPublishing(true);

      const tracks: PickedTrack[] = [];
      let unreadable = 0;
      for (const asset of picked.assets) {
        const result = await readOne(asset);
        if ('error' in result) unreadable++;
        else tracks.push(result);
      }

      const { requests, undated } = groupTracksByDay(tracks);
      if (requests.length === 0) {
        Alert.alert(
          t('journeyPublish.errorTitle'),
          unreadable > 0 || undated.length > 0
            ? t('journeyPublish.errorNothingUsable')
            : t('journeyPublish.errorNoTrack')
        );
        return;
      }

      const published: DayResult[] = [];
      for (const request of requests) {
        try {
          const call = httpsCallable<typeof request, PublishJourneyDayResponse>(
            functions,
            'publishJourneyDay'
          );
          const { data } = await call(request);
          published.push({
            status: 'ok',
            date: data.date,
            km: (data.distanceMeters / METERS_PER_KM).toFixed(1),
            replaced: data.replaced,
          });
        } catch (error) {
          if (__DEV__) console.warn('[journey] publish failed', error);
          published.push({
            status: 'failed',
            date: request.date,
            message: t(firebaseErrorKey(error)),
          });
        }
      }

      // Newest run on top, so the last thing published is the first thing read.
      setResults((previous) => [...published.reverse(), ...previous]);
      // The list is server truth, so re-read it rather than patching it from
      // what this run believes it wrote.
      await loadDays();

      const skipped = unreadable + undated.length;
      if (skipped > 0) {
        Alert.alert(
          t('journeyPublish.skippedTitle'),
          t('journeyPublish.skippedMessage', { count: skipped })
        );
      }
    } catch (error) {
      // Safety net for the picker itself; per-file and per-day errors are handled above.
      if (__DEV__) console.warn('[journey] publish failed', error);
      Alert.alert(t('journeyPublish.errorTitle'), t('common.errorGeneric'));
    } finally {
      setPublishing(false);
    }
  }

  /**
   * Delete one published day. Naming the date in the confirm matters more than
   * usual here: the rows differ only by date, and a wrong tap takes a day off
   * the site with no undo other than publishing the track again.
   */
  function confirmDelete(date: string) {
    Alert.alert(
      t('journeyPublish.deleteTitle', { date }),
      t('journeyPublish.deleteMessage'),
      [
        { text: t('journeyPublish.cancel'), style: 'cancel' },
        {
          text: t('journeyPublish.deleteConfirm'),
          style: 'destructive',
          onPress: () => void handleDelete(date),
        },
      ]
    );
  }

  async function handleDelete(date: string) {
    if (deleting) return;
    setDeleting(date);
    try {
      const call = httpsCallable<DeleteJourneyDayRequest, DeleteJourneyDayResponse>(
        functions,
        'deleteJourneyDay'
      );
      const { data } = await call({ date });
      // The callable treats a missing document as success, so say so instead of
      // letting the row quietly vanish as if this delete had done the work.
      if (!data.existed) {
        Alert.alert(
          t('journeyPublish.deleteGoneTitle'),
          t('journeyPublish.deleteGoneMessage', { date })
        );
      }
      await loadDays();
    } catch (error) {
      if (__DEV__) console.warn('[journey] delete failed', error);
      Alert.alert(t('journeyPublish.deleteFailedTitle'), t(firebaseErrorKey(error)));
    } finally {
      setDeleting(null);
    }
  }

  function renderResult(result: DayResult, index: number) {
    const ok = result.status === 'ok';
    return (
      <View key={`${result.date}-${index}`} style={styles.resultRow}>
        <Ionicons
          name={ok ? 'checkmark-circle' : 'alert-circle'}
          size={typography.sizes.xl}
          color={ok ? colors.actionPrimary : colors.destructive}
          style={styles.resultIcon}
        />
        <View style={styles.resultText}>
          <Text style={styles.resultDate}>{result.date}</Text>
          <Text style={styles.resultMeta}>
            {result.status === 'ok'
              ? result.replaced
                ? t('journeyPublish.resultReplaced', { km: result.km })
                : t('journeyPublish.resultPublished', { km: result.km })
              : result.message}
          </Text>
        </View>
      </View>
    );
  }

  function renderDay(day: PublishedDay) {
    const busy = deleting === day.date;
    return (
      <View key={day.date} style={styles.resultRow}>
        <View style={styles.resultText}>
          <Text style={styles.resultDate}>{day.date}</Text>
          <Text style={styles.resultMeta}>
            {t('journeyPublish.dayDistance', { km: day.km })}
          </Text>
        </View>
        {busy ? (
          <ActivityIndicator />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('journeyPublish.a11yDelete', { date: day.date })}
            accessibilityState={{ disabled: deleting !== null }}
            style={styles.dayDelete}
            onPress={() => confirmDelete(day.date)}
            disabled={deleting !== null}
          >
            <Ionicons
              name="trash-outline"
              size={typography.sizes.xl}
              color={colors.destructive}
            />
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('journeyPublish.title'), headerShown: true }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.intro}>{t('journeyPublish.intro')}</Text>
        <Text style={styles.hint}>{t('journeyPublish.hint')}</Text>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: publishing, busy: publishing }}
          style={[styles.button, publishing && styles.buttonDisabled]}
          onPress={handlePublish}
          disabled={publishing}
        >
          <Text style={styles.buttonText}>
            {publishing ? t('journeyPublish.publishing') : t('journeyPublish.pick')}
          </Text>
        </Pressable>

        {/* Kept alongside the server-state list below: this panel is the only
            place per-day failures and trim skips are reported. */}
        {results.length > 0 && (
          <View style={styles.results}>
            <Text style={styles.resultsHeader}>{t('journeyPublish.resultsHeader')}</Text>
            {results.map(renderResult)}
          </View>
        )}

        <View style={styles.days}>
          <Text style={styles.resultsHeader}>{t('journeyPublish.daysHeader')}</Text>
          {days === null ? (
            <ActivityIndicator />
          ) : days.length === 0 ? (
            <Text style={styles.daysEmpty}>
              {t(daysFailed ? 'journeyPublish.daysFailed' : 'journeyPublish.daysEmpty')}
            </Text>
          ) : (
            days.map(renderDay)
          )}
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    paddingBottom: spacing[8],
  },
  intro: {
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
    marginBottom: spacing[3],
  },
  hint: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginBottom: spacing[5],
  },
  button: {
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.md,
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.actionPrimaryText,
  },
  results: {
    marginTop: spacing[6],
  },
  resultsHeader: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing[3],
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    marginBottom: spacing[2],
  },
  resultIcon: {
    marginRight: spacing[3],
  },
  resultText: {
    flex: 1,
  },
  resultDate: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing[1],
  },
  resultMeta: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  days: {
    marginTop: spacing[6],
  },
  daysEmpty: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  dayDelete: {
    // Padded out to a comfortable tap target: the icon alone is well under 44pt
    // and it sits at the edge of the row.
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    marginLeft: spacing[2],
  },
});
