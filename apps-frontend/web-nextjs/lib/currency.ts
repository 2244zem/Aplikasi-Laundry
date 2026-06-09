export function parseCurrencyInput(value: string) {
  const normalized = value.replace(/[^\d]/g, '');
  return normalized ? Number(normalized) : 0;
}

export function formatCurrencyInput(value: number) {
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}
