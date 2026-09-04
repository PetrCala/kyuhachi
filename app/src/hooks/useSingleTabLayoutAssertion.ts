import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useRootNavigationState } from 'expo-router';
import { DEV_TOOLS_ENABLED } from '@/lib/dev/flags';

/** Route name of the tab layout in the root stack. */
export const TAB_LAYOUT_ROUTE = '(tabs)';

// Root-stack shapes already reported this launch, so a duplicate is announced
// once, not on every navigation-state change while it persists (and not twice
// when both copies of the tab layout run this hook).
const reported = new Set<string>();

/** The names of the root stack's routes, oldest first. */
export function rootRouteNames(state: { routes: { name: string }[] } | undefined): string[] {
  return state?.routes.map((route) => route.name) ?? [];
}

/** True when the root stack holds the tab layout more than once. */
export function hasDuplicateTabLayout(routeNames: string[]): boolean {
  return routeNames.filter((name) => name === TAB_LAYOUT_ROUTE).length > 1;
}

/**
 * Dev-tools guard for the "one tab layout, one MapView" invariant. A second
 * `(tabs)` entry in the root stack (a `push`/`replace` to a tab route from a
 * root-level screen) mounts a second live map and leaves the first one to rot,
 * which is one documented way the map ends up frozen. Announces the first
 * occurrence loudly so a diagnostic build surfaces it on device.
 */
export function useSingleTabLayoutAssertion(): void {
  const rootState = useRootNavigationState();

  useEffect(() => {
    if (!DEV_TOOLS_ENABLED || !rootState) return;
    const names = rootRouteNames(rootState);
    if (!hasDuplicateTabLayout(names)) return;
    const shape = names.join(' > ');
    if (reported.has(shape)) return;
    reported.add(shape);
    const message = `Root stack: ${shape}`;
    console.error(`[nav] duplicate tab layout. ${message}`);
    Alert.alert('Duplicate tab layout', message);
  }, [rootState]);
}
