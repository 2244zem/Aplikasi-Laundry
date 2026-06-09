'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export type AppLanguage = 'id' | 'en';

export function normalizeLanguage(value: string | null | undefined): AppLanguage {
  return value === 'en' ? 'en' : 'id';
}

export function useAppLanguage() {
  const searchParams = useSearchParams();
  const [storedLanguage, setStoredLanguage] = useState<AppLanguage>('id');
  const queryLanguage = searchParams.get('lang') ? normalizeLanguage(searchParams.get('lang')) : null;

  useEffect(() => {
    const saved = normalizeLanguage(window.localStorage.getItem('ungu_laundry_lang'));
    setStoredLanguage(queryLanguage ?? saved);
  }, [queryLanguage]);

  return queryLanguage ?? storedLanguage;
}

export function useLocalizedNumber() {
  const language = useAppLanguage();

  return useMemo(
    () => ({
      currency(value: number) {
        return new Intl.NumberFormat(language === 'id' ? 'id-ID' : 'en-US', {
          currency: 'IDR',
          maximumFractionDigits: 0,
          style: 'currency',
        }).format(value || 0);
      },
      date(value: string) {
        return new Intl.DateTimeFormat(language === 'id' ? 'id-ID' : 'en-US', {
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          month: 'short',
          year: 'numeric',
        }).format(new Date(value));
      },
    }),
    [language],
  );
}
