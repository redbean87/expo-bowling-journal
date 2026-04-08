import { MaterialIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LeagueId } from '@/services/journal';

import { radius, spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import {
  leagueTypeLabel,
  resolveLeagueType,
  type LeagueType,
} from '@/utils/league-type-utils';

type League = {
  _id: string;
  name: string;
  type?: LeagueType | null;
  isOpenBowling?: boolean | null;
};

const createLeaguePickerModalStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.lg,
      maxHeight: '60%',
    },
    modalTitle: {
      fontSize: typeScale.titleSm,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: spacing.md,
    },
    leagueOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
    },
    leagueOptionSelected: {
      backgroundColor: colors.accentMuted,
    },
    leagueOptionPressed: {
      opacity: 0.75,
    },
    leagueOptionText: {
      fontSize: typeScale.body,
      color: colors.textPrimary,
    },
    leagueOptionTextSelected: {
      color: colors.accent,
      fontWeight: '600',
    },
    leagueOptionRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      flexShrink: 0,
    },
    leagueTypeBadge: {
      fontSize: typeScale.bodySm,
      fontWeight: '500',
      color: colors.textSecondary,
    },
  });

interface LeaguePickerModalProps {
  visible: boolean;
  onClose: () => void;
  leagues: League[];
  selectedLeagueId: LeagueId | null;
  onSelect: (leagueId: LeagueId) => void;
  colors: ThemeColors;
}

export function LeaguePickerModal({
  visible,
  onClose,
  leagues,
  selectedLeagueId,
  onSelect,
  colors,
}: LeaguePickerModalProps) {
  const insets = useSafeAreaInsets();
  const s = useMemo(() => createLeaguePickerModalStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <View
          style={[
            s.modalSheet,
            {
              paddingBottom: Math.max(insets.bottom, spacing.lg),
            },
          ]}
        >
          <Text style={s.modalTitle}>Select League</Text>
          <ScrollView>
            {leagues.map((league) => {
              const lType = resolveLeagueType(league);
              const isSelected = league._id === selectedLeagueId;

              return (
                <Pressable
                  key={league._id}
                  style={({ pressed }) => [
                    s.leagueOption,
                    isSelected && s.leagueOptionSelected,
                    pressed && s.leagueOptionPressed,
                  ]}
                  onPress={() => {
                    onSelect(league._id as LeagueId);
                    onClose();
                  }}
                >
                  <Text
                    style={[
                      s.leagueOptionText,
                      isSelected && s.leagueOptionTextSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {league.name}
                  </Text>
                  <View style={s.leagueOptionRight}>
                    {lType !== 'league' && (
                      <Text style={s.leagueTypeBadge}>
                        {leagueTypeLabel(lType)}
                      </Text>
                    )}
                    {isSelected ? (
                      <MaterialIcons
                        name="check"
                        size={18}
                        color={colors.accent}
                      />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}
