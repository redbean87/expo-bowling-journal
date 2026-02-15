import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  loadScoreboardLayoutMode,
  persistScoreboardLayoutMode,
  type ScoreboardLayoutMode,
} from '@/config/preferences-storage';

type PreferencesContextValue = {
  scoreboardLayout: ScoreboardLayoutMode;
  setScoreboardLayout: (mode: ScoreboardLayoutMode) => void;
  isHydrated: boolean;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: PropsWithChildren) {
  const [scoreboardLayout, setScoreboardLayoutState] =
    useState<ScoreboardLayoutMode>('current');
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const hydrate = async () => {
      try {
        const mode = await loadScoreboardLayoutMode();

        if (isMounted) {
          setScoreboardLayoutState(mode);
        }
      } finally {
        if (isMounted) {
          setIsHydrated(true);
        }
      }
    };

    void hydrate();

    return () => {
      isMounted = false;
    };
  }, []);

  const setScoreboardLayout = useCallback((mode: ScoreboardLayoutMode) => {
    setScoreboardLayoutState(mode);

    void persistScoreboardLayoutMode(mode);
  }, []);

  const value = useMemo(
    () => ({ scoreboardLayout, setScoreboardLayout, isHydrated }),
    [isHydrated, scoreboardLayout, setScoreboardLayout]
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const value = useContext(PreferencesContext);

  if (!value) {
    throw new Error('usePreferences must be used within PreferencesProvider.');
  }

  return value;
}
