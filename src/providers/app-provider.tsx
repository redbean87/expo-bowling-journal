import { PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export function AppProvider({ children }: PropsWithChildren) {
  return <SafeAreaProvider>{children}</SafeAreaProvider>;
}
