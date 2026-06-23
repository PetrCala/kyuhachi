/**
 * Pick a display name for a new challenge.
 *
 * Naming is optional at creation: when the user leaves the field blank we fall
 * back to the challenge type's name (e.g. "Walking Challenge") so the list still
 * reads sensibly even with several challenges. If a challenge by that name
 * already exists we append the lowest free number ("Walking Challenge 2") to
 * keep the list unambiguous. Deleting a challenge frees its number, so we scan
 * for the first gap rather than counting existing challenges.
 */
export function uniqueChallengeName(base: string, existing: Iterable<string>): string {
  const taken = new Set<string>();
  for (const name of existing) {
    const trimmed = name.trim();
    if (trimmed) taken.add(trimmed);
  }
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}
