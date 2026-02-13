import { StyleSheet, View } from 'react-native';

import { AuthGate } from '@/components/auth-gate';
import { colors } from '@/theme/tokens';

export default function SignInScreen() {
  return (
    <View style={styles.container}>
      <AuthGate />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: colors.background,
    justifyContent: 'center',
  },
});
