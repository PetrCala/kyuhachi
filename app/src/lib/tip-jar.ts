import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Product } from 'expo-iap';
import { TIP_PRODUCT_IDS, isTipProductId, type TipProductId } from '@kyuhachi/shared';

/**
 * A tip product as the Support screen shows it. Title and price come straight
 * from the store, so they are already localized to the user's storefront and
 * currency; the app never formats a price itself.
 */
export type TipProduct = {
  id: TipProductId;
  title: string;
  price: string;
};

/**
 * Store products in tier order (cheapest first), dropping anything that is not
 * a tip. StoreKit returns products in an unspecified order and silently omits
 * ids it does not recognise, so neither the order nor the count can be assumed.
 */
export function toTipProducts(products: readonly Product[]): TipProduct[] {
  const byId = new Map<string, Product>();
  for (const product of products) {
    if (isTipProductId(product.id)) {
      byId.set(product.id, product);
    }
  }

  return TIP_PRODUCT_IDS.flatMap((id) => {
    const product = byId.get(id);
    return product ? [{ id, title: product.title, price: product.displayPrice }] : [];
  });
}

// Local count of tips given, so the screen can say thank you on later visits.
// It is a courtesy, not an entitlement: nothing in the app reads it to decide
// what a user may do, and losing it on reinstall costs nothing (ADR-011).
const TIPS_GIVEN_KEY = 'tips.given.v1';

export async function readTipsGiven(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(TIPS_GIVEN_KEY);
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export async function recordTipGiven(): Promise<number> {
  const next = (await readTipsGiven()) + 1;
  try {
    await AsyncStorage.setItem(TIPS_GIVEN_KEY, String(next));
  } catch {
    // The thank-you line is cosmetic; a failed write is not worth surfacing.
  }
  return next;
}
