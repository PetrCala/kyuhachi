import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import auth from '@react-native-firebase/auth';
import { useAuth } from '../src/context/AuthContext';
import { colors, spacing, typography, radii } from '../src/theme';

export default function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('home.title')}</Text>
      <Text style={styles.subtitle}>{user?.email ?? user?.displayName ?? ''}</Text>
      <Pressable style={styles.primaryButton} onPress={() => router.push('/onsens')}>
        <Text style={styles.primaryButtonText}>{t('home.onsenList')}</Text>
      </Pressable>
      <Pressable style={styles.primaryButton} onPress={() => router.push('/map')}>
        <Text style={styles.primaryButtonText}>{t('home.map')}</Text>
      </Pressable>
      <Pressable style={styles.signOut} onPress={() => auth().signOut()}>
        <Text style={styles.signOutText}>{t('home.signOut')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing[6],
  },
  title: {
    fontSize: typography.sizes.xxxl,
    fontWeight: typography.weights.bold,
    marginBottom: spacing[2],
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginBottom: spacing[10],
  },
  primaryButton: {
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.md,
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    marginBottom: spacing[3],
  },
  primaryButtonText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.actionPrimaryText,
  },
  signOut: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[2],
  },
  signOutText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
});
