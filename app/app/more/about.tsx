import type { ComponentProps } from 'react';
import { ScrollView, View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { colors, spacing, typography, radii } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

// External destinations. Not translatable — these are configuration, not copy.
const GITHUB_URL = 'https://github.com/PetrCala/kyuhachi';
const ISSUES_URL = 'https://github.com/PetrCala/kyuhachi/issues';
const DATA_SOURCE_URL = 'https://www.88onsen.com';
// Source docs live at docs/legal/{privacy,terms}.md. These point at the
// GitHub-rendered copies for now; swap to the Firebase Hosting URLs once the
// policy pages are deployed (see the hosting task).
const PRIVACY_URL = 'https://github.com/PetrCala/kyuhachi/blob/master/docs/legal/privacy.md';
const TERMS_URL = 'https://github.com/PetrCala/kyuhachi/blob/master/docs/legal/terms.md';

// 九 (kyu) over 八 (hachi), set in Klee One — the app's visual identity. Mirrors
// the sign-in brand mark; not a translatable string.
const BRAND_MARK = '九\n八';

function openUrl(url: string) {
  Linking.openURL(url).catch(() => {
    // Nothing actionable if the device has no handler for the URL.
  });
}

type LinkRowProps = {
  icon: IconName;
  label: string;
  url: string;
  last?: boolean;
};

function LinkRow({ icon, label, url, last }: LinkRowProps) {
  return (
    <Pressable onPress={() => openUrl(url)} accessibilityRole="link">
      <View style={[styles.row, last && styles.rowLast]}>
        <Ionicons
          name={icon}
          size={typography.sizes.xl}
          color={colors.textSecondary}
          style={styles.rowIcon}
        />
        <Text style={styles.rowLabel}>{label}</Text>
        <Ionicons name="open-outline" size={typography.sizes.lg} color={colors.textPlaceholder} />
      </View>
    </Pressable>
  );
}

export default function About() {
  const { t } = useTranslation();

  const version = Constants.expoConfig?.version ?? '—';
  // The iOS build number (CFBundleVersion) is injected by fastlane *after*
  // `expo prebuild`, so it never reaches Constants.expoConfig.ios.buildNumber.
  // Read it from the native Info.plist at runtime instead. See docs/ios-deploy.md.
  const build = Application.nativeBuildVersion;
  const versionLabel = build
    ? t('about.versionWithBuild', { version, build })
    : t('about.version', { version });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('about.title'), headerShown: true }} />

      <View style={styles.identity}>
        <View style={styles.brandMark}>
          <Text style={styles.brandGlyph}>{BRAND_MARK}</Text>
        </View>
        <Text style={styles.appName}>{Constants.expoConfig?.name ?? 'Kyuhachi'}</Text>
        <Text style={styles.tagline}>{t('about.tagline')}</Text>
        <Text style={styles.version}>{versionLabel}</Text>
      </View>

      <Text style={styles.sectionHeader}>{t('about.aboutHeader')}</Text>
      <View style={styles.group}>
        <Text style={styles.bodyText}>{t('about.aboutBody')}</Text>
      </View>

      <Text style={styles.sectionHeader}>{t('about.linksHeader')}</Text>
      <View style={styles.group}>
        <LinkRow icon="logo-github" label={t('about.github')} url={GITHUB_URL} />
        <LinkRow icon="water-outline" label={t('about.dataSource')} url={DATA_SOURCE_URL} />
        <LinkRow icon="bug-outline" label={t('about.reportBug')} url={ISSUES_URL} last />
      </View>

      <Text style={styles.sectionHeader}>{t('about.legalHeader')}</Text>
      <View style={styles.group}>
        <LinkRow icon="shield-checkmark-outline" label={t('about.privacy')} url={PRIVACY_URL} />
        <LinkRow icon="document-text-outline" label={t('about.terms')} url={TERMS_URL} last />
      </View>

      <Text style={styles.sectionHeader}>{t('about.acknowledgmentsHeader')}</Text>
      <View style={styles.group}>
        <Text style={styles.bodyText}>{t('about.acknowledgmentsBody')}</Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t('about.copyright')}</Text>
        <Text style={styles.footerText}>{t('about.madeWith')}</Text>
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
    paddingBottom: spacing[10],
  },
  identity: {
    alignItems: 'center',
    paddingVertical: spacing[6],
  },
  brandMark: {
    width: 88, // decorative logo tile; mirrors the app icon proportions
    height: 88,
    borderRadius: radii.xl,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  brandGlyph: {
    fontFamily: typography.fonts.brand,
    fontSize: typography.sizes.xxxl,
    lineHeight: 30, // tight stack so 九 and 八 read as one mark
    textAlign: 'center',
    color: colors.brandGlyph,
  },
  appName: {
    fontFamily: typography.fonts.brand,
    fontSize: typography.sizes.xxl,
    color: colors.textPrimary,
  },
  tagline: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing[1],
  },
  version: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing[2],
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
  footer: {
    alignItems: 'center',
    marginTop: spacing[8],
  },
  footerText: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    marginTop: spacing[1],
  },
});
