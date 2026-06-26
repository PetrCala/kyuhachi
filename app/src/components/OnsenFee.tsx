import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatYen } from '@/lib/budget';
import { OnsenInfoRow } from '@/components/OnsenInfoRow';
import { colors, spacing, typography } from '@/theme';

interface OnsenFeeProps {
  /** Raw admission-fee text from 88onsen.com — the "original" breakdown / fallback. */
  admissionFee: string | null;
  /** Parsed adult weekday walk-in fee in yen, or null when no individual fee parsed. */
  adultFee: number | null;
}

/**
 * The admission-fee block shared by the onsen detail screen and the map-pin preview
 * sheet, so both render the fee the same way.
 *
 * When a single adult fee parsed out (`adultFee`), it shows that one clean figure
 * with an inline "details" toggle — mirroring the hours block's "today" line — that
 * reveals the verbatim source text (other rates, weekend/holiday pricing, etc.) only
 * on demand, so the collapsed row stays one line. Without a parsed fee it falls back
 * to the verbatim text, exactly like `OnsenHours` falls back to its raw string.
 */
export function OnsenFee({ admissionFee, adultFee }: OnsenFeeProps) {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);

  // No parsed fee: render the verbatim text as a plain row (or nothing).
  if (adultFee == null) {
    return admissionFee ? (
      <OnsenInfoRow label={t('onsenDetail.labelFee')} value={admissionFee} />
    ) : null;
  }

  return (
    <>
      <View style={styles.feeRow}>
        <Text style={styles.feeLabel} selectable>
          {t('onsenDetail.labelFee')}
        </Text>
        <Text style={styles.feeValue} selectable>
          {t('onsenDetail.feeAdult', { amount: formatYen(adultFee) })}
        </Text>
        {/* Reveal the verbatim text for the full rate breakdown, on demand. */}
        {admissionFee && (
          <Pressable
            style={styles.feeDetails}
            onPress={() => setShowDetails((v) => !v)}
            accessibilityRole="button"
            hitSlop={spacing[1]}
          >
            <Text style={styles.feeDetailsText}>{t('onsenDetail.feeDetails')}</Text>
            <Ionicons
              name={showDetails ? 'chevron-up' : 'chevron-down'}
              size={typography.sizes.sm}
              color={colors.actionPrimary}
            />
          </Pressable>
        )}
      </View>
      {showDetails && admissionFee && (
        <Text style={styles.feeRaw} selectable>
          {admissionFee}
        </Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[2],
  },
  feeLabel: {
    width: spacing[12] + spacing[8],
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    flexShrink: 0,
  },
  feeValue: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    lineHeight: typography.sizes.xl,
  },
  feeDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1] / 2,
    marginLeft: spacing[2],
  },
  feeDetailsText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.actionPrimary,
  },
  feeRaw: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    lineHeight: typography.sizes.xl,
    paddingBottom: spacing[2],
  },
});
