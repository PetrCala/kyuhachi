import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIAP } from 'expo-iap';
import type { Product, Purchase } from 'expo-iap';
import { useTipJar } from '@/hooks/useTipJar';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// The real module needs the native StoreKit bridge; the hook's contract with it
// is exactly what these tests pin down.
jest.mock('expo-iap', () => ({
  ErrorCode: { UserCancelled: 'user-cancelled' },
  useIAP: jest.fn(),
}));

type Options = Parameters<typeof useIAP>[0];

function product(id: string, title: string, displayPrice: string): Product {
  return { id, title, displayPrice, platform: 'ios', type: 'in-app' } as Product;
}

const store = {
  connected: true,
  products: [] as Product[],
  fetchProducts: jest.fn<Promise<void>, [unknown]>(),
  requestPurchase: jest.fn(),
  finishTransaction: jest.fn(),
};

/** The options the hook handed to useIAP, so a test can fire store callbacks. */
let options: Options;

beforeEach(async () => {
  await AsyncStorage.clear();
  store.connected = true;
  store.products = [
    product('com.kyuhachi.app.tip.towel', 'A towel too', '¥800'),
    product('com.kyuhachi.app.tip.bath', 'Buy me a bath', '¥300'),
  ];
  store.fetchProducts.mockReset().mockResolvedValue(undefined);
  store.requestPurchase.mockReset().mockResolvedValue(undefined);
  store.finishTransaction.mockReset().mockResolvedValue(undefined);
  (useIAP as jest.Mock).mockReset().mockImplementation((opts: Options) => {
    options = opts;
    return store;
  });
});

test('asks the store for every tip product once connected', async () => {
  const { result } = renderHook(() => useTipJar());

  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(store.fetchProducts).toHaveBeenCalledTimes(1);
  expect(store.fetchProducts).toHaveBeenCalledWith({
    skus: [
      'com.kyuhachi.app.tip.bath',
      'com.kyuhachi.app.tip.towel',
      'com.kyuhachi.app.tip.stay',
    ],
    type: 'in-app',
  });
  expect(result.current.products.map((p) => p.id)).toEqual([
    'com.kyuhachi.app.tip.bath',
    'com.kyuhachi.app.tip.towel',
  ]);
});

test('a tip requests the App Store product and shows as pending', async () => {
  const { result } = renderHook(() => useTipJar());
  await waitFor(() => expect(result.current.status).toBe('ready'));

  act(() => result.current.tip('com.kyuhachi.app.tip.bath'));

  expect(store.requestPurchase).toHaveBeenCalledWith({
    request: { apple: { sku: 'com.kyuhachi.app.tip.bath' } },
    type: 'in-app',
  });
  expect(result.current.pendingId).toBe('com.kyuhachi.app.tip.bath');

  // A second tap while one purchase is in flight is ignored.
  act(() => result.current.tip('com.kyuhachi.app.tip.towel'));
  expect(store.requestPurchase).toHaveBeenCalledTimes(1);
});

test('a completed tip is finished as a consumable and counted locally', async () => {
  const { result } = renderHook(() => useTipJar());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  act(() => result.current.tip('com.kyuhachi.app.tip.bath'));

  const purchase = { id: 'txn-1', productId: 'com.kyuhachi.app.tip.bath' } as unknown as Purchase;
  await act(async () => {
    await options?.onPurchaseSuccess?.(purchase);
  });

  // Consumable, so the tip can be given again; unfinished transactions would
  // be redelivered by StoreKit on every launch.
  expect(store.finishTransaction).toHaveBeenCalledWith({ purchase, isConsumable: true });
  expect(result.current.pendingId).toBeNull();
  await waitFor(() => expect(result.current.tipsGiven).toBe(1));

  // The count survives a remount, which is all it is for.
  const remounted = renderHook(() => useTipJar());
  await waitFor(() => expect(remounted.result.current.tipsGiven).toBe(1));
});

test('a cancelled purchase is not reported as a failure', async () => {
  const onPurchaseFailed = jest.fn();
  const { result } = renderHook(() => useTipJar({ onPurchaseFailed }));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  act(() => result.current.tip('com.kyuhachi.app.tip.bath'));

  act(() => {
    options?.onPurchaseError?.({ name: 'Error', message: 'cancelled', code: 'user-cancelled' } as never);
  });

  expect(onPurchaseFailed).not.toHaveBeenCalled();
  expect(result.current.pendingId).toBeNull();
});

test('any other purchase error is reported once', async () => {
  const onPurchaseFailed = jest.fn();
  const { result } = renderHook(() => useTipJar({ onPurchaseFailed }));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  act(() => result.current.tip('com.kyuhachi.app.tip.bath'));

  act(() => {
    options?.onPurchaseError?.({ name: 'Error', message: 'nope', code: 'service-error' } as never);
  });

  expect(onPurchaseFailed).toHaveBeenCalledTimes(1);
  expect(result.current.pendingId).toBeNull();
});

test('an unreachable store leaves the jar unavailable, not spinning', async () => {
  store.products = [];
  store.fetchProducts.mockRejectedValue(new Error('offline'));

  const { result } = renderHook(() => useTipJar());

  await waitFor(() => expect(result.current.status).toBe('unavailable'));
  expect(result.current.products).toEqual([]);
});

test('a store that knows none of the products is unavailable too', async () => {
  store.products = [];

  const { result } = renderHook(() => useTipJar());

  await waitFor(() => expect(result.current.status).toBe('unavailable'));
});
