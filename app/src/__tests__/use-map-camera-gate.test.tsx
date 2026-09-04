import { act, renderHook } from '@testing-library/react-native';
import { useMapCameraGate } from '@/hooks/useMapCameraGate';

const SETTLE_MS = 400;

interface Facts {
  focused: boolean;
  laidOut: boolean;
  mapReady: boolean;
}

const allTrue: Facts = { focused: true, laidOut: true, mapReady: true };

function renderGate(initial: Facts, onReopen?: () => void) {
  return renderHook((facts: Facts) => useMapCameraGate({ ...facts, settleMs: SETTLE_MS, onReopen }), {
    initialProps: initial,
  });
}

describe('useMapCameraGate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('holds commands while any readiness fact is false', () => {
    const { result } = renderGate({ ...allTrue, focused: false });
    const command = jest.fn();
    act(() => result.current.run(command));
    act(() => {
      jest.advanceTimersByTime(SETTLE_MS * 2);
    });
    expect(command).not.toHaveBeenCalled();
    expect(result.current.pending()).toBe(1);
    expect(result.current.ready).toBe(false);
  });

  it('replays held commands in order once open and settled', () => {
    const { result, rerender } = renderGate({ ...allTrue, mapReady: false });
    const calls: string[] = [];
    act(() => {
      result.current.run(() => calls.push('first'));
      result.current.run(() => calls.push('second'));
    });
    rerender(allTrue);
    // Open, but not yet settled: still nothing.
    act(() => {
      jest.advanceTimersByTime(SETTLE_MS - 1);
    });
    expect(calls).toEqual([]);
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(calls).toEqual(['first', 'second']);
    expect(result.current.pending()).toBe(0);
    expect(result.current.ready).toBe(true);
  });

  it('runs commands immediately once settled, including one issued from a replayed command', () => {
    const { result, rerender } = renderGate({ ...allTrue, laidOut: false });
    const calls: string[] = [];
    act(() => {
      result.current.run(() => {
        calls.push('outer');
        result.current.run(() => calls.push('inner'));
      });
    });
    rerender(allTrue);
    act(() => {
      jest.advanceTimersByTime(SETTLE_MS);
    });
    expect(calls).toEqual(['outer', 'inner']);

    act(() => result.current.run(() => calls.push('direct')));
    expect(calls).toEqual(['outer', 'inner', 'direct']);
  });

  it('cancels a pending replay and keeps the queue when the gate closes mid-settle', () => {
    const { result, rerender } = renderGate({ ...allTrue, focused: false });
    const command = jest.fn();
    act(() => result.current.run(command));
    rerender(allTrue);
    act(() => {
      jest.advanceTimersByTime(SETTLE_MS / 2);
    });
    // The tab is left again before the settle elapses.
    rerender({ ...allTrue, focused: false });
    act(() => {
      jest.advanceTimersByTime(SETTLE_MS * 2);
    });
    expect(command).not.toHaveBeenCalled();
    expect(result.current.pending()).toBe(1);

    rerender(allTrue);
    act(() => {
      jest.advanceTimersByTime(SETTLE_MS);
    });
    expect(command).toHaveBeenCalledTimes(1);
  });

  it('closes again after opening: commands issued while unfocused wait', () => {
    const { result, rerender } = renderGate(allTrue);
    act(() => {
      jest.advanceTimersByTime(SETTLE_MS);
    });
    expect(result.current.ready).toBe(true);
    rerender({ ...allTrue, focused: false });
    expect(result.current.ready).toBe(false);
    const command = jest.fn();
    act(() => result.current.run(command));
    expect(command).not.toHaveBeenCalled();
  });

  it('calls onReopen after the settle on a re-opening with nothing queued, never on the first', () => {
    const onReopen = jest.fn();
    const { result, rerender } = renderGate(allTrue, onReopen);
    act(() => {
      jest.advanceTimersByTime(SETTLE_MS);
    });
    expect(onReopen).not.toHaveBeenCalled();

    rerender({ ...allTrue, focused: false });
    rerender(allTrue);
    act(() => {
      jest.advanceTimersByTime(SETTLE_MS);
    });
    expect(onReopen).toHaveBeenCalledTimes(1);

    // A re-opening that has real work queued skips the nudge: the queued
    // command moves the camera itself.
    rerender({ ...allTrue, focused: false });
    const command = jest.fn();
    act(() => result.current.run(command));
    rerender(allTrue);
    act(() => {
      jest.advanceTimersByTime(SETTLE_MS);
    });
    expect(command).toHaveBeenCalledTimes(1);
    expect(onReopen).toHaveBeenCalledTimes(1);
  });
});
