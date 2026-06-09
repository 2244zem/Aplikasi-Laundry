'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ensureProfile } from '@/lib/profile';
import type { AppLanguage } from '@/lib/i18n';
import { normalizeLanguage } from '@/lib/i18n';
import type { UserProfile } from '@/lib/types';

type DeviceMode = 'android' | 'tablet' | 'desktop' | null;

type NavItem = {
  href: string;
  icon: string;
  label: Record<AppLanguage, string>;
  matches: (path: string, hash?: string) => boolean;
};

const userNavItems: NavItem[] = [
  { href: '/', icon: 'fi-rr-home', label: { id: 'Beranda', en: 'Home' }, matches: (path) => path === '/' },
  { href: '/orders/new', icon: 'fi-rr-add-document', label: { id: 'Order', en: 'Order' }, matches: (path) => path === '/orders/new' },
  { href: '/orders/history', icon: 'fi-rr-ballot', label: { id: 'Riwayat', en: 'History' }, matches: (path) => path.startsWith('/orders/history') },
  { href: '/orders/payment', icon: 'fi-rr-credit-card', label: { id: 'Bayar', en: 'Pay' }, matches: (path) => path.startsWith('/orders/payment') },
];

const adminNavItems: NavItem[] = [
  { href: '/admin/dashboard', icon: 'fi-rr-apps', label: { id: 'Dasbor', en: 'Dashboard' }, matches: (path, hash) => path.startsWith('/admin/dashboard') && hash !== '#orders' },
  { href: '/admin/dashboard#orders', icon: 'fi-rr-ballot', label: { id: 'Pesanan', en: 'Orders' }, matches: (path, hash) => path.startsWith('/admin/dashboard') && hash === '#orders' },
  { href: '/admin/chat', icon: 'fi-rr-comment-alt', label: { id: 'Chat', en: 'Chat' }, matches: (path) => path.startsWith('/admin/chat') },
  { href: '/admin/inventory', icon: 'fi-rr-box-open', label: { id: 'Stok', en: 'Stock' }, matches: (path) => path.startsWith('/admin/inventory') },
  { href: '/admin/finance', icon: 'fi-rr-receipt', label: { id: 'Keuangan', en: 'Finance' }, matches: (path) => path.startsWith('/admin/finance') },
];

function navItemsForProfile(profile: UserProfile | null) {
  if (!profile) {
    return userNavItems;
  }

  if (profile.role === 'SUPERADMIN' || profile.role === 'ADMIN' || profile.staff_role === 'OWNER') {
    return adminNavItems;
  }

  if (profile.staff_role === 'KASIR') {
    return adminNavItems.filter((item) => !item.href.startsWith('/admin/finance'));
  }

  if (profile.staff_role === 'TUKANG_CUCI') {
    return adminNavItems.filter((item) => item.href.startsWith('/admin/dashboard') || item.href.startsWith('/admin/chat'));
  }

  return userNavItems;
}

function detectDeviceMode() {
  if (typeof window === 'undefined') {
    return null;
  }

  const params = new URLSearchParams(window.location.search);

  if (params.has('isandroid')) {
    return 'android';
  }

  if (params.has('istablet')) {
    return 'tablet';
  }

  if (params.has('isdesktop')) {
    return 'desktop';
  }

  return null;
}

function navHref(href: string, mode: DeviceMode, language: AppLanguage) {
  const [path, hash] = href.split('#');
  const params = new URLSearchParams();

  if (mode) {
    params.set(`is${mode}`, '');
  }

  if (language === 'en') {
    params.set('lang', 'en');
  }

  const query = params.toString();
  return `${path}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`;
}

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState<DeviceMode>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [language, setLanguage] = useState<AppLanguage>('id');

  useEffect(() => {
    setMode(detectDeviceMode());
  }, []);

  useEffect(() => {
    const queryLanguage = searchParams.get('lang');
    const savedLanguage = typeof window !== 'undefined' ? window.localStorage.getItem('ungu_laundry_lang') : null;
    const nextLanguage = queryLanguage ? normalizeLanguage(queryLanguage) : normalizeLanguage(savedLanguage);

    setLanguage(nextLanguage);
  }, [searchParams]);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        if (mounted) {
          setProfile(null);
          setProfileLoading(false);
        }
        return;
      }

      try {
        const nextProfile = await ensureProfile(session.user);
        if (mounted) {
          setProfile(nextProfile);
          setProfileLoading(false);
        }
      } catch {
        if (mounted) {
          setProfile(null);
          setProfileLoading(false);
        }
      }
    }

    void loadProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      if (mounted) {
        setProfileLoading(true);
      }
      void loadProfile();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const isAdmin = profile?.role === 'ADMIN' || profile?.role === 'SUPERADMIN' || Boolean(profile?.staff_role);
  const navItems = profileLoading ? [] : navItemsForProfile(profile);
  const shellClass = `device-stage ${mode ? `device-${mode}` : 'device-fluid'}`;
  const currentHash = typeof window === 'undefined' ? '' : window.location.hash;

  function toggleLanguage() {
    const nextLanguage: AppLanguage = language === 'id' ? 'en' : 'id';
    const params = new URLSearchParams(searchParams.toString());

    if (nextLanguage === 'id') {
      params.delete('lang');
    } else {
      params.set('lang', nextLanguage);
    }

    window.localStorage.setItem('ungu_laundry_lang', nextLanguage);
    setLanguage(nextLanguage);
    router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`);
  }

  return (
    <div className={shellClass}>
      <div className="device-frame">
        {mode === 'android' ? (
          <div className="device-statusbar" aria-hidden>
            <span>9:41</span>
            <span>LTE 100%</span>
          </div>
        ) : null}

        <div className="app-shell">
          <header className="topbar">
            <Link className="brand" href={navHref(isAdmin ? '/admin/dashboard' : '/', mode, language)}>
              <span className="brand-mark">
                <i className="fi fi-sr-washer" aria-hidden />
              </span>
              <span>
                Ungu Laundry
                <small>{language === 'id' ? 'perawatan premium' : 'premium care'}</small>
              </span>
            </Link>

            <nav className="nav-links" aria-label="Navigasi utama">
              {navItems.map((item) => {
                const isActive = item.matches(pathname, currentHash);

                return (
                  <Link className={`nav-link ${isActive ? 'active' : ''}`} href={navHref(item.href, mode, language)} key={item.href}>
                    <i className={`fi ${item.icon}`} aria-hidden />
                    {item.label[language]}
                  </Link>
                );
              })}
            </nav>

            <button className="language-toggle" onClick={toggleLanguage} type="button">
              <i className="fi fi-rr-language" aria-hidden />
              {language === 'id' ? 'ID' : 'EN'}
            </button>
          </header>

          <div className="app-content">{children}</div>

          <nav className="mobile-tabbar" aria-label="Navigasi mobile">
            {navItems.map((item) => {
              const isActive = item.matches(pathname, currentHash);

              return (
                <Link
                  aria-label={item.label[language]}
                  className={`mobile-tab ${isActive ? 'active' : ''}`}
                  href={navHref(item.href, mode, language)}
                  key={item.href}
                >
                  <i className={`fi ${item.icon}`} aria-hidden />
                  <span>{item.label[language]}</span>
                </Link>
              );
            })}
          </nav>

          <a className="flaticon-credit" href="https://www.flaticon.com/uicons" rel="noreferrer" target="_blank">
            Icons by Flaticon
          </a>
        </div>
      </div>
    </div>
  );
}
