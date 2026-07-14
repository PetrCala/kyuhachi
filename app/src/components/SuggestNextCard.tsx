import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import type { RouteDocument } from '@kyuhachi/shared';
import { usePreferences } from '@/context/PreferencesContext';
import { simulatedCoordinate } from '@/lib/dev-location';
import { selectNearest, type NextOnsenCandidate } from '@/lib/next-onsen';
import { onsenReading } from '@/lib/onsen-name';
import { colors, spacing, typography, radii } from '@/theme';

// How many of the closest unvisited onsens the card lists. Three gives the user
// a choice (the very nearest might be closed today) without crowding the home screen.
const SUGGESTION_COUNT = 3;

interface SuggestNextCardProps {
  /** Eligible, not-yet-visited onsens for the active challenge, with coordinates. */
  candidates: NextOnsenCandidate[];
  /** The challenge's active route; seeds the dev-only simulated location. */
  activeRoute: RouteDocument | null;
}

/**
 * "Nearest unvisited": the closest eligible onsens the user still needs, ranked
 * by current location. Tapping one opens its detail screen, where Call and
 * Directions live: closing the plan to travel loop from the home dashboard.
 *
 * Unlike the onsen list's "Near you" section, this ignores the nearby-radius
 * preference: it always surfaces the nearest target even when that's far away,
 * because the question here is "where next?", not "what's within walking range?".
 */
export function SuggestNextCard({ candidates, activeRoute }: SuggestNextCardProps) {
  const { t, i18n } = useTranslation();
  const { showReadings } = usePreferences();
  const [deviceCoords, setDeviceCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [denied, setDenied] = useState(false);

  const fetchPosition = useCallback(async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setDeviceCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      // No fix available; the card stays hidden rather than nagging.
    }
  }, []);

  // Ask for location once there's something to suggest. A denial just flips the
  // card to its "enable location" prompt; we never bounce the user to Settings
  // unprompted; that only happens if they tap Enable and the OS won't ask again.
  useEffect(() => {
    if (__DEV__ || candidates.length === 0) return;
    let cancelled = false;
    (async () => {
      let granted = false;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        granted = status === 'granted';
      } catch {
        granted = false;
      }
      if (cancelled) return;
      if (!granted) {
        setDenied(true);
        return;
      }
      setDenied(false);
      await fetchPosition();
    })();
    return () => {
      cancelled = true;
    };
  }, [candidates.length, fetchPosition]);

  const onEnablePress = useCallback(async () => {
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      setDenied(false);
      await fetchPosition();
    } else if (!canAskAgain) {
      // The OS won't prompt again; send the user to the app's Settings page.
      await Linking.openSettings();
    }
  }, [fetchPosition]);

  // Real device location in production; a fixed Kyushu spot in dev so the card
  // can be exercised away from Japan (mirrors the onsen list + map screens).
  const origin = useMemo<{ lat: number; lng: number } | null>(() => {
    if (candidates.length === 0) return null;
    if (__DEV__) {
      const sim = simulatedCoordinate(
        activeRoute,
        candidates.map((c) => ({ lat: c.lat, lng: c.lng }))
      );
      return { lat: sim.latitude, lng: sim.longitude };
    }
    return deviceCoords;
  }, [candidates, activeRoute, deviceCoords]);

  const nearest = useMemo(
    () => (origin ? selectNearest(origin, candidates, SUGGESTION_COUNT) : []),
    [origin, candidates]
  );

  // Shared fallback CTA. Used when there's nothing to rank by location: either
  // the challenge is complete (no candidates) or the user declined location,
  // so the card never collapses to nothing as the home screen's lead block.
  const browseFallback = (
    <Pressable
      style={styles.browseButton}
      onPress={() => router.push('/(tabs)/onsens')}
      accessibilityRole="button"
    >
      <Text style={styles.browseButtonText}>{t('home.suggestNext.browseOnsens')}</Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );

  // Nothing eligible left to suggest (challenge complete, or all visited). Offer
  // a way into the full onsen list rather than vanishing from the top of home.
  if (candidates.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.heading}>{t('home.suggestNext.heading')}</Text>
        {browseFallback}
      </View>
    );
  }

  // Permission denied and no location yet: invite the user to turn it on, but
  // still offer the browse path so a refusal doesn't dead-end the lead block.
  if (denied && !deviceCoords) {
    return (
      <View style={styles.card}>
        <Text style={styles.heading}>{t('home.suggestNext.heading')}</Text>
        <Text style={styles.prompt}>{t('home.suggestNext.locationPrompt')}</Text>
        <Pressable style={styles.enableButton} onPress={onEnablePress} accessibilityRole="button">
          <Text style={styles.enableButtonText}>{t('home.suggestNext.enableLocation')}</Text>
        </Pressable>
        {browseFallback}
      </View>
    );
  }

  // Location still resolving (or no fix yet): render nothing to avoid a flash.
  if (nearest.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>{t('home.suggestNext.heading')}</Text>
      {nearest.map((onsen) => {
        const reading = onsenReading({
          nameRomaji: onsen.nameRomaji,
          nameKana: onsen.nameKana,
          language: i18n.language,
          showReadings,
        });
        return (
        <Pressable
          key={onsen.id}
          style={styles.row}
          onPress={() => router.push(`/onsens/${onsen.id}`)}
          accessibilityRole="button"
        >
          <View style={styles.rowText}>
            <Text style={styles.rowName} numberOfLines={1}>
              {onsen.name}
            </Text>
            {reading ? (
              <Text style={styles.rowReading} numberOfLines={1}>
                {reading}
              </Text>
            ) : null}
            <Text style={styles.rowArea} numberOfLines={1}>
              {onsen.areaName}　{onsen.prefecture}
            </Text>
          </View>
          <Text style={styles.rowDistance}>
            {t('onsenList.distanceKm', { km: onsen.distanceKm.toFixed(1) })}
          </Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[5],
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  heading: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textMuted,
    marginBottom: spacing[3],
  },
  prompt: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: spacing[3],
  },
  enableButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: radii.full,
    backgroundColor: colors.backgroundSecondary,
  },
  enableButtonText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.actionPrimary,
  },
  browseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing[1],
    marginTop: spacing[2],
  },
  browseButtonText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.actionPrimary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
  },
  rowText: {
    flex: 1,
    marginRight: spacing[3],
  },
  rowName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  // Reading under the name (romaji or kana by UI language); omitted when none.
  rowReading: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing[1],
  },
  rowArea: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing[1],
  },
  rowDistance: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginRight: spacing[2],
  },
  chevron: {
    fontSize: typography.sizes.xl,
    color: colors.textPlaceholder,
  },
});
