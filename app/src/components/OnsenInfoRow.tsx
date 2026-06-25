import { type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@/theme';

interface OnsenInfoRowProps {
  label: string;
  value: string;
  /** Renders the whole value as an underlined, tappable link (e.g. phone number). */
  onPress?: () => void;
  /** An inline icon (e.g. directions) shown right after the value text, tappable on its own. */
  action?: {
    icon: ComponentProps<typeof Ionicons>['name'];
    onPress: () => void;
    accessibilityLabel: string;
  };
}

/**
 * A labelled value row used across the onsen detail screen and the map-pin preview
 * sheet. The value renders either as plain selectable text, an inline-action variant
 * (a tappable icon after the text), or — when `onPress` is given — a link-style
 * pressable spanning the whole value.
 */
export function OnsenInfoRow({ label, value, onPress, action }: OnsenInfoRowProps) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel} selectable>
        {label}
      </Text>
      {onPress ? (
        <Pressable
          style={styles.infoValuePressable}
          onPress={onPress}
          accessibilityRole="button"
          hitSlop={spacing[1]}
        >
          <Text style={[styles.infoValue, styles.infoValueLink]} selectable>
            {value}
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.infoValue} selectable>
          {value}
          {action && (
            <Text
              onPress={action.onPress}
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel}
              suppressHighlighting
            >
              {'  '}
              <Ionicons name={action.icon} size={typography.sizes.md} color={colors.actionPrimary} />
            </Text>
          )}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  infoRow: {
    flexDirection: 'row',
    paddingVertical: spacing[2],
  },
  infoLabel: {
    width: spacing[12] + spacing[8],
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    flexShrink: 0,
  },
  infoValue: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    lineHeight: typography.sizes.xl,
  },
  infoValuePressable: {
    flex: 1,
  },
  infoValueLink: {
    color: colors.actionPrimary,
    textDecorationLine: 'underline',
  },
});
