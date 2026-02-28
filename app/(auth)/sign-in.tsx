import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthGate } from '@/components/auth-gate';
import { type ThemeColors } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export default function SignInScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <AuthGate />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: 20,
      backgroundColor: colors.background,
      justifyContent: 'center',
    },
  });
