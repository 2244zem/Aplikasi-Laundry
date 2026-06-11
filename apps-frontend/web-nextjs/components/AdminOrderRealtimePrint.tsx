'use client';

import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { AdminServicePricingPanel } from '@/components/AdminServicePricingPanel';
import { InteractiveChatLaundry } from '@/components/InteractiveChatLaundry';
import { ListSkeleton } from '@/components/Skeleton';
import { canEditOrderCommercials, canOperateOrders, operatorOutletId } from '@/lib/access';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/currency';
import { isOrderPriceFinal, paymentStatusClass, paymentStatusLabel } from '@/lib/paymentStatus';
import { supabase } from '@/lib/supabaseClient';
import type { LaundryOrder, UserProfile } from '@/lib/types';

const statusOptions: LaundryOrder['status_order'][] = [
  'PENDING_CONFIRMATION',
  'DITERIMA',
  'DICUCI',
  'DISETRIKA',
  'SELESAI',
  'DIBATALKAN',
];

type Props = {
  profile: UserProfile;
};

type AdminPaymentFilter = 'ALL' | 'WAITING_CONFIRMATION' | 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED';

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function buildReceiptHtml(order: LaundryOrder) {
  const detail = order.format_detail ?? {};
  const customerEstimate = Number(detail.estimasi_harga || 0);
  const finalTotal = isOrderPriceFinal(order) ? Number(order.total_harga || 0) : 0;
  const outletName = detail.outlet_name || 'UNGU LAUNDRY';
  const outletAddress = detail.outlet_address || '-';

  return `
    <html>
      <head>
        <title>Ungu Laundry Nota ${escapeHtml(order.id.slice(0, 8))}</title>
        <style>
          body {
            width: 58mm;
            margin: 0;
            padding: 8px;
            font-family: "Courier New", monospace;
            font-size: 12px;
            color: #111827;
          }

          h1 {
            margin: 0 0 8px;
            font-size: 16px;
            text-align: center;
          }

          h2 {
            margin: 8px 0 4px;
            font-size: 12px;
            text-align: center;
          }

          p {
            margin: 4px 0;
          }

          ol {
            margin: 4px 0 0;
            padding-left: 14px;
          }

          li {
            margin: 3px 0;
          }

          .line {
            border-top: 1px dashed #111827;
            margin: 8px 0;
          }

          .center {
            text-align: center;
          }

          .small {
            font-size: 10px;
            line-height: 1.35;
          }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(outletName).toUpperCase()}</h1>
        <p class="center small">${escapeHtml(outletAddress)}</p>
        <div class="line"></div>
        <p>ID: ${escapeHtml(order.id.slice(0, 8))}</p>
        <p>Tanggal: ${escapeHtml(new Date(order.created_at).toLocaleString('id-ID'))}</p>
        <p>Paket: ${escapeHtml(detail.paket ?? '-')}</p>
        <p>Estimasi: ${escapeHtml(detail.estimasi_pakaian ?? '-')} ${escapeHtml(detail.satuan ?? 'pcs')}</p>
        <p>Berat final: ${escapeHtml(order.berat_kg || '-')} kg</p>
        <p>Alamat: ${escapeHtml(detail.alamat ?? '-')}</p>
        <p>Pickup: ${escapeHtml(detail.pickup_time ?? '-')}</p>
        <p>Catatan: ${escapeHtml(detail.catatan ?? '-')}</p>
        <div class="line"></div>
        <p>Status: ${escapeHtml(order.status_order)}</p>
        <p>Pembayaran: ${escapeHtml(order.status_pembayaran)}</p>
        <p>Estimasi customer: ${escapeHtml(customerEstimate >= 1000 ? formatCurrency(customerEstimate) : '-')}</p>
        <p>Total final: ${escapeHtml(finalTotal >= 1000 ? formatCurrency(finalTotal) : 'MENUNGGU KONFIRMASI')}</p>
        <div class="line"></div>
        <h2>KETENTUAN</h2>
        <ol class="small">
          <li>Komplain diterima maksimal 1x24 jam setelah pakaian diterima.</li>
          <li>Barang mudah luntur, susut, atau rusak karena kondisi bahan bukan tanggung jawab outlet.</li>
          <li>Jumlah pakaian mengikuti data timbang dan catatan outlet.</li>
          <li>Simpan nota ini sebagai bukti transaksi.</li>
        </ol>
        <div class="line"></div>
        <p class="center">*** TERIMA KASIH ***</p>
        <script>
          window.onload = function () {
            window.print();
            window.setTimeout(function () { window.close(); }, 250);
          };
        </script>
      </body>
    </html>
  `;
}

