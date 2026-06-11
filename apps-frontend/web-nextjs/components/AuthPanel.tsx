'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LogIn, LogOut, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ListSkeleton, SkeletonBlock } from '@/components/Skeleton';
import { friendlyAppError } from '@/lib/appErrors';
import { supabase } from '@/lib/supabaseClient';
import { ensureProfile } from '@/lib/profile';
import { getValidatedAuthSession } from '@/lib/authSession';
import type { UserProfile } from '@/lib/types';

type AuthState = {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  message: string;
};

type AuthenticatedState = {
  session: Session;
  profile: UserProfile;
  loading: boolean;
  message: string;
};

type AuthPanelProps = {
  children: (state: AuthenticatedState & { refreshProfile: () => Promise<void> }) => React.ReactNode;
};

export function AuthPanel({ children }: AuthPanelProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [nama, setNama] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function withCurrentContext(path: string) {
    const params = new URLSearchParams();

    ['isandroid', 'istablet', 'isdesktop', 'lang'].forEach((key) => {
      const value = searchParams.get(key);
      if (searchParams.has(key)) {
        params.set(key, value ?? '');
      }
    });

    const query = params.toString();
    return `${path}${query ? `?${query}` : ''}`;
  }

  function isAdminProfile(nextProfile: UserProfile) {
    return nextProfile.role === 'ADMIN' || nextProfile.role === 'SUPERADMIN' || Boolean(nextProfile.staff_role);
  }

  function routeAfterAuth(nextProfile: UserProfile) {
    const isAdmin = isAdminProfile(nextProfile);

    if (pathname.startsWith('/admin') && !isAdmin) {
      return '/';
    }

    if (isAdmin && !pathname.startsWith('/admin')) {
      return '/admin/dashboard';
    }

    return '';
  }

  const refreshProfile = useCallback(async () => {
    const { session: currentSession, user, errorMessage } = await getValidatedAuthSession();

    setSession(currentSession);

    if (!currentSession || !user) {
      setProfile(null);
      setMessage(errorMessage ?? '');
      return;
    }

    const nextProfile = await ensureProfile(user, nama);
    setProfile(nextProfile);
  }, [nama]);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        const { session: currentSession, user, errorMessage } = await getValidatedAuthSession();

        if (!mounted) {
          return;
        }

        setSession(currentSession);

        if (currentSession && user) {
          const nextProfile = await ensureProfile(user);
          if (mounted) {
            setProfile(nextProfile);
            const nextRoute = routeAfterAuth(nextProfile);
            if (nextRoute) {
              router.replace(withCurrentContext(nextRoute));
            }
          }
        } else if (errorMessage) {
          setMessage(errorMessage);
        }
      } catch (error) {
        if (mounted) {
          setMessage(friendlyAppError(error, 'Gagal membaca sesi Supabase.'));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession) {
        setSession(null);
        setProfile(null);
        return;
      }

      void loadSession();
    });

    void loadSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const authResponse =
        mode === 'signup'
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password });

      if (authResponse.error) {
        throw authResponse.error;
      }

      if (authResponse.data.session?.user) {
        const nextProfile = await ensureProfile(authResponse.data.session.user, nama);
        setSession(authResponse.data.session);
        setProfile(nextProfile);
        setMessage(mode === 'signup' ? 'Akun dibuat dan profile siap.' : 'Berhasil masuk.');
        const nextRoute = routeAfterAuth(nextProfile);
        if (nextRoute) {
          router.replace(withCurrentContext(nextRoute));
        }
      } else {
        setMessage('Cek email untuk konfirmasi akun Supabase Auth.');
      }
    } catch (error) {
      setMessage(friendlyAppError(error, 'Autentikasi gagal.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    setLoading(true);
    setMessage('');
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setLoading(false);
    router.replace(withCurrentContext('/'));
  }

  if (loading && !session && !profile) {
    return (
      <section className="panel auth-skeleton">
        <SkeletonBlock className="skeleton-label" />
        <SkeletonBlock className="skeleton-value" />
        <ListSkeleton count={2} />
      </section>
    );
  }

  if (session && profile) {
    const isAdmin = isAdminProfile(profile);
    const adminRouteMismatch = pathname.startsWith('/admin') && !isAdmin;
    const customerRouteMismatch = pathname.startsWith('/orders') && isAdmin;

    if (adminRouteMismatch || customerRouteMismatch) {
      return (
        <section className="panel soft">
          <p className="eyebrow">Akses role</p>
          <h1>{adminRouteMismatch ? 'Halaman admin khusus outlet.' : 'Halaman customer khusus user.'}</h1>
          <p className="muted">
            Kamu login sebagai {profile.role}. Menu dan halaman diarahkan sesuai role supaya alur kerja tetap bersih.
          </p>
          <div className="actions">
            <Link className="button primary" href={withCurrentContext(isAdmin ? '/admin/dashboard' : '/')}>
              <i className="fi fi-rr-home" aria-hidden />
              {isAdmin ? 'Ke Dasbor' : 'Ke Dashboard User'}
            </Link>
            <button className="button secondary" onClick={handleSignOut} type="button">
              <LogOut aria-hidden size={18} />
              Keluar
            </button>
          </div>
        </section>
      );
    }

    return (
      <div className="grid">
        <section className="panel soft">
          <div className="page-header" style={{ marginBottom: 0 }}>
            <div>
              <p className="eyebrow">Sesi aktif</p>
              <h2 style={{ marginBottom: 6 }}>{profile.nama}</h2>
              <p className="muted" style={{ marginBottom: 0 }}>
                {profile.email} - {profile.role} - Langganan {profile.status_langganan}
              </p>
            </div>
            <button className="button secondary" onClick={handleSignOut} type="button">
              <LogOut aria-hidden size={18} />
              Keluar
            </button>
          </div>
        </section>
        {children({ session, profile, loading, message, refreshProfile })}
      </div>
    );
  }

  return (
    <div className="grid two">
      <section className="panel">
        <p className="eyebrow">Masuk Supabase</p>
        <h1>{mode === 'signup' ? 'Buat akun Ungu Laundry' : 'Masuk untuk lanjut'}</h1>
        <p className="muted">
          Akun ini dipakai untuk mencoba RLS, membuat order customer, dan membuka dashboard admin.
        </p>

        <form className="form-grid" onSubmit={handleAuth}>
          {mode === 'signup' ? (
            <label className="field">
              <span>Nama</span>
              <input
                className="input"
                onChange={(event) => setNama(event.target.value)}
                placeholder="Nama pengguna"
                required
                value={nama}
              />
            </label>
          ) : null}

          <label className="field">
            <span>Email</span>
            <input
              className="input"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nama@email.com"
              required
              type="email"
              value={email}
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              className="input"
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimal 6 karakter"
              required
              type="password"
              value={password}
            />
          </label>

          <div className="actions">
            <button className="button primary" disabled={loading} type="submit">
              {mode === 'signup' ? <UserPlus aria-hidden size={18} /> : <LogIn aria-hidden size={18} />}
              {mode === 'signup' ? 'Daftar' : 'Masuk'}
            </button>
            <button
              className="button ghost"
              onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
              type="button"
            >
              {mode === 'signup' ? 'Sudah punya akun' : 'Buat akun baru'}
            </button>
          </div>
        </form>

        {message ? <div className="alert error">{message}</div> : null}
      </section>

      <aside className="panel soft">
        <h2>Catatan akses admin</h2>
        <p className="muted">
          User baru otomatis menjadi `USER`. Untuk mencoba dashboard admin sebelum Midtrans aktif,
          ubah role user menjadi `ADMIN`, `status_langganan` menjadi `ACTIVE`, dan tanggal
          kadaluwarsa ke masa depan dari Supabase Table Editor.
        </p>
      </aside>
    </div>
  );
}
