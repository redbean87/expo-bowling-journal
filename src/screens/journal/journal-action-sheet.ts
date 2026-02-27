import { Alert, Platform } from 'react-native';

type JournalActionSheetAction = {
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

export function openJournalNativeActionSheet({
  title,
  actions,
  cancelLabel = 'Cancel',
}: {
  title: string;
  actions: JournalActionSheetAction[];
  cancelLabel?: string;
}) {
  if (Platform.OS === 'android') {
    Alert.alert(title, undefined, [
      ...actions.map((action) => ({
        text: action.label,
        ...(action.destructive ? { style: 'destructive' as const } : {}),
        onPress: action.onPress,
      })),
      {
        text: cancelLabel,
        style: 'cancel' as const,
      },
    ]);

    return true;
  }

  return false;
}
