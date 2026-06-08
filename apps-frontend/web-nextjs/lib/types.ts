export type UserProfile = {
  id: string;
  auth_user_id: string;
  nama: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'SUPERADMIN';
  status_langganan: 'ACTIVE' | 'INACTIVE';
  tgl_kadaluwarsa_langganan: string | null;
  nama_toko: string | null;
  alamat_toko: string | null;
  outlet_latitude: number | null;
  outlet_longitude: number | null;
  flyer_title: string | null;
  flyer_body: string | null;
  flyer_accent: string | null;
  flyer_discount_label: string | null;
};

export type LaundryOrderDetail = {
  paket?: string;
  alamat?: string;
  estimasi_pakaian?: number;
  catatan?: string;
  pickup_time?: string;
  customer_latitude?: number;
  customer_longitude?: number;
  outlet_name?: string;
  outlet_address?: string;
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

export type ChatMessage = {
  id: string;
  order_id: string;
  sender_user_id: string;
  receiver_user_id: string | null;
  message: string | null;
  attachment_url: string | null;
  attachment_path: string | null;
  attachment_mime_type: string | null;
  created_at: string;
};

export type ExpenseCategory =
  | 'SABUN'
  | 'PARFUM'
  | 'LISTRIK'
  | 'GAJI'
  | 'SEWA'
  | 'MAINTENANCE'
  | 'LAINNYA';

export type Expense = {
  id: string;
  admin_id: string;
  kategori: ExpenseCategory;
  nominal: number;
  keterangan: string | null;
  created_at: string;
  updated_at: string;
};

export type MonthlyBalance = {
  id: string;
  admin_id: string;
  bulan_tahun: string;
  total_pendapatan_kotor: number;
  total_pengeluaran: number;
  pendapatan_bersih: number;
  updated_at: string;
};
