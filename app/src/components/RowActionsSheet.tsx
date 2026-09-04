import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { colors, radii, spacing, typography } from '@/theme';

export interface RowAction {
  /** Visible label in the sheet. */
  label: string;
  onPress: () => void;
  /** Renders the option in the destructive (red) style. */
  destructive?: boolean;
}

export interface RowActionsConfig {
  /** Optional sheet heading: typically the row's (untranslated) name. */
  title?: string;
  /** Cancel row label (also what tapping the backdrop maps to). */
  cancelLabel: string;
  actions: RowAction[];
}

interface RowActionsSheetContextValue {
  /** Open the shared action sheet for a given row. */
  open: (config: RowActionsConfig) => void;
}

const RowActionsSheetContext = createContext<RowActionsSheetContextValue | null>(null);

// How long after a requested close we wait for gorhom's `onClose` before
// treating the sheet as closed anyway (its slide-out is a spring well under
// this). See `requestClose` for why the fallback exists.
const CLOSE_FALLBACK_MS = 800;

/**
 * Imperative handle to the app-level row-actions sheet. Throws if used outside
 * {@link RowActionsSheetProvider} so a missing provider fails loudly in dev
 * rather than silently doing nothing.
 */
export function useRowActionsSheet(): RowActionsSheetContextValue {
  const ctx = useContext(RowActionsSheetContext);
  if (!ctx) {
    throw new Error('useRowActionsSheet must be used within a RowActionsSheetProvider');
  }
  return ctx;
}

/**
 * Hosts a single inline `@gorhom/bottom-sheet` `BottomSheet` at the app root and
 * exposes `open(config)` via context. A ⋯ trigger ({@link RowActionsButton})
 * lives inside a list row, but the sheet itself must cover the whole screen, so
 * it is mounted here, at the root, where its container is full-size.
 *
 * We deliberately do NOT use the portal-based `BottomSheetModal`: its
 * `@gorhom/portal` host does not render on React Native's New Architecture
 * (`present()` runs but nothing mounts), and it additionally requires a
 * `BottomSheetModalProvider` ancestor: without one it throws
 * `'BottomSheetModalInternalContext' cannot be null!` on render. The inline
 * sheet (the same approach as `OnsenPreviewSheet`) renders fine on New Arch.
 *
 * The sheet sizes to its contents (the action count varies per row) and pins to
 * the bottom with safe-area padding; the backdrop, the grabber, a downward
 * swipe, and the cancel row all dismiss it. A chosen item's `onPress` runs
 * *after* the sheet finishes dismissing, so any surface the action drives (an
 * alert, a navigation) appears over a settled UI rather than fighting the
 * slide-down, mirroring the native iOS action sheet.
 *
 * IMPORTANT: the `BottomSheet` is mounted only while there is a config to show,
 * and a closed, idle sheet is never left mounted. Even closed, gorhom always
 * mounts a full-screen `pointerEvents="box-none"` container
 * (`BottomSheetHostingContainer`), and because this provider sits at the app
 * root that container would sit over *every* screen, the map tab included. Such
 * a sibling over the native map can swallow the map's pan gesture on iOS (worse
 * on the New Architecture), freezing the map while overlay buttons still tap:
 * exactly the regression fixed in #109. So `config` is both the content and the
 * mount gate: the sheet animates itself in on mount (`index={0}` plus gorhom's
 * default `animateOnMount`, the only reliable way in, since `snapToIndex` from a
 * mount effect is a no-op while the sheet's layout is still unmeasured), and
 * `onClose` fires once the slide-out has finished, which is when the config is
 * cleared and the sheet unmounted.
 */
