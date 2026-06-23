import { useState, useEffect, useRef, useCallback } from 'react';
import { View, ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, type Region } from 'react-native-maps';
import {
  collection,
  doc,
  getDoc,
  query,
  where,
  onSnapshot,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import type {
  ChallengeDocument,
  OnsenDocument,
  RouteDocument,
  UserDocument,
} from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS } from '@kyuhachi/shared';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/firebase';
import { simulatedCoordinate } from '@/lib/dev-location';
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
  const { routeId: paramRouteId } = useLocalSearchParams<{ routeId?: string }>();
  const mapRef = useRef<MapView>(null);
  const [onsens, setOnsens] = useState<OnsenRow[]>([]);
  const [onsensLoading, setOnsensLoading] = useState(true);
  const [route, setRoute] = useState<RouteDocument | null>(null);
  // We resolve a route on mount (an explicit param, or the active challenge's),
  // and hold rendering until it loads so the map can mount already framed on the
  // track rather than animating in afterwards.
  const [routeLoaded, setRouteLoaded] = useState(false);
  // Whether foreground location permission is granted; gates the blue dot.
  const [locationGranted, setLocationGranted] = useState(false);

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

  // Resolve which route to draw: an explicit routeId param wins; otherwise fall
  // back to the active challenge's activeRouteId so a challenge's route shows on
  // the map automatically. A dangling id (deleted route) resolves to no route.
  useEffect(() => {
    if (!user) {
      setRoute(null);
      setRouteLoaded(true);
      return;
    }
    setRouteLoaded(false);
    let cancelled = false;
    const userRef = doc(db, COLLECTIONS.USERS, user.uid);

    async function resolveRouteId(): Promise<string | null> {
      if (paramRouteId) return paramRouteId;
      const userDoc = await getDoc(userRef);
      const defaultChallengeId = (userDoc.data() as UserDocument | undefined)?.defaultChallengeId;
      if (!defaultChallengeId) return null;
      const challengeDoc = await getDoc(
        doc(userRef, SUBCOLLECTIONS.CHALLENGES, defaultChallengeId)
      );
      return (challengeDoc.data() as ChallengeDocument | undefined)?.activeRouteId ?? null;
    }

    resolveRouteId()
      .then(async (id) => {
        if (cancelled) return;
        if (!id) {
          setRoute(null);
          return;
        }
        const routeDoc = await getDoc(doc(userRef, SUBCOLLECTIONS.ROUTES, id));
        if (cancelled) return;
        setRoute(routeDoc.exists() ? (routeDoc.data() as RouteDocument) : null);
      })
      .catch(() => {
        if (!cancelled) setRoute(null);
      })
      .finally(() => {
        if (!cancelled) setRouteLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, paramRouteId]);

  const loading = onsensLoading || !routeLoaded;
  // Route names are user/Firestore data, shown as-is; fall back to the generic title.
  const title = route?.name ?? t('map.title');
  const initialRegion = route ? regionForBounds(route.bounds) : KYUSHU_REGION;

  // Surface the active route's name in the tab header (the tab bar label stays
  // the static "Map"); falls back to the generic title when no route is drawn.
  useEffect(() => {
    navigation.setOptions({ headerTitle: title });
  }, [navigation, title]);

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
      >
        {onsens.map((onsen) => (
          <Marker
            key={onsen.id}
            coordinate={{ latitude: onsen.lat, longitude: onsen.lng }}
            title={onsen.name}
            description={onsen.areaName}
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
