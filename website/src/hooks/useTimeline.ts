import type { JourneyDayDocument } from '@kyuhachi/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { timelineDomain } from '../lib/timeline';

interface Timeline {
  /** The scrubbed-to day, or null for live (today, the resting state). */
  cutoff: string | null;
  setCutoff: (day: string | null) => void;
  playing: boolean;
  togglePlay: () => void;
  /** How much of the head day's track is drawn during playback, 0 to 1. */
  headFraction: number;
}

/**
 * How long one recorded day takes to draw during playback. Constant per day
 * on purpose: pacing by distance makes long days drag and short days blink,
 * and a steady rhythm reads better than a faithful one.
 */
const DAY_ANIM_MS = 1200;

/**
 * How long a run of empty calendar days between two recorded days takes, in
 * total, not per day. Rest weeks are real but they are not the story; a short
 * beat marks them without making the viewer sit through them.
 */
const HOP_MS = 150;

/**
 * The most wall-clock time one animation frame is allowed to advance the
 * playhead. Frames stretch when the tab is throttled or the main thread
 * stalls, and honouring a two-second gap literally would teleport the walk a
 * day and a half forward in one jump.
 */
const MAX_FRAME_MS = 100;

const DAY_MS = 86_400_000;

/** The mutable playhead the animation loop advances between renders. */
interface Playhead {
  /** Recorded dates ascending, frozen at play start. */
  dates: string[];
  index: number;
  fraction: number;
  /** Remaining milliseconds of the current between-days hop, 0 outside one. */
  hopMsLeft: number;
  lastTs: number | null;
}

/**
 * The scrubber's state. Live (cutoff null) is the default and what everything
 * returns to; a non-null cutoff is an explicit, temporary mode the visitor is
 * always one click away from leaving.
 *
 * Playback lives here too: `togglePlay` walks the recorded days in order,
 * driving `cutoff` day by day and `headFraction` within the current day, and
 * hands control straight back on any manual scrub. The hook also mirrors the
 * cutoff into a `?d=` URL param so a scrubbed view can be shared.
 */
