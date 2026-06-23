import type { ComponentProps } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from '@react-native-firebase/auth';
import { useAuth } from '@/context/AuthContext';
import { auth } from '@/firebase';
import { DEV_TOOLS_ENABLED } from '@/lib/dev/flags';
import { LANGUAGES, setAppLanguage } from '@/i18n';
import { colors, spacing, typography, radii, shadows } from '@/theme';

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

function LanguageToggle() {
  const { i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? i18n.language;

  return (
    <View style={styles.segmented}>
      {LANGUAGES.map(({ code, label }) => {
        const active = current === code;
        return (
          <Pressable
            key={code}
            onPress={() => setAppLanguage(code)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && styles.segmentActive, active && shadows.sm]}
          >
            <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
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

      <Text style={styles.sectionHeader}>{t('more.language')}</Text>
      <View style={styles.group}>
        <View style={styles.languageRow}>
          <LanguageToggle />
        </View>
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

      {/* Dev-only entry; never rendered in App Store builds, so the labels are an
          intentional exception to the i18n rule (the screen is English-only). */}
      {DEV_TOOLS_ENABLED ? (
        <>
          <Text style={styles.sectionHeader}>Developer</Text>
          <View style={styles.group}>
            <Row
              icon="construct-outline"
              label="Mock data & resets"
              onPress={() => router.push('/dev')}
              last
            />
          </View>
        </>
      ) : null}
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
  languageRow: {
    padding: spacing[3],
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.md,
    padding: spacing[1],
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[2],
    borderRadius: radii.sm,
  },
  segmentActive: {
    backgroundColor: colors.background,
  },
  segmentLabel: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
  },
  segmentLabelActive: {
    color: colors.textPrimary,
    fontWeight: typography.weights.semibold,
  },
});
