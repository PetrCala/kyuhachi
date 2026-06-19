import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: t('tabs.home'),
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          tabBarLabel: t('tabs.map'),
          headerTitle: t('map.title'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'map' : 'map-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="onsens"
        options={{
          tabBarLabel: t('tabs.onsens'),
          headerTitle: t('onsenList.title'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'water' : 'water-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          tabBarLabel: t('tabs.more'),
          headerTitle: t('more.title'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'ellipsis-horizontal-circle' : 'ellipsis-horizontal-circle-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
