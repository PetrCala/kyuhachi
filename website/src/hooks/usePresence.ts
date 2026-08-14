import {
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  set,
} from 'firebase/database';
import { useEffect, useState } from 'react';
import { rtdb } from '../firebase';

/**
 * The classic RTDB presence pattern: every open tab holds one node under
 * /presence, removed by the server on disconnect (onDisconnect) and by the
 * client on unmount. The viewer count is simply the child count, so it needs
 * no server code and no cleanup job. Re-registers automatically after every
 * reconnect (.info/connected fires again).
 *
 * Returns 0 until the first server snapshot arrives.
 */
export function usePresence(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const myPresenceRef = push(ref(rtdb, 'presence'));
    const connectedRef = ref(rtdb, '.info/connected');

    const unsubConnected = onValue(connectedRef, (snap) => {
      if (snap.val() !== true) return;
      // Order matters: arm the server-side cleanup before marking presence,
      // so a tab that dies mid-setup can never leave a stuck node.
      onDisconnect(myPresenceRef)
        .remove()
        .then(() => set(myPresenceRef, true))
        .catch((err) => console.error('presence registration failed', err));
    });

    const unsubCount = onValue(
      ref(rtdb, 'presence'),
      (snap) => setCount(snap.size),
      (err) => console.error('presence subscription failed', err)
    );

    return () => {
      unsubConnected();
      unsubCount();
      // Deliberately no onDisconnect cancel: if this remove never lands, the
      // armed server-side hook is the safety net, and it firing after a
      // successful remove is harmless.
      remove(myPresenceRef).catch(() => {
        // The onDisconnect hook cleans up when the connection drops.
      });
    };
  }, []);

  return count;
}
