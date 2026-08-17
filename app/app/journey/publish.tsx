/**
 * Publish a walked day to the public journey site, from the phone.
 *
 * The path that keeps the site current without the Strava API: export the day
 * from the watch's own app (COROS: activity, ⋯, Export Data, GPX), pick the file
 * here, and it is live. No laptop, and the same privacy trimming as every other
 * writer, which happens server-side in the publishJourneyDay callable.
 *
 * Reachable only by the journey uid: the row in the menu is gated and so is this
 * screen (Expo Router bundles every file under app/, so hiding the row is not
 * enough on its own; the redirect is what makes it unreachable). Both are UX
 * only. The real boundary is the callable's own uid check, since the uid is
 * readable in the app bundle and any account could call the function directly.
 */
import { useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { JOURNEY_UID, type PublishJourneyDayResponse } from '@kyuhachi/shared';
import { useAuth } from '@/context/AuthContext';
import { functions } from '@/firebase';
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

export default function PublishJourneyDay() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState<DayResult[]>([]);

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
  if (user?.uid !== JOURNEY_UID) return <Redirect href="/" />;

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

        {results.length > 0 && (
          <View style={styles.results}>
            <Text style={styles.resultsHeader}>{t('journeyPublish.resultsHeader')}</Text>
            {results.map(renderResult)}
          </View>
        )}
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
});
