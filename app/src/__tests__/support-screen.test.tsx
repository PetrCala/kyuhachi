import { render, screen, fireEvent } from '@testing-library/react-native';
import { Alert, Linking, Share } from 'react-native';
import { useTipJar } from '@/hooks/useTipJar';

import SupportScreen from '../../app/menu/support';

// Header/icons render as no-ops; t returns the key.
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// The store side is covered by use-tip-jar.test.tsx; here the hook is a stub.
jest.mock('@/hooks/useTipJar', () => ({ useTipJar: jest.fn() }));

const mockTipJar = useTipJar as jest.Mock;
const tip = jest.fn();

const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });

function tipJar(overrides: Partial<ReturnType<typeof useTipJar>> = {}) {
  return {
    status: 'ready' as const,
    products: [
      { id: 'com.kyuhachi.app.tip.bath', title: 'Buy me a bath', price: '¥300' },
      { id: 'com.kyuhachi.app.tip.towel', title: 'A towel too', price: '¥800' },
    ],
    pendingId: null,
    tipsGiven: 0,
    tip,
    ...overrides,
  };
}

beforeEach(() => {
  mockTipJar.mockReturnValue(tipJar());
});

afterEach(() => {
  openURL.mockClear();
  shareSpy.mockClear();
  tip.mockClear();
  mockTipJar.mockReset();
});

test('the rate row opens the App Store review composer', () => {
  render(<SupportScreen />);

  fireEvent.press(screen.getByText('support.rate'));

  // Apple's documented write-review deep link, not StoreKit's rate-limited prompt.
  expect(openURL).toHaveBeenCalledWith(
    'https://apps.apple.com/app/id6761064476?action=write-review'
  );
});

test('the share row opens the system share sheet with the App Store link', () => {
  render(<SupportScreen />);

  fireEvent.press(screen.getByText('support.share'));

  expect(shareSpy).toHaveBeenCalledWith({
    message: 'support.shareMessage',
    url: 'https://apps.apple.com/app/id6761064476',
  });
});

test('the feedback rows open GitHub', () => {
  render(<SupportScreen />);

  fireEvent.press(screen.getByText('support.reportBug'));
  fireEvent.press(screen.getByText('support.suggest'));
  fireEvent.press(screen.getByText('support.source'));

  expect(openURL.mock.calls.map(([url]) => url)).toEqual([
    'https://github.com/PetrCala/kyuhachi/issues',
    'https://github.com/PetrCala/kyuhachi/issues/new',
    'https://github.com/PetrCala/kyuhachi',
  ]);
});

test('the tip rows show the store’s title and price, and buy on tap', () => {
  render(<SupportScreen />);

  expect(screen.getByText('¥300')).toBeTruthy();
  fireEvent.press(screen.getByText('Buy me a bath'));

  expect(tip).toHaveBeenCalledWith('com.kyuhachi.app.tip.bath');
});

test('a purchase in flight blocks the other tip rows', () => {
  mockTipJar.mockReturnValue(tipJar({ pendingId: 'com.kyuhachi.app.tip.bath' }));
  render(<SupportScreen />);

  fireEvent.press(screen.getByText('A towel too'));

  expect(tip).not.toHaveBeenCalled();
});

test('an unavailable store explains itself instead of showing rows', () => {
  mockTipJar.mockReturnValue(tipJar({ status: 'unavailable', products: [] }));
  render(<SupportScreen />);

  expect(screen.getByText('support.tipUnavailable')).toBeTruthy();
  expect(screen.queryByText('Buy me a bath')).toBeNull();
});

test('the note thanks a user who has already tipped', () => {
  mockTipJar.mockReturnValue(tipJar({ tipsGiven: 2 }));
  render(<SupportScreen />);

  expect(screen.getByText('support.tipThanks')).toBeTruthy();
  expect(screen.queryByText('support.tipExplain')).toBeNull();
});

test('a failed purchase is surfaced as an alert', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  render(<SupportScreen />);

  // The screen owns the message; the hook only decides when to call it.
  mockTipJar.mock.calls[0][0].onPurchaseFailed();

  expect(alert).toHaveBeenCalledWith('support.tipErrorTitle', 'support.tipErrorMessage');
  alert.mockRestore();
});
