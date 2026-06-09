import type { UserProfile } from '@/lib/types';

export function isSubscriptionActive(profile: UserProfile) {
  if (profile.role === 'SUPERADMIN') {
    return true;
  }

  if (profile.role !== 'ADMIN' || profile.status_langganan !== 'ACTIVE') {
    return false;
  }

  if (!profile.tgl_kadaluwarsa_langganan) {
    return true;
  }

  return new Date(profile.tgl_kadaluwarsa_langganan).getTime() > Date.now();
}

export function isOutletOperator(profile: UserProfile) {
  return isSubscriptionActive(profile) || Boolean(profile.staff_outlet_id && profile.staff_role);
}

export function operatorOutletId(profile: UserProfile) {
  return profile.staff_outlet_id || profile.id;
}

export function canManageFinance(profile: UserProfile) {
  return profile.role === 'SUPERADMIN' || (isSubscriptionActive(profile) && !profile.staff_role) || profile.staff_role === 'OWNER';
}

export function canManageInventory(profile: UserProfile) {
  return profile.role === 'SUPERADMIN' || (isOutletOperator(profile) && profile.staff_role !== 'TUKANG_CUCI');
}

export function canOperateOrders(profile: UserProfile) {
  return profile.role === 'SUPERADMIN' || isOutletOperator(profile);
}

export function canEditOrderCommercials(profile: UserProfile) {
  return profile.role === 'SUPERADMIN' || !profile.staff_role || profile.staff_role === 'OWNER' || profile.staff_role === 'KASIR';
}