export function RowActionsSheetProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  // The active row's actions, or null when there is no sheet. Doubles as the
  // mount gate (see the note on the component): set on open, and cleared only
  // once the close animation has finished, so the content never blanks mid-exit.
  const [config, setConfig] = useState<RowActionsConfig | null>(null);
  // The item picked before the dismiss animation; run once the sheet settles.
  const pendingAction = useRef<(() => void) | null>(null);

  // Set while a close we asked for is in flight; cleared when it lands. See
  // `requestClose`.
  const closeFallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearCloseFallback = useCallback(() => {
    if (closeFallback.current) clearTimeout(closeFallback.current);
    closeFallback.current = null;
  }, []);
  useEffect(() => clearCloseFallback, [clearCloseFallback]);

  const open = useCallback(
    (next: RowActionsConfig) => {
      pendingAction.current = null;
      clearCloseFallback();
      setConfig(next);
    },
    [clearCloseFallback]
  );

  // Any close (swipe, backdrop, cancel, or a chosen action) clears the config
  // and then runs the pending action (null for a plain dismissal) over the
  // now-settled UI.
  const handleClose = useCallback(() => {
    clearCloseFallback();
    const action = pendingAction.current;
    pendingAction.current = null;
    setConfig(null);
    action?.();
  }, [clearCloseFallback]);

  // Ask gorhom to slide the sheet out, and guarantee the close lands. The sheet
  // unmounts only on gorhom's `onClose`, which fires only for an animation that
  // *finished*; an interrupted one, or a `close()` gorhom drops (it no-ops while
  // a close is already in flight), would leave this root-level sheet mounted,
  // its full-screen container and gesture handlers sitting over every screen,
  // the Map tab included: the shape #240 removed. So a requested close is
  // followed up: by `onClose` if gorhom finishes, by this timer if it doesn't.
  const requestClose = useCallback(() => {
    sheetRef.current?.close();
    clearCloseFallback();
    closeFallback.current = setTimeout(handleClose, CLOSE_FALLBACK_MS);
  }, [clearCloseFallback, handleClose]);

  const selectAction = useCallback(
    (onPress: () => void) => {
      pendingAction.current = onPress;
      requestClose();
    },
    [requestClose]
  );

  // A requested close that got interrupted and settled back at an open detent:
  // ask again. gorhom reports the settled index here.
  const handleChange = useCallback((index: number) => {
    if (index >= 0 && closeFallback.current) sheetRef.current?.close();
  }, []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        // Belt and braces against the same "invisible sheet over the screen"
        // trap: the backdrop starts with pointerEvents 'auto' unless this is
        // set, and only drops to 'none' through a runOnJS hop that its own
        // isMounted guard can swallow. With touch-through it starts at 'none'
        // instead and the same reaction raises it to 'auto' as the sheet opens,
        // so the backdrop is tappable exactly while it is visible.
        enableTouchThrough
      />
    ),
    []
  );

  return (
    <RowActionsSheetContext.Provider value={{ open }}>
      {children}
      {config ? (
        <BottomSheet
          ref={sheetRef}
          // The mount position: the sheet opens itself as it appears, animating
          // in because gorhom's `animateOnMount` defaults to true. Dynamic
          // sizing still measures the real content height first: with no
          // content height yet there are no detents, so gorhom holds the mount
          // animation until `BottomSheetView` has reported its layout and then
          // animates to that measured height. Closing goes through the ref.
          index={0}
          enableDynamicSizing
          enablePanDownToClose
          onClose={handleClose}
          onChange={handleChange}
          backdropComponent={renderBackdrop}
          backgroundStyle={styles.sheetBackground}
          handleIndicatorStyle={styles.handleIndicator}
        >
          <BottomSheetView style={{ paddingBottom: insets.bottom }}>
            {config.title ? (
              <View style={styles.titleRow}>
                <Text style={styles.titleText} numberOfLines={1}>
                  {config.title}
                </Text>
              </View>
            ) : null}
            {config.actions.map((action, index) => (
              <Pressable
                key={action.label}
                accessibilityRole="button"
                onPress={() => selectAction(action.onPress)}
                style={({ pressed }) => [
                  styles.option,
                  (config.title || index > 0) && styles.optionDivider,
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
              onPress={requestClose}
              style={({ pressed }) => [styles.cancel, pressed && styles.optionPressed]}
            >
              <Text style={styles.cancelText}>{config.cancelLabel}</Text>
            </Pressable>
          </BottomSheetView>
        </BottomSheet>
      ) : null}
    </RowActionsSheetContext.Provider>
  );
}

const styles = StyleSheet.create({
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
  // Grouped-list gap separating the actions from the cancel affordance: the
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
