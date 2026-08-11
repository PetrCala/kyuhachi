import { render, screen } from '@testing-library/react-native';
import type { CachedOnsen } from '@kyuhachi/shared';
import OnsenHeroImage from '@/components/OnsenHeroImage';
import { cachedOnsen } from '@/lib/__fixtures__/onsen-doc';
import { groundForPrefecture } from '@/lib/onsen-mark';

// Keys translate to themselves so assertions can match stable i18n keys.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

// The mark is drawn with react-native-svg; stub the primitives so it renders
// under react-test-renderer. Their props survive into the tree, which is what
// the determinism assertions below compare.
jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Svg: 'Svg',
  Circle: 'Circle',
  Defs: 'Defs',
  G: 'G',
  Path: 'Path',
  Pattern: 'Pattern',
  Rect: 'Rect',
  Text: 'Text',
}));

/** The rendered mark, serialized, so two renders can be compared as values. */
function drawn(onsen: CachedOnsen): string {
  const view = render(<OnsenHeroImage onsen={onsen} style={{}} />);
  const json = JSON.stringify(view.toJSON());
  view.unmount();
  return json;
}

describe('OnsenHeroImage', () => {
  // SHOW_CATALOG_PHOTOS is off (app/src/lib/catalog-photos.ts): every onsen
  // renders the generated mark regardless of imageUrl.
  it('renders the generated mark even when the onsen has a photo', () => {
    render(
      <OnsenHeroImage
        onsen={cachedOnsen({ imageUrl: 'https://img.example/a.jpg', blurhash: 'LEHV6nWB2yk8' })}
        style={{}}
      />
    );
    expect(screen.getByLabelText('onsenPreview.onsenMark')).toBeTruthy();
  });

  it('renders with a null spring quality and a null blurhash', () => {
    render(
      <OnsenHeroImage onsen={cachedOnsen({ springQuality: null, blurhash: null })} style={{}} />
    );
    expect(screen.getByLabelText('onsenPreview.onsenMark')).toBeTruthy();
  });

  it('draws the same mark for the same onsen on every render', () => {
    const onsen = cachedOnsen({ id: 'stable-id' });
    expect(drawn(onsen)).toBe(drawn(onsen));
  });

  it('draws a different mark for a different onsen in the same place', () => {
    const here = { prefecture: '大分県', springQuality: '単純温泉' };
    expect(drawn(cachedOnsen({ id: 'onsen-a', ...here }))).not.toBe(
      drawn(cachedOnsen({ id: 'onsen-b', ...here }))
    );
  });

  it('grounds the mark in the onsen prefecture, differently for each', () => {
    const oita = drawn(cachedOnsen({ prefecture: '大分県' }));
    const kagoshima = drawn(cachedOnsen({ prefecture: '鹿児島県' }));
    expect(oita).toContain(groundForPrefecture('大分県'));
    expect(kagoshima).toContain(groundForPrefecture('鹿児島県'));
    expect(oita).not.toBe(kagoshima);
  });

  it('still draws a mark for an onsen outside the seven prefectures', () => {
    const tree = drawn(cachedOnsen({ prefecture: '' }));
    expect(tree).toContain(groundForPrefecture(''));
  });
});
