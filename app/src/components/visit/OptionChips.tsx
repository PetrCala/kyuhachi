import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, typography, radii } from '@/theme';

export interface ChipOption {
  value: string;
  label: string;
}

interface OptionChipsProps {
  options: ChipOption[];
  value: string | null;
  onChange: (value: string | null) => void;
}

/** A row of single-select chips. Tapping the selected chip clears the value to
 *  null, so any optional field can be unset again. */
export function OptionChips({ options, value, onChange }: OptionChipsProps) {
  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            style={[styles.chip, selected && styles.chipSelected]}
            onPress={() => onChange(selected ? null : opt.value)}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[1],
    marginBottom: spacing[1],
  },
  chip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.background,
  },
  chipSelected: {
    backgroundColor: colors.actionPrimary,
    borderColor: colors.actionPrimary,
  },
  chipText: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
  },
  chipTextSelected: {
    color: colors.actionPrimaryText,
    fontWeight: typography.weights.medium,
  },
});
