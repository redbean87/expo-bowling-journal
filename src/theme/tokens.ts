export type ThemeColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceSubtle: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentMuted: string;
  accentText: string;
  border: string;
  borderStrong: string;
  danger: string;
  dangerMuted: string;
  dangerBorder: string;
  warningMuted: string;
  warningBorder: string;
  bannerBackground: string;
  bannerTextPrimary: string;
  bannerTextSecondary: string;
  overlay: string;
  surfaceElevated: string;
  shadow: string;
  shadowStrong: string;
};

export const lightColors: ThemeColors = {
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
  warningMuted: '#FFF8E6',
  warningBorder: '#E2D2A7',
  bannerBackground: '#121621',
  bannerTextPrimary: '#FFFFFF',
  bannerTextSecondary: '#D8DEE9',
  overlay: 'rgba(15, 23, 42, 0.22)',
  surfaceElevated: '#FFFFFF',
  shadow: '#0F172A',
  shadowStrong: '#000000',
};

export const darkColors: ThemeColors = {
  background: '#0F141D',
  surface: '#171D29',
  surfaceMuted: '#1C2331',
  surfaceSubtle: '#101723',
  textPrimary: '#E9EEF7',
  textSecondary: '#B7C2D6',
  accent: '#6CA8FF',
  accentMuted: '#1E335A',
  accentText: '#08101D',
  border: '#283246',
  borderStrong: '#3A4963',
  danger: '#FF8E84',
  dangerMuted: '#372022',
  dangerBorder: '#6A3E42',
  warningMuted: '#3A2F1A',
  warningBorder: '#7A6540',
  bannerBackground: '#0A0E16',
  bannerTextPrimary: '#F4F7FF',
  bannerTextSecondary: '#BAC5DB',
  overlay: 'rgba(2, 6, 12, 0.52)',
  surfaceElevated: '#1F2736',
  shadow: '#000000',
  shadowStrong: '#000000',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const radius = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
} as const;

export const typeScale = {
  bodySm: 13,
  body: 14,
  bodyLg: 15,
  titleSm: 16,
  title: 20,
  hero: 26,
} as const;

export const lineHeight = {
  compact: 18,
  body: 20,
} as const;

export const colors = lightColors;

export const theme = {
  colors,
  spacing,
  radius,
  typeScale,
  lineHeight,
} as const;

export type AppTheme = {
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typeScale: typeof typeScale;
  lineHeight: typeof lineHeight;
};

export function createTheme(colors: ThemeColors): AppTheme {
  return {
    colors,
    spacing,
    radius,
    typeScale,
    lineHeight,
  };
}
