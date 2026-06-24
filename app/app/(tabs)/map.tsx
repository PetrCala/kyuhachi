import { useState, useEffect, useRef, useCallback } from 'react';
import { View, ActivityIndicator, Alert, Animated, Pressable, StyleSheet } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, type Region } from 'react-native-maps';
import {
  collection,
  doc,
  query,
  where,
  onSnapshot,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import type { OnsenDocument, RouteDocument } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS } from '@kyuhachi/shared';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/firebase';
import { simulatedCoordinate } from '@/lib/dev-location';
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import MapZoomControl from '@/components/MapZoomControl';
import { colors, spacing, radii, shadows } from '@/theme';

type OnsenRow = OnsenDocument & { id: string };

const KYUSHU_REGION = {
  latitude: 32.8,
  longitude: 130.7,
  latitudeDelta: 4,
  longitudeDelta: 4,
};

/** Roughly city-level zoom used when recentering the map on the user. */
const USER_LOCATION_DELTA = 0.05;

/** Idle time (ms) with no map interaction before the zoom slider fades out, and
 *  how long that fade takes. The slider reappears on any map touch. */
const ZOOM_HIDE_DELAY = 2500;
const ZOOM_FADE_DURATION = 250;

/** Rough Apple Maps camera altitude (metres) that frames a given latitude span,
 *  used to seed the zoom slider's knob before the map reports its real camera.
 *  ~111 km per degree of latitude; the map corrects this on its first reading. */
function estimateAltitude(latitudeDelta: number): number {
  return latitudeDelta * 111_000;
}

/** A map region that frames the route's bounding box with a little padding. */
function regionForBounds(bounds: RouteDocument['bounds']): Region {
  return {
    latitude: (bounds.minLat + bounds.maxLat) / 2,
    longitude: (bounds.minLng + bounds.maxLng) / 2,
    latitudeDelta: Math.max((bounds.maxLat - bounds.minLat) * 1.4, 0.02),
    longitudeDelta: Math.max((bounds.maxLng - bounds.minLng) * 1.4, 0.02),
  };
}

