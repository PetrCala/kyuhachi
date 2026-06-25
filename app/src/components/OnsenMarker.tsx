import { memo, useCallback, type ElementRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker, Callout, CalloutSubview } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography, radii } from '@/theme';

interface OnsenMarkerProps {
  id: string;
  lat: number;
  lng: number;
  /** Onsen name — shown as the callout title (Firestore data, untranslated). */
  name: string;
  /** Area name — shown as the callout subtitle (Firestore data, untranslated). */
  areaName: string;
  /** Visited in the active challenge → bath-water-blue pin + "Visited ✓" state. */
  visited: boolean;
  /** Whether the user has an active challenge — gates the "Mark visited" action.
   *  When false, the check-in button is hidden entirely. */
  inChallenge: boolean;
  /** Registers this marker's imperative handle with the parent (keyed by id) so an
   *  arriving "Show on map" focus can pop the matching callout. Must be stable. */
  registerRef: (id: string, ref: ElementRef<typeof Marker> | null) => void;
  /** Opens Apple Maps directions to this onsen. Must be stable. */
  onDirections: (id: string) => void;
  /** Records a one-tap check-in for this onsen. Must be stable. */
  onMarkVisited: (id: string) => void;
  /** Opens the onsen detail screen. Must be stable. */
  onDetails: (id: string) => void;
}

/**
 * A single onsen pin on the map with an action-focused callout. Tapping the pin
 * pops a balloon showing the onsen's name/area and a row of quick actions —
 * Directions, Mark visited (when in a challenge and not yet visited), and
 * Details — so the user can act without leaving the map.
 *
 * iOS note: a native Apple Maps callout doesn't forward touches to ordinary
 * <Pressable>s nested in it; only <CalloutSubview> reliably reports inner taps.
 * Each action is therefore a <CalloutSubview> with its own onPress.
 *
 * Memoized so that the map screen's frequent re-renders — the zoom slider
 * streams the live camera altitude on every frame of a pinch or pan — do not
 * re-render or re-attach all ~155 markers each frame. Only markers whose own
 * props actually change (e.g. `visited` flips after a check-in) re-render. Props
 * are kept primitive and the callbacks stable so React.memo's shallow comparison
 * holds.
 */
function OnsenMarker({
  id,
  lat,
  lng,
  name,
  areaName,
  visited,
  inChallenge,
  registerRef,
  onDirections,
  onMarkVisited,
  onDetails,
}: OnsenMarkerProps) {
  const { t } = useTranslation();

  // Stable for this marker's lifetime (id never changes), so the underlying
  // Marker's ref isn't detached/re-attached on the rare re-render.
  const setRef = useCallback(
    (ref: ElementRef<typeof Marker> | null) => registerRef(id, ref),
    [id, registerRef]
  );
  const handleDirections = useCallback(() => onDirections(id), [id, onDirections]);
  const handleMarkVisited = useCallback(() => onMarkVisited(id), [id, onMarkVisited]);
  const handleDetails = useCallback(() => onDetails(id), [id, onDetails]);

  // Show the check-in action only when the user is in a challenge and this onsen
  // isn't already visited; once visited, the slot shows a "Visited ✓" state.
  const showMarkVisited = inChallenge && !visited;

  return (
    <Marker
      ref={setRef}
      coordinate={{ latitude: lat, longitude: lng }}
      pinColor={visited ? colors.onsenVisited : undefined}
    >
      <Callout tooltip>
        <View style={styles.callout}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {areaName}
            </Text>
          </View>
          <View style={styles.actions}>
            <CalloutSubview style={styles.action} onPress={handleDirections}>
              <Ionicons name="navigate" size={typography.sizes.xl} color={colors.actionPrimary} />
              <Text style={styles.actionLabel} numberOfLines={1}>
                {t('onsenDetail.getDirections')}
              </Text>
            </CalloutSubview>

            {showMarkVisited ? (
              <CalloutSubview style={styles.action} onPress={handleMarkVisited}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={typography.sizes.xl}
                  color={colors.actionPrimary}
                />
                <Text style={styles.actionLabel} numberOfLines={1}>
                  {t('onsenDetail.markVisited')}
                </Text>
              </CalloutSubview>
            ) : (
              inChallenge && (
                <View style={styles.action}>
                  <Ionicons
                    name="checkmark-circle"
                    size={typography.sizes.xl}
                    color={colors.onsenVisited}
                  />
                  <Text style={[styles.actionLabel, styles.visitedLabel]} numberOfLines={1}>
                    {t('onsenDetail.visited')}
                  </Text>
                </View>
              )
            )}

            <CalloutSubview style={styles.action} onPress={handleDetails}>
              <Ionicons
                name="information-circle-outline"
                size={typography.sizes.xl}
                color={colors.actionPrimary}
              />
              <Text style={styles.actionLabel} numberOfLines={1}>
                {t('onsenPreview.details')}
              </Text>
            </CalloutSubview>
          </View>
        </View>
      </Callout>
    </Marker>
  );
}

export default memo(OnsenMarker);

const styles = StyleSheet.create({
  // The tooltip balloon. `tooltip` callouts draw no native chrome, so this view
  // supplies the whole bubble: a rounded white card. A native callout has no
  // intrinsic width, so the bubble is given a fixed width wide enough to seat the
  // three action columns without truncating their labels.
  callout: {
    width: 240,
    backgroundColor: colors.background,
    borderRadius: radii.lg,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderColor: colors.separator,
  },
  header: {
    paddingBottom: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  title: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing[1],
  },
  actions: {
    flexDirection: 'row',
    paddingTop: spacing[2],
  },
  // Each action is an equal-width column: icon over a one-line label.
  action: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[1],
  },
  actionLabel: {
    marginTop: spacing[1],
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    color: colors.actionPrimary,
    textAlign: 'center',
  },
  // The already-visited state reuses the visited-pin blue for its label.
  visitedLabel: {
    color: colors.onsenVisited,
  },
});
