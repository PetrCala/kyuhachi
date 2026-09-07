// Imported explicitly rather than relying on ambient @types/jest: Functions is
// installed standalone in CI, with no parent node_modules to pick those up from.
import { describe, expect, it } from '@jest/globals';
import {
  buildRecapCaption,
  dayNumber,
  IG_CAPTION_MAX_CHARS,
  IG_MAX_HASHTAGS,
  type DayRecap,
  type RecapOnsen,
} from '../caption';

const takegawara: RecapOnsen = {
  name: '竹瓦温泉',
  nameRomaji: 'Takegawara Onsen',
  areaName: '別府',
  prefecture: '大分県',
  ordinal: 18,
};

const hyotan: RecapOnsen = {
  name: 'ひょうたん温泉',
  nameRomaji: 'Hyotan Onsen',
  areaName: '別府',
  prefecture: '大分県',
  ordinal: 19,
};

function recap(overrides: Partial<DayRecap> = {}): DayRecap {
  return {
    date: '2026-10-13',
    dayNumber: 12,
    distanceMeters: 41_234,
    cumulativeDistanceMeters: 487_600,
    onsens: [takegawara, hyotan],
    visitedCount: 19,
    target: 88,
    note: null,
    ...overrides,
  };
}

describe('dayNumber', () => {
  it('counts the start date as day 1', () => {
    expect(dayNumber('2026-10-02')).toBe(1);
  });

  it('counts calendar days, not walked days', () => {
    expect(dayNumber('2026-10-13')).toBe(12);
    expect(dayNumber('2026-12-02')).toBe(62);
  });
});

describe('buildRecapCaption', () => {
  it('leads with the day, the distance and the running total', () => {
    expect(buildRecapCaption(recap())).toContain('Day 12 · 41.2 km · 487.6 km so far');
  });

  it('names the onsens with their ordinals in both languages', () => {
    const caption = buildRecapCaption(recap());
    expect(caption).toContain(
      'Onsen 18 and 19 of 88: 竹瓦温泉 (Takegawara Onsen) and ひょうたん温泉 (Hyotan Onsen). 別府, Ōita.'
    );
    expect(caption).toContain('88湯のうち18・19湯目：竹瓦温泉、ひょうたん温泉。大分県別府。');
  });

  it('falls back to the kanji name when the catalog has no reading', () => {
    const caption = buildRecapCaption(recap({ onsens: [{ ...takegawara, nameRomaji: null }] }));
    expect(caption).toContain('Onsen 18 of 88: 竹瓦温泉.');
  });

  it('reports progress instead of onsens on a day with none', () => {
    const caption = buildRecapCaption(recap({ onsens: [], visitedCount: 17 }));
    expect(caption).toContain('No onsen today. 17 of 88 so far.');
    expect(caption).toContain('本日は入湯なし。88湯のうち17湯。');
  });

  it('includes the note when there is one', () => {
    expect(buildRecapCaption(recap({ note: 'Rain from Yufuin on.' }))).toContain(
      'Rain from Yufuin on.'
    );
  });

  it('always links the journey site', () => {
    expect(buildRecapCaption(recap())).toContain('kyuhachi-path.web.app');
  });

  it('adds area and prefecture tags, dropping the 県 suffix', () => {
    const caption = buildRecapCaption(recap());
    expect(caption).toContain('#大分');
    expect(caption).toContain('#別府');
    expect(caption).not.toContain('#大分県');
  });

  it('never exceeds Instagram\'s caption or hashtag limits', () => {
    // A worst case that cannot happen in the data: ten onsens, each with a long
    // name, area and note. The caption must still be publishable.
    const onsens = Array.from({ length: 10 }, (_, index) => ({
      ...takegawara,
      name: '長'.repeat(40),
      nameRomaji: 'Nagai'.repeat(20),
      areaName: `別府${index}`,
      ordinal: index + 1,
    }));
    const caption = buildRecapCaption(recap({ onsens, note: 'x'.repeat(3000) }));
    expect(caption.length).toBeLessThanOrEqual(IG_CAPTION_MAX_CHARS);
    expect(caption.match(/#/g)?.length ?? 0).toBeLessThanOrEqual(IG_MAX_HASHTAGS);
  });

  it('drops the note before it drops the numbers', () => {
    const caption = buildRecapCaption(recap({ note: 'y'.repeat(2500) }));
    expect(caption).not.toContain('y'.repeat(2500));
    expect(caption).toContain('Day 12 · 41.2 km');
  });
});
