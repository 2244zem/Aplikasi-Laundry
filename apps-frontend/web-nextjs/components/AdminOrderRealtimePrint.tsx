'use client';

import { useEffect, useState } from 'react';
import { Check, Printer, RefreshCw, Save } from 'lucide-react';
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

  return `
    <html>
      <head>
        <title>ScaleWash Nota ${escapeHtml(order.id.slice(0, 8))}</title>
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

          p {
            margin: 4px 0;
          }

          .line {
            border-top: 1px dashed #111827;
            margin: 8px 0;
          }
        </style>
      </head>
      <body>
        <h1>SCALEWASH NOTA</h1>
        <p>ID: ${escapeHtml(order.id.slice(0, 8))}</p>
        <p>User: ${escapeHtml(order.user_id)}</p>
        <p>Paket: ${escapeHtml(detail.paket ?? '-')}</p>
        <p>Estimasi: ${escapeHtml(detail.estimasi_pakaian ?? '-')} pcs</p>
        <p>Alamat: ${escapeHtml(detail.alamat ?? '-')}</p>
        <p>Pickup: ${escapeHtml(detail.pickup_time ?? '-')}</p>
        <p>Catatan: ${escapeHtml(detail.catatan ?? '-')}</p>
        <div class="line"></div>
        <p>Status: ${escapeHtml(order.status_order)}</p>
        <p>Input berat dan harga final di dashboard.</p>
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

type OrderRowProps = {
  order: LaundryOrder;
  profile: UserProfile;
  onChange: (order: LaundryOrder) => void;
};

function OrderRow({ order, profile, onChange }: OrderRowProps) {
  const [beratKg, setBeratKg] = useState(Number(order.berat_kg ?? 0));
  const [totalHarga, setTotalHarga] = useState(Number(order.total_harga ?? 0));
  const [statusOrder, setStatusOrder] = useState<LaundryOrder['status_order']>(order.status_order);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const detail = order.format_detail ?? {};
  const canClaim = !order.admin_outlet_id;
  const canEdit = order.admin_outlet_id === profile.id || profile.role === 'SUPERADMIN';

  async function claimOrder() {
    setSaving(true);
    setMessage('');

    const { data, error } = await supabase
      .from('tabel_order')
      .update({
        admin_outlet_id: profile.id,
        status_order: 'DITERIMA',
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
    setStatusOrder('DITERIMA');
    setMessage('Order diambil outlet.');
  }

  async function saveOrder() {
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
    <tr>
      <td>
        <strong>{order.id.slice(0, 8)}</strong>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          {new Date(order.created_at).toLocaleString('id-ID')}
        </p>
      </td>
      <td>
        <strong>{detail.paket ?? '-'}</strong>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          {detail.estimasi_pakaian ?? '-'} pcs · {detail.alamat ?? '-'}
        </p>
      </td>
      <td>
        <span className={statusClass(order)}>{order.status_order}</span>
        <p className="muted" style={{ margin: '8px 0 0' }}>
          {order.status_pembayaran}
        </p>
      </td>
      <td>
        <div className="form-grid" style={{ gap: 8 }}>
          <input
            className="input"
            disabled={!canEdit}
            min={0}
            onChange={(event) => setBeratKg(Number(event.target.value))}
            step="0.1"
            title="Berat kg"
            type="number"
            value={beratKg}
          />
          <input
            className="input"
            disabled={!canEdit}
            min={0}
            onChange={(event) => setTotalHarga(Number(event.target.value))}
            step="500"
            title="Total harga"
            type="number"
            value={totalHarga}
          />
          <span className="muted">{formatCurrency(totalHarga)}</span>
        </div>
      </td>
      <td>
        <div className="form-grid" style={{ gap: 8 }}>
          <select
            className="select"
            disabled={!canEdit}
            onChange={(event) => setStatusOrder(event.target.value as LaundryOrder['status_order'])}
            value={statusOrder}
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <div className="actions">
            {canClaim ? (
              <button className="button secondary" disabled={saving} onClick={claimOrder} type="button">
                <Check aria-hidden size={16} />
                Claim
              </button>
            ) : null}
            <button className="button primary" disabled={!canEdit || saving} onClick={saveOrder} type="button">
              <Save aria-hidden size={16} />
              Simpan
            </button>
            <button className="button secondary" onClick={() => printOrder(order)} type="button">
              <Printer aria-hidden size={16} />
              Print
            </button>
          </div>
          {message ? <small className="muted">{message}</small> : null}
        </div>
      </td>
    </tr>
  );
}

export function AdminOrderRealtimePrint({ profile }: Props) {
  const [lastOrder, setLastOrder] = useState<LaundryOrder | null>(null);
  const [printerStatus, setPrinterStatus] = useState('Siap menerima order realtime.');
  const [orders, setOrders] = useState<LaundryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const isActiveAdmin =
    profile.role === 'SUPERADMIN' || (profile.role === 'ADMIN' && profile.status_langganan === 'ACTIVE');

  async function loadOrders() {
    setLoading(true);
    setErrorMessage('');

    let request = supabase
      .from('tabel_order')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (profile.role !== 'SUPERADMIN') {
      request = request.or(`admin_outlet_id.is.null,admin_outlet_id.eq.${profile.id}`);
    }

    const { data, error } = await request;

    setLoading(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setOrders((data ?? []) as LaundryOrder[]);
  }

  function upsertOrder(nextOrder: LaundryOrder) {
    setOrders((currentOrders) => {
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
  }, [isActiveAdmin, profile.id, profile.role]);

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
          setLastOrder(order);
          upsertOrder(order);

          if (printOrder(order)) {
            setPrinterStatus(`Nota ${order.id.slice(0, 8)} dikirim ke printer.`);
          } else {
            setPrinterStatus('Popup print diblokir browser. Gunakan tombol cetak ulang.');
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isActiveAdmin]);

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
    <div className="grid">
      <section className="panel soft">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <div>
            <p className="eyebrow">Dashboard outlet</p>
            <h1>Order realtime & POS print</h1>
            <p className="muted" style={{ marginBottom: 0 }}>
              {printerStatus}
            </p>
          </div>
          <div className="actions">
            <button className="button secondary" disabled={loading} onClick={loadOrders} type="button">
              <RefreshCw aria-hidden size={18} />
              Refresh
            </button>
            {lastOrder ? (
              <button className="button primary" onClick={() => printOrder(lastOrder)} type="button">
                <Printer aria-hidden size={18} />
                Cetak Ulang
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="page-header">
          <div>
            <p className="eyebrow">Antrian order</p>
            <h2>Pesanan masuk</h2>
          </div>
          <span className="status active">{orders.length} order</span>
        </div>

        {errorMessage ? <div className="alert error">{errorMessage}</div> : null}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nota</th>
                <th>Detail</th>
                <th>Status</th>
                <th>Berat & harga</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <OrderRow key={order.id} order={order} profile={profile} onChange={upsertOrder} />
              ))}
              {!loading && orders.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <p className="muted" style={{ margin: 0 }}>
                      Belum ada order dalam antrian outlet ini.
                    </p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
