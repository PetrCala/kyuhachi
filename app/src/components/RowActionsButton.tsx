import { Pressable, StyleSheet, ActionSheetIOS } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';

// Fixed glyph size for the ⋯ trigger — a tap-target dimension, not part of the
// type scale (mirrors the geometry constants in RecordVisitFab).
const ICON_SIZE = 22;

export interface RowAction {
  /** Visible label in the action sheet. */
  label: string;
  onPress: () => void;
  /** Renders the option in the native destructive (red) style. */
  destructive?: boolean;
}

interface RowActionsButtonProps {
  /** Spoken label for the ⋯ trigger — there is no visible text. */
  accessibilityLabel: string;
  /** Cancel row label (also what dismissing the sheet maps to). */
  cancelLabel: string;
  /** Optional sheet heading — typically the row's (untranslated) name. */
  title?: string;
  actions: RowAction[];
}

/**
 * A three-dot (⋯) row affordance that opens the native iOS action sheet for
 * per-item actions (rename / delete / …). iOS-only by design — this app does
 * not target Android, so `ActionSheetIOS` is used directly with no fallback.
 */
export default function RowActionsButton({
  accessibilityLabel,
  cancelLabel,
  title,
  actions,
}: RowActionsButtonProps) {
  function open() {
    const labels = actions.map((a) => a.label);
    const cancelButtonIndex = labels.length;
    const destructiveButtonIndex = actions.findIndex((a) => a.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...labels, cancelLabel],
        cancelButtonIndex,
        ...(destructiveButtonIndex >= 0 ? { destructiveButtonIndex } : {}),
      },
      (index) => {
        if (index === undefined || index === cancelButtonIndex) return;
        actions[index]?.onPress();
      }
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={spacing[2]}
      onPress={open}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Ionicons name="ellipsis-horizontal" size={ICON_SIZE} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  pressed: {
    opacity: 0.5,
  },
});