function printOrder(order: LaundryOrder) {
  const printWindow = window.open('', '_blank', 'width=360,height=640');

  if (!printWindow) {
    return false;
  }

  printWindow.document.open();
  printWindow.document.write(buildReceiptHtml(order));
  printWindow.document.close();
  return true;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    currency: 'IDR',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value || 0);
}

function statusClass(order: LaundryOrder) {
  if (order.status_order === 'SELESAI') {
    return 'status done';
  }

  if (order.status_order === 'DIBATALKAN') {
    return 'status failed';
  }

  return 'status pending';
}

function orderStatusLabel(status: LaundryOrder['status_order']) {
  return status === 'PENDING_CONFIRMATION' ? 'PENDING' : status;
}

function matchesPaymentFilter(order: LaundryOrder, filter: AdminPaymentFilter) {
  if (filter === 'ALL') {
    return true;
  }

  if (filter === 'WAITING_CONFIRMATION') {
    return order.status_order === 'PENDING_CONFIRMATION';
  }

  if (filter === 'UNPAID') {
    return order.status_order !== 'PENDING_CONFIRMATION' && order.status_pembayaran === 'UNPAID';
  }

  return order.status_pembayaran === filter;
}

function adminPaymentFilterLabel(filter: AdminPaymentFilter) {
  if (filter === 'ALL') {
    return 'Semua';
  }

  if (filter === 'WAITING_CONFIRMATION') {
    return 'Menunggu konfirmasi';
  }

  if (filter === 'UNPAID') {
    return 'UNPAID';
  }

  return filter;
}

type OrderRowProps = {
  order: LaundryOrder;
  profile: UserProfile;
  onChange: (order: LaundryOrder) => void;
  onOpenChat: (order: LaundryOrder) => void;
};

