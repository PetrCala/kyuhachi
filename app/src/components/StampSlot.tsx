import { View, StyleSheet } from 'react-native';
import OnsenIcon from '@/components/OnsenIcon';
import { colors, spacing, radii } from '@/theme';

interface StampSlotProps {
  /** Square edge length of the slot in points (matches Stamp). */
  size: number;
}

/**
 * An empty passport slot waiting to be stamped: a faint framed square with the
 * ♨ watermark and a blank date line, mirroring the printed slots in a physical
 * stamp book. Its footprint matches Stamp so stamped and empty cells align.
 */
export function StampSlot({ size }: StampSlotProps) {
  return (
    <View style={{ width: size }}>
      <View style={[styles.slot, { width: size, height: size }]}>
        {/* Glyph size is a runtime fraction of the slot: the allowed inline exception. */}
        <OnsenIcon color={colors.stampWatermark} size={Math.round(size * 0.4)} />
      </View>
      <View style={styles.dateRow}>
        <View style={styles.dateLine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    borderWidth: 1,
    borderColor: colors.stampFrame,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateRow: {
    height: spacing[5],
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateLine: {
    width: '70%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.stampFrame,
  },
});
