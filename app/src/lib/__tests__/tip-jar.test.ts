import type { Product } from 'expo-iap';
import { toTipProducts } from '../tip-jar';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

function product(id: string, title: string, displayPrice: string): Product {
  return { id, title, displayPrice, platform: 'ios', type: 'in-app' } as Product;
}

const stay = product('com.kyuhachi.app.tip.stay', 'A night’s stay', '¥2,000');
const bath = product('com.kyuhachi.app.tip.bath', 'Buy me a bath', '¥300');
const towel = product('com.kyuhachi.app.tip.towel', 'A towel too', '¥800');

test('orders the store products cheapest first, whatever order they arrive in', () => {
  expect(toTipProducts([stay, bath, towel]).map((p) => p.id)).toEqual([
    'com.kyuhachi.app.tip.bath',
    'com.kyuhachi.app.tip.towel',
    'com.kyuhachi.app.tip.stay',
  ]);
});

test('keeps the store’s own title and price', () => {
  expect(toTipProducts([bath])).toEqual([
    { id: 'com.kyuhachi.app.tip.bath', title: 'Buy me a bath', price: '¥300' },
  ]);
});

test('drops products that are not tips', () => {
  expect(toTipProducts([product('com.kyuhachi.app.something.else', 'Other', '¥100')])).toEqual([]);
});

test('tolerates the store returning only some of the tiers', () => {
  expect(toTipProducts([stay, bath]).map((p) => p.id)).toEqual([
    'com.kyuhachi.app.tip.bath',
    'com.kyuhachi.app.tip.stay',
  ]);
});