export function useTimeline(walkedDays: JourneyDayDocument[] | null): Timeline {
  const [cutoff, setCutoffRaw] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [headFraction, setHeadFraction] = useState(1);
  const domain = useMemo(() => timelineDomain(walkedDays ?? []), [walkedDays]);

  // Recorded dates ascending. The query already orders by date, but sorting a
  // copy here means playback order never depends on the caller's sort.
  const recordedDates = useMemo(() => (walkedDays ?? []).map((day) => day.date).sort(), [walkedDays]);

  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const playheadRef = useRef<Playhead | null>(null);
  const reducedMotionRef = useRef(false);

  const stopPlayback = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    playheadRef.current = null;
    setPlaying(false);
    // Pausing mid-day rounds the head day up to complete: the contract is
    // that a fraction below 1 only ever exists while playing.
    setHeadFraction(1);
  }, []);

  const frame = useCallback(
    (ts: number) => {
      const head = playheadRef.current;
      if (head == null) return;
      let budget = head.lastTs == null ? 0 : Math.min(ts - head.lastTs, MAX_FRAME_MS);
      head.lastTs = ts;

      // Spend the frame's time across day animation and hops in one pass, so
      // a fast frame rate and a slow one land the playhead in the same place.
      while (budget > 0) {
        if (head.hopMsLeft > 0) {
          const spend = Math.min(head.hopMsLeft, budget);
          head.hopMsLeft -= spend;
          budget -= spend;
          if (head.hopMsLeft <= 0) {
            head.index += 1;
            head.fraction = 0;
            setCutoffRaw(head.dates[head.index]);
          }
        } else {
          const remainingMs = (1 - head.fraction) * DAY_ANIM_MS;
          const spend = Math.min(remainingMs, budget);
          head.fraction = Math.min(1, head.fraction + spend / DAY_ANIM_MS);
          budget -= spend;
          if (head.fraction >= 1) {
            if (head.index >= head.dates.length - 1) {
              // The final day is drawn: playback's ending IS returning to
              // live, so the page lands back in its resting state.
              stopPlayback();
              setCutoffRaw(null);
              return;
            }
            const gapMs =
              Date.parse(head.dates[head.index + 1] + 'T00:00:00Z') -
              Date.parse(head.dates[head.index] + 'T00:00:00Z');
            if (gapMs > DAY_MS) {
              head.hopMsLeft = HOP_MS;
            } else {
              head.index += 1;
              head.fraction = 0;
              setCutoffRaw(head.dates[head.index]);
            }
          }
        }
      }

      setHeadFraction(head.fraction);
      rafRef.current = requestAnimationFrame(frame);
    },
    [stopPlayback]
  );

  const startPlayback = useCallback(() => {
    const dates = recordedDates;
    if (dates.length === 0) return;

    // From live or from the end, replay from the start; from anywhere in the
    // middle, continue the walk with the first day after the one being
    // viewed, which is what "play" means while standing in the past.
    let index = 0;
    const last = dates[dates.length - 1];
    if (cutoff != null && cutoff < last) {
      const next = dates.findIndex((d) => d > cutoff);
      if (next !== -1) index = next;
    }

    setCutoffRaw(dates[index]);
    setPlaying(true);

    if (reducedMotionRef.current) {
      // Reduced motion: no line growing across the screen. Whole recorded
      // days land once per second, the same stepping a keyboard gives.
      setHeadFraction(1);
      playheadRef.current = { dates, index, fraction: 1, hopMsLeft: 0, lastTs: null };
      timerRef.current = window.setInterval(() => {
        const head = playheadRef.current;
        if (head == null) return;
        if (head.index >= head.dates.length - 1) {
          stopPlayback();
          setCutoffRaw(null);
          return;
        }
        head.index += 1;
        setCutoffRaw(head.dates[head.index]);
      }, 1000);
    } else {
      setHeadFraction(0);
      playheadRef.current = { dates, index, fraction: 0, hopMsLeft: 0, lastTs: null };
      rafRef.current = requestAnimationFrame(frame);
    }
  }, [recordedDates, cutoff, frame, stopPlayback]);

  const togglePlay = useCallback(() => {
    if (playheadRef.current != null) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [startPlayback, stopPlayback]);

  const setCutoff = useCallback(
    (day: string | null) => {
      // A manual scrub while the walk is replaying is the visitor taking the
      // controls back, so playback yields immediately.
      if (playheadRef.current != null) stopPlayback();
      if (day == null) {
        setCutoffRaw(null);
        return;
      }
      // With nothing recorded there is nothing to scrub to; and a cutoff
      // outside the recorded span is clamped rather than rejected, so keyboard
      // stepping past either end just stops there.
      if (domain == null) return;
      setCutoffRaw(day < domain.first ? domain.first : day > domain.last ? domain.last : day);
    },
    [domain, stopPlayback]
  );

  // Track prefers-reduced-motion live: the setting can change mid-session,
  // and a running animation should not outlive the request to stop moving.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = mq.matches;
    const onChange = () => {
      reducedMotionRef.current = mq.matches;
      if (playheadRef.current != null) stopPlayback();
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [stopPlayback]);

  // A hidden tab pauses playback rather than letting it run blind: throttled
  // background frames would crawl anyway, and returning to a walk that
  // finished unseen defeats the point of watching it.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && playheadRef.current != null) stopPlayback();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [stopPlayback]);

  // Stop the loop on unmount without the state churn of a full stopPlayback.
  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (timerRef.current != null) window.clearInterval(timerRef.current);
    },
    []
  );

  /*
   * URL state. The param is read exactly once, before the write effect below
   * ever runs, because the recorded domain needed to validate it arrives well
   * after mount and the write effect would otherwise strip the param while
   * the page still says cutoff null.
   */
  const pendingUrlDayRef = useRef<string | null | undefined>(undefined);
  if (pendingUrlDayRef.current === undefined) {
    const raw = new URLSearchParams(window.location.search).get('d');
    pendingUrlDayRef.current = raw != null && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  }

  useEffect(() => {
    const pending = pendingUrlDayRef.current;
    if (pending == null || domain == null) return;
    pendingUrlDayRef.current = null;
    if (pending >= domain.first && pending <= domain.last) {
      setCutoffRaw(pending);
    } else {
      // A shared link to a day outside the walk gets the live page, and the
      // dead param comes off the URL so reloading does not retry it.
      const url = new URL(window.location.href);
      url.searchParams.delete('d');
      window.history.replaceState(null, '', url);
    }
  }, [domain]);

  // Mirror the cutoff into ?d=. replaceState, never pushState: a scrub is one
  // view changing, and filling the back button with every dragged-over day
  // would trap the visitor in their own history.
  useEffect(() => {
    if (pendingUrlDayRef.current != null) return;
    const url = new URL(window.location.href);
    if (cutoff == null) {
      url.searchParams.delete('d');
    } else {
      url.searchParams.set('d', cutoff);
    }
    window.history.replaceState(null, '', url);
  }, [cutoff]);

  return { cutoff, setCutoff, playing, togglePlay, headFraction };
}
