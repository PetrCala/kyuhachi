import { type ComponentProps } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { AreaGuideSectionKind, CachedAreaGuide } from '@kyuhachi/shared';
import { pickLocalized } from '@/lib/area-guide';
import { colors, spacing, typography, radii } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

// One icon per section kind. Section labels themselves come from t() so they
// localise with the UI; only the prose and highlights are content.
const SECTION_ICONS: Record<AreaGuideSectionKind, IconName> = {
  specialties: 'restaurant-outline',
  produce: 'leaf-outline',
  attractions: 'camera-outline',
  history: 'time-outline',
  culture: 'color-palette-outline',
};

interface AreaGuideViewProps {
  guide: CachedAreaGuide;
  /** Small note above the hero, e.g. "Your area, detected nearby" on the nearby route. */
  locatedNote?: string;
}

/**
 * The guide screen body: a hero (region name + optional tagline) and one card
 * per section. Shared by the by-id route (from an onsen) and the nearby route
 * ("your area"). Renders whichever locale matches the UI language.
 */
export function AreaGuideView({ guide, locatedNote }: AreaGuideViewProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {locatedNote && (
        <View style={styles.locatedNote}>
          <Ionicons
            name="location-outline"
            size={typography.sizes.sm}
            color={colors.actionPrimary}
          />
          <Text style={styles.locatedText}>{locatedNote}</Text>
        </View>
      )}

      <View style={styles.hero}>
        <Text style={styles.name} selectable>
          {pickLocalized(guide.name, language)}
        </Text>
        {guide.tagline && (
          <Text style={styles.tagline} selectable>
            {pickLocalized(guide.tagline, language)}
          </Text>
        )}
      </View>

      {guide.sections.map((section) => {
        const highlights = section.highlights?.map((h) => pickLocalized(h, language)) ?? [];
        return (
          <View key={section.kind} style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIcon}>
                <Ionicons
                  name={SECTION_ICONS[section.kind]}
                  size={typography.sizes.md}
                  color={colors.actionPrimary}
                />
              </View>
              <Text style={styles.sectionTitle}>{t(`areaGuide.section.${section.kind}`)}</Text>
            </View>
            <Text style={styles.sectionBody} selectable>
              {pickLocalized(section.body, language)}
            </Text>
            {highlights.length > 0 && (
              <View style={styles.chips}>
                {highlights.map((h) => (
                  <View key={h} style={styles.chip}>
                    <Text style={styles.chipText}>{h}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: spacing[10],
  },
  locatedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
  },
  locatedText: {
    marginLeft: spacing[1],
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  hero: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
  },
  name: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  tagline: {
    marginTop: spacing[1],
    fontSize: typography.sizes.md,
    color: colors.textMuted,
  },
  section: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    marginTop: spacing[2],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionIcon: {
    width: spacing[8],
    height: spacing[8],
    borderRadius: radii.full,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[2],
  },
  sectionTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  sectionBody: {
    marginTop: spacing[2],
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.xl,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing[2],
  },
  chip: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.full,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    marginRight: spacing[2],
    marginBottom: spacing[2],
  },
  chipText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
});
