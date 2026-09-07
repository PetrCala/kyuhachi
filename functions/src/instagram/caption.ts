/**
 * Caption text for a day's Instagram recap. Pure functions over a plain input
 * shape: everything Firestore-shaped happens in recap.ts, so the wording is
 * testable without a database and reviewable without reading a query.
 *
 * Voice follows docs/brand-voice.md, which governs every surface a reader meets
 * and does not stop at the App Store. In practice, for a caption:
 *
 *  - Concrete over abstract. The numbers ARE the caption: day, kilometres,
 *    which onsen out of 88. A caption that would fit any other walk is cut.
 *  - No marketing filler, and the banned list applies here too.
 *  - Japanese is written as Japanese, never translated from the English. The
 *    two halves carry the same facts in the same order; they are not the same
 *    sentences, and the JA half uses the house vocabulary (湯, 九州八十八湯).
 *  - Wit gets one seat per surface, and on this account the bio already has it.
 *    Captions stay straight.
 */

/** Instagram's hard cap on a caption. Exceeded captions are rejected outright. */
export const IG_CAPTION_MAX_CHARS = 2200;

/** Instagram's hard cap on hashtags in one caption. */
export const IG_MAX_HASHTAGS = 30;

/**
 * The walk's first day, JST. Day numbers in captions count from here, so a
 * reader can place any post in the trip without doing date arithmetic.
 * Canonical elsewhere as the route plan's start in kyuhachi-data.
 */
export const WALK_START_DATE = '2026-10-02';

/** Where every caption sends the reader. Bare host: Instagram makes no link of it either way, and the scheme is noise. */
const JOURNEY_SITE = 'kyuhachi-path.web.app';

/**
 * The seven Kyushu prefectures, for the English half. The catalog stores
 * `prefecture` as it appears on the source, i.e. in Japanese, and a small fixed
 * map beats romanizing at runtime: the set cannot grow, and Ōita's macron is
 * the kind of thing a generic transliterator gets wrong.
 */
const PREFECTURE_EN: Record<string, string> = {
  福岡県: 'Fukuoka',
  佐賀県: 'Saga',
  長崎県: 'Nagasaki',
  熊本県: 'Kumamoto',
  大分県: 'Ōita',
  宮崎県: 'Miyazaki',
  鹿児島県: 'Kagoshima',
};

/** Hashtags on every post, in both languages. Area tags are appended per day. */
const BASE_HASHTAGS = [
  '#九州八十八湯',
  '#温泉',
  '#温泉巡り',
  '#湯めぐり',
  '#九州温泉',
  '#onsen',
  '#kyushu',
  '#japantravel',
  '#hotsprings',
  '#walkingjapan',
];

export interface RecapOnsen {
  /** Kanji name, always the primary display (docs/brand-voice.md). */
  name: string;
  /** Hepburn reading, a pronunciation aid for the English half. May be absent. */
  nameRomaji: string | null;
  areaName: string;
  /** Japanese, e.g. 大分県. */
  prefecture: string;
  /** Which of the 88 this was, 1-based, in visit order. */
  ordinal: number;
}

export interface DayRecap {
  /** JST calendar day, YYYY-MM-DD. */
  date: string;
  /** 1-based day of the walk, counted from WALK_START_DATE. */
  dayNumber: number;
  distanceMeters: number;
  /** Every walked day so far, including this one. */
  cumulativeDistanceMeters: number;
  /** Onsens reached on this day, in visit order. May be empty: most days are. */
  onsens: RecapOnsen[];
  /** Unique eligible onsens visited so far, including this day's. */
  visitedCount: number;
  /** The challenge target, read from challenge_types rather than hardcoded. */
  target: number;
  /** Petr's own note for the day, or null. Passed through as written. */
  note: string | null;
}

