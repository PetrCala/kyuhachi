import { View, Text, Pressable, StyleSheet } from 'react-native';
import auth from '@react-native-firebase/auth';
import { useAuth } from '../src/context/AuthContext';
import { colors, spacing, typography, radii } from '../src/theme';

export default function Home() {
  const { user } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Kyuhachi</Text>
      <Text style={styles.subtitle}>{user?.email ?? user?.displayName ?? ''}</Text>
      <Pressable style={styles.signOut} onPress={() => auth().signOut()}>
        <Text style={styles.signOutText}>Sign out</Text>
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
