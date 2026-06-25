import { act, render, screen } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { ProgressBar, type ProgressMarker } from '@/components/ProgressBar';

// TierBadge renders an SVG seal; stub the native svg primitives so the bar
// renders under react-test-renderer.
jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Svg: 'Svg',
  Circle: 'Circle',
  G: 'G',
  Path: 'Path',
  Text: 'Text',
}));

const MARKERS: ProgressMarker[] = [
  { position: 44, tierId: 'silver', reached: false },
  { position: 88, tierId: 'gold', reached: false },
];

describe('ProgressBar fill animation', () => {
  // Spying on Animated.timing tells a snap (setValue, no timing) apart from a
  // tween (timing drives the fill) without reaching into Animated internals.
  let timingSpy: jest.SpyInstance;
  beforeEach(() => {
    timingSpy = jest.spyOn(Animated, 'timing');
  });
  afterEach(() => timingSpy.mockRestore());

  it('renders a marker label for each tier threshold', () => {
    render(<ProgressBar value={5} total={88} markers={MARKERS} animate={false} />);
    expect(screen.getByText('44')).toBeTruthy();
    expect(screen.getByText('88')).toBeTruthy();
  });

  it('snaps to the new fill (no tween) when not animating', () => {
    const { rerender } = render(
      <ProgressBar value={5} total={88} markers={MARKERS} animate={false} />
    );
    timingSpy.mockClear();
    act(() => {
      rerender(<ProgressBar value={44} total={88} markers={MARKERS} animate={false} />);
    });
    expect(timingSpy).not.toHaveBeenCalled();
  });

  it('tweens toward the new fill when animating', () => {
    const { rerender } = render(
      <ProgressBar value={5} total={88} markers={MARKERS} animate={false} />
    );
    timingSpy.mockClear();
    act(() => {
      rerender(<ProgressBar value={44} total={88} markers={MARKERS} animate />);
    });
    expect(timingSpy).toHaveBeenCalled();
  });
});
