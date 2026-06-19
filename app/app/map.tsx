import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, type Region } from 'react-native-maps';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import firestore from '@react-native-firebase/firestore';
import type { OnsenDocument } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS } from '@kyuhachi/shared';
import { useAuth } from '../src/context/AuthContext';
import {
  parseRoute,
  sourceFormatFromName,
  nameWithoutExtension,
  RouteImportError,
  type ParsedRoute,
} from '../src/lib/route-import';
import { colors, spacing, typography, radii, shadows } from '../src/theme';

type OnsenRow = OnsenDocument & { id: string };

const KYUSHU_REGION = {
  latitude: 32.8,
  longitude: 130.7,
  latitudeDelta: 4,
  longitudeDelta: 4,
};

/** A map region that frames the route's bounding box with a little padding. */
function regionForBounds(bounds: ParsedRoute['bounds']): Region {
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
  const mapRef = useRef<MapView>(null);
  const [onsens, setOnsens] = useState<OnsenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<ParsedRoute | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const unsubscribe = firestore()
      .collection(COLLECTIONS.ONSENS)
      .where('isActive', '==', true)
      .onSnapshot(
        (snapshot) => {
          setOnsens(
            snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as OnsenDocument) }))
          );
          setLoading(false);
        },
        () => setLoading(false)
      );
    return unsubscribe;
  }, []);

  async function handleImport() {
    if (!user) return;
    try {
      // gpx/kml/tcx have no standard MIME type, so accept any file and branch on extension.
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      const format = sourceFormatFromName(asset.name);
      if (!format) {
        Alert.alert(t('routes.importErrorTitle'), t('routes.importErrorFormat'));
        return;
      }

      setImporting(true);
      const text = await new File(asset.uri).text();
      const parsed = parseRoute(text, format, nameWithoutExtension(asset.name));

      await firestore()
        .collection(COLLECTIONS.USERS)
        .doc(user.uid)
        .collection(SUBCOLLECTIONS.ROUTES)
        .add({
          ...parsed,
          createdAt: firestore.FieldValue.serverTimestamp(),
          updatedAt: firestore.FieldValue.serverTimestamp(),
        });

      setRoute(parsed);
      mapRef.current?.animateToRegion(regionForBounds(parsed.bounds), 500);
    } catch (error) {
      const message =
        error instanceof RouteImportError && error.code === 'noTrack'
          ? t('routes.importErrorNoTrack')
          : t('routes.importErrorParse');
      Alert.alert(t('routes.importErrorTitle'), message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: t('map.title'), headerShown: true }} />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      ) : (
        <View style={styles.container}>
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_DEFAULT}
            initialRegion={KYUSHU_REGION}
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
          <View style={styles.importButtonWrapper} pointerEvents="box-none">
            <Pressable
              style={[styles.importButton, shadows.md, importing && styles.importButtonDisabled]}
              onPress={handleImport}
              disabled={importing}
            >
              <Text style={styles.importButtonText}>
                {importing ? t('routes.importing') : t('routes.import')}
              </Text>
            </Pressable>
          </View>
        </View>
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
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  importButtonWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing[6],
    alignItems: 'center',
  },
  importButton: {
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.full,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[6],
  },
  importButtonDisabled: {
    opacity: 0.6,
  },
  importButtonText: {
    color: colors.actionPrimaryText,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
});
