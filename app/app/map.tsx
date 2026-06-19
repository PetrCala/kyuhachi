import { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, type Region } from 'react-native-maps';
import firestore from '@react-native-firebase/firestore';
import type { OnsenDocument, RouteDocument } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS } from '@kyuhachi/shared';
import { useAuth } from '../src/context/AuthContext';
import { colors, spacing } from '../src/theme';

type OnsenRow = OnsenDocument & { id: string };

const KYUSHU_REGION = {
  latitude: 32.8,
  longitude: 130.7,
  latitudeDelta: 4,
  longitudeDelta: 4,
};

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
  const { routeId } = useLocalSearchParams<{ routeId?: string }>();
  const mapRef = useRef<MapView>(null);
  const [onsens, setOnsens] = useState<OnsenRow[]>([]);
  const [onsensLoading, setOnsensLoading] = useState(true);
  const [route, setRoute] = useState<RouteDocument | null>(null);
  // When a routeId is requested we hold rendering until it loads, so the map can
  // mount already framed on the track rather than animating in afterwards.
  const [routeLoaded, setRouteLoaded] = useState(!routeId);

  useEffect(() => {
    const unsubscribe = firestore()
      .collection(COLLECTIONS.ONSENS)
      .where('isActive', '==', true)
      .onSnapshot(
        (snapshot) => {
          setOnsens(
            snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as OnsenDocument) }))
          );
          setOnsensLoading(false);
        },
        () => setOnsensLoading(false)
      );
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user || !routeId) {
      setRoute(null);
      setRouteLoaded(true);
      return;
    }
    setRouteLoaded(false);
    let cancelled = false;
    firestore()
      .collection(COLLECTIONS.USERS)
      .doc(user.uid)
      .collection(SUBCOLLECTIONS.ROUTES)
      .doc(routeId)
      .get()
      .then((doc) => {
        if (cancelled) return;
        setRoute(doc.exists() ? (doc.data() as RouteDocument) : null);
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
  }, [user, routeId]);

  const loading = onsensLoading || !routeLoaded;
  // Route names are user/Firestore data, shown as-is; fall back to the generic title.
  const title = route?.name ?? t('map.title');
  const initialRegion = route ? regionForBounds(route.bounds) : KYUSHU_REGION;

  return (
    <>
      <Stack.Screen options={{ title, headerShown: true }} />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      ) : (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={initialRegion}
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
        </MapView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  map: {
    flex: 1,
  },
});
