'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { LaundryOrder, UserProfile } from '@/lib/types';

type Props = {
  profile: UserProfile;
};

type OutletProfile = Pick<
  UserProfile,
  | 'id'
  | 'nama'
  | 'email'
  | 'role'
  | 'status_langganan'
  | 'tgl_kadaluwarsa_langganan'
  | 'nama_toko'
  | 'alamat_toko'
  | 'outlet_latitude'
  | 'outlet_longitude'
  | 'flyer_title'
  | 'flyer_body'
  | 'flyer_accent'
  | 'flyer_discount_label'
>;

type UserLocation = {
  latitude: number;
  longitude: number;
};

const serviceOptions = [
  { icon: 'fi-rr-washer', label: 'Cuci Setrika', min: 'Mulai 12 pcs' },
  { icon: 'fi-rr-water', label: 'Cuci Kering', min: 'Reguler' },
  { icon: 'fi-rr-iron', label: 'Setrika Saja', min: 'Rapi lipat' },
  { icon: 'fi-rr-bolt', label: 'Express 6 Jam', min: 'Prioritas' },
];

const orderSteps: LaundryOrder['status_order'][] = ['PENDING_CONFIRMATION', 'DITERIMA', 'DICUCI', 'DISETRIKA', 'SELESAI'];

function isActiveOutlet(outlet: OutletProfile) {
  if (outlet.role === 'SUPERADMIN') {
    return true;
  }

  if (outlet.role !== 'ADMIN' || outlet.status_langganan !== 'ACTIVE') {
    return false;
  }

  if (!outlet.tgl_kadaluwarsa_langganan) {
    return true;
  }

  return new Date(outlet.tgl_kadaluwarsa_langganan).getTime() > Date.now();
}

function outletName(outlet: OutletProfile) {
  return outlet.nama_toko || `Laundry ${outlet.nama}`;
}

