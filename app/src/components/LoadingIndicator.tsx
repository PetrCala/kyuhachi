import { StampingLoader } from '@/components/StampingLoader';
import { colors } from '@/theme';

interface LoadingIndicatorProps {
  /** Retained for the call sites; the stamp loader has a fixed footprint. */
  size?: number | 'small' | 'large';
  /** Tint for the stamp body (and the Reduce-Motion fallback spinner). */
  color?: string;
}

/**
 * The app's "work in progress" visual: a rubber stamp pressing onto the page (see
 * {@link StampingLoader}). It lives in its own component so the busy visual stays
 * a single swap point for the overlays and screens that render it.
 */
export function LoadingIndicator({ color = colors.actionPrimary }: LoadingIndicatorProps) {
  return <StampingLoader color={color} />;
}
