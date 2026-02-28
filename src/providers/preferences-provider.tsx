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
  loadThemeFlavorPreference,
  persistColorModePreference,
  persistScoreboardLayoutMode,
  persistThemeFlavorPreference,
  type ColorModePreference,
  type ScoreboardLayoutMode,
  type ThemeFlavorPreference,
} from '@/config/preferences-storage';

type PreferencesContextValue = {
  scoreboardLayout: ScoreboardLayoutMode;
  setScoreboardLayout: (mode: ScoreboardLayoutMode) => void;
  colorModePreference: ColorModePreference;
  setColorModePreference: (mode: ColorModePreference) => void;
  themeFlavorPreference: ThemeFlavorPreference;
  setThemeFlavorPreference: (flavor: ThemeFlavorPreference) => void;
  isHydrated: boolean;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: PropsWithChildren) {
  const [scoreboardLayout, setScoreboardLayoutState] =
    useState<ScoreboardLayoutMode>('current');
  const [colorModePreference, setColorModePreferenceState] =
    useState<ColorModePreference>('system');
  const [themeFlavorPreference, setThemeFlavorPreferenceState] =
    useState<ThemeFlavorPreference>('default');
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

        const themeFlavor = await loadThemeFlavorPreference();

        if (isMounted) {
          setThemeFlavorPreferenceState(themeFlavor);
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

  const setThemeFlavorPreference = useCallback(
    (flavor: ThemeFlavorPreference) => {
      setThemeFlavorPreferenceState(flavor);

      void persistThemeFlavorPreference(flavor);
    },
    []
  );

  const value = useMemo(
    () => ({
      scoreboardLayout,
      setScoreboardLayout,
      colorModePreference,
      setColorModePreference,
      themeFlavorPreference,
      setThemeFlavorPreference,
      isHydrated,
    }),
    [
      colorModePreference,
      isHydrated,
      scoreboardLayout,
      setColorModePreference,
      setScoreboardLayout,
      setThemeFlavorPreference,
      themeFlavorPreference,
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
