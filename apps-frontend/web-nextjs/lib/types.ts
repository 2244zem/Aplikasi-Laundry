export type UserProfile = {
  id: string;
  auth_user_id: string;
  nama: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'SUPERADMIN';
  staff_role: 'OWNER' | 'KASIR' | 'TUKANG_CUCI' | null;
  staff_outlet_id: string | null;
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
  outlet_is_open: boolean;
  outlet_pickup_eta_minutes: number;
  outlet_rating: number;
  outlet_radius_km: number;
};

export type LaundryOrderDetail = {
  paket?: string;
  service_id?: string;
  satuan?: 'kg' | 'pcs' | 'item';
  harga_satuan?: number;
  estimasi_harga?: number;
  estimasi_menit?: number;
  alamat?: string;
  estimasi_pakaian?: number;
  catatan?: string;
  preferensi_parfum?: string;
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
  qr_token: string;
  qr_label_printed_at: string | null;
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
  read_by_admin_at: string | null;
  read_by_user_at: string | null;
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

export type InventoryItem = {
  id: string;
  admin_id: string;
  nama_barang: string;
  kategori: string;
  stok: number;
  satuan: string;
  stok_minimum: number;
  catatan: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryUsageRule = {
  id: string;
  admin_id: string;
  inventory_item_id: string;
  service_id: string | null;
  konsumsi_per_kg: number;
  konsumsi_per_order: number;
  aktif: boolean;
  created_at: string;
  updated_at: string;
};

export type InventoryMovement = {
  id: string;
  admin_id: string;
  inventory_item_id: string;
  order_id: string | null;
  movement_type: 'MANUAL' | 'AUTO_DEDUCTION' | 'ADJUSTMENT';
  qty_delta: number;
  stok_setelah: number | null;
  catatan: string | null;
  created_at: string;
};

export type ServicePricing = {
  id: string;
  admin_id: string;
  nama_layanan: string;
  deskripsi: string | null;
  satuan: 'kg' | 'pcs' | 'item';
  harga: number;
  estimasi_menit: number;
  aktif: boolean;
  urutan: number;
  created_at: string;
  updated_at: string;
};

export type OrderEvent = {
  id: string;
  order_id: string;
  actor_user_id: string | null;
  event_type: 'STATUS_CHANGED' | string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type CourierLocation = {
  id: string;
  order_id: string;
  courier_user_id: string | null;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed_kmh: number | null;
  updated_at: string;
};

export type CustomerRetentionQueue = {
  id: string;
  admin_id: string;
  user_id: string;
  last_order_at: string | null;
  suggested_message: string;
  status: 'PENDING' | 'SENT' | 'SKIPPED' | 'FAILED';
  sent_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
