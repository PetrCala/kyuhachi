import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  Share,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { TipProductId } from '@kyuhachi/shared';
import { useTipJar } from '@/hooks/useTipJar';
import type { TipProduct } from '@/lib/tip-jar';
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

// One icon and one label per tier: a bath, a towel to dry off with, a night's
// stay. The label is ours rather than the store's product name, because
// StoreKit localizes names by the device's App Store account and would show a
// Japanese reader on a non-Japanese storefront the English name.
const TIP_ICONS: Record<TipProductId, IconName> = {
  'com.kyuhachi.app.tip.bath': 'water-outline',
  'com.kyuhachi.app.tip.towel': 'shirt-outline',
  'com.kyuhachi.app.tip.stay': 'moon-outline',
};

const TIP_LABELS: Record<TipProductId, string> = {
  'com.kyuhachi.app.tip.bath': 'support.tipBath',
  'com.kyuhachi.app.tip.towel': 'support.tipTowel',
  'com.kyuhachi.app.tip.stay': 'support.tipStay',
};

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

type TipRowProps = {
  product: TipProduct;
  label: string;
  pending: boolean;
  disabled: boolean;
  onPress: (id: TipProductId) => void;
  last?: boolean;
};

function TipRow({ product, label, pending, disabled, onPress, last }: TipRowProps) {
  return (
    <Pressable
      onPress={() => onPress(product.id)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <View style={[styles.row, last && styles.rowLast]}>
        <Ionicons
          name={TIP_ICONS[product.id]}
          size={typography.sizes.xl}
          color={colors.textSecondary}
          style={styles.rowIcon}
        />
        <Text style={styles.rowLabel}>{label}</Text>
        {pending ? (
          <ActivityIndicator color={colors.textSecondary} />
        ) : (
          // The store's own price string: already formatted for the user's
          // storefront and currency, so the app never formats one.
          <Text style={styles.price}>{product.price}</Text>
        )}
      </View>
    </Pressable>
  );
}

export default function Support() {
  const { t } = useTranslation();

  const onPurchaseFailed = useCallback(() => {
    Alert.alert(t('support.tipErrorTitle'), t('support.tipErrorMessage'));
  }, [t]);
  const { status, products, pendingId, tipsGiven, tip } = useTipJar({ onPurchaseFailed });

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

      <Text style={styles.sectionHeader}>{t('support.tipHeader')}</Text>
      <View style={styles.group}>
        {status === 'loading' ? (
          <View style={[styles.row, styles.rowLast]}>
            <ActivityIndicator color={colors.textSecondary} />
          </View>
        ) : null}
        {status === 'unavailable' ? (
          <Text style={styles.bodyText}>{t('support.tipUnavailable')}</Text>
        ) : null}
        {status === 'ready'
          ? products.map((product, index) => (
              <TipRow
                key={product.id}
                product={product}
                label={t(TIP_LABELS[product.id])}
                pending={pendingId === product.id}
                disabled={pendingId !== null}
                onPress={tip}
                last={index === products.length - 1}
              />
            ))
          : null}
      </View>
      <Text style={styles.note}>
        {tipsGiven > 0 ? t('support.tipThanks') : t('support.tipExplain')}
      </Text>

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

      <Text style={[styles.note, styles.noteLast]}>{t('support.note')}</Text>
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
  price: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
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
    marginTop: spacing[3],
    marginHorizontal: spacing[4],
  },
  noteLast: {
    marginTop: spacing[6],
  },
});