function distanceKm(from: UserLocation | null, outlet: OutletProfile) {
  if (!from || outlet.outlet_latitude == null || outlet.outlet_longitude == null) {
    return null;
  }

  const radiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(Number(outlet.outlet_latitude) - from.latitude);
  const deltaLng = toRadians(Number(outlet.outlet_longitude) - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(Number(outlet.outlet_latitude));
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function orderStatusLabel(status: LaundryOrder['status_order']) {
  return status === 'PENDING_CONFIRMATION' ? 'PENDING' : status;
}

function upsertOrderList(currentOrders: LaundryOrder[], nextOrder: LaundryOrder) {
  const exists = currentOrders.some((order) => order.id === nextOrder.id);
  const nextOrders = exists
    ? currentOrders.map((order) => (order.id === nextOrder.id ? nextOrder : order))
    : [nextOrder, ...currentOrders];

  return nextOrders.slice(0, 5);
}

export function CustomerOrderForm({ profile }: Props) {
  const [paket, setPaket] = useState('Cuci Setrika');
  const [estimasiPakaian, setEstimasiPakaian] = useState(12);
  const [alamat, setAlamat] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [catatan, setCatatan] = useState('');
  const [outlets, setOutlets] = useState<OutletProfile[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState('');
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [locationMessage, setLocationMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingOutlets, setLoadingOutlets] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [activeOrders, setActiveOrders] = useState<LaundryOrder[]>([]);
  const [message, setMessage] = useState('');
  const [createdOrderId, setCreatedOrderId] = useState('');

  const selectedOutlet = useMemo(
    () => outlets.find((outlet) => outlet.id === selectedOutletId) ?? null,
    [outlets, selectedOutletId],
  );

  const sortedOutlets = useMemo(() => {
    return [...outlets].sort((left, right) => {
      const leftDistance = distanceKm(location, left);
      const rightDistance = distanceKm(location, right);

      if (leftDistance == null && rightDistance == null) {
        return outletName(left).localeCompare(outletName(right));
      }

      if (leftDistance == null) {
        return 1;
      }

      if (rightDistance == null) {
        return -1;
      }

      return leftDistance - rightDistance;
    });
  }, [location, outlets]);

  useEffect(() => {
    let mounted = true;

    async function loadOutlets() {
      setLoadingOutlets(true);

      const { data, error } = await supabase
        .from('tabel_user')
        .select(
          'id,nama,email,role,status_langganan,tgl_kadaluwarsa_langganan,nama_toko,alamat_toko,outlet_latitude,outlet_longitude,flyer_title,flyer_body,flyer_accent,flyer_discount_label',
        )
        .in('role', ['ADMIN', 'SUPERADMIN'])
        .order('nama', { ascending: true });

      if (!mounted) {
        return;
      }

      setLoadingOutlets(false);

      if (error) {
        setMessage(error.message);
        return;
      }

      const activeOutlets = ((data ?? []) as OutletProfile[]).filter(isActiveOutlet);
      setOutlets(activeOutlets);
      setSelectedOutletId((current) => current || activeOutlets[0]?.id || '');
    }

    void loadOutlets();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadActiveOrders() {
      setOrdersLoading(true);

      const { data, error } = await supabase
        .from('tabel_order')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!mounted) {
        return;
      }

      setOrdersLoading(false);

      if (error) {
        setMessage(error.message);
        return;
      }

      setActiveOrders((data ?? []) as LaundryOrder[]);
    }

    void loadActiveOrders();

    const channel = supabase
      .channel(`scale-wash:user-orders:${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          filter: `user_id=eq.${profile.id}`,
          schema: 'public',
          table: 'tabel_order',
        },
        (payload) => {
          setActiveOrders((currentOrders) => upsertOrderList(currentOrders, payload.new as LaundryOrder));
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          filter: `user_id=eq.${profile.id}`,
          schema: 'public',
          table: 'tabel_order',
        },
        (payload) => {
          setActiveOrders((currentOrders) => upsertOrderList(currentOrders, payload.new as LaundryOrder));
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [profile.id]);

  function requestLocation() {
    setLocationMessage('');

    if (!navigator.geolocation) {
      setLocationMessage('Browser ini belum mendukung lokasi.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationMessage('Lokasi aktif. Laundry terdekat diprioritaskan.');
      },
      () => {
        setLocationMessage('Izin lokasi ditolak. Kamu tetap bisa pilih outlet manual.');
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 },
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOutlet) {
      setMessage('Pilih laundry tujuan dulu sebelum kirim order.');
      return;
    }

    setSubmitting(true);
    setMessage('');
    setCreatedOrderId('');

    const { data, error } = await supabase
      .from('tabel_order')
      .insert({
        user_id: profile.id,
        admin_outlet_id: selectedOutlet.id,
        format_detail: {
          paket,
          estimasi_pakaian: estimasiPakaian,
          alamat,
          pickup_time: pickupTime,
          catatan,
          customer_latitude: location?.latitude,
          customer_longitude: location?.longitude,
          outlet_name: outletName(selectedOutlet),
          outlet_address: selectedOutlet.alamat_toko,
        },
        status_order: 'PENDING_CONFIRMATION',
        status_pembayaran: 'UNPAID',
      })
      .select('*')
      .single();

    setSubmitting(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    const nextOrder = data as LaundryOrder;
    setCreatedOrderId(nextOrder.id);
    setActiveOrders((currentOrders) => upsertOrderList(currentOrders, nextOrder));
    setMessage(`Order terkirim ke ${outletName(selectedOutlet)}.`);
    setAlamat('');
    setCatatan('');
    setPickupTime('');
  }

  return (
    <div className="order-layout">
      <section className="app-card order-builder">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Pickup order</p>
            <h1>Pilih laundry, lalu jadwalkan pickup.</h1>
            <p className="muted">Order langsung masuk ke outlet yang kamu pilih, bukan diterima acak.</p>
          </div>
          <span className="icon-badge">
            <i className="fi fi-rr-map-marker-home" aria-hidden />
          </span>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="service-picker" aria-label="Pilih paket laundry">
            {serviceOptions.map((service) => (
              <button
                className={`service-option ${paket === service.label ? 'active' : ''}`}
                key={service.label}
                onClick={() => setPaket(service.label)}
                type="button"
              >
                <i className={`fi ${service.icon}`} aria-hidden />
                <strong>{service.label}</strong>
                <span>{service.min}</span>
              </button>
            ))}
          </div>

          <div className="location-strip">
            <div>
              <strong>Aktifkan lokasi</strong>
              <span>{location ? 'Urutan outlet memakai jarak dari posisimu.' : 'Cari laundry aktif terdekat.'}</span>
            </div>
            <button className="button secondary" onClick={requestLocation} type="button">
              <span className="motion-icon">
                <i className="fi fi-rr-location-crosshairs" aria-hidden />
              </span>
              Get location
            </button>
          </div>
          {locationMessage ? <p className="form-note">{locationMessage}</p> : null}

          <div className="field">
            <span>Laundry terdekat</span>
            <div className="outlet-list">
              {loadingOutlets ? <p className="muted">Memuat outlet aktif...</p> : null}
              {!loadingOutlets && sortedOutlets.length === 0 ? (
                <div className="empty-state">
                  <i className="fi fi-rr-store-alt" aria-hidden />
                  <strong>Belum ada outlet aktif</strong>
                  <span>Aktifkan membership admin dan isi profil outlet dulu.</span>
                </div>
              ) : null}

              {sortedOutlets.map((outlet) => {
                const range = distanceKm(location, outlet);
                const isSelected = selectedOutletId === outlet.id;

                return (
                  <button
                    className={`outlet-card ${isSelected ? 'active' : ''}`}
                    key={outlet.id}
                    onClick={() => setSelectedOutletId(outlet.id)}
                    type="button"
                  >
                    <span className="outlet-logo">
                      <i className="fi fi-rr-washer" aria-hidden />
                    </span>
                    <span>
                      <strong>{outletName(outlet)}</strong>
                      <small>{outlet.alamat_toko || outlet.email}</small>
                      <em>{range == null ? 'Lokasi outlet belum diset' : `${range.toFixed(1)} km dari kamu`}</em>
                    </span>
                    <i className={`fi ${isSelected ? 'fi-sr-badge-check' : 'fi-rr-angle-small-right'}`} aria-hidden />
                  </button>
                );
              })}
            </div>
          </div>

          <label className="field">
            <span>Estimasi pakaian</span>
            <input
              className="input"
              min={1}
              onChange={(event) => setEstimasiPakaian(Number(event.target.value))}
              required
              type="number"
              value={estimasiPakaian}
            />
          </label>

          <label className="field">
            <span>Alamat pickup</span>
            <textarea
              className="textarea"
              onChange={(event) => setAlamat(event.target.value)}
              placeholder="Contoh: Jl. Melati No. 7, dekat minimarket"
              required
              value={alamat}
            />
          </label>

          <label className="field">
            <span>Waktu pickup</span>
            <input
              className="input"
              onChange={(event) => setPickupTime(event.target.value)}
              type="datetime-local"
              value={pickupTime}
            />
          </label>

          <label className="field">
            <span>Catatan</span>
            <textarea
              className="textarea"
              onChange={(event) => setCatatan(event.target.value)}
              placeholder="Pisahkan pakaian putih, parfum soft, dan lainnya"
              value={catatan}
            />
          </label>

          <button className="button primary" disabled={submitting} type="submit">
            <span className="motion-icon">
              <i className="fi fi-rr-paper-plane" aria-hidden />
            </span>
            {submitting ? 'Mengirim...' : 'Kirim Order'}
          </button>
        </form>

        {message ? (
          <div className={`alert ${createdOrderId ? 'success' : 'error'}`}>
            {createdOrderId ? <i className="fi fi-sr-badge-check success-icon" aria-hidden /> : null}
            {' '}
            {message}
            {createdOrderId ? ` ID: ${createdOrderId.slice(0, 8)}` : ''}
            {createdOrderId ? (
              <div className="alert-actions">
                <Link className="button secondary" href={`/orders/${createdOrderId}/chat`}>
                  <i className="fi fi-rr-comment-alt" aria-hidden />
                  Buka Chat & Status
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <aside className="order-side">
        <div className="ad-card" style={{ '--ad-accent': selectedOutlet?.flyer_accent || '#20bdd6' } as CSSProperties}>
          <span className="ad-pill">{selectedOutlet?.flyer_discount_label || 'Member active'}</span>
          <h2>{selectedOutlet?.flyer_title || 'Laundry bersih, pickup cepat.'}</h2>
          <p>
            {selectedOutlet?.flyer_body ||
              'Admin outlet bisa desain flyer sendiri: judul, promo, warna, dan deskripsi akan tampil di customer.'}
          </p>
          <div className="ad-machine" aria-hidden>
            <i className="fi fi-rr-washer" />
          </div>
        </div>

        <div className="app-card receipt-card">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Ringkasan</p>
              <h2>Order preview</h2>
            </div>
            <span className="status pending">Draft</span>
          </div>
          <div className="receipt-preview modern">
            <p>SCALEWASH ORDER</p>
            <p>User: {profile.nama}</p>
            <p>Outlet: {selectedOutlet ? outletName(selectedOutlet) : '-'}</p>
            <p>Paket: {paket}</p>
            <p>Estimasi: {estimasiPakaian} pcs</p>
            <p>Status: PENDING_CONFIRMATION</p>
          </div>
        </div>

        <div className="app-card live-status-card">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Realtime</p>
              <h2>Status order kamu</h2>
            </div>
            <span className="status active">{activeOrders.length} live</span>
          </div>

          <div className="customer-order-list">
            {ordersLoading ? <p className="muted">Memuat status order...</p> : null}
            {!ordersLoading && activeOrders.length === 0 ? (
              <div className="empty-state compact">
                <i className="fi fi-rr-ballot" aria-hidden />
                <strong>Belum ada order</strong>
                <span>Order baru akan muncul realtime di sini.</span>
              </div>
            ) : null}

            {activeOrders.map((order) => {
              const currentIndex = orderSteps.indexOf(order.status_order);

              return (
                <article className="customer-status-card" key={order.id}>
                  <div>
                    <strong>#{order.id.slice(0, 8)}</strong>
                    <span>{order.format_detail?.outlet_name || 'Outlet laundry'}</span>
                  </div>
                  <span className={`status ${order.status_order === 'SELESAI' ? 'done' : 'pending'}`}>
                    {orderStatusLabel(order.status_order)}
                  </span>
                  <div className="status-rail">
                    {orderSteps.map((status, index) => (
                      <span className={index <= currentIndex ? 'active' : ''} key={status}>
                        {orderStatusLabel(status)}
                      </span>
                    ))}
                  </div>
                  <Link className="button secondary" href={`/orders/${order.id}/chat`}>
                    <i className="fi fi-rr-comment-alt" aria-hidden />
                    Chat & detail
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}
