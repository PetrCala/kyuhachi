/**
 * Whether — and what — to show as an onsen's romaji reading beneath its kanji
 * name.
 *
 * The reading is a pronunciation aid for users who can't read kanji, so it is
 * shown only when the app's UI language is not Japanese (a Japanese reader gets
 * the kanji directly and the extra line is just clutter). Returns the trimmed
 * romaji to render, or null when there is nothing to show — no reading has been
 * published yet, or the UI is in Japanese.
 *
 * The kanji `name` is always the primary display; this never replaces it.
 */
export function onsenReading(
  nameRomaji: string | null | undefined,
  language: string
): string | null {
  if (language === 'ja') return null;
  const reading = nameRomaji?.trim();
  return reading ? reading : null;
}
