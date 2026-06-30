import { onsenReading } from '@/lib/onsen-name';

describe('onsenReading', () => {
  it('returns the romaji for a non-Japanese UI', () => {
    expect(onsenReading('Beppu Onsen', 'en')).toBe('Beppu Onsen');
  });

  it('hides the reading when the UI is Japanese', () => {
    expect(onsenReading('Beppu Onsen', 'ja')).toBeNull();
  });

  it('returns null when no reading has been published', () => {
    expect(onsenReading(null, 'en')).toBeNull();
    expect(onsenReading(undefined, 'en')).toBeNull();
  });

  it('treats a blank or whitespace-only reading as nothing to show', () => {
    expect(onsenReading('', 'en')).toBeNull();
    expect(onsenReading('   ', 'en')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(onsenReading('  Yufuin  ', 'en')).toBe('Yufuin');
  });
});
