import { useMemo } from 'react';
import { useTheme } from './ThemeContext';
import type { ThemeColors } from './colors';

/**
 * Turns a static stylesheet into a theme-reactive one.
 *
 * The conversion for any screen is mechanical:
 *
 *   // before — frozen at module load, never reacts to theme
 *   import { colors } from '@/theme';
 *   const styles = StyleSheet.create({ card: { backgroundColor: colors.background } });
 *
 *   // after — rebuilt whenever the active palette changes
 *   const styles = useThemedStyles(makeStyles);              // inside the component
 *   const makeStyles = (colors: ThemeColors) =>              // at the bottom of the file
 *     StyleSheet.create({ card: { backgroundColor: colors.background } });
 *
 * Results are cached by (factory, palette), so every component sharing a
 * `makeStyles` gets the same `StyleSheet` object per theme — one create call
 * per theme, not one per render or per component instance.
 */

// T is inferred from the factory's return value — i.e. the result of
// `StyleSheet.create(...)`, which is already a fully-typed style object. The
// NamedStyles constraint is enforced inside the factory by StyleSheet.create
// itself, so the hook stays generic over whatever the factory produces.
export type StyleFactory<T> = (colors: ThemeColors) => T;

const cache = new WeakMap<StyleFactory<unknown>, WeakMap<ThemeColors, unknown>>();

export function useThemedStyles<T>(factory: StyleFactory<T>): T {
  const { colors } = useTheme();

  return useMemo(() => {
    let byPalette = cache.get(factory as StyleFactory<unknown>);
    if (!byPalette) {
      byPalette = new WeakMap();
      cache.set(factory as StyleFactory<unknown>, byPalette);
    }
    let styles = byPalette.get(colors) as T | undefined;
    if (!styles) {
      styles = factory(colors);
      byPalette.set(colors, styles);
    }
    return styles;
  }, [factory, colors]);
}
