// Test double for '@/theme/use-app-theme' used by the D2 navigation tests.
export function useAppTheme() {
  return {
    mode: 'light',
    preference: 'system',
    flavor: 'classic',
    theme: {},
    colors: {
      background: '#ffffff',
    },
  };
}
