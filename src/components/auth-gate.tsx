import { useAuthActions } from '@convex-dev/auth/react';
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from 'convex/react';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { viewerQuery } from '@/convex/functions';
import { colors } from '@/theme/tokens';

export function AuthGate() {
  const viewer = useQuery(viewerQuery);

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
        <View style={styles.card}>
          <Text style={styles.title}>Signed in</Text>
          <Text style={styles.subtitle}>
            {viewer?.email
              ? `Connected as ${viewer.email}`
              : 'Connected to Convex Auth.'}
          </Text>
          <SignOutButton />
        </View>
      </Authenticated>
    </View>
  );
}

function AuthForm() {
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
    <View style={styles.card}>
      <Text style={styles.title}>
        {isSigningUp ? 'Create account' : 'Sign in'}
      </Text>
      <Text style={styles.subtitle}>
        Use email and password to access your bowling journal.
      </Text>

      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        value={email}
      />
      <TextInput
        autoCapitalize="none"
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        style={styles.input}
        value={password}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        disabled={isSubmitting}
        onPress={onSubmit}
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonLabel}>
          {isSubmitting
            ? 'Working...'
            : isSigningUp
              ? 'Create account'
              : 'Sign in'}
        </Text>
      </Pressable>

      <Pressable
        disabled={isSubmitting}
        onPress={() => setIsSigningUp((current) => !current)}
        style={styles.ghostButton}
      >
        <Text style={styles.ghostButtonLabel}>
          {isSigningUp
            ? 'Already have an account? Sign in'
            : 'Need an account? Create one'}
        </Text>
      </Pressable>
    </View>
  );
}

function SignOutButton() {
  const { signOut } = useAuthActions();

  return (
    <Pressable onPress={() => void signOut()} style={styles.ghostButton}>
      <Text style={styles.ghostButtonLabel}>Sign out</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  centered: {
    alignItems: 'center',
    gap: 10,
  },
  card: {
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F9FBFF',
    color: colors.textPrimary,
    paddingHorizontal: 12,
  },
  error: {
    color: '#B42318',
    fontSize: 13,
  },
  primaryButton: {
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: colors.accent,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  ghostButton: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostButtonLabel: {
    color: colors.accent,
    fontWeight: '600',
  },
});
