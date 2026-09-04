import { isFiniteCamera, isFiniteRegion } from '@/lib/map-camera';

describe('isFiniteRegion', () => {
  const kyushu = { latitude: 32.8, longitude: 130.7, latitudeDelta: 4, longitudeDelta: 4 };

  it('accepts a normal region', () => {
    expect(isFiniteRegion(kyushu)).toBe(true);
  });

  it('rejects a NaN span, which MapKit itself lets through', () => {
    // regionForBounds over a route document with a missing bound.
    expect(isFiniteRegion({ ...kyushu, latitudeDelta: NaN })).toBe(false);
    expect(isFiniteRegion({ ...kyushu, longitudeDelta: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it('rejects a zero or negative span', () => {
    expect(isFiniteRegion({ ...kyushu, latitudeDelta: 0 })).toBe(false);
    expect(isFiniteRegion({ ...kyushu, longitudeDelta: -1 })).toBe(false);
  });

  it('rejects an out-of-range centre', () => {
    expect(isFiniteRegion({ ...kyushu, latitude: 91 })).toBe(false);
    expect(isFiniteRegion({ ...kyushu, longitude: NaN })).toBe(false);
  });
});

describe('isFiniteCamera', () => {
  it('accepts a partial camera with only finite fields', () => {
    expect(isFiniteCamera({ altitude: 5000 })).toBe(true);
    expect(isFiniteCamera({ center: { latitude: 33, longitude: 131 } })).toBe(true);
    expect(isFiniteCamera({})).toBe(true);
  });

  it('rejects a non-finite or non-positive altitude', () => {
    expect(isFiniteCamera({ altitude: NaN })).toBe(false);
    expect(isFiniteCamera({ altitude: 0 })).toBe(false);
  });

  it('rejects a bad centre, heading, or pitch', () => {
    expect(isFiniteCamera({ center: { latitude: NaN, longitude: 131 } })).toBe(false);
    expect(isFiniteCamera({ heading: NaN })).toBe(false);
    expect(isFiniteCamera({ pitch: Number.NEGATIVE_INFINITY })).toBe(false);
  });
});
