import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { colors, spacing, typography } from '@/theme';

interface CopyableNameProps {
  /** The name shown, and what a copy puts on the pasteboard. */
  name: string;
  /** Typography for the name; each caller styles its own. */
  textStyle: StyleProp<TextStyle>;
  /** Layout for the row (margins); each caller positions its own. */
  style?: StyleProp<ViewStyle>;
  numberOfLines?: number;
  /** Light-on-dark icon, for a name sitting over a photo scrim. */
  inverted?: boolean;
}

/**
 * An onsen's name with a copy affordance, shared by the onsen detail screen and
 * the map-pin preview sheet so copying works the same wherever the name shows.
 *
 * Two ways to copy, both ending in the same feedback (a light haptic, the icon
 * swapping to a checkmark for a moment, a VoiceOver announcement):
 *  - tap the copy icon beside the name: the discoverable path;
 *  - long-press the name itself: the iOS text habit, kept so the muscle memory
 *    that reaches for it still lands somewhere.
 *
 * The icon is the explicit control, so the long-press replaces `selectable`
 * rather than stacking a second long-press menu on top of it. Copies the name
 * only, never the reading beneath it: that is what gets pasted into a search
 * box or a message.
 */
export function CopyableName({
  name,
  textStyle,
  style,
  numberOfLines,
  inverted = false,
}: CopyableNameProps) {
  const { t } = useTranslation();
  const { copied, copy } = useCopyToClipboard(t('copyName.copied'));
  const handleCopy = () => void copy(name);
  const iconColor = inverted ? colors.textInverted : colors.actionPrimary;

  return (
    <View style={[styles.row, style]}>
      <Text
        style={[textStyle, styles.name]}
        numberOfLines={numberOfLines}
        onLongPress={handleCopy}
        suppressHighlighting
      >
        {name}
      </Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={handleCopy}
        // Pads the glyph out to a comfortable finger target.
        hitSlop={spacing[3]}
        accessibilityRole="button"
        accessibilityLabel={copied ? t('copyName.copied') : t('copyName.copy')}
      >
        <Ionicons
          name={copied ? 'checkmark' : 'copy-outline'}
          size={typography.sizes.xl}
          color={iconColor}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // The icon hugs the name rather than floating at the far edge, so it reads as
  // the name's own control and not a generic header action.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  // Wraps within the row instead of pushing the icon off-screen.
  name: {
    flexShrink: 1,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.5,
  },
});
