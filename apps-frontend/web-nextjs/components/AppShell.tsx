'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type DeviceMode = 'android' | 'tablet' | 'desktop' | null;

const navItems = [
  { href: '/', icon: 'fi-rr-home', label: 'Home', matches: (path: string) => path === '/' },
  { href: '/orders/new', icon: 'fi-rr-add-document', label: 'Order', matches: (path: string) => path.startsWith('/orders') },
  { href: '/admin/dashboard', icon: 'fi-rr-apps', label: 'Admin', matches: (path: string) => path.startsWith('/admin/dashboard') },
  { href: '/admin/finance', icon: 'fi-rr-receipt', label: 'Finance', matches: (path: string) => path.startsWith('/admin/finance') },
];

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

function modeQuery(mode: DeviceMode) {
  if (!mode) {
    return '';
  }

  return `?is${mode}`;
}

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [mode, setMode] = useState<DeviceMode>(null);

  useEffect(() => {
    setMode(detectDeviceMode());
  }, []);

  const query = useMemo(() => modeQuery(mode), [mode]);
  const shellClass = `device-stage ${mode ? `device-${mode}` : 'device-fluid'}`;

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
            <Link className="brand" href={`/${query}`}>
              <span className="brand-mark">
                <i className="fi fi-sr-washer" aria-hidden />
              </span>
              <span>
                ScaleWash
                <small>clean ops</small>
              </span>
            </Link>

            <nav className="nav-links" aria-label="Navigasi utama">
              {navItems.map((item) => {
                const isActive = item.matches(pathname);

                return (
                  <Link className={`nav-link ${isActive ? 'active' : ''}`} href={`${item.href}${query}`} key={item.href}>
                    <i className={`fi ${item.icon}`} aria-hidden />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </header>

          <div className="app-content">{children}</div>

          <nav className="mobile-tabbar" aria-label="Navigasi mobile">
            {navItems.map((item) => {
              const isActive = item.matches(pathname);

              return (
                <Link
                  aria-label={item.label}
                  className={`mobile-tab ${isActive ? 'active' : ''}`}
                  href={`${item.href}${query}`}
                  key={item.href}
                >
                  <i className={`fi ${item.icon}`} aria-hidden />
                  <span>{item.label}</span>
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
