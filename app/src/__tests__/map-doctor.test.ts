import { formatMapDoctorReport, withTimeout, type MapDoctorInput } from '@/lib/dev/map-doctor';
import { hasDuplicateTabLayout } from '@/hooks/useSingleTabLayoutAssertion';

const base: MapDoctorInput = {
  now: 10_000,
  focused: true,
  laidOut: true,
  mapReady: true,
  gateReady: true,
  queued: 0,
  instance: 0,
  lastPressAt: 8_500,
  lastRegionChangeAt: 0,
  lastRegionCompleteAt: 9_000,
  camera: {
    center: { latitude: 32.8, longitude: 130.7 },
    altitude: 5000,
    heading: 0,
    pitch: 0,
    zoom: 10,
  },
  cameraError: null,
  sheet: 'none',
  rootRoutes: ['(tabs)'],
};

describe('formatMapDoctorReport', () => {
  it('reports event ages, a finite camera, and a healthy root stack', () => {
    const report = formatMapDoctorReport(base);
    expect(report).toContain('onPress 1.5s ago');
    expect(report).toContain('onRegionChange never');
    expect(report).toContain('altitude 5000 m; finite');
    expect(report).toContain('root stack: (tabs)');
    expect(report).not.toContain('DUPLICATE');
  });

  it('flags a non-finite camera and a duplicated tab layout', () => {
    const report = formatMapDoctorReport({
      ...base,
      camera: { ...base.camera!, altitude: NaN },
      rootRoutes: ['(tabs)', 'challenge/preview', '(tabs)'],
    });
    expect(report).toContain('NOT FINITE');
    expect(report).toContain('DUPLICATE TAB LAYOUT');
  });

  it('reports a failed camera read instead of hiding it', () => {
    const report = formatMapDoctorReport({
      ...base,
      camera: null,
      cameraError: 'timed out after 1000 ms',
    });
    expect(report).toContain('read failed (timed out after 1000 ms)');
  });
});

describe('hasDuplicateTabLayout', () => {
  it('is false for a single tab layout with screens pushed over it', () => {
    expect(hasDuplicateTabLayout(['(tabs)', 'onsens/[id]', 'onsens/edit-visit'])).toBe(false);
  });
  it('is true once the layout appears twice', () => {
    expect(hasDuplicateTabLayout(['(tabs)', 'routes', '(tabs)'])).toBe(true);
  });
});

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('resolves a prompt promise', async () => {
    await expect(withTimeout(Promise.resolve(1), 1000)).resolves.toBe(1);
  });

  it('rejects a promise that never settles once the timeout elapses', async () => {
    const pending = withTimeout(new Promise<never>(() => {}), 1000);
    jest.advanceTimersByTime(1000);
    await expect(pending).rejects.toThrow('timed out after 1000 ms');
  });

  it('rejects when there is no promise at all (no map ref)', async () => {
    await expect(withTimeout(undefined, 1000)).rejects.toThrow('no map ref');
  });
});
