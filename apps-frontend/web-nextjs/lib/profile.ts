import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import type { UserProfile } from '@/lib/types';

export async function fetchProfileByAuthUserId(authUserId: string) {
  const { data, error } = await supabase
    .from('tabel_user')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as UserProfile | null;
}

export async function ensureProfile(user: User, fallbackName?: string) {
  const existing = await fetchProfileByAuthUserId(user.id);

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from('tabel_user')
    .insert({
      auth_user_id: user.id,
      nama: fallbackName || user.email?.split('@')[0] || 'Ungu Laundry User',
      email: user.email,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as UserProfile;
}
