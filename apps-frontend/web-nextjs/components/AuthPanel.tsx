'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LogIn, LogOut, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { ensureProfile } from '@/lib/profile';
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
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [nama, setNama] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const refreshProfile = useCallback(async () => {
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();

    setSession(currentSession);

    if (!currentSession?.user) {
      setProfile(null);
      return;
    }

    const nextProfile = await ensureProfile(currentSession.user, nama);
    setProfile(nextProfile);
  }, [nama]);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();

        if (!mounted) {
          return;
        }

        setSession(currentSession);

        if (currentSession?.user) {
          const nextProfile = await ensureProfile(currentSession.user);
          if (mounted) {
            setProfile(nextProfile);
          }
        }
      } catch (error) {
        if (mounted) {
          setMessage(error instanceof Error ? error.message : 'Gagal membaca sesi Supabase.');
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
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
      }
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
      } else {
        setMessage('Cek email untuk konfirmasi akun Supabase Auth.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Autentikasi gagal.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    setLoading(true);
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setLoading(false);
  }

  if (session && profile) {
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
