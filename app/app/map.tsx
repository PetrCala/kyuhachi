import { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import firestore from '@react-native-firebase/firestore';
import type { OnsenDocument } from '@kyuhachi/shared';
import { COLLECTIONS } from '@kyuhachi/shared';
import { colors } from '../src/theme';

type OnsenRow = OnsenDocument & { id: string };

const KYUSHU_REGION = {
  latitude: 32.8,
  longitude: 130.7,
  latitudeDelta: 4,
  longitudeDelta: 4,
};

export default function MapScreen() {
  const { t } = useTranslation();
  const [onsens, setOnsens] = useState<OnsenRow[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <>
      <Stack.Screen options={{ title: t('map.title'), headerShown: true }} />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      ) : (
        <MapView
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
