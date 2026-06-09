import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

type ValidatedAuthSession = {
  errorMessage?: string;
  session: Session | null;
  user: User | null;
};

function looksLikeJwt(token: string) {
  return token.split('.').length === 3;
}

async function clearInvalidLocalSession() {
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
}

export async function getValidatedAuthSession(): Promise<ValidatedAuthSession> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return {
      session: null,
      user: null,
    };
  }

  if (!session.access_token || !looksLikeJwt(session.access_token)) {
    await clearInvalidLocalSession();
    return {
      errorMessage: 'Sesi login tidak valid. Login ulang sebelum melanjutkan.',
      session: null,
      user: null,
    };
  }

  const userResult = await supabase.auth.getUser(session.access_token);

  if (!userResult.error && userResult.data.user) {
    return {
      session,
      user: userResult.data.user,
    };
  }

  const refreshResult = await supabase.auth.refreshSession();
  const refreshedSession = refreshResult.data.session;

  if (refreshResult.error || !refreshedSession?.access_token || !looksLikeJwt(refreshedSession.access_token)) {
    await clearInvalidLocalSession();
    return {
      errorMessage: 'Session Supabase sudah kedaluwarsa. Login ulang lalu coba lagi.',
      session: null,
      user: null,
    };
  }

  const refreshedUserResult = await supabase.auth.getUser(refreshedSession.access_token);

  if (refreshedUserResult.error || !refreshedUserResult.data.user) {
    await clearInvalidLocalSession();
    return {
      errorMessage: 'Session Supabase tidak bisa diverifikasi. Login ulang lalu coba lagi.',
      session: null,
      user: null,
    };
  }

  return {
    session: refreshedSession,
    user: refreshedUserResult.data.user,
  };
}
