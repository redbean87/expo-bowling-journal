export function getFirstParam(value: unknown): string | null {
  if (Array.isArray(value)) {
    const firstValue = value[0];
    return typeof firstValue === 'string' ? firstValue : null;
  }

  return typeof value === 'string' ? value : null;
}
