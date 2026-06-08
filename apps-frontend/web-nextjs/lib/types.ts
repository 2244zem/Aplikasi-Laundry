export type UserProfile = {
  id: string;
  auth_user_id: string;
  nama: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'SUPERADMIN';
  status_langganan: 'ACTIVE' | 'INACTIVE';
  tgl_kadaluwarsa_langganan: string | null;
};

export type LaundryOrderDetail = {
  paket?: string;
  alamat?: string;
  estimasi_pakaian?: number;
  catatan?: string;
  pickup_time?: string;
};

export type LaundryOrder = {
  id: string;
  user_id: string;
  admin_outlet_id: string | null;
  format_detail: LaundryOrderDetail;
  berat_kg: number;
  total_harga: number;
  status_order:
    | 'PENDING_CONFIRMATION'
    | 'DITERIMA'
    | 'DICUCI'
    | 'DISETRIKA'
    | 'SELESAI'
    | 'DIBATALKAN';
  status_pembayaran: 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  midtrans_order_id: string | null;
  created_at: string;
  updated_at: string;
};
