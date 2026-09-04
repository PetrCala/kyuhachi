# The intermittent map freeze

The Map tab can end up in a state where Apple Maps still draws tiles but ignores
every pan and pinch, while React Native touchables (tab bar, overlay buttons)
keep working, until the app is reloaded. It has been worked in waves (#109,
#112, #148, #238, #239, #240) and still recurs, typically after leaving the tab
(onsen list, onsen page, visit editor) and coming back.

This page records what the code does about it now and how to read the
diagnostic it ships with. The investigation itself is summarised at the end.

## What the app does about it

- **Every camera command is gated.** `useMapCameraGate` holds `setCamera`,
  `animateCamera` and `animateToRegion` until the map is focused, laid out with
  a non-zero size, has reported `onMapReady`, and a short settle has elapsed,
  then replays them in order. Inactive tab screens are detached from the native
  view hierarchy, so a command sent while another tab is active, or in the very
  commit that re-attaches the Map tab (a "Show on map" `dismissTo`), used to hit
  a map that was not in any window. A camera set against an unsized map is a
  documented way MapKit ends up with a camera it never recovers from.
- **Every camera value is validated** (`lib/map-camera.ts`). MapKit rejects an
  invalid centre but accepts a NaN span or altitude; the app now drops those.
- **The camera is nudged on every return to the tab.** Re-setting the current
  camera, unchanged, is the documented way to wake MKMapView out of the
  stuck-gesture state it can enter after a hierarchy change or a long press.
- **Only one tab layout can exist.** Root-level screens reach the tabs only via
  `router.dismissTo('/')` or `RedirectHome`; `push`/`replace`/`<Redirect>` to a
  tab route from a root-level screen creates a second `(tabs)` entry and a
  second live map (`root-home-navigation.test.ts` scans for it, and dev builds
  alert on a duplicate at runtime).
- **Sheets cannot get stuck over the map.** `OnsenPreviewSheet` and the root
  `RowActionsSheet` unmount on a fallback timer if gorhom's `onClose` never
  arrives, and re-issue `close()` if an interrupted close settles back open.

## The map doctor (dev-tools builds)

A medkit button sits top-right on the map in any build with dev tools enabled
(local, development and preview builds; never the App Store build). Tap it when
the map is frozen. It logs and shows:

| Line | What it tells you |
|---|---|
| `map: focused laidOut mapReady gate queued instance` | Whether the app itself thinks the map is commandable. `gate=closed` on a visible map means a readiness fact is stale. |
| `events: onPress / onRegionChange / onRegionChangeComplete` | Whether touches reach MapKit at all. A recent `onPress` with no `onRegionChange` after a pan means MapKit gets the touch and refuses to scroll. Nothing at all means something is above the map or its recognizers are dead. |
| `camera:` | `NOT FINITE` or a read that times out means camera corruption. |
| `preview sheet:` | `open` or `closing` while nothing is visible means a sheet is stuck over the map. |
| `root stack:` | `DUPLICATE TAB LAYOUT` means a root-level screen navigated into the tabs. |

Then try the two buttons. **Nudge camera** re-sets the current camera; if that
revives the map, the fault is MapKit's gesture or camera state. **Remount map**
mounts a fresh MapView at the same region; if only that helps, the old native
view was carrying the fault. Also check by hand whether the tab bar taps and
the onsen list scrolls: if they are dead too, the fault is above the map
(react-native-screens disables the whole root stack during transitions).

## Investigation summary (September 2026)

Ranked causes, from reading react-native-maps 1.27.2, react-native-screens
4.23, gesture-handler 2.30, gorhom bottom-sheet 5.2.14 and expo-router 55:

1. Camera/region commands reaching a detached or unsized MKMapView (the class
   #238 found, with the first-mount-only guard it left).
2. MapKit's own gesture state surviving the tab detach/re-attach cycle.
3. A second tab layout, still creatable through `replace('/')` after the pushes
   were fixed.
4. A sheet left mounted over the map after an interrupted close.

Excluded: JS-thread saturation (buttons would die too), gesture-handler's root
recognizer (resets per touch), and the iOS 26 transition lock in
react-native-screens (it disables the tab bar as well). Two earlier theories
were wrong on this stack: a `box-none` sibling cannot swallow touches under
Fabric, and `tracksViewChanges` is not read by the Fabric marker view.