export default function MapScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigation = useNavigation();
  const { routeId: paramRouteId, focusOnsenId, focusTs } = useLocalSearchParams<{
    routeId?: string;
    focusOnsenId?: string;
    focusTs?: string;
  }>();
  // kyuhachiIds visited in the active challenge (drives the visited pin color),
  // plus the active challenge's route — both kept live by the progress hook.
  const { visitedIds, activeRoute, loading: progressLoading } =
    useActiveChallengeProgress();
  const mapRef = useRef<MapView>(null);
  const [onsens, setOnsens] = useState<OnsenRow[]>([]);
  const [onsensLoading, setOnsensLoading] = useState(true);
  // An explicit `routeId` param (a just-imported route, or "View route on map")
  // draws that specific route; otherwise the map draws the active challenge's
  // route. Both are live subscriptions, and `route` is derived rather than
  // stored, so a route attached, renamed, switched, or cleared while this tab
  // stays mounted reflects on the map without a remount — which the previous
  // one-shot read could not do.
  const [paramRoute, setParamRoute] = useState<RouteDocument | null>(null);
  const [paramRouteLoaded, setParamRouteLoaded] = useState(!paramRouteId);
  const route = paramRouteId ? paramRoute : activeRoute;
  // Whether foreground location permission is granted; gates the blue dot.
  const [locationGranted, setLocationGranted] = useState(false);
  // Live camera altitude (Apple Maps), read after each gesture settles so the
  // zoom slider's knob tracks pinch as well as its own drags.
  const [altitude, setAltitude] = useState<number | undefined>(undefined);

  // The zoom slider auto-hides after a spell of no interaction and reappears on
  // any map touch. `zoomVisible` drives both its opacity and whether it accepts
  // touches; `bumpZoom` is the single "there was activity" signal that the map's
  // gesture callbacks and the slider itself both fire.
  const [zoomVisible, setZoomVisible] = useState(true);
  const zoomOpacity = useRef(new Animated.Value(1)).current;
  const zoomHideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const bumpZoom = useCallback(() => {
    setZoomVisible(true);
    if (zoomHideTimer.current) clearTimeout(zoomHideTimer.current);
    zoomHideTimer.current = setTimeout(() => setZoomVisible(false), ZOOM_HIDE_DELAY);
  }, []);

  // Fade the slider whenever its visibility flips. Opacity rides the native driver.
  useEffect(() => {
    Animated.timing(zoomOpacity, {
      toValue: zoomVisible ? 1 : 0,
      duration: ZOOM_FADE_DURATION,
      useNativeDriver: true,
    }).start();
  }, [zoomVisible, zoomOpacity]);

  // Start the first countdown on mount; clear the pending timer on unmount.
  useEffect(() => {
    bumpZoom();
    return () => {
      if (zoomHideTimer.current) clearTimeout(zoomHideTimer.current);
    };
  }, [bumpZoom]);

  // Dev builds always stand in a simulated spot in Kyushu (on the active route
  // when there is one) so the location UX can be checked away from Japan;
  // production always shows the real device location. Gated on __DEV__ so the
  // whole branch is stripped from release builds.
  const simulated = __DEV__ ? simulatedCoordinate(route, onsens) : null;

  // Ask for foreground location once on mount so the blue dot can show. The
  // recenter button re-prompts if the user hasn't decided yet.
  useEffect(() => {
    let cancelled = false;
    Location.requestForegroundPermissionsAsync()
      .then(({ status }) => {
        if (!cancelled) setLocationGranted(status === 'granted');
      })
      .catch(() => {
        if (!cancelled) setLocationGranted(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Center the map on the user. Re-request permission if undecided; if denied,
  // point them at Settings since iOS won't prompt a second time.
  const handleRecenter = useCallback(async () => {
    // When simulating, recenter on the fake spot — no permission or GPS needed.
    if (simulated) {
      mapRef.current?.animateToRegion({
        latitude: simulated.latitude,
        longitude: simulated.longitude,
        latitudeDelta: USER_LOCATION_DELTA,
        longitudeDelta: USER_LOCATION_DELTA,
      });
      return;
    }
    let granted = locationGranted;
    if (!granted) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      granted = status === 'granted';
      setLocationGranted(granted);
    }
    if (!granted) {
      Alert.alert(t('map.locationDeniedTitle'), t('map.locationDeniedMessage'));
      return;
    }
    try {
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      mapRef.current?.animateToRegion({
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: USER_LOCATION_DELTA,
        longitudeDelta: USER_LOCATION_DELTA,
      });
    } catch {
      Alert.alert(t('common.errorTitle'), t('map.locationError'));
    }
  }, [simulated, locationGranted, t]);

  // Read the actual camera altitude once a gesture settles (and on first ready)
  // to keep the slider knob in sync with pinch. getCamera can reject in teardown.
  const handleCameraSettle = useCallback(async () => {
    try {
      const camera = await mapRef.current?.getCamera();
      if (camera?.altitude !== undefined) setAltitude(camera.altitude);
    } catch {
      // Map gone or camera unavailable — leave the last known altitude in place.
    }
  }, []);

  // True while a streaming altitude read is in flight, so the per-frame reads
  // below never pile up overlapping getCamera calls.
  const streamingReadRef = useRef(false);

  // Fires continuously while the camera moves — a pinch or a programmatic
  // recenter animation. Reads the live altitude so the zoom knob tracks the map
  // in near real time instead of only snapping into place once motion settles.
  // Guarded to one read at a time; onRegionChangeComplete still does the final,
  // authoritative read.
  const handleRegionChange = useCallback(async () => {
    bumpZoom();
    if (streamingReadRef.current) return;
    streamingReadRef.current = true;
    try {
      await handleCameraSettle();
    } finally {
      streamingReadRef.current = false;
    }
  }, [bumpZoom, handleCameraSettle]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, COLLECTIONS.ONSENS), where('isActive', '==', true)),
      (snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
        setOnsens(
          snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as OnsenDocument) }))
        );
        setOnsensLoading(false);
      },
      () => setOnsensLoading(false)
    );
    return unsubscribe;
  }, []);

  // Subscribe to the param route (when one is given) so it draws live — a rename
  // or edit reflects without a remount, and the empty→loaded transition mirrors
  // how the active route loads. The active-challenge route needs no work here:
  // the progress hook already subscribes to it and hands it back as activeRoute.
  // A dangling id (deleted route) resolves to no route.
  useEffect(() => {
    if (!user || !paramRouteId) {
      setParamRoute(null);
      setParamRouteLoaded(true);
      return;
    }
    setParamRouteLoaded(false);
    const unsub = onSnapshot(
      doc(db, COLLECTIONS.USERS, user.uid, SUBCOLLECTIONS.ROUTES, paramRouteId),
      (snapshot: FirebaseFirestoreTypes.DocumentSnapshot) => {
        setParamRoute(snapshot.exists() ? (snapshot.data() as RouteDocument) : null);
        setParamRouteLoaded(true);
      },
      () => {
        setParamRoute(null);
        setParamRouteLoaded(true);
      }
    );
    return unsub;
  }, [user, paramRouteId]);

  const loading =
    onsensLoading || (paramRouteId ? !paramRouteLoaded : !!user && progressLoading);
  // Route names are user/Firestore data, shown as-is; fall back to the generic title.
  const title = route?.name ?? t('map.title');
  const initialRegion = route ? regionForBounds(route.bounds) : KYUSHU_REGION;

  // Surface the active route's name in the tab header (the tab bar label stays
  // the static "Map"); falls back to the generic title when no route is drawn.
  useEffect(() => {
    navigation.setOptions({ headerTitle: title });
  }, [navigation, title]);

  // Keep the camera on the drawn route. `initialRegion` frames the route known
  // at mount; this re-frames when the route arrives or changes afterward — e.g.
  // a route attached or switched while the Map tab stayed mounted — which a
  // static `initialRegion` can't. Keyed on the bounds so it animates once per
  // distinct route, not on every snapshot.
  const framedBoundsRef = useRef<string | null>(null);
  useEffect(() => {
    if (!route) return;
    const { minLat, minLng, maxLat, maxLng } = route.bounds;
    const key = `${minLat},${minLng},${maxLat},${maxLng}`;
    if (key === framedBoundsRef.current) return;
    framedBoundsRef.current = key;
    mapRef.current?.animateToRegion(regionForBounds(route.bounds));
  }, [route]);

  // Arriving from an onsen's "Show on map": center the camera on that pin.
  // `focusTs` is a per-tap nonce so tapping again re-focuses the same onsen (an
  // unchanging id alone wouldn't re-fire the effect); the guard stops a re-run
  // on unrelated re-renders or when returning to this tab. Runs after the
  // route-framing effect above so a focused onsen wins the camera.
  const focusedTokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusOnsenId || !focusTs || focusedTokenRef.current === focusTs) return;
    const target = onsens.find((o) => o.id === focusOnsenId);
    if (!target) return; // onsen list not loaded yet; re-runs when it arrives
    focusedTokenRef.current = focusTs;
    mapRef.current?.animateToRegion({
      latitude: target.lat,
      longitude: target.lng,
      latitudeDelta: USER_LOCATION_DELTA,
      longitudeDelta: USER_LOCATION_DELTA,
    });
  }, [focusOnsenId, focusTs, onsens]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={initialRegion}
        showsUserLocation={!simulated && locationGranted}
        onMapReady={handleCameraSettle}
        onRegionChange={handleRegionChange}
        onPanDrag={bumpZoom}
        onPress={bumpZoom}
        onRegionChangeComplete={handleCameraSettle}
      >
        {onsens.map((onsen) => (
          <Marker
            key={onsen.id}
            coordinate={{ latitude: onsen.lat, longitude: onsen.lng }}
            title={onsen.name}
            description={onsen.areaName}
            // Visited onsens in the active challenge get a bath-water blue pin;
            // unvisited keep the default red pin.
            pinColor={visitedIds.has(onsen.id) ? colors.onsenVisited : undefined}
            onCalloutPress={() => router.push(`/onsens/${onsen.id}`)}
          />
        ))}
        {route && (
          <Polyline
            coordinates={route.points.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
            strokeColor={colors.actionPrimary}
            strokeWidth={spacing[1]}
          />
        )}
        {simulated && (
          <Marker
            key="dev-simulated"
            coordinate={simulated}
            anchor={{ x: 0.5, y: 0.5 }}
            title={t('map.simulatedLocation')}
            tracksViewChanges={false}
          >
            <View style={styles.simDot} />
          </Marker>
        )}
      </MapView>
      <Animated.View
        style={[styles.zoomControlWrap, { opacity: zoomOpacity }]}
        pointerEvents={zoomVisible ? 'box-none' : 'none'}
      >
        <MapZoomControl
          mapRef={mapRef}
          initialAltitude={estimateAltitude(initialRegion.latitudeDelta)}
          altitude={altitude}
          zoomInLabel={t('map.zoomIn')}
          zoomOutLabel={t('map.zoomOut')}
          onActivity={bumpZoom}
        />
      </Animated.View>
      <Pressable
        style={[styles.recenterButton, shadows.md]}
        onPress={handleRecenter}
        accessibilityRole="button"
        accessibilityLabel={t('map.recenter')}
      >
        <Ionicons name="locate" size={spacing[6]} color={colors.actionPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  // Full-height column pinned to the right edge so the zoom slider centers
  // vertically without hardcoding its height; box-none lets map gestures through
  // the empty space above and below the control.
  zoomControlWrap: {
    position: 'absolute',
    right: spacing[4],
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  recenterButton: {
    position: 'absolute',
    right: spacing[4],
    bottom: spacing[6],
    width: spacing[12],
    height: spacing[12],
    borderRadius: radii.full,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Dev-only simulated-location dot — amber with a white ring so it reads as
  // "me" and stays distinct from the default red onsen pins.
  simDot: {
    width: spacing[4],
    height: spacing[4],
    borderRadius: radii.full,
    backgroundColor: colors.brandGlyph,
    borderWidth: 2,
    borderColor: colors.textInverted,
  },
});
