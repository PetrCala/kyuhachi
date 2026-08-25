import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorCode, useIAP } from 'expo-iap';
import { TIP_PRODUCT_IDS, type TipProductId } from '@kyuhachi/shared';
import { readTipsGiven, recordTipGiven, toTipProducts, type TipProduct } from '@/lib/tip-jar';

/**
 * `loading` covers the store connection and the product fetch; `unavailable`
 * means the store answered with nothing usable (offline, sandbox down, or the
 * products not yet approved in App Store Connect), which is a normal state and
 * not an error to shout about.
 */
export type TipJarStatus = 'loading' | 'ready' | 'unavailable';

export type TipJar = {
  status: TipJarStatus;
  products: TipProduct[];
  /** The product a purchase is in flight for, if any. */
  pendingId: TipProductId | null;
  /** Tips given on this device, ever. Drives the thank-you line only. */
  tipsGiven: number;
  tip: (id: TipProductId) => void;
};

type Options = {
  /** Called when a purchase fails for a reason other than the user cancelling. */
  onPurchaseFailed?: () => void;
};

export function useTipJar({ onPurchaseFailed }: Options = {}): TipJar {
  const [pendingId, setPendingId] = useState<TipProductId | null>(null);
  const [tipsGiven, setTipsGiven] = useState(0);
  const [fetched, setFetched] = useState(false);
  const [failed, setFailed] = useState(false);

  const failedRef = useRef(onPurchaseFailed);
  failedRef.current = onPurchaseFailed;

  const { connected, products, fetchProducts, requestPurchase, finishTransaction } = useIAP({
    onPurchaseSuccess: async (purchase) => {
      // StoreKit redelivers a transaction on every launch until it is
      // finished. A tip grants nothing, so there is nothing to verify or
      // unlock first: finish it as soon as it arrives.
      await finishTransaction({ purchase, isConsumable: true });
      setPendingId(null);
      setTipsGiven(await recordTipGiven());
    },
    onPurchaseError: (error) => {
      setPendingId(null);
      if (error.code !== ErrorCode.UserCancelled) {
        failedRef.current?.();
      }
    },
    onError: () => setFailed(true),
  });

  useEffect(() => {
    let alive = true;
    readTipsGiven().then((count) => {
      if (alive) {
        setTipsGiven(count);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // Fetch once per connection. fetchProducts is not a stable reference, so it
  // is read through a ref: putting it in the dependency list would refetch on
  // every render.
  const fetchRef = useRef(fetchProducts);
  fetchRef.current = fetchProducts;
  useEffect(() => {
    if (!connected) {
      return;
    }
    let alive = true;
    fetchRef
      .current({ skus: [...TIP_PRODUCT_IDS], type: 'in-app' })
      .then(() => {
        if (alive) {
          setFetched(true);
        }
      })
      .catch(() => {
        if (alive) {
          setFailed(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [connected]);

  const tipProducts = useMemo(() => toTipProducts(products), [products]);

  const tip = useCallback(
    (id: TipProductId) => {
      if (pendingId) {
        return;
      }
      setPendingId(id);
      requestPurchase({ request: { apple: { sku: id } }, type: 'in-app' }).catch(() => {
        // A rejected request also arrives via onPurchaseError, which decides
        // whether the user sees anything. This only clears the spinner.
        setPendingId(null);
      });
    },
    [pendingId, requestPurchase]
  );

  const status: TipJarStatus = failed
    ? 'unavailable'
    : !fetched
    ? 'loading'
    : tipProducts.length > 0
    ? 'ready'
    : 'unavailable';

  return { status, products: tipProducts, pendingId, tipsGiven, tip };
}
