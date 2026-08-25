import { render, screen, fireEvent } from '@testing-library/react-native';
import { Linking, Share } from 'react-native';

import SupportScreen from '../../app/menu/support';

// Header/icons render as no-ops; t returns the key.
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });

afterEach(() => {
  openURL.mockClear();
  shareSpy.mockClear();
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
