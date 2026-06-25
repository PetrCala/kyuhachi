import { act, render, screen } from '@testing-library/react-native';
import { StampClaimModal, type StampReward } from '@/components/StampClaimModal';

// Keys translate to themselves so assertions can match stable i18n keys.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

// Haptics aren't available under the test renderer; stub them out.
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success' },
}));

const REWARD: StampReward = {
  onsenId: 'onsen-1',
  prefecture: '大分県',
  areaName: '別府温泉',
  name: 'むし湯',
  dateMs: Date.UTC(2026, 5, 25),
};

// Flush the effect that reads Reduce Motion (async) so it doesn't warn.
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('StampClaimModal', () => {
  it('shows nothing when there is no reward', async () => {
    render(<StampClaimModal reward={null} animationsEnabled onDismiss={jest.fn()} />);
    await flush();
    expect(screen.queryByText('stampClaim.title')).toBeNull();
    expect(screen.queryByText('stampClaim.collect')).toBeNull();
  });

  it('inks the earned stamp, shows the glow, and offers the Collect button when animating', async () => {
    render(<StampClaimModal reward={REWARD} animationsEnabled onDismiss={jest.fn()} />);
    await flush();
    expect(screen.getByText('stampClaim.title')).toBeTruthy();
    expect(screen.getByText('stampClaim.collect')).toBeTruthy();
    // The reward's onsen fields are inked onto the seal.
    expect(screen.getByText('むし湯')).toBeTruthy();
    expect(screen.getByText('大分県')).toBeTruthy();
    // The glow halo is present while the flourish plays.
    expect(screen.getByTestId('stampGlow')).toBeTruthy();
  });

  it('shows the stamp and Collect button but hides the glow with animations disabled', async () => {
    render(<StampClaimModal reward={REWARD} animationsEnabled={false} onDismiss={jest.fn()} />);
    await flush();
    expect(screen.getByText('stampClaim.title')).toBeTruthy();
    expect(screen.getByText('stampClaim.collect')).toBeTruthy();
    expect(screen.getByText('むし湯')).toBeTruthy();
    // No glow halo lingers behind the seal when the flourish is off.
    expect(screen.queryByTestId('stampGlow')).toBeNull();
  });
});
