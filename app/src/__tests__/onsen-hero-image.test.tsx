import { render, screen } from '@testing-library/react-native';
import OnsenHeroImage from '@/components/OnsenHeroImage';

// Keys translate to themselves so assertions can match stable i18n keys.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

// A hand-encoded BlurHash whose DC component packs pure red (255, 0, 0); see
// app/src/lib/__tests__/blurhash-color.test.ts for how it was derived.
const RED_BLURHASH = '00TI:j';

describe('OnsenHeroImage', () => {
  // SHOW_CATALOG_PHOTOS is off (app/src/lib/catalog-photos.ts): every onsen
  // renders the tinted placeholder regardless of imageUrl, which is exactly
  // the state the onsenDoc() fixture already models (imageUrl/blurhash null).
  it('renders the tinted symbol placeholder even when imageUrl is set', () => {
    render(
      <OnsenHeroImage imageUrl="https://img.example/a.jpg" blurhash={RED_BLURHASH} style={{}} />
    );
    // The placeholder, not a photo, is what's on screen: it carries the
    // "no photo" accessibility label regardless of the (ignored) imageUrl.
    expect(screen.getByLabelText('onsenPreview.imagePlaceholder')).toBeTruthy();
  });

  it('tints the placeholder from the BlurHash average colour', () => {
    render(<OnsenHeroImage imageUrl={null} blurhash={RED_BLURHASH} style={{}} />);
    const placeholder = screen.getByLabelText('onsenPreview.imagePlaceholder');
    expect(placeholder.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: 'rgb(255, 0, 0)' })])
    );
  });

  it('falls back to a neutral tint when blurhash is null (a real published state)', () => {
    render(<OnsenHeroImage imageUrl={null} blurhash={null} style={{}} />);
    const placeholder = screen.getByLabelText('onsenPreview.imagePlaceholder');
    expect(placeholder.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: 'rgb(242, 242, 247)' })])
    );
  });
});
