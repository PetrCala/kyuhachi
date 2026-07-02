import { onsenReading } from '@/lib/onsen-name';

// Shorthand: both readings present unless a test overrides one.
const READINGS = { nameRomaji: 'Beppu Onsen', nameKana: 'べっぷおんせん' };

describe('onsenReading', () => {
  it('returns the romaji for a non-Japanese UI when the preference is on', () => {
    expect(onsenReading({ ...READINGS, language: 'en', showReadings: true })).toBe('Beppu Onsen');
  });

  it('returns the kana for a Japanese UI when the preference is on', () => {
    expect(onsenReading({ ...READINGS, language: 'ja', showReadings: true })).toBe('べっぷおんせん');
  });

  it('hides the reading when the preference is off, in both languages', () => {
    expect(onsenReading({ ...READINGS, language: 'en', showReadings: false })).toBeNull();
    expect(onsenReading({ ...READINGS, language: 'ja', showReadings: false })).toBeNull();
  });

  it("returns null when the active language's reading is unpublished, even if the other exists", () => {
    expect(
      onsenReading({ nameRomaji: null, nameKana: 'べっぷおんせん', language: 'en', showReadings: true })
    ).toBeNull();
    expect(
      onsenReading({ nameRomaji: 'Beppu Onsen', nameKana: null, language: 'ja', showReadings: true })
    ).toBeNull();
    expect(
      onsenReading({ nameRomaji: undefined, nameKana: undefined, language: 'en', showReadings: true })
    ).toBeNull();
  });

  it('treats a blank or whitespace-only reading as nothing to show', () => {
    expect(
      onsenReading({ nameRomaji: '', nameKana: '', language: 'en', showReadings: true })
    ).toBeNull();
    expect(
      onsenReading({ nameRomaji: '   ', nameKana: '　', language: 'ja', showReadings: true })
    ).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(
      onsenReading({ nameRomaji: '  Yufuin  ', nameKana: null, language: 'en', showReadings: true })
    ).toBe('Yufuin');
    expect(
      onsenReading({ nameRomaji: null, nameKana: ' ゆふいん ', language: 'ja', showReadings: true })
    ).toBe('ゆふいん');
  });
});
