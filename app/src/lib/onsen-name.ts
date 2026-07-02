/**
 * Whether — and what — to show as an onsen's reading beneath its kanji name.
 *
 * The reading is a pronunciation aid whose script follows the UI language: a
 * Japanese UI shows the hiragana yomi (`nameKana`, effectively furigana), any
 * other UI shows the Hepburn romaji (`nameRomaji`). One preference
 * (`showReadings`, default on) controls whether readings show at all, in both
 * languages. Returns the trimmed reading to render, or null when there is
 * nothing to show — the preference is off, or no reading has been published
 * for the active language's script.
 *
 * The kanji `name` is always the primary display; this never replaces it.
 */
export function onsenReading(args: {
  nameRomaji: string | null | undefined;
  nameKana: string | null | undefined;
  /** The active UI language (`i18n.language`) — `'ja'` selects the kana. */
  language: string;
  /** The `showReadings` preference. */
  showReadings: boolean;
}): string | null {
  if (!args.showReadings) return null;
  const source = args.language === 'ja' ? args.nameKana : args.nameRomaji;
  const reading = source?.trim();
  return reading ? reading : null;
}
