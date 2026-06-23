import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radii } from '@/theme';

// Fixed glyph size for the ⋯ trigger — a tap-target dimension, not part of the
// type scale (mirrors the geometry constants in RecordVisitFab).
const ICON_SIZE = 22;
// The sheet starts a full screen height below its resting place so it is always
// off-screen at rest regardless of its measured height; the ease-out curve makes
// the visible final stretch decelerate into place, like the native sheet.
const SCREEN_HEIGHT = Dimensions.get('window').height;
const ENTER_DURATION = 260;
const EXIT_DURATION = 200;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
 * A three-dot (⋯) row affordance that opens a custom bottom-sheet modal of
 * per-item actions (rename / delete / …). The backdrop fades in while the sheet
 * slides up from the bottom — the two are animated independently so it feels
 * like the native iOS action sheet rather than the whole surface sliding.
 *
 * Experimental alternative to ActionSheetIOS — kept behind the same props so the
 * list screens don't need to change.
 */
export default function RowActionsButton({
  accessibilityLabel,
  cancelLabel,
  title,
  actions,
}: RowActionsButtonProps) {
  const [visible, setVisible] = useState(false);
  const insets = useSafeAreaInsets();
  // 0 = dismissed (backdrop clear, sheet off-screen), 1 = presented.
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: ENTER_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  function close(after?: () => void) {
    Animated.timing(anim, {
      toValue: 0,
      duration: EXIT_DURATION,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setVisible(false);
      after?.();
    });
  }

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT, 0],
  });

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={spacing[2]}
        onPress={() => setVisible(true)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <Ionicons name="ellipsis-horizontal" size={ICON_SIZE} color={colors.textTertiary} />
      </Pressable>

      <Modal visible={visible} transparent animationType="none" onRequestClose={() => close()}>
        <View style={styles.root}>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
            style={[styles.backdrop, { opacity: anim }]}
            onPress={() => close()}
          />
          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + spacing[2], transform: [{ translateY }] },
            ]}
          >
            <View style={styles.group}>
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
                  onPress={() => close(action.onPress)}
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
            </View>

            <Pressable
              onPress={() => close()}
              style={({ pressed }) => [styles.cancel, pressed && styles.optionPressed]}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
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
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  sheet: {
    paddingHorizontal: spacing[2],
  },
  group: {
    backgroundColor: colors.background,
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginBottom: spacing[2],
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
  cancel: {
    backgroundColor: colors.background,
    borderRadius: radii.lg,
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  cancelText: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
});
