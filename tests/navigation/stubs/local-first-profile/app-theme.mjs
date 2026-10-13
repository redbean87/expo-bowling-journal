// Test double for '@/theme/use-app-theme' used by the local-first profile
// reads test: resolves to the light palette so the real profile cards can
// build their styles.
export function useAppTheme() {
  return {
    mode: 'light',
    preference: 'system',
    flavor: 'classic',
    theme: {},
    colors: {
      background: '#F5F7FA',
      surface: '#FFFFFF',
      surfaceMuted: '#F8FAFF',
      surfaceSubtle: '#FBFDFF',
      textPrimary: '#1A1F2B',
      textSecondary: '#5A6375',
      accent: '#1B6EF3',
      accentMuted: '#EAF1FF',
      accentText: '#FFFFFF',
      border: '#E3E8F1',
      borderStrong: '#CCD6E6',
      danger: '#B42318',
      dangerMuted: '#FEF5F4',
      dangerBorder: '#E8C5C2',
      warning: '#B54708',
      warningMuted: '#FFF8E6',
      warningBorder: '#E2D2A7',
      success: '#1A7F4B',
      bannerBackground: '#121621',
      bannerTextPrimary: '#FFFFFF',
      bannerTextSecondary: '#D8DEE9',
      overlay: 'rgba(15, 23, 42, 0.22)',
      surfaceElevated: '#FFFFFF',
      shadow: '#0F172A',
      shadowStrong: '#000000',
    },
  };
}
