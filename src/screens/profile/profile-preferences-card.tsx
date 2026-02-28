import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import {
  type ColorModePreference,
  type ScoreboardLayoutMode,
  type ThemeFlavorPreference,
} from '@/config/preferences-storage';
import {
  lineHeight,
  spacing,
  type ThemeColors,
  typeScale,
} from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type ProfilePreferencesCardProps = {
  scoreboardLayout: ScoreboardLayoutMode;
  setScoreboardLayout: (mode: ScoreboardLayoutMode) => void;
  colorModePreference: ColorModePreference;
  setColorModePreference: (mode: ColorModePreference) => void;
  themeFlavorPreference: ThemeFlavorPreference;
  setThemeFlavorPreference: (flavor: ThemeFlavorPreference) => void;
  isHydrated: boolean;
};

type Option<Value extends string> = {
  label: string;
  value: Value;
  description: string;
};

const scoreboardLayoutOptions: Option<ScoreboardLayoutMode>[] = [
  {
    label: 'Current',
    value: 'current',
    description: 'Larger, scrollable frame strip while editing.',
  },
  {
    label: 'Compact',
    value: 'compact',
    description: 'Fit all 10 frames in one row.',
  },
];

const colorModeOptions: Option<ColorModePreference>[] = [
  {
    label: 'System',
    value: 'system',
    description: 'Match your device appearance setting.',
  },
  {
    label: 'Light',
    value: 'light',
    description: 'Always use the light theme.',
  },
  {
    label: 'Dark',
    value: 'dark',
    description: 'Always use the dark theme.',
  },
];

const themeFlavorOptions: Option<ThemeFlavorPreference>[] = [
  {
    label: 'Default',
    value: 'default',
    description: 'Use the app default accent palette.',
  },
  {
    label: 'Shinobi Blend',
    value: 'shinobi',
    description: 'Blend Naruto orange with Sasuke indigo accents.',
  },
];

export function ProfilePreferencesCard({
  scoreboardLayout,
  setScoreboardLayout,
  colorModePreference,
  setColorModePreference,
  themeFlavorPreference,
  setThemeFlavorPreference,
  isHydrated,
}: ProfilePreferencesCardProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Card muted style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>Preferences</Text>

      <Text style={styles.meta}>Theme</Text>
      <View style={styles.layoutOptionsRow}>
        {colorModeOptions.map((option) => {
          const isActive = colorModePreference === option.value;

          return (
            <Pressable
              key={option.value}
              onPress={() => setColorModePreference(option.value)}
              style={({ pressed }) => [
                styles.layoutOption,
                isActive ? styles.layoutOptionActive : null,
                pressed ? styles.layoutOptionPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.layoutOptionLabel,
                  isActive ? styles.layoutOptionLabelActive : null,
                ]}
              >
                {option.label}
              </Text>
              <Text
                style={[
                  styles.layoutOptionDescription,
                  isActive ? styles.layoutOptionDescriptionActive : null,
                ]}
              >
                {option.description}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.meta}>Theme flavor</Text>
      <View style={styles.layoutOptionsRow}>
        {themeFlavorOptions.map((option) => {
          const isActive = themeFlavorPreference === option.value;

          return (
            <Pressable
              key={option.value}
              onPress={() => setThemeFlavorPreference(option.value)}
              style={({ pressed }) => [
                styles.layoutOption,
                isActive ? styles.layoutOptionActive : null,
                pressed ? styles.layoutOptionPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.layoutOptionLabel,
                  isActive ? styles.layoutOptionLabelActive : null,
                ]}
              >
                {option.label}
              </Text>
              <Text
                style={[
                  styles.layoutOptionDescription,
                  isActive ? styles.layoutOptionDescriptionActive : null,
                ]}
              >
                {option.description}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.meta}>Scoreboard layout</Text>
      <View style={styles.layoutOptionsRow}>
        {scoreboardLayoutOptions.map((option) => {
          const isActive = scoreboardLayout === option.value;

          return (
            <Pressable
              key={option.value}
              onPress={() => setScoreboardLayout(option.value)}
              style={({ pressed }) => [
                styles.layoutOption,
                isActive ? styles.layoutOptionActive : null,
                pressed ? styles.layoutOptionPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.layoutOptionLabel,
                  isActive ? styles.layoutOptionLabelActive : null,
                ]}
              >
                {option.label}
              </Text>
              <Text
                style={[
                  styles.layoutOptionDescription,
                  isActive ? styles.layoutOptionDescriptionActive : null,
                ]}
              >
                {option.description}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!isHydrated ? (
        <Text style={styles.meta}>Loading preferences...</Text>
      ) : null}
    </Card>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    sectionCard: {
      gap: spacing.sm,
    },
    sectionTitle: {
      fontSize: typeScale.titleSm,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    meta: {
      fontSize: typeScale.bodySm,
      lineHeight: lineHeight.compact,
      color: colors.textSecondary,
    },
    layoutOptionsRow: {
      gap: spacing.sm,
    },
    layoutOption: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.surface,
      gap: spacing.xs,
    },
    layoutOptionActive: {
      borderColor: colors.accent,
      backgroundColor: colors.accentMuted,
    },
    layoutOptionPressed: {
      opacity: 0.82,
    },
    layoutOptionLabel: {
      fontSize: typeScale.body,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    layoutOptionLabelActive: {
      color: colors.accent,
    },
    layoutOptionDescription: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
    },
    layoutOptionDescriptionActive: {
      color: colors.textPrimary,
    },
  });
