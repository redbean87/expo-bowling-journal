import { useWindowDimensions } from 'react-native';

// Material UI breakpoints
// https://mui.com/material-ui/customization/breakpoints
export const breakpoints = {
  xs: 0,
  sm: 600,
  md: 900,
  lg: 1200,
  xl: 1536,
} as const;

export type BreakpointKey = keyof typeof breakpoints;

/**
 * Hook to detect current breakpoint based on screen width.
 * Uses Material UI breakpoints:
 * - xs: 0-599 (mobile)
 * - sm: 600-899 (tablet portrait, large phones)
 * - md: 900-1199 (tablet landscape)
 * - lg: 1200-1535 (desktop)
 * - xl: 1536+ (large desktop)
 */
export function useBreakpoint() {
  const { width } = useWindowDimensions();

  const current = ((): BreakpointKey => {
    if (width >= breakpoints.xl) return 'xl';
    if (width >= breakpoints.lg) return 'lg';
    if (width >= breakpoints.md) return 'md';
    if (width >= breakpoints.sm) return 'sm';
    return 'xs';
  })();

  return {
    width,
    current,
    isXs: current === 'xs',
    isSm: current === 'sm',
    isMd: current === 'md',
    isLg: current === 'lg',
    isXl: current === 'xl',
    /** True for xs and sm - phones and small tablets */
    isMobile: current === 'xs' || current === 'sm',
    /** True for md and up - tablets and desktop */
    isTablet: current === 'md',
    /** True for lg and up - desktop */
    isDesktop: current === 'lg' || current === 'xl',
    /** True for sm breakpoint and below - triggers compact mode */
    isCompact: width < breakpoints.sm,
  };
}

/**
 * Check if a breakpoint key matches a range.
 * Similar to MUI's theme.breakpoints.up() / down() / between() / only()
 */
export const breakpointUtils = {
  /** width >= breakpoint */
  up: (width: number, key: BreakpointKey) => width >= breakpoints[key],

  /** width < breakpoint */
  down: (width: number, key: BreakpointKey) => width < breakpoints[key],

  /** between start (inclusive) and end (exclusive) */
  between: (width: number, start: BreakpointKey, end: BreakpointKey) =>
    width >= breakpoints[start] && width < breakpoints[end],

  /** only this breakpoint range */
  only: (width: number, key: BreakpointKey) => {
    const keys: BreakpointKey[] = ['xs', 'sm', 'md', 'lg', 'xl'];
    const index = keys.indexOf(key);
    const nextKey = keys[index + 1];
    if (!nextKey) return width >= breakpoints[key];
    return width >= breakpoints[key] && width < breakpoints[nextKey];
  },
};
