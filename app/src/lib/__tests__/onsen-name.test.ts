import { onsenReading } from '@/lib/onsen-name';

describe('onsenReading', () => {
  it('returns the romaji for a non-Japanese UI when the preference is on', () => {
    expect(onsenReading('Beppu Onsen', 'en', true)).toBe('Beppu Onsen');
  });

  it('hides the reading when the romaji preference is off', () => {
    expect(onsenReading('Beppu Onsen', 'en', false)).toBeNull();
  });

  it('hides the reading when the UI is Japanese', () => {
    expect(onsenReading('Beppu Onsen', 'ja', true)).toBeNull();
  });

  it('returns null when no reading has been published', () => {
    expect(onsenReading(null, 'en', true)).toBeNull();
    expect(onsenReading(undefined, 'en', true)).toBeNull();
  });

  it('treats a blank or whitespace-only reading as nothing to show', () => {
    expect(onsenReading('', 'en', true)).toBeNull();
    expect(onsenReading('   ', 'en', true)).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(onsenReading('  Yufuin  ', 'en', true)).toBe('Yufuin');
  });
});
