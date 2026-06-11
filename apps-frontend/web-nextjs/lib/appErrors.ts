type ErrorLike = {
  code?: unknown;
  message?: unknown;
};

function rawErrorMessage(error: unknown) {
  if (!error) {
    return '';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object') {
    const message = (error as ErrorLike).message;

    if (typeof message === 'string') {
      return message;
    }
  }

  return '';
}

function rawErrorCode(error: unknown) {
  if (error && typeof error === 'object') {
    const code = (error as ErrorLike).code;

    if (typeof code === 'string') {
      return code;
    }
  }

  return '';
}

export function friendlyAppError(error: unknown, fallback = 'Terjadi kendala. Coba refresh lalu ulangi aksi ini.') {
  const message = rawErrorMessage(error).trim();
  const code = rawErrorCode(error);
  const normalized = `${code} ${message}`.toLowerCase();

  if (!message && !code) {
    return fallback;
  }

  if (
    normalized.includes('jwt')
    || normalized.includes('session')
    || normalized.includes('refresh token')
    || normalized.includes('invalid login credentials')
    || normalized.includes('auth session missing')
  ) {
    return 'Sesi login sudah tidak valid. Logout, login ulang, lalu coba lagi.';
  }

  if (
    normalized.includes('row-level security')
    || normalized.includes('permission denied')
    || normalized.includes('42501')
    || normalized.includes('not authorized')
    || normalized.includes('unauthorized')
    || normalized.includes('forbidden')
  ) {
    return 'Akses ditolak oleh aturan keamanan. Pastikan akun, role, dan outlet yang dipakai sudah benar.';
  }

  if (normalized.includes('failed to fetch') || normalized.includes('networkerror')) {
    return 'Koneksi ke server terputus. Cek internet/BFF lalu coba lagi.';
  }

  if (normalized.includes('duplicate key')) {
    return 'Data ini sudah ada. Refresh halaman untuk melihat versi terbaru.';
  }

  return message || fallback;
}
