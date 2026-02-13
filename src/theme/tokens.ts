export const colors = {
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
} as const;

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

export const theme = {
  colors,
  spacing,
  radius,
  typeScale,
  lineHeight,
} as const;
