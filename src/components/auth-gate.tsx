import { useAuthActions } from '@convex-dev/auth/react';
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from 'convex/react';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Input } from '@/components/ui';
import { viewerQuery } from '@/convex/functions';
import {
  lineHeight,
  radius,
  spacing,
  type ThemeColors,
  typeScale,
} from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export function AuthGate() {
  const viewer = useQuery(viewerQuery);
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <AuthLoading>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.subtitle}>Checking session...</Text>
        </View>
      </AuthLoading>

      <Unauthenticated>
        <AuthForm />
      </Unauthenticated>

      <Authenticated>
        <Card>
          <Text style={styles.title}>Signed in</Text>
          <Text style={styles.subtitle}>
            {viewer?.email
              ? `Connected as ${viewer.email}`
              : 'Connected to Convex Auth.'}
          </Text>
          <SignOutButton />
        </Card>
      </Authenticated>
    </View>
  );
}

function AuthForm() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flow = isSigningUp ? 'signUp' : 'signIn';

  const onSubmit = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      await signIn('password', {
        flow,
        email,
        password,
      });
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : 'Unable to continue auth flow.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <Text style={styles.title}>
        {isSigningUp ? 'Create account' : 'Sign in'}
      </Text>
      <Text style={styles.subtitle}>
        Use email and password to access your bowling journal.
      </Text>

      <Input
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="Email"
        value={email}
      />
      <Input
        autoCapitalize="none"
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        value={password}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        disabled={isSubmitting}
        label={
          isSubmitting
            ? 'Working...'
            : isSigningUp
              ? 'Create account'
              : 'Sign in'
        }
        onPress={onSubmit}
      />

      <Button
        disabled={isSubmitting}
        label={
          isSigningUp
            ? 'Already have an account? Sign in'
            : 'Need an account? Create one'
        }
        onPress={() => setIsSigningUp((current) => !current)}
        variant="ghost"
      />
    </Card>
  );
}

function SignOutButton() {
  const { signOut } = useAuthActions();

  return (
    <Button label="Sign out" onPress={() => void signOut()} variant="ghost" />
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      marginTop: 16,
    },
    centered: {
      alignItems: 'center',
      gap: spacing.md,
    },
    title: {
      fontSize: typeScale.title,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: typeScale.body,
      lineHeight: lineHeight.body,
      color: colors.textSecondary,
    },
    error: {
      color: colors.danger,
      fontSize: typeScale.bodySm,
      borderRadius: radius.sm,
    },
  });
