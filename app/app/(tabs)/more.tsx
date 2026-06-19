import type { ComponentProps } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from '@react-native-firebase/auth';
import { useAuth } from '../../src/context/AuthContext';
import { auth } from '../../src/firebase';
import { colors, spacing, typography, radii } from '../../src/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type RowProps = {
  icon: IconName;
  label: string;
  onPress?: () => void;
  badge?: string;
  destructive?: boolean;
  disabled?: boolean;
  last?: boolean;
};

function Row({ icon, label, onPress, badge, destructive, disabled, last }: RowProps) {
  const tint = destructive
    ? colors.destructive
    : disabled
    ? colors.tabBarInactive
    : colors.textSecondary;

  const body = (
    <View style={[styles.row, last && styles.rowLast]}>
      <Ionicons name={icon} size={typography.sizes.xl} color={tint} style={styles.rowIcon} />
      <Text
        style={[
          styles.rowLabel,
          destructive && styles.rowLabelDestructive,
          disabled && styles.rowLabelDisabled,
        ]}
      >
        {label}
      </Text>
      {badge ? <Text style={styles.badge}>{badge}</Text> : null}
      {onPress && !disabled ? (
        <Ionicons name="chevron-forward" size={typography.sizes.lg} color={colors.textPlaceholder} />
      ) : null}
    </View>
  );

  if (onPress && !disabled) {
    return <Pressable onPress={onPress}>{body}</Pressable>;
  }
  return body;
}

export default function More() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const accountLabel = user?.email ?? user?.displayName ?? '';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.group}>
        <Row
          icon="trophy-outline"
          label={t('more.challenges')}
          onPress={() => router.push('/challenge/list')}
        />
        <Row
          icon="navigate-outline"
          label={t('more.routes')}
          onPress={() => router.push('/routes')}
        />
        <Row icon="stats-chart-outline" label={t('more.stats')} badge={t('more.statsBadge')} disabled last />
      </View>

      <Text style={styles.sectionHeader}>{t('more.account')}</Text>
      <View style={styles.group}>
        {accountLabel ? (
          <View style={styles.row}>
            <Ionicons
              name="person-circle-outline"
              size={typography.sizes.xl}
              color={colors.textSecondary}
              style={styles.rowIcon}
            />
            <Text style={styles.rowValue} numberOfLines={1}>
              {accountLabel}
            </Text>
          </View>
        ) : null}
        <Row icon="log-out-outline" label={t('more.signOut')} onPress={() => signOut(auth)} destructive last />
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
    color: colors.textPrimary,
  },
  rowLabelDestructive: {
    color: colors.destructive,
  },
  rowLabelDisabled: {
    color: colors.tabBarInactive,
  },
  rowValue: {
    flex: 1,
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
  },
  badge: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginRight: spacing[2],
  },
  sectionHeader: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing[6],
    marginBottom: spacing[2],
    marginLeft: spacing[4],
  },
});
