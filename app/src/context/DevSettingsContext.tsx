import { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DevSettingsContextValue {
  /** Dev-only: render a simulated current-location marker in Kyushu. */
  simulateLocation: boolean;
  setSimulateLocation: (value: boolean) => void;
}

const DevSettingsContext = createContext<DevSettingsContextValue>({
  simulateLocation: false,
  setSimulateLocation: () => {},
});

const SIMULATE_LOCATION_KEY = 'settings.devSimulateLocation';

export function DevSettingsProvider({ children }: { children: React.ReactNode }) {
  const [simulateLocation, setSimulateLocationState] = useState(false);

  // Hydrate the persisted choice on mount. A brief flash before it resolves is
  // acceptable for a dev-only tool.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SIMULATE_LOCATION_KEY)
      .then((saved) => {
        if (!cancelled && saved === 'true') setSimulateLocationState(true);
      })
      .catch(() => {
        // Storage unavailable — keep the default (off).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function setSimulateLocation(value: boolean) {
    setSimulateLocationState(value);
    AsyncStorage.setItem(SIMULATE_LOCATION_KEY, value ? 'true' : 'false').catch(() => {
      // Best-effort persistence; the in-memory change already took effect.
    });
  }

  return (
    <DevSettingsContext.Provider value={{ simulateLocation, setSimulateLocation }}>
      {children}
    </DevSettingsContext.Provider>
  );
}

export function useDevSettings(): DevSettingsContextValue {
  return useContext(DevSettingsContext);
}
