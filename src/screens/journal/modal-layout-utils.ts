export function getCreateModalTranslateY(width: number) {
  if (width < 768) {
    return -24;
  }

  if (width < 1024) {
    return -12;
  }

  return 0;
}
