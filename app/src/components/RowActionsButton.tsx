import { useCallback, useRef } from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { colors, spacing, typography, radii } from '@/theme';

// Fixed glyph size for the ⋯ trigger — a tap-target dimension, not part of the
// type scale (mirrors the geometry constants in RecordVisitFab).
const ICON_SIZE = 22;

export interface RowAction {
  /** Visible label in the sheet. */
  label: string;
  onPress: () => void;
  /** Renders the option in the destructive (red) style. */
  destructive?: boolean;
}

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
 * (rename / delete / …), opened by tapping the ⋯ button.
 *
 * Built on `@gorhom/bottom-sheet` (`BottomSheetModal`) for native-quality
 * slide-up, backdrop, and swipe/grabber dismissal. The sheet sizes to its
 * contents (the action count varies per row) and pins to the bottom with
 * safe-area padding; the backdrop, the grabber, a downward swipe, and the
 * cancel row all dismiss it.
 *
 * A chosen item's `onPress` runs *after* the sheet finishes dismissing, so any
 * surface the action drives (an alert, a navigation) appears over a settled UI
 * rather than fighting the slide-down — mirroring the native iOS action sheet.
 */
export default function RowActionsButton({
  accessibilityLabel,
  cancelLabel,
  title,
  actions,
}: RowActionsButtonProps) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  // The item picked before the dismiss animation; run once the sheet settles.
  const pendingAction = useRef<(() => void) | null>(null);

  const selectAction = useCallback((onPress: () => void) => {
    pendingAction.current = onPress;
    sheetRef.current?.dismiss();
  }, []);

  const handleDismiss = useCallback(() => {
    const action = pendingAction.current;
    pendingAction.current = null;
    action?.();
  }, []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    []
  );

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={spacing[2]}
        onPress={() => sheetRef.current?.present()}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <Ionicons name="ellipsis-horizontal" size={ICON_SIZE} color={colors.textTertiary} />
      </Pressable>

      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        enablePanDownToClose
        onDismiss={handleDismiss}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.handleIndicator}
      >
        <BottomSheetView style={{ paddingBottom: insets.bottom + spacing[2] }}>
          {title ? (
            <View style={styles.titleRow}>
              <Text style={styles.titleText} numberOfLines={1}>
                {title}
              </Text>
            </View>
          ) : null}
          {actions.map((action, index) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              onPress={() => selectAction(action.onPress)}
              style={({ pressed }) => [
                styles.option,
                (title || index > 0) && styles.optionDivider,
                pressed && styles.optionPressed,
              ]}
            >
              <Text
                style={[styles.optionText, action.destructive && styles.optionTextDestructive]}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}

          <View style={styles.groupGap} />

          <Pressable
            accessibilityRole="button"
            onPress={() => sheetRef.current?.dismiss()}
            style={({ pressed }) => [styles.cancel, pressed && styles.optionPressed]}
          >
            <Text style={styles.cancelText}>{cancelLabel}</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>
    </>
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
  // The sheet surface: app background with rounded top corners; the grabber sits
  // above the content so the first row never meets the rounded edge.
  sheetBackground: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  handleIndicator: {
    backgroundColor: colors.separator,
  },
  titleRow: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  titleText: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  option: {
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  optionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  optionPressed: {
    backgroundColor: colors.backgroundSecondary,
  },
  optionText: {
    fontSize: typography.sizes.lg,
    color: colors.textPrimary,
  },
  optionTextDestructive: {
    color: colors.destructive,
  },
  // Grouped-list gap separating the actions from the cancel affordance — the
  // single-surface stand-in for the iOS action sheet's two stacked cards.
  groupGap: {
    height: spacing[2],
    backgroundColor: colors.backgroundSecondary,
  },
  cancel: {
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  cancelText: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
});
