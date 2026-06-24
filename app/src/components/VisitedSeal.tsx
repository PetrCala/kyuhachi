import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { VisitDocument } from '@kyuhachi/shared';
import OnsenIcon from '@/components/OnsenIcon';
import { colors, spacing, typography, radii } from '@/theme';

// Fixed seal geometry. The ring sizes are intrinsic to the stamp motif, not part
// of the spacing scale.
const SEAL_SIZE = 64;
const GLYPH_SIZE = 30;
const CHECK_SIZE = 20;

interface VisitedSealProps {
  visit: VisitDocument;
}

/**
 * A rubber-stamp "visited" seal, echoing the passport / stamp-book feel of the
 * 88-onsen challenge. The inked ring carries the hot-spring glyph with a check,
 * and a tear-off label states the day it was stamped. It reads at a glance as
 * "you've completed this onsen" — the detail card sits below it untouched.
 */
export function VisitedSeal({ visit }: VisitedSealProps) {
  const { t, i18n } = useTranslation();
  const stampedOn = visit.visitedAt.toDate().toLocaleDateString(i18n.language);

  return (
    <View style={styles.frame}>
      <View style={styles.seal}>
        <OnsenIcon color={colors.stampInk} size={GLYPH_SIZE} />
        <View style={styles.check}>
          <Ionicons name="checkmark-sharp" size={CHECK_SIZE} color={colors.stampInk} />
        </View>
      </View>
      <View style={styles.label}>
        <Text style={styles.title}>{t('onsenDetail.visitedSeal')}</Text>
        <Text style={styles.date}>{t('onsenDetail.visitedOn', { date: stampedOn })}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    padding: spacing[4],
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.stampFrame,
    backgroundColor: colors.stampWatermark,
    borderStyle: 'dashed',
    marginBottom: spacing[3],
  },
  seal: {
    width: SEAL_SIZE,
    height: SEAL_SIZE,
    borderRadius: radii.full,
    borderWidth: 3,
    borderColor: colors.stampInk,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  check: {
    position: 'absolute',
    right: -spacing[1],
    bottom: -spacing[1],
    borderRadius: radii.full,
    backgroundColor: colors.background,
  },
  label: {
    flex: 1,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    letterSpacing: 2,
    color: colors.stampInk,
    textTransform: 'uppercase',
  },
  date: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    marginTop: spacing[1],
  },
});
