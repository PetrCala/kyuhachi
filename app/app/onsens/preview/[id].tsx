import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, onSnapshot, type FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import type { OnsenDocument } from '@kyuhachi/shared';
import { COLLECTIONS } from '@kyuhachi/shared';
import { OnsenInfoRow } from '@/components/OnsenInfoRow';
import { OnsenHours } from '@/components/OnsenHours';
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import { db } from '@/firebase';
import { colors, radii, spacing, typography } from '@/theme';

type OnsenWithId = OnsenDocument & { id: string };

// Hero image height — the image-forward focal point of the sheet.
const HERO_HEIGHT = 200;
// Glyph size for the placeholder mark when an onsen has no photo; a layout
// dimension, not part of the type scale.
const PLACEHOLDER_GLYPH = 56;

/**
 * Image-forward onsen preview, presented as a native iOS page sheet (registered
 * as a `pageSheet` route in the root layout). A large hero image (or a themed
 * placeholder) anchors the top with the name overlaid on a scrim; below it a
 * scrollable info area mirrors the detail screen's rows, and a pinned CTA opens
 * the full detail screen.
 *
 * The native page sheet is edge-to-edge and bottom-pinned, supplying its own
 * rounded top corners, dim backdrop, and swipe-to-dismiss (with scroll/drag
 * coordination), so this route only renders content. The selected onsen is
 * re-fetched by id from Firestore — offline persistence serves it from cache
 * instantly (the map already subscribed to the same collection), so opening is
 * effectively immediate.
 */
export default function OnsenPreviewScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  // kyuhachiIds visited in the active challenge — drives the "visited" badge.
  const { visitedIds } = useActiveChallengeProgress();
  const [onsen, setOnsen] = useState<OnsenWithId | null>(null);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = onSnapshot(
      doc(db, COLLECTIONS.ONSENS, id),
      (snapshot: FirebaseFirestoreTypes.DocumentSnapshot) => {
        setOnsen(
          snapshot.exists() ? { id: snapshot.id, ...(snapshot.data() as OnsenDocument) } : null
        );
      },
      () => setOnsen(null)
    );
    return unsubscribe;
  }, [id]);

  const visited = onsen ? visitedIds.has(onsen.id) : false;

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        {onsen?.imageUrl ? (
          <Image
            source={onsen.imageUrl}
            style={styles.heroImage}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
            placeholder={onsen.blurhash ? { blurhash: onsen.blurhash } : undefined}
            placeholderContentFit="cover"
          />
        ) : (
          <View style={styles.heroPlaceholder}>
            <Ionicons
              name="image-outline"
              size={PLACEHOLDER_GLYPH}
              color={colors.textMuted}
              accessibilityLabel={t('onsenPreview.imagePlaceholder')}
            />
          </View>
        )}
        <View style={styles.heroScrim} pointerEvents="none" />
        {onsen && (
          <Text style={styles.heroName} numberOfLines={2}>
            {onsen.name}
          </Text>
        )}
      </View>

      {onsen && (
        <>
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.subheader}>
              <Text style={styles.area} selectable>
                {t('onsenPreview.areaPrefecture', {
                  area: onsen.areaName,
                  prefecture: onsen.prefecture,
                })}
              </Text>
              {visited && (
                <View style={styles.visitedBadge}>
                  <Text style={styles.visitedText}>{t('onsenPreview.visited')}</Text>
                  <Ionicons
                    name="checkmark-circle"
                    size={typography.sizes.md}
                    color={colors.stampInk}
                  />
                </View>
              )}
            </View>

            <View style={styles.section}>
              <OnsenInfoRow
                label={t('onsenDetail.labelAddress')}
                value={onsen.address}
                action={{
                  icon: 'navigate',
                  onPress: () =>
                    Linking.openURL(`https://maps.apple.com/?daddr=${onsen.lat},${onsen.lng}`),
                  accessibilityLabel: t('onsenDetail.getDirections'),
                }}
              />
              {onsen.admissionFee && (
                <OnsenInfoRow label={t('onsenDetail.labelFee')} value={onsen.admissionFee} />
              )}
              {onsen.springQuality && (
                <OnsenInfoRow
                  label={t('onsenDetail.labelSpringQuality')}
                  value={onsen.springQuality}
                />
              )}
              {onsen.businessHours && <OnsenHours hours={onsen.businessHours} />}
            </View>
          </ScrollView>

          <Pressable
            style={({ pressed }) => [
              styles.cta,
              { marginBottom: insets.bottom + spacing[4] },
              pressed && styles.ctaPressed,
            ]}
            onPress={() => router.push(`/onsens/${onsen.id}`)}
            accessibilityRole="button"
            accessibilityLabel={t('onsenPreview.viewFullDetails')}
          >
            <Text style={styles.ctaText}>{t('onsenPreview.viewFullDetails')}</Text>
            <Ionicons
              name="chevron-forward"
              size={typography.sizes.md}
              color={colors.actionPrimaryText}
            />
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    // No top-corner rounding here: the native page sheet supplies its own
    // rounded top corners and clips this content to them. Rounding again with a
    // different radius would leave slivers of sheet background at the corners.
  },
  hero: {
    height: HERO_HEIGHT,
    justifyContent: 'flex-end',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    backgroundColor: colors.backgroundSecondary,
  },
  // Themed block standing in for a missing photo so the layout still reads as
  // image-forward.
  heroPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Bottom-up dark band stand-in so the overlaid name stays legible over any
  // image. A solid translucent band rather than a true gradient (no gradient lib).
  heroScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: HERO_HEIGHT / 2,
    backgroundColor: colors.overlay,
  },
  heroName: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.textInverted,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  subheader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  area: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  visitedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginLeft: spacing[2],
  },
  visitedText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    // Dark seal ink — matches the "visited" stamp on the onsen detail screen.
    color: colors.stampInk,
  },
  section: {
    paddingTop: spacing[2],
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    marginHorizontal: spacing[4],
    marginTop: spacing[3],
    paddingVertical: spacing[4],
    borderRadius: radii.md,
    backgroundColor: colors.actionPrimary,
  },
  ctaPressed: {
    opacity: 0.85,
  },
  ctaText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.actionPrimaryText,
  },
});
