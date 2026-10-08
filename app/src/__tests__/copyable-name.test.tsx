import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { CopyableName } from '@/components/CopyableName';
import { COPIED_FEEDBACK_MS } from '@/hooks/useCopyToClipboard';

// Keys translate to themselves so assertions can match stable i18n keys.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light' },
}));

// The glyph name is the observable: it tells copy-at-rest from copied.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = jest.requireActual('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => <RNText testID="copy-icon">{name}</RNText>,
  };
});

const NAME = '山田温泉';

async function pressCopyButton() {
  await act(async () => {
    fireEvent.press(screen.getByLabelText('copyName.copy'));
  });
}

describe('CopyableName', () => {
  let announce: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation();
  });

  afterEach(() => {
    announce.mockRestore();
    jest.useRealTimers();
  });

  it('shows the name with a copy icon at rest', () => {
    render(<CopyableName name={NAME} textStyle={{}} numberOfLines={2} inverted />);
    expect(screen.getByText(NAME)).toBeTruthy();
    expect(screen.getByTestId('copy-icon')).toHaveTextContent('copy-outline');
    expect(screen.getByLabelText('copyName.copy')).toBeTruthy();
  });

  it('copies the name when the icon is tapped, with haptic and spoken feedback', async () => {
    render(<CopyableName name={NAME} textStyle={{}} />);

    await pressCopyButton();

    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(NAME);
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
    expect(announce).toHaveBeenCalledWith('copyName.copied');
    // The icon confirms visually and the label confirms to VoiceOver.
    expect(screen.getByTestId('copy-icon')).toHaveTextContent('checkmark');
    expect(screen.getByLabelText('copyName.copied')).toBeTruthy();
  });

  it('copies the name on a long-press of the name itself', async () => {
    render(<CopyableName name={NAME} textStyle={{}} />);

    await act(async () => {
      fireEvent(screen.getByText(NAME), 'longPress');
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(NAME);
    expect(screen.getByTestId('copy-icon')).toHaveTextContent('checkmark');
  });

  it('returns to the copy icon once the confirmation window has passed', async () => {
    render(<CopyableName name={NAME} textStyle={{}} />);

    await pressCopyButton();
    act(() => {
      jest.advanceTimersByTime(COPIED_FEEDBACK_MS - 1);
    });
    expect(screen.getByTestId('copy-icon')).toHaveTextContent('checkmark');

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByTestId('copy-icon')).toHaveTextContent('copy-outline');
    expect(screen.getByLabelText('copyName.copy')).toBeTruthy();
  });

  it('restarts the confirmation window on a repeat copy instead of cutting it short', async () => {
    render(<CopyableName name={NAME} textStyle={{}} />);

    await pressCopyButton();
    act(() => {
      jest.advanceTimersByTime(COPIED_FEEDBACK_MS - 100);
    });
    // Second copy, pressed while still confirmed: the button now reads "copied".
    await act(async () => {
      fireEvent.press(screen.getByLabelText('copyName.copied'));
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    // The first window would have ended by now; the second keeps it confirmed.
    expect(screen.getByTestId('copy-icon')).toHaveTextContent('checkmark');
    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(2);
  });
});
