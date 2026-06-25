import { render, screen } from '@testing-library/react-native';
import { PassportPage } from '../../app/passport';

// passport.tsx pulls in <Stack.Screen>, the Firebase-backed progress hook, and
// the AsyncStorage-backed preferences at module load; stub them so PassportPage
// can be tested in isolation (it uses none of them itself).
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { push: jest.fn() } }));
jest.mock('@/context/PreferencesContext', () => ({ usePreferences: () => ({ animatePassport: true }) }));
jest.mock('@/hooks/useActiveChallengeProgress', () => ({ useActiveChallengeProgress: jest.fn() }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const stamped = [
  { onsenId: 'a', ms: 1, prefecture: '大分県', areaName: '別府温泉', name: 'むし湯' },
  { onsenId: 'b', ms: 2, prefecture: '熊本県', areaName: '黒川温泉', name: '山みず木' },
  { onsenId: 'c', ms: 3, prefecture: '佐賀県', areaName: '武雄温泉', name: '元湯' },
];

// The latest stamp is the last (highest ms) entry — slot 2 on page 0.
const MOST_RECENT_SLOT = stamped.length - 1;

describe('PassportPage reveal', () => {
  it('gives the most-recent stamp the ink-press emphasis when animating the open page', () => {
    render(
      <PassportPage
        pageIndex={0}
        totalSlots={stamped.length}
        stamped={stamped}
        stampSize={80}
        animate
        isCurrent
        mostRecentSlot={MOST_RECENT_SLOT}
      />
    );
    // Two cascading stamps plus the single ink-pressed newest stamp.
    expect(screen.getAllByTestId('passportStamp')).toHaveLength(2);
    expect(screen.getAllByTestId('passportInkStamp')).toHaveLength(1);
    // The inked seal still carries its onsen name.
    expect(screen.getByText('元湯')).toBeTruthy();
  });

  it('renders every stamp plainly with no ink-press when motion is off', () => {
    render(
      <PassportPage
        pageIndex={0}
        totalSlots={stamped.length}
        stamped={stamped}
        stampSize={80}
        animate={false}
        isCurrent
        mostRecentSlot={MOST_RECENT_SLOT}
      />
    );
    // No stamp is singled out for the ink-press; all appear at once.
    expect(screen.queryByTestId('passportInkStamp')).toBeNull();
    expect(screen.getAllByTestId('passportStamp')).toHaveLength(stamped.length);
    expect(screen.getByText('元湯')).toBeTruthy();
  });
});
