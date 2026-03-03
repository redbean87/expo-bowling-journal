import React from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message: string | null;
};

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: null };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred.';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info);
  }

  handleReload = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    // On native, reset the boundary state so the tree re-mounts.
    // A full native reload would require expo-updates which is not
    // currently in the project; re-mounting is the safe fallback.
    this.setState({ hasError: false, message: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          {this.state.message ?? 'An unexpected error occurred.'}
        </Text>
        <TouchableOpacity style={styles.button} onPress={this.handleReload}>
          <Text style={styles.buttonText}>Reload</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#F5F7FA',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1F2B',
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: '#5A6375',
    marginBottom: 24,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#1B6EF3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
