import {
  MARK_VIEWBOX_HEIGHT,
  MARK_VIEWBOX_WIDTH,
  groundForPrefecture,
  motifForSpringQuality,
  onsenMark,
  tileForMotif,
  type MarkMotif,
} from '@/lib/onsen-mark';
import { colors } from '@/theme';

const KYUSHU = ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県'];

describe('groundForPrefecture', () => {
  it('gives each Kyushu prefecture its own ground', () => {
    const grounds = KYUSHU.map(groundForPrefecture);
    expect(new Set(grounds).size).toBe(KYUSHU.length);
  });

  it('accepts a prefecture published with or without the 県 suffix', () => {
    expect(groundForPrefecture('大分')).toBe(groundForPrefecture('大分県'));
  });

  it('falls back to the neutral ground outside Kyushu, and for a blank field', () => {
    expect(groundForPrefecture('北海道')).toBe(colors.markGroundNeutral);
    expect(groundForPrefecture('')).toBe(colors.markGroundNeutral);
  });
});

describe('motifForSpringQuality', () => {
  it.each([
    ['単純温泉', 'steam'],
    ['単純硫黄泉', 'asanoha'],
    ['ナトリウム－炭酸水素塩泉', 'bubbles'],
    ['ナトリウム－塩化物泉', 'seigaiha'],
    ['カルシウム・ナトリウム－硫酸塩泉', 'asanoha'],
    ['含鉄（Ⅱ）－ナトリウム－塩化物泉', 'asanoha'],
    ['単純放射能泉', 'bubbles'],
  ] as [string, MarkMotif][])('matches %s by substring', (quality, motif) => {
    expect(motifForSpringQuality(quality)).toBe(motif);
  });

  it('falls back to steam for a null quality, which is a real published state', () => {
    expect(motifForSpringQuality(null)).toBe('steam');
  });

  it('falls back to steam for a quality it does not recognize', () => {
    expect(motifForSpringQuality('よくわからない泉質')).toBe('steam');
  });
});

describe('tileForMotif', () => {
  const MOTIFS: MarkMotif[] = ['seigaiha', 'asanoha', 'bubbles', 'steam'];

  it('gives every motif a non-empty tile with a positive period', () => {
    for (const motif of MOTIFS) {
      const tile = tileForMotif(motif);
      expect(tile.d.length).toBeGreaterThan(0);
      expect(tile.width).toBeGreaterThan(0);
      expect(tile.height).toBeGreaterThan(0);
      // NaN anywhere in generated path data silently blanks the pattern.
      expect(tile.d).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it('returns the same tile object every time (built once, not per mark)', () => {
    expect(tileForMotif('asanoha')).toBe(tileForMotif('asanoha'));
  });
});

describe('onsenMark', () => {
  const base = { id: 'a1b2', prefecture: '大分県', springQuality: '単純温泉' };

  it('is deterministic: the same onsen always draws the same mark', () => {
    expect(onsenMark(base)).toEqual(onsenMark({ ...base }));
  });

  it('varies the composition by id, so two onsens never look identical', () => {
    const a = onsenMark(base);
    const b = onsenMark({ ...base, id: 'c3d4' });
    expect(a.ground).toBe(b.ground);
    expect(a.motif).toBe(b.motif);
    // Same place, same spring: only the id-seeded parts may differ, and they do.
    expect([a.patternX, a.patternY, a.patternScale, a.discs[0].cx]).not.toEqual([
      b.patternX,
      b.patternY,
      b.patternScale,
      b.discs[0].cx,
    ]);
    expect(a.patternId).not.toBe(b.patternId);
  });

  it('keeps every seeded value inside the drawing space', () => {
    for (const prefecture of KYUSHU) {
      const mark = onsenMark({ ...base, id: `id-${prefecture}`, prefecture });
      expect(mark.patternX).toBeGreaterThanOrEqual(0);
      expect(mark.patternX).toBeLessThanOrEqual(mark.tile.width);
      expect(mark.patternY).toBeGreaterThanOrEqual(0);
      expect(mark.patternY).toBeLessThanOrEqual(mark.tile.height);
      expect(mark.patternScale).toBeGreaterThan(0);
      for (const disc of mark.discs) {
        expect(disc.cx).toBeGreaterThanOrEqual(0);
        expect(disc.cx).toBeLessThanOrEqual(MARK_VIEWBOX_WIDTH);
        expect(disc.cy).toBeGreaterThanOrEqual(0);
        expect(disc.cy).toBeLessThanOrEqual(MARK_VIEWBOX_HEIGHT);
        expect(disc.r).toBeGreaterThan(0);
      }
    }
  });

  it('builds an id-safe pattern id from the kyuhachiId', () => {
    const mark = onsenMark({ ...base, id: '3f2a4c1e-9b7d-4f0a-8c11-5e6d7a8b9c0d' });
    expect(mark.patternId).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it('draws a complete mark for a null spring quality', () => {
    const mark = onsenMark({ ...base, springQuality: null });
    expect(mark.motif).toBe('steam');
    expect(mark.ground).toBe(groundForPrefecture('大分県'));
    expect(mark.discs).toHaveLength(2);
  });
});
