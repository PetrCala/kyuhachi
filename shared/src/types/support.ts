/**
 * Tip jar: consumable in-app purchases a user can make to support development.
 *
 * A tip unlocks nothing. Every feature of the app is free whether or not a
 * user ever tips, which is what keeps this a tip and not a paywall (ADR-011).
 * Consumables are deliberate: they can be given more than once, and there is
 * no entitlement to restore.
 *
 * The ids must match the products in App Store Connect character for
 * character; the store returns nothing for an id it does not know. The setup
 * (prices, localizations, review notes) is in docs/tip-jar.md.
 */

/** The tip products, cheapest first. Display order on the Support screen. */
export const TIP_PRODUCT_IDS = [
  'com.kyuhachi.app.tip.bath',
  'com.kyuhachi.app.tip.towel',
  'com.kyuhachi.app.tip.stay',
] as const;

export type TipProductId = (typeof TIP_PRODUCT_IDS)[number];

export function isTipProductId(id: string): id is TipProductId {
  return (TIP_PRODUCT_IDS as readonly string[]).includes(id);
}
