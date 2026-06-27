import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRowActionsSheet, type RowAction } from '@/components/RowActionsSheet';
import { colors, spacing } from '@/theme';

export type { RowAction };

// Fixed glyph size for the ⋯ trigger — a tap-target dimension, not part of the
// type scale (mirrors the geometry constants in RecordVisitFab).
const ICON_SIZE = 22;

interface RowActionsButtonProps {
  /** Spoken label for the ⋯ trigger — there is no visible text. */
  accessibilityLabel: string;
  /** Cancel row label (also what tapping the backdrop maps to). */
  cancelLabel: string;
  /** Optional sheet heading — typically the row's (untranslated) name. */
  title?: string;
  actions: RowAction[];
}

/**
 * A three-dot (⋯) row affordance that opens a bottom-sheet of per-item actions
 * (rename / delete / …). It is only the trigger: tapping it hands the actions to
 * the app-level {@link RowActionsSheetProvider}, which owns the single shared
 * sheet. The sheet must cover the whole screen, so it cannot live inside the
 * list row this button sits in — see that provider for why it is hosted at the
 * root and why we avoid the portal-based `BottomSheetModal`.
 */
export default function RowActionsButton({
  accessibilityLabel,
  cancelLabel,
  title,
  actions,
}: RowActionsButtonProps) {
  const { open } = useRowActionsSheet();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={spacing[2]}
      onPress={() => open({ title, cancelLabel, actions })}
      style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
    >
      <Ionicons name="ellipsis-horizontal" size={ICON_SIZE} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trigger: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  pressed: {
    opacity: 0.5,
  },
});
