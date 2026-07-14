import type { ComponentProps } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from '@react-native-firebase/auth';
import { useAuth } from '@/context/AuthContext';
import { auth } from '@/firebase';
import { colors, spacing, typography, radii } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

// Canonical Firebase provider id for Sign in with Apple. Used only to label the
// sign-in method; not user-facing copy, so exempt from the i18n rule.
const APPLE_PROVIDER_ID = 'apple.com';

// Identity avatar glyph. A plain size literal (not a style token): icon sizing
// is outside the spacing/font/radius token rules, mirroring about.tsx.
const AVATAR_SIZE = 64;

type ActionRowProps = {
  icon: IconName;
  label: string;
  onPress: () => void;
  chevron?: boolean;
  last?: boolean;
};

function ActionRow({ icon, label, onPress, chevron, last }: ActionRowProps) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <View style={[styles.row, last && styles.rowLast]}>
        <Ionicons
          name={icon}
          size={typography.sizes.xl}
          color={colors.destructive}
          style={styles.rowIcon}
        />
        <Text style={styles.rowLabel}>{label}</Text>
        {chevron ? (
          <Ionicons name="chevron-forward" size={typography.sizes.lg} color={colors.textPlaceholder} />
        ) : null}
      </View>
    </Pressable>
  );
}

export default function Account() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const email = user?.email ?? '';
  const displayName = user?.displayName ?? '';
  // Lead with the friendliest identifier; show the email underneath only when a
  // display name is also present (otherwise it's already the primary line).
  const primary = displayName || email || t('account.title');
  const secondary = displayName && email ? email : '';

  const isApple = user?.providerData.some((p) => p.providerId === APPLE_PROVIDER_ID) ?? false;
  const provider = isApple ? t('account.signedInWithApple') : t('account.signedInWithEmail');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('account.title'), headerShown: true }} />

      <View style={styles.identity}>
        <Ionicons name="person-circle-outline" size={AVATAR_SIZE} color={colors.textSecondary} />
        <Text style={styles.primary} numberOfLines={1}>
          {primary}
        </Text>
        {secondary ? (
          <Text style={styles.secondary} numberOfLines={1}>
            {secondary}
          </Text>
        ) : null}
        <Text style={styles.provider}>{provider}</Text>
      </View>

      <View style={styles.group}>
        <ActionRow icon="log-out-outline" label={t('account.signOut')} onPress={() => signOut(auth)} />
        <ActionRow
          icon="trash-outline"
          label={t('account.deleteAccount')}
          onPress={() => router.push('/menu/delete-account')}
          chevron
          last
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  content: {
    padding: spacing[4],
  },
  identity: {
    alignItems: 'center',
    paddingVertical: spacing[6],
  },
  primary: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginTop: spacing[2],
  },
  secondary: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    marginTop: spacing[1],
  },
  provider: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing[2],
  },
  group: {
    backgroundColor: colors.background,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowIcon: {
    marginRight: spacing[3],
  },
  rowLabel: {
    flex: 1,
    fontSize: typography.sizes.md,
    color: colors.destructive,
  },
});
