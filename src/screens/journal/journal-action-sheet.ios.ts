import { ActionSheetIOS } from 'react-native';

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
  const options = [...actions.map((action) => action.label), cancelLabel];
  const destructiveIndices = actions
    .map((action, index) => (action.destructive ? index : -1))
    .filter((index) => index >= 0);
  const destructiveButtonIndex =
    destructiveIndices.length === 0
      ? undefined
      : destructiveIndices.length === 1
        ? destructiveIndices[0]
        : destructiveIndices;

  ActionSheetIOS.showActionSheetWithOptions(
    {
      options,
      cancelButtonIndex: options.length - 1,
      destructiveButtonIndex,
      title,
    },
    (buttonIndex) => {
      if (buttonIndex < 0 || buttonIndex >= actions.length) {
        return;
      }

      actions[buttonIndex]?.onPress();
    }
  );

  return true;
}