function OrderCard({ order, profile, onChange, onOpenChat }: OrderRowProps) {
  const [beratKg, setBeratKg] = useState(Number(order.berat_kg ?? 0));
  const [totalHarga, setTotalHarga] = useState(Number(order.total_harga ?? 0));
  const [statusOrder, setStatusOrder] = useState<LaundryOrder['status_order']>(order.status_order);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const detail = order.format_detail ?? {};
  const outletId = operatorOutletId(profile);
  const canEdit = order.admin_outlet_id === outletId || profile.role === 'SUPERADMIN';
  const canEditCommercials = canEdit && canEditOrderCommercials(profile);
  const statusIndex = Math.max(0, statusOptions.indexOf(order.status_order));
  const customerEstimate = Number(detail.estimasi_harga || 0);
  const isFinalStatus = statusOrder !== 'PENDING_CONFIRMATION' && statusOrder !== 'DIBATALKAN';
  const hasValidFinalPrice = Number(totalHarga || 0) >= 1000;

  useEffect(() => {
    setBeratKg(Number(order.berat_kg ?? 0));
    setTotalHarga(Number(order.total_harga ?? 0));
    setStatusOrder(order.status_order);
  }, [order.berat_kg, order.id, order.status_order, order.total_harga]);

  async function saveOrder() {
    if (isFinalStatus && !hasValidFinalPrice) {
      setMessage('Isi harga final minimal Rp 1.000 sebelum menerima atau memproses order.');
      return;
    }

    setSaving(true);
    setMessage('');

    const { data, error } = await supabase
      .from('tabel_order')
      .update({
        berat_kg: beratKg,
        total_harga: totalHarga,
        status_order: statusOrder,
      })
      .eq('id', order.id)
      .select('*')
      .single();

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    onChange(data as LaundryOrder);
    setMessage('Order diperbarui.');
  }

  return (
    <article className="order-ticket">
      <div className="ticket-head">
        <div>
          <span className="ticket-id">#{order.id.slice(0, 8)}</span>
          <h3>{detail.paket ?? 'Laundry order'}</h3>
          <p className="muted">{new Date(order.created_at).toLocaleString('id-ID')}</p>
        </div>
        <div className="ticket-status-stack">
          <span className={statusClass(order)}>{orderStatusLabel(order.status_order)}</span>
          <span className={paymentStatusClass(order.status_pembayaran)}>
            {paymentStatusLabel(order.status_pembayaran)}
          </span>
        </div>
      </div>

      <div className="ticket-body">
        <div className="ticket-info">
          <span>
            <i className="fi fi-rr-shirt-long-sleeve" aria-hidden />
            {detail.estimasi_pakaian ?? '-'} {detail.satuan || 'pcs'}
          </span>
          <span>
            <i className="fi fi-rr-map-marker-home" aria-hidden />
            {detail.alamat ?? '-'}
          </span>
          <span>
            <i className="fi fi-rr-clock-three" aria-hidden />
            {detail.pickup_time || 'Pickup fleksibel'}
          </span>
          <span>
            <i className="fi fi-rr-wallet" aria-hidden />
            Estimasi customer: {customerEstimate >= 1000 ? formatCurrency(customerEstimate) : '-'}
          </span>
        </div>

        <div className="status-rail" aria-label="Progress order">
          {statusOptions.slice(0, 5).map((status, index) => (
            <span className={index <= statusIndex ? 'active' : ''} key={status}>
              {orderStatusLabel(status)}
            </span>
          ))}
        </div>

        <div className="ticket-edit">
          <label>
            <span>Berat final</span>
            <input
              className="input"
              disabled={!canEditCommercials}
              min={0}
              onChange={(event) => setBeratKg(Number(event.target.value))}
              step="0.1"
              title="Berat kg"
              type="number"
              value={beratKg}
            />
          </label>
          <label>
            <span>Harga final admin</span>
            <input
              className="input"
              disabled={!canEditCommercials}
              inputMode="numeric"
              onChange={(event) => setTotalHarga(parseCurrencyInput(event.target.value))}
              placeholder="100.000"
              title="Total harga"
              type="text"
              value={formatCurrencyInput(totalHarga)}
            />
          </label>
          <strong>{hasValidFinalPrice ? formatCurrency(totalHarga) : 'Harga belum final'}</strong>
        </div>
        {!hasValidFinalPrice ? (
          <div className="alert info ticket-price-alert">
            Isi harga final minimal Rp 1.000 sebelum customer bisa membayar Midtrans.
          </div>
        ) : null}
      </div>

      <div className="ticket-actions">
        <div className="ticket-status-control">
          <div className="choice-grid status-choice-grid" role="listbox" aria-label="Ubah status order">
            {statusOptions.map((status) => (
              <button
                aria-selected={statusOrder === status}
                className={`choice-pill ${statusOrder === status ? 'active' : ''}`}
                disabled={!canEdit}
                key={status}
                onClick={() => setStatusOrder(status)}
                type="button"
              >
                {orderStatusLabel(status)}
              </button>
            ))}
          </div>
        </div>
        <div className="actions">
          <button className="button primary" disabled={!canEdit || saving} onClick={saveOrder} type="button">
            <i className="fi fi-rr-disk" aria-hidden />
            Simpan
          </button>
          <button className="button secondary" onClick={() => printOrder(order)} type="button">
            <i className="fi fi-rr-print" aria-hidden />
            Print
          </button>
          <button className="button secondary" onClick={() => onOpenChat(order)} type="button">
            <i className="fi fi-rr-comment-alt" aria-hidden />
            Chat
          </button>
        </div>
      </div>
      {message ? <small className="ticket-message">{message}</small> : null}
    </article>
  );
}

