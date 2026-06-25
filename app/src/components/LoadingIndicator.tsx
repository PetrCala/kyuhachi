import { ActivityIndicator } from 'react-native';
import { colors } from '@/theme';

interface LoadingIndicatorProps {
  /** Overall size of the indicator. Mapped to the placeholder spinner for now. */
  size?: number | 'small' | 'large';
  /** Tint applied to the placeholder spinner. */
  color?: string;
}

/**
 * The app's "work in progress" visual.
 *
 * Today this is a plain platform spinner — a deliberate placeholder. It lives in
 * its own component so the visual can later be swapped for something with more
 * character (e.g. rising onsen bubbles) without touching the overlays and screens
 * that render it. Keep the prop surface small so that swap stays a drop-in.
 */
export function LoadingIndicator({ size = 'large', color = colors.actionPrimary }: LoadingIndicatorProps) {
  return <ActivityIndicator size={size} color={color} />;
}
