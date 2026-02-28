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
  loadColorModePreference,
  loadScoreboardLayoutMode,
  persistColorModePreference,
  persistScoreboardLayoutMode,
  type ColorModePreference,
  type ScoreboardLayoutMode,
} from '@/config/preferences-storage';

type PreferencesContextValue = {
  scoreboardLayout: ScoreboardLayoutMode;
  setScoreboardLayout: (mode: ScoreboardLayoutMode) => void;
  colorModePreference: ColorModePreference;
  setColorModePreference: (mode: ColorModePreference) => void;
  isHydrated: boolean;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: PropsWithChildren) {
  const [scoreboardLayout, setScoreboardLayoutState] =
    useState<ScoreboardLayoutMode>('current');
  const [colorModePreference, setColorModePreferenceState] =
    useState<ColorModePreference>('system');
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const hydrate = async () => {
      try {
        const mode = await loadScoreboardLayoutMode();

        if (isMounted) {
          setScoreboardLayoutState(mode);
        }

        const colorMode = await loadColorModePreference();

        if (isMounted) {
          setColorModePreferenceState(colorMode);
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

  const setColorModePreference = useCallback((mode: ColorModePreference) => {
    setColorModePreferenceState(mode);

    void persistColorModePreference(mode);
  }, []);

  const value = useMemo(
    () => ({
      scoreboardLayout,
      setScoreboardLayout,
      colorModePreference,
      setColorModePreference,
      isHydrated,
    }),
    [
      colorModePreference,
      isHydrated,
      scoreboardLayout,
      setColorModePreference,
      setScoreboardLayout,
    ]
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
