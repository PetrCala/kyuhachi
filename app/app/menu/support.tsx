import type { ComponentProps } from 'react';
import { ScrollView, View, Text, Pressable, Share, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  APP_STORE_URL,
  GITHUB_URL,
  ISSUES_URL,
  NEW_ISSUE_URL,
  WRITE_REVIEW_URL,
  openUrl,
} from '@/lib/links';
import { colors, spacing, typography, radii } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type RowProps = {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** External links get the open-in glyph; in-app actions (share) do not. */
  external?: boolean;
  last?: boolean;
};

function Row({ icon, label, onPress, external, last }: RowProps) {
  return (
    <Pressable onPress={onPress} accessibilityRole={external ? 'link' : 'button'}>
      <View style={[styles.row, last && styles.rowLast]}>
        <Ionicons
          name={icon}
          size={typography.sizes.xl}
          color={colors.textSecondary}
          style={styles.rowIcon}
        />
        <Text style={styles.rowLabel}>{label}</Text>
        <Ionicons
          name={external ? 'open-outline' : 'chevron-forward'}
          size={typography.sizes.lg}
          color={colors.textPlaceholder}
        />
      </View>
    </Pressable>
  );
}

export default function Support() {
  const { t } = useTranslation();

  const share = () => {
    Share.share({ message: t('support.shareMessage'), url: APP_STORE_URL }).catch(() => {
      // Sharing failing (or being dismissed) needs no follow-up.
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('support.title'), headerShown: true }} />

      <View style={styles.group}>
        <Text style={styles.bodyText}>{t('support.intro')}</Text>
      </View>

      <Text style={styles.sectionHeader}>{t('support.spreadHeader')}</Text>
      <View style={styles.group}>
        <Row
          icon="star-outline"
          label={t('support.rate')}
          onPress={() => openUrl(WRITE_REVIEW_URL)}
          external
        />
        <Row icon="share-outline" label={t('support.share')} onPress={share} last />
      </View>

      <Text style={styles.sectionHeader}>{t('support.improveHeader')}</Text>
      <View style={styles.group}>
        <Row
          icon="bug-outline"
          label={t('support.reportBug')}
          onPress={() => openUrl(ISSUES_URL)}
          external
        />
        <Row
          icon="bulb-outline"
          label={t('support.suggest')}
          onPress={() => openUrl(NEW_ISSUE_URL)}
          external
        />
        <Row
          icon="logo-github"
          label={t('support.source')}
          onPress={() => openUrl(GITHUB_URL)}
          external
          last
        />
      </View>

      <Text style={styles.note}>{t('support.note')}</Text>
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
    paddingBottom: spacing[10],
  },
  group: {
    backgroundColor: colors.background,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  bodyText: {
    fontSize: typography.sizes.md,
    lineHeight: 22,
    color: colors.textPrimary,
    padding: spacing[4],
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
  sectionHeader: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing[6],
    marginBottom: spacing[2],
    marginLeft: spacing[4],
  },
  note: {
    fontSize: typography.sizes.sm,
    lineHeight: 20,
    color: colors.textMuted,
    marginTop: spacing[6],
    marginHorizontal: spacing[4],
  },
});