/** 41234 -> "41.2 km". One decimal: a walk is not measured to the metre. */
function km(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Japanese half: same precision, no space, the unit as Japanese writes it. */
function kmJa(meters: number): string {
  return `${(meters / 1000).toFixed(1)}km`;
}

/** ["a", "b", "c"] -> "a, b and c". Oxford-free, matching the app's English. */
function listEn(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Japanese enumeration uses the ideographic comma, with no trailing conjunction. */
function listJa(items: string[]): string {
  return items.join('、');
}

/** "18", or "18 and 19", or "18, 19 and 20": the ordinals this day added. */
function ordinalsEn(onsens: RecapOnsen[]): string {
  return listEn(onsens.map((onsen) => String(onsen.ordinal)));
}

function ordinalsJa(onsens: RecapOnsen[]): string {
  return onsens.map((onsen) => String(onsen.ordinal)).join('・');
}

/** "竹瓦温泉 (Takegawara Onsen)", degrading to the kanji alone when there is no reading. */
function onsenEn(onsen: RecapOnsen): string {
  return onsen.nameRomaji ? `${onsen.name} (${onsen.nameRomaji})` : onsen.name;
}

/**
 * The places this day touched, deduplicated and in order: "Beppu, Ōita".
 * Empty on a day with no onsen, which is most of them.
 */
function placesEn(onsens: RecapOnsen[]): string {
  const seen = new Set<string>();
  const places: string[] = [];
  for (const onsen of onsens) {
    const prefecture = PREFECTURE_EN[onsen.prefecture] ?? onsen.prefecture;
    const place = `${onsen.areaName}, ${prefecture}`;
    if (!seen.has(place)) {
      seen.add(place);
      places.push(place);
    }
  }
  return listEn(places);
}

function placesJa(onsens: RecapOnsen[]): string {
  const seen = new Set<string>();
  const places: string[] = [];
  for (const onsen of onsens) {
    // Japanese address order is largest unit first, so the prefecture leads.
    const place = `${onsen.prefecture}${onsen.areaName}`;
    if (!seen.has(place)) {
      seen.add(place);
      places.push(place);
    }
  }
  return listJa(places);
}

/**
 * Area and prefecture hashtags for the day, Japanese only.
 *
 * Japanese-only on purpose: these are how the onsen community actually
 * searches, and a romanized "#beppu" reaches a different, thinner audience
 * that the base English tags already cover. Prefecture tags drop the 県 suffix
 * because #大分 is the tag people use and #大分県 is not.
 */
function areaHashtags(onsens: RecapOnsen[]): string[] {
  const tags = new Set<string>();
  for (const onsen of onsens) {
    tags.add(`#${onsen.prefecture.replace(/県$/, '')}`);
    // Area names occasionally carry spaces or punctuation from the source; a
    // hashtag ends at the first of those, so anything but word characters is
    // dropped rather than left to silently truncate the tag.
    const area = onsen.areaName.replace(/[^\p{L}\p{N}]/gu, '');
    if (area) tags.add(`#${area}`);
  }
  return [...tags];
}

/**
 * The English half. Reads as three lines at most: the numbers, the onsens,
 * the note.
 */
function englishBlock(recap: DayRecap): string {
  const lines = [
    `Day ${recap.dayNumber} · ${km(recap.distanceMeters)} · ${km(recap.cumulativeDistanceMeters)} so far`,
  ];
  if (recap.onsens.length > 0) {
    const names = listEn(recap.onsens.map(onsenEn));
    lines.push(
      `Onsen ${ordinalsEn(recap.onsens)} of ${recap.target}: ${names}. ${placesEn(recap.onsens)}.`
    );
  } else {
    lines.push(`No onsen today. ${recap.visitedCount} of ${recap.target} so far.`);
  }
  return lines.join('\n');
}

/**
 * The Japanese half. Same facts, same order, written as Japanese: 〜日目 for the
 * day count, 湯 as the counter for onsens, 通算 for the running total.
 */
function japaneseBlock(recap: DayRecap): string {
  const lines = [
    `${recap.dayNumber}日目・${kmJa(recap.distanceMeters)}・通算${kmJa(recap.cumulativeDistanceMeters)}`,
  ];
  if (recap.onsens.length > 0) {
    lines.push(
      `${recap.target}湯のうち${ordinalsJa(recap.onsens)}湯目：${listJa(
        recap.onsens.map((onsen) => onsen.name)
      )}。${placesJa(recap.onsens)}。`
    );
  } else {
    lines.push(`本日は入湯なし。${recap.target}湯のうち${recap.visitedCount}湯。`);
  }
  return lines.join('\n');
}

/**
 * Build the caption for one day.
 *
 * Assembled as blocks and then trimmed from the least load-bearing end, rather
 * than truncated: a caption cut mid-sentence at 2200 characters is worse than
 * one without the note. Order of sacrifice is note, then hashtags, and the two
 * language blocks are never cut, because a caption missing its numbers has no
 * reason to exist.
 */
export function buildRecapCaption(recap: DayRecap): string {
  const hashtags = [...BASE_HASHTAGS, ...areaHashtags(recap.onsens)].slice(0, IG_MAX_HASHTAGS);
  const note = recap.note?.trim() ?? '';

  const withNote = (includeNote: boolean, tags: string[]): string =>
    [
      englishBlock(recap),
      ...(includeNote && note ? [note] : []),
      '',
      japaneseBlock(recap),
      '',
      JOURNEY_SITE,
      '',
      tags.join(' '),
    ].join('\n');

  const full = withNote(true, hashtags);
  if (full.length <= IG_CAPTION_MAX_CHARS) return full;

  const withoutNote = withNote(false, hashtags);
  if (withoutNote.length <= IG_CAPTION_MAX_CHARS) return withoutNote;

  // Nothing but the numbers and as many tags as still fit. Reaching here means
  // a single day produced onsen names long enough to fill 2200 characters,
  // which the 10-visit-per-day ceiling makes essentially impossible; it exists
  // so the function has no path that returns an invalid caption.
  let tags = [...hashtags];
  while (tags.length > 0 && withNote(false, tags).length > IG_CAPTION_MAX_CHARS) {
    tags = tags.slice(0, -1);
  }
  return withNote(false, tags).slice(0, IG_CAPTION_MAX_CHARS);
}

/**
 * 1-based day of the walk for a JST calendar day, counting the start date as
 * day 1. Both arguments are YYYY-MM-DD strings already in JST, so this is plain
 * calendar arithmetic on UTC midnights and carries no timezone of its own.
 */
export function dayNumber(date: string, startDate: string = WALK_START_DATE): number {
  const day = Date.parse(`${date}T00:00:00Z`);
  const start = Date.parse(`${startDate}T00:00:00Z`);
  return Math.floor((day - start) / 86_400_000) + 1;
}
