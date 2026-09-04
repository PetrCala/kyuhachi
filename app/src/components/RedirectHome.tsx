import { useEffect } from 'react';
import { router } from 'expo-router';

/**
 * Sends the user to the Home tab from a root-level screen. Use this instead of
 * `<Redirect href="/" />` (or `router.replace('/')`) anywhere outside the tab
 * layout.
 *
 * `/` lives inside `(tabs)`, and every root-level screen is a root-stack sibling
 * of it. A `Redirect`/`replace` from one of those resolves to a REPLACE at the
 * root stack, which swaps the current screen for a *second* `(tabs)` entry: two
 * tab layouts, two live MapViews, and a root stack with more than one entry,
 * which on iOS 26 also arms the content-wide swipe-back gesture over the map.
 * `dismissTo` dispatches POP_TO instead: it walks back to the existing tab
 * layout, and only when there is none (a deep link straight into this screen)
 * does it replace the current route with a fresh one.
 */
export default function RedirectHome() {
  useEffect(() => {
    router.dismissTo('/');
  }, []);
  return null;
}