function AdminOutletStudio({ profile }: Props) {
  const [namaToko, setNamaToko] = useState(profile.nama_toko || `Laundry ${profile.nama}`);
  const [alamatToko, setAlamatToko] = useState(profile.alamat_toko || '');
  const [latitude, setLatitude] = useState(profile.outlet_latitude?.toString() || '');
  const [longitude, setLongitude] = useState(profile.outlet_longitude?.toString() || '');
  const [flyerTitle, setFlyerTitle] = useState(profile.flyer_title || 'Cuci cepat, wangi tahan lama');
  const [flyerBody, setFlyerBody] = useState(
    profile.flyer_body || 'Promo member aktif: pickup prioritas, nota otomatis, dan chat bukti kondisi pakaian.',
  );
  const [flyerAccent, setFlyerAccent] = useState(profile.flyer_accent || '#95DFD3');
  const [flyerDiscount, setFlyerDiscount] = useState(profile.flyer_discount_label || 'Diskon 20%');
  const [outletIsOpen, setOutletIsOpen] = useState(profile.outlet_is_open ?? true);
  const [pickupEta, setPickupEta] = useState(profile.outlet_pickup_eta_minutes?.toString() || '30');
  const [outletRating, setOutletRating] = useState(profile.outlet_rating?.toString() || '4.8');
  const [outletRadius, setOutletRadius] = useState(profile.outlet_radius_km?.toString() || '8');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  function useCurrentLocation() {
    setMessage('');

    if (!navigator.geolocation) {
      setMessage('Browser belum mendukung lokasi.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(7));
        setLongitude(position.coords.longitude.toFixed(7));
        setMessage('Lokasi outlet diambil dari posisi device ini.');
      },
      () => setMessage('Izin lokasi ditolak. Isi latitude/longitude manual.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function saveOutletProfile() {
    setSaving(true);
    setMessage('');

    const { error } = await supabase
      .from('tabel_user')
      .update({
        nama_toko: namaToko,
        alamat_toko: alamatToko,
        outlet_latitude: latitude ? Number(latitude) : null,
        outlet_longitude: longitude ? Number(longitude) : null,
        flyer_title: flyerTitle,
        flyer_body: flyerBody,
        flyer_accent: flyerAccent,
        flyer_discount_label: flyerDiscount,
        outlet_is_open: outletIsOpen,
        outlet_pickup_eta_minutes: Number(pickupEta || 30),
        outlet_rating: Number(outletRating || 4.8),
        outlet_radius_km: Number(outletRadius || 8),
      })
      .eq('id', profile.id);

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Profil outlet dan flyer disimpan.');
  }

  return (
    <section className="admin-studio">
      <div className="membership-card">
        <span className="ad-pill">Membership {profile.status_langganan}</span>
        <h2>{namaToko}</h2>
        <p>{alamatToko || 'Isi alamat outlet supaya customer lebih percaya dan lokasi bisa dihitung.'}</p>
        <div className="membership-meta">
          <span>
            <i className="fi fi-rr-store-alt" aria-hidden />
            {outletIsOpen ? 'Buka' : 'Tutup'}
          </span>
          <span>
            <i className="fi fi-rr-clock-three" aria-hidden />
            ETA {pickupEta} menit
          </span>
          <span>
            <i className="fi fi-rr-crown" aria-hidden />
            {profile.role}
          </span>
          <span>
            <i className="fi fi-rr-calendar-clock" aria-hidden />
            {profile.tgl_kadaluwarsa_langganan
              ? new Date(profile.tgl_kadaluwarsa_langganan).toLocaleDateString('id-ID')
              : 'Tanpa kadaluwarsa'}
          </span>
        </div>
      </div>

      <div className="flyer-editor app-card">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Flyer outlet</p>
            <h2>Design iklan toko</h2>
          </div>
          <button className="button secondary" onClick={saveOutletProfile} type="button" disabled={saving}>
            <i className="fi fi-rr-disk" aria-hidden />
            {saving ? 'Menyimpan' : 'Simpan'}
          </button>
        </div>

        <div className="flyer-grid">
          <div className="form-grid">
            <label className="field">
              <span>Nama toko</span>
              <input className="input" onChange={(event) => setNamaToko(event.target.value)} value={namaToko} />
            </label>
            <label className="field">
              <span>Alamat toko</span>
              <textarea className="textarea compact" onChange={(event) => setAlamatToko(event.target.value)} value={alamatToko} />
            </label>
            <div className="grid two equal">
              <label className="field">
                <span>Latitude</span>
                <input className="input" onChange={(event) => setLatitude(event.target.value)} value={latitude} />
              </label>
              <label className="field">
                <span>Longitude</span>
                <input className="input" onChange={(event) => setLongitude(event.target.value)} value={longitude} />
              </label>
            </div>
            <button className="button secondary" onClick={useCurrentLocation} type="button">
              <i className="fi fi-rr-location-crosshairs" aria-hidden />
              Pakai lokasi device
            </button>
            <label className="switch-field">
              <input checked={outletIsOpen} onChange={(event) => setOutletIsOpen(event.target.checked)} type="checkbox" />
              <span>Outlet sedang buka</span>
            </label>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Judul flyer</span>
              <input className="input" onChange={(event) => setFlyerTitle(event.target.value)} value={flyerTitle} />
            </label>
            <label className="field">
              <span>Isi promo</span>
              <textarea className="textarea compact" onChange={(event) => setFlyerBody(event.target.value)} value={flyerBody} />
            </label>
            <div className="grid two equal">
              <label className="field">
                <span>Label promo</span>
                <input className="input" onChange={(event) => setFlyerDiscount(event.target.value)} value={flyerDiscount} />
              </label>
              <label className="field">
                <span>Warna</span>
                <input className="input color-input" onChange={(event) => setFlyerAccent(event.target.value)} type="color" value={flyerAccent} />
              </label>
            </div>
            <div className="grid three compact-grid">
              <label className="field">
                <span>ETA pickup</span>
                <input className="input" min={5} onChange={(event) => setPickupEta(event.target.value)} type="number" value={pickupEta} />
              </label>
              <label className="field">
                <span>Rating</span>
                <input className="input" max={5} min={0} onChange={(event) => setOutletRating(event.target.value)} step="0.1" type="number" value={outletRating} />
              </label>
              <label className="field">
                <span>Radius km</span>
                <input className="input" min={1} onChange={(event) => setOutletRadius(event.target.value)} step="0.5" type="number" value={outletRadius} />
              </label>
            </div>
          </div>
        </div>

        <div className="ad-card mini" style={{ '--ad-accent': flyerAccent } as CSSProperties}>
          <span className="ad-pill">{flyerDiscount}</span>
          <h3>{flyerTitle}</h3>
          <p>{flyerBody}</p>
        </div>
        {message ? <div className={`alert ${message.includes('disimpan') ? 'success' : 'error'}`}>{message}</div> : null}
      </div>
    </section>
  );
}

export function AdminOrderRealtimePrint({ profile }: Props) {
  const [lastOrder, setLastOrder] = useState<LaundryOrder | null>(null);
  const [printerStatus, setPrinterStatus] = useState('Siap menerima order realtime.');
  const [orders, setOrders] = useState<LaundryOrder[]>([]);
  const [paymentFilter, setPaymentFilter] = useState<AdminPaymentFilter>('ALL');
  const [selectedChatOrder, setSelectedChatOrder] = useState<LaundryOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const isActiveAdmin = canOperateOrders(profile);
  const outletId = operatorOutletId(profile);
  const visibleOrders = orders.filter((order) => matchesPaymentFilter(order, paymentFilter));
  const waitingConfirmationCount = orders.filter((order) => order.status_order === 'PENDING_CONFIRMATION').length;
  const unpaidCount = orders.filter((order) => order.status_order !== 'PENDING_CONFIRMATION' && order.status_pembayaran !== 'PAID').length;

  async function loadOrders() {
    setLoading(true);
    setErrorMessage('');

    let request = supabase
      .from('tabel_order')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (profile.role !== 'SUPERADMIN') {
      request = request.eq('admin_outlet_id', outletId);
    }

    const { data, error } = await request;

    setLoading(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setOrders((data ?? []) as LaundryOrder[]);
  }

  function canSeeOrder(nextOrder: LaundryOrder) {
    return (
      profile.role === 'SUPERADMIN' ||
      nextOrder.admin_outlet_id === outletId
    );
  }

  function syncOrder(nextOrder: LaundryOrder) {
    setOrders((currentOrders) => {
      if (!canSeeOrder(nextOrder)) {
        return currentOrders.filter((order) => order.id !== nextOrder.id);
      }

      const exists = currentOrders.some((order) => order.id === nextOrder.id);
      const nextOrders = exists
        ? currentOrders.map((order) => (order.id === nextOrder.id ? nextOrder : order))
        : [nextOrder, ...currentOrders];

      return nextOrders.slice(0, 30);
    });
  }

  useEffect(() => {
    if (!isActiveAdmin) {
      setLoading(false);
      return;
    }

    void loadOrders();
  }, [isActiveAdmin, outletId, profile.id, profile.role]);

  useEffect(() => {
    if (!isActiveAdmin) {
      return;
    }

    const channel = supabase
      .channel('scale-wash:orders')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tabel_order',
        },
        (payload) => {
          const order = payload.new as LaundryOrder;
          if (!canSeeOrder(order)) {
            return;
          }

          setLastOrder(order);
          syncOrder(order);

          if (printOrder(order)) {
            setPrinterStatus(`Nota ${order.id.slice(0, 8)} dikirim ke printer.`);
          } else {
            setPrinterStatus('Popup print diblokir browser. Gunakan tombol cetak ulang.');
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tabel_order',
        },
        (payload) => {
          syncOrder(payload.new as LaundryOrder);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isActiveAdmin, outletId, profile.id, profile.role]);

  if (!isActiveAdmin) {
    return (
      <section className="panel">
        <p className="eyebrow">Akses admin</p>
        <h1>Langganan admin belum aktif</h1>
        <p className="muted">
          Akun ini masih {profile.role} dengan status langganan {profile.status_langganan}.
        </p>
      </section>
    );
  }

  return (
    <div className="grid admin-dashboard">
      {!profile.staff_role ? (
        <>
          <AdminOutletStudio profile={profile} />
          <AdminServicePricingPanel profile={profile} />
        </>
      ) : (
        <section className="panel soft">
          <p className="eyebrow">Mode staff</p>
          <h1>{profile.staff_role}</h1>
          <p className="muted">Akses kamu dibatasi untuk operasional outlet sesuai role dari owner.</p>
        </section>
      )}

      <section className="ops-hero">
        <div className="page-header">
          <div>
            <p className="eyebrow">Dashboard outlet</p>
            <h1>Order realtime & POS print</h1>
            <p>{printerStatus}</p>
          </div>
          <div className="actions">
            <button className="button secondary" disabled={loading} onClick={loadOrders} type="button">
              <i className="fi fi-rr-refresh" aria-hidden />
              Refresh
            </button>
            {lastOrder ? (
              <button className="button primary" onClick={() => printOrder(lastOrder)} type="button">
                <i className="fi fi-rr-print" aria-hidden />
                Cetak Ulang
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="app-card" id="orders">
        <div className="page-header">
          <div>
            <p className="eyebrow">Antrian order</p>
            <h2>Pesanan masuk ke outlet kamu</h2>
          </div>
          <div className="admin-order-tools">
            <span className="status pending">{waitingConfirmationCount} menunggu konfirmasi</span>
            <span className="status pending">{unpaidCount} belum lunas</span>
            <span className="status active">{orders.length} order</span>
          </div>
        </div>

        <div className="segmented-control payment-filter-control" role="tablist" aria-label="Filter status pembayaran">
          {(['ALL', 'WAITING_CONFIRMATION', 'UNPAID', 'PENDING', 'PAID', 'FAILED'] as AdminPaymentFilter[]).map((filter) => (
            <button
              aria-selected={paymentFilter === filter}
              className={paymentFilter === filter ? 'active' : ''}
              key={filter}
              onClick={() => setPaymentFilter(filter)}
              type="button"
            >
              {adminPaymentFilterLabel(filter)}
            </button>
          ))}
        </div>

        {errorMessage ? <div className="alert error">{errorMessage}</div> : null}

        <div className="order-board">
          {loading && orders.length === 0 ? <ListSkeleton count={3} /> : null}
          {visibleOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              profile={profile}
              onChange={syncOrder}
              onOpenChat={setSelectedChatOrder}
            />
          ))}
          {!loading && visibleOrders.length === 0 ? (
            <div className="empty-state">
              <i className="fi fi-rr-ballot" aria-hidden />
              <strong>{orders.length === 0 ? 'Belum ada pesanan' : 'Tidak ada order di filter ini'}</strong>
              <span>{orders.length === 0 ? 'Order akan muncul ketika customer memilih outlet ini.' : 'Ganti filter untuk melihat status pembayaran lain.'}</span>
            </div>
          ) : null}
        </div>
      </section>

      {selectedChatOrder ? (
        <InteractiveChatLaundry orderId={selectedChatOrder.id} profile={profile} />
      ) : null}
    </div>
  );
}
