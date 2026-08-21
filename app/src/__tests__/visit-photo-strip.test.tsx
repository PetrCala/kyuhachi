import { fireEvent, render, screen } from '@testing-library/react-native';
import { VisitPhotoStrip } from '@/components/VisitPhotoStrip';

// Keys translate to themselves, with interpolation kept so the "photo N of M"
// label can be asserted on.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${vars.index}/${vars.count}` : key,
    i18n: { language: 'en' },
  }),
}));

// expo-image is a native view; render it as a host component so its props
// (chiefly `source`) can be inspected.
jest.mock('expo-image', () => ({ Image: 'ExpoImage' }));

const URLS = ['https://example.test/a.jpg', 'https://example.test/b.jpg', 'https://example.test/c.jpg'];

const PAGE_WIDTH = 300;

/** Fires the layout pass that gives the pager its page width. */
function layout() {
  fireEvent(screen.root, 'layout', {
    nativeEvent: { layout: { width: PAGE_WIDTH, height: 200 } },
  });
}

/** Fires a scroll to `page`, as a swipe that has settled there would. */
function scrollTo(page: number) {
  fireEvent.scroll(screen.UNSAFE_getByType('RCTScrollView' as never), {
    nativeEvent: {
      contentOffset: { x: page * PAGE_WIDTH, y: 0 },
      contentSize: { width: PAGE_WIDTH * URLS.length, height: 200 },
      layoutMeasurement: { width: PAGE_WIDTH, height: 200 },
    },
  });
}

function mountedSources() {
  return screen.UNSAFE_queryAllByType('ExpoImage' as never).map((node) => node.props.source);
}

describe('VisitPhotoStrip', () => {
  it('renders one page per photo, each labelled with its position', () => {
    render(<VisitPhotoStrip urls={URLS} />);
    layout();

    expect(screen.getByLabelText('visits.photoOfCount:1/3')).toBeTruthy();
    expect(screen.getByLabelText('visits.photoOfCount:2/3')).toBeTruthy();
    expect(screen.getByLabelText('visits.photoOfCount:3/3')).toBeTruthy();
  });

  it('labels a lone photo without a position', () => {
    render(<VisitPhotoStrip urls={[URLS[0]]} />);
    layout();

    expect(screen.getByLabelText('visits.photo')).toBeTruthy();
  });

  it('loads only the current photo and the next one until swiped further', () => {
    render(<VisitPhotoStrip urls={URLS} />);
    layout();

    // The third photo is behind two swipes and costs several megabytes; a
    // reader who never swipes must never pay for it.
    expect(mountedSources()).toEqual([URLS[0], URLS[1]]);
  });

  it('keeps photos mounted once swiped past, so swiping back is instant', () => {
    render(<VisitPhotoStrip urls={URLS} />);
    layout();

    scrollTo(2);
    expect(mountedSources()).toEqual(URLS);

    scrollTo(0);
    expect(mountedSources()).toEqual(URLS);
  });

  it('reports the tapped photo by index', () => {
    const onPressPhoto = jest.fn();
    render(<VisitPhotoStrip urls={URLS} onPressPhoto={onPressPhoto} />);
    layout();

    fireEvent.press(screen.getByLabelText('visits.photoOfCount:2/3'));
    expect(onPressPhoto).toHaveBeenCalledWith(1);
  });
});
