import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { VisitDocument } from '@kyuhachi/shared';
import { colors, spacing, typography, radii } from '@/theme';

const ICON_SIZE = 32;

interface VisitedBannerProps {
  visit: VisitDocument;
  onEdit: () => void;
}

/**
 * A full-width success banner that states, unmistakably, that this onsen is done.
 * It uses the bath-water blue from the map's visited pins, so the same colour that
 * means "visited" on the map means "visited" here. The logged visit details sit in
 * the plain card below; this banner owns the single edit affordance.
 */
export function VisitedBanner({ visit, onEdit }: VisitedBannerProps) {
  const { t, i18n } = useTranslation();
  const visitedOn = visit.visitedAt.toDate().toLocaleDateString(i18n.language);

  return (
    <View style={styles.banner}>
      <Ionicons name="checkmark-circle" size={ICON_SIZE} color={colors.textInverted} />
      <View style={styles.text}>
        <Text style={styles.title}>{t('onsenDetail.visitedBannerTitle')}</Text>
        <Text style={styles.subtitle}>
          {t('onsenDetail.visitedBannerSubtitle', { date: visitedOn })}
        </Text>
      </View>
      <Pressable
        style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]}
        onPress={onEdit}
        accessibilityRole="button"
        hitSlop={spacing[2]}
      >
        <Text style={styles.editLabel}>{t('onsenDetail.editDetails')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: radii.lg,
    backgroundColor: colors.onsenVisited,
    marginBottom: spacing[3],
  },
  text: {
    flex: 1,
  },
  title: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textInverted,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textInverted,
    marginTop: spacing[1],
    opacity: 0.9,
  },
  editButton: {
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[3],
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.textInverted,
  },
  editButtonPressed: {
    opacity: 0.7,
  },
  editLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textInverted,
  },
});
