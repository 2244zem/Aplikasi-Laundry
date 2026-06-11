'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ListSkeleton } from '@/components/Skeleton';
import { supabase } from '@/lib/supabaseClient';
import type { LaundryOrder, ServicePricing, UserProfile } from '@/lib/types';

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
  | 'outlet_is_open'
  | 'outlet_pickup_eta_minutes'
  | 'outlet_rating'
  | 'outlet_radius_km'
>;

type UserLocation = {
  latitude: number;
  longitude: number;
};

type ServiceChoice = Pick<ServicePricing, 'aktif' | 'deskripsi' | 'estimasi_menit' | 'harga' | 'id' | 'nama_layanan' | 'satuan'> & {
  icon: string;
};

type WizardStep = 1 | 2 | 3;

const fallbackServicePrices: ServiceChoice[] = [
  { aktif: true, deskripsi: 'Cuci, kering, dan setrika rapi', estimasi_menit: 1440, harga: 8000, icon: 'fi-rr-washer', id: 'fallback-cuci-setrika', nama_layanan: 'Cuci Setrika', satuan: 'kg' },
  { aktif: true, deskripsi: 'Cuci dan lipat reguler', estimasi_menit: 1440, harga: 6000, icon: 'fi-rr-water', id: 'fallback-cuci-kering', nama_layanan: 'Cuci Kering', satuan: 'kg' },
  { aktif: true, deskripsi: 'Setrika rapi untuk pakaian bersih', estimasi_menit: 720, harga: 5000, icon: 'fi-rr-iron', id: 'fallback-setrika', nama_layanan: 'Setrika Saja', satuan: 'kg' },
  { aktif: true, deskripsi: 'Prioritas selesai di hari yang sama', estimasi_menit: 360, harga: 15000, icon: 'fi-rr-bolt', id: 'fallback-express', nama_layanan: 'Express 6 Jam', satuan: 'kg' },
];

const orderSteps: LaundryOrder['status_order'][] = ['PENDING_CONFIRMATION', 'DITERIMA', 'DICUCI', 'DISETRIKA', 'SELESAI'];
const fragranceOptions = ['Lavender', 'Ocean Breeze', 'Tanpa parfum'];

const wizardLabels = [
  { body: 'Outlet dan layanan', label: 'Pilih' },
  { body: 'Alamat, waktu, preferensi', label: 'Detail' },
  { body: 'Cek ulang sebelum kirim', label: 'Ringkasan' },
] as const;

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

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    currency: 'IDR',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value || 0);
}

function formatEta(minutes: number) {
  if (minutes < 60) {
    return `${minutes} menit`;
  }

  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} jam` : `${Math.round(hours / 24)} hari`;
}

function serviceIcon(serviceName: string) {
  const normalized = serviceName.toLowerCase();

  if (normalized.includes('express')) {
    return 'fi-rr-bolt';
  }

  if (normalized.includes('setrika')) {
    return 'fi-rr-iron';
  }

  if (normalized.includes('kering')) {
    return 'fi-rr-water';
  }

  return 'fi-rr-washer';
}

function serviceMatchesIntent(service: ServiceChoice, intent: string) {
  const normalized = `${service.nama_layanan} ${service.deskripsi ?? ''}`.toLowerCase();

  if (intent === 'premium') {
    return normalized.includes('premium') || normalized.includes('satuan') || normalized.includes('dry') || normalized.includes('jas') || normalized.includes('gaun');
  }

  if (intent === 'sepatu') {
    return normalized.includes('sepatu') || normalized.includes('shoe');
  }

  if (intent === 'cuci-kiloan') {
    return normalized.includes('kilo') || normalized.includes('cuci') || service.satuan === 'kg';
  }

  return false;
}

function pickServiceFromIntent(services: ServiceChoice[], intent: string | null) {
  if (!intent) {
    return services[0]?.id || '';
  }

  return services.find((service) => serviceMatchesIntent(service, intent))?.id || services[0]?.id || '';
}

function buildInitialChatMessage(order: LaundryOrder) {
  const detail = order.format_detail ?? {};
  const price = Number(order.total_harga || detail.estimasi_harga || 0);

  return [
    'Halo admin, saya baru membuat order pickup.',
    '',
    `Order: #${order.id.slice(0, 8)}`,
    `Outlet: ${detail.outlet_name || 'Outlet laundry'}`,
    `Layanan: ${detail.paket || 'Laundry'}`,
    `Estimasi: ${detail.estimasi_pakaian ?? '-'} ${detail.satuan || 'pcs'}`,
    `Alamat: ${detail.alamat || '-'}`,
    `Pickup: ${detail.pickup_time || 'Fleksibel'}`,
    detail.preferensi_parfum ? `Preferensi: ${detail.preferensi_parfum}` : '',
    `Estimasi harga: ${formatCurrency(price)}`,
    detail.catatan ? `Catatan: ${detail.catatan}` : '',
    '',
    'Mohon dicek dan dikonfirmasi. Terima kasih.',
  ]
    .filter(Boolean)
    .join('\n');
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
  const searchParams = useSearchParams();
  const serviceIntent = searchParams.get('service');
  const [selectedServiceId, setSelectedServiceId] = useState(fallbackServicePrices[0].id);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [estimasiPakaian, setEstimasiPakaian] = useState(12);
  const [alamat, setAlamat] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [preferensiParfum, setPreferensiParfum] = useState(fragranceOptions[0]);
  const [catatan, setCatatan] = useState('');
  const [outlets, setOutlets] = useState<OutletProfile[]>([]);
  const [servicePrices, setServicePrices] = useState<ServiceChoice[]>(fallbackServicePrices);
  const [selectedOutletId, setSelectedOutletId] = useState('');
  const [radiusFilterKm, setRadiusFilterKm] = useState(10);
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [locationMessage, setLocationMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingOutlets, setLoadingOutlets] = useState(true);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [activeOrders, setActiveOrders] = useState<LaundryOrder[]>([]);
  const [message, setMessage] = useState('');
  const [createdOrderId, setCreatedOrderId] = useState('');

  const selectedOutlet = useMemo(
    () => outlets.find((outlet) => outlet.id === selectedOutletId) ?? null,
    [outlets, selectedOutletId],
  );
  const selectedService = useMemo(
    () => servicePrices.find((service) => service.id === selectedServiceId) ?? servicePrices[0],
    [selectedServiceId, servicePrices],
  );
  const estimateUnit = selectedService?.satuan || 'pcs';
  const estimatedPrice = useMemo(
    () => Math.max(0, estimasiPakaian) * Number(selectedService?.harga || 0),
    [estimasiPakaian, selectedService?.harga],
  );
  const selectedRange = selectedOutlet ? distanceKm(location, selectedOutlet) : null;
  const canContinueStepOne = Boolean(selectedOutlet && selectedService && selectedOutlet.outlet_is_open)
    && (!location || selectedRange == null || selectedRange <= Number(selectedOutlet?.outlet_radius_km || radiusFilterKm));
  const canContinueStepTwo = Boolean(alamat.trim());

  const sortedOutlets = useMemo(() => {
    return [...outlets]
      .filter((outlet) => {
        const range = distanceKm(location, outlet);
        return !location || range == null || range <= radiusFilterKm;
      })
      .sort((left, right) => {
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
  }, [location, outlets, radiusFilterKm]);

  useEffect(() => {
    let mounted = true;

    async function loadOutlets() {
      setLoadingOutlets(true);

      const { data, error } = await supabase
        .from('tabel_user')
        .select(
          'id,nama,email,role,status_langganan,tgl_kadaluwarsa_langganan,nama_toko,alamat_toko,outlet_latitude,outlet_longitude,flyer_title,flyer_body,flyer_accent,flyer_discount_label,outlet_is_open,outlet_pickup_eta_minutes,outlet_rating,outlet_radius_km',
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

    async function loadServicePrices() {
      if (!selectedOutletId) {
        setLoadingPrices(false);
        setServicePrices(fallbackServicePrices);
        setSelectedServiceId(pickServiceFromIntent(fallbackServicePrices, serviceIntent));
        return;
      }

      setLoadingPrices(true);

      const { data, error } = await supabase
        .from('tabel_service_pricing')
        .select('*')
        .eq('admin_id', selectedOutletId)
        .eq('aktif', true)
        .order('urutan', { ascending: true })
        .order('created_at', { ascending: true });

      if (!mounted) {
        return;
      }

      setLoadingPrices(false);

      if (error) {
        setMessage(error.message);
        setServicePrices(fallbackServicePrices);
        setSelectedServiceId(fallbackServicePrices[0].id);
        return;
      }

      const mappedPrices = ((data ?? []) as ServicePricing[]).map((price) => ({
        ...price,
        icon: serviceIcon(price.nama_layanan),
      }));
      const nextPrices = mappedPrices.length > 0 ? mappedPrices : fallbackServicePrices;
      setServicePrices(nextPrices);
      setSelectedServiceId(pickServiceFromIntent(nextPrices, serviceIntent));
    }

    void loadServicePrices();

    return () => {
      mounted = false;
    };
  }, [selectedOutletId, serviceIntent]);

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

  function withCurrentContext(href: string) {
    const [path, query = ''] = href.split('?');
    const params = new URLSearchParams(query);

    ['isandroid', 'istablet', 'isdesktop', 'lang'].forEach((key) => {
      if (searchParams.has(key) && !params.has(key)) {
        params.set(key, searchParams.get(key) ?? '');
      }
    });

    const nextQuery = params.toString();
    return `${path}${nextQuery ? `?${nextQuery}` : ''}`;
  }

  function goToNextStep() {
    setMessage('');

    if (wizardStep === 1 && !canContinueStepOne) {
      setMessage(!selectedOutlet ? 'Pilih outlet laundry dulu.' : 'Outlet belum bisa menerima pickup. Pilih outlet yang buka dan masuk radius layanan.');
      return;
    }

    if (wizardStep === 2 && !canContinueStepTwo) {
      setMessage('Isi alamat pickup dulu agar outlet bisa menjemput pakaian.');
      return;
    }

    setWizardStep((currentStep) => (Math.min(3, currentStep + 1) as WizardStep));
  }

  function goToPreviousStep() {
    setMessage('');
    setWizardStep((currentStep) => (Math.max(1, currentStep - 1) as WizardStep));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOutlet) {
      setMessage('Pilih laundry tujuan dulu sebelum kirim order.');
      return;
    }

    if (!selectedOutlet.outlet_is_open) {
      setMessage(`${outletName(selectedOutlet)} sedang tutup. Pilih outlet lain yang sedang buka.`);
      return;
    }

    const selectedRange = distanceKm(location, selectedOutlet);
    if (location && selectedRange != null && selectedRange > Number(selectedOutlet.outlet_radius_km || radiusFilterKm)) {
      setMessage(`${outletName(selectedOutlet)} berada di luar radius layanan outlet.`);
      return;
    }

    if (!selectedService) {
      setMessage('Pilih layanan laundry dulu sebelum kirim order.');
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
          paket: selectedService.nama_layanan,
          service_id: selectedService.id.startsWith('fallback-') ? undefined : selectedService.id,
          satuan: selectedService.satuan,
          harga_satuan: selectedService.harga,
          estimasi_harga: estimatedPrice,
          estimasi_menit: selectedService.estimasi_menit,
          estimasi_pakaian: estimasiPakaian,
          alamat,
          pickup_time: pickupTime,
          catatan,
          preferensi_parfum: preferensiParfum,
          customer_latitude: location?.latitude,
          customer_longitude: location?.longitude,
          outlet_name: outletName(selectedOutlet),
          outlet_address: selectedOutlet.alamat_toko,
        },
        total_harga: estimatedPrice,
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
    const { error: chatError } = await supabase.from('tabel_chat_message').insert({
      order_id: nextOrder.id,
      sender_user_id: profile.id,
      receiver_user_id: selectedOutlet.id,
      message: buildInitialChatMessage(nextOrder),
    });

    setCreatedOrderId(nextOrder.id);
    setActiveOrders((currentOrders) => upsertOrderList(currentOrders, nextOrder));
    setMessage(
      chatError
        ? `Order terkirim ke ${outletName(selectedOutlet)}, tetapi pesan awal chat gagal dibuat: ${chatError.message}`
        : `Order terkirim ke ${outletName(selectedOutlet)} dan chat awal sudah dibuat.`,
    );
    setAlamat('');
    setCatatan('');
    setPickupTime('');
    setWizardStep(1);
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

        <form className="form-grid order-wizard" onSubmit={handleSubmit}>
          <div className="wizard-steps" aria-label="Tahap pemesanan">
            {wizardLabels.map((step, index) => {
              const stepNumber = (index + 1) as WizardStep;

              return (
                <button
                  aria-current={wizardStep === stepNumber ? 'step' : undefined}
                  className={wizardStep === stepNumber ? 'active' : wizardStep > stepNumber ? 'done' : ''}
                  key={step.label}
                  onClick={() => setWizardStep(stepNumber)}
                  type="button"
                >
                  <span>{stepNumber}</span>
                  <strong>{step.label}</strong>
                  <small>{step.body}</small>
                </button>
              );
            })}
          </div>

          {wizardStep === 1 ? (
            <div className="wizard-panel">
              <div className="wizard-panel-head">
                <div>
                  <p className="eyebrow">Tahap 1</p>
                  <h2>Pilih outlet dan layanan.</h2>
                  <p className="muted">Order hanya masuk ke outlet yang kamu pilih.</p>
                </div>
                <span className="status pending">{sortedOutlets.length} outlet</span>
              </div>

              <div className="service-picker" aria-label="Pilih paket laundry">
                {servicePrices.map((service) => (
                  <button
                    className={`service-option ${selectedServiceId === service.id ? 'active' : ''}`}
                    key={service.id}
                    onClick={() => setSelectedServiceId(service.id)}
                    type="button"
                  >
                    <i className={`fi ${service.icon}`} aria-hidden />
                    <strong>{service.nama_layanan}</strong>
                    <span>{formatCurrency(Number(service.harga))}/{service.satuan} - {formatEta(Number(service.estimasi_menit))}</span>
                  </button>
                ))}
              </div>
              {loadingPrices ? <p className="form-note">Memuat harga layanan outlet...</p> : null}

              <div className="location-strip">
                <div>
                  <strong>Aktifkan lokasi</strong>
                  <span>{location ? 'Urutan outlet memakai jarak dari posisimu.' : 'Cari laundry aktif terdekat.'}</span>
                </div>
                <button className="button secondary" onClick={requestLocation} type="button">
                  <span className="motion-icon">
                    <i className="fi fi-rr-location-crosshairs" aria-hidden />
                  </span>
                  Pakai lokasi
                </button>
              </div>
              {locationMessage ? <p className="form-note">{locationMessage}</p> : null}

              <div className="radius-filter" aria-label="Filter radius laundry">
                {[3, 5, 10, 20].map((radius) => (
                  <button
                    className={radiusFilterKm === radius ? 'active' : ''}
                    key={radius}
                    onClick={() => setRadiusFilterKm(radius)}
                    type="button"
                  >
                    {radius} km
                  </button>
                ))}
              </div>

              <div className="field">
                <span>Laundry terdekat</span>
                <div className="outlet-list">
                  {loadingOutlets ? <ListSkeleton count={2} /> : null}
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
                    const isOpen = outlet.outlet_is_open;

                    return (
                      <button
                        className={`outlet-card ${isSelected ? 'active' : ''} ${isOpen ? '' : 'disabled'}`}
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
                          <em>
                            {range == null ? 'Lokasi belum diset' : `${range.toFixed(1)} km`}
                            {' - '}
                            {isOpen ? `Buka - ETA ${outlet.outlet_pickup_eta_minutes || 30} menit` : 'Tutup'}
                            {' - '}
                            {Number(outlet.outlet_rating || 4.8).toFixed(1)} rating
                          </em>
                        </span>
                        <i className={`fi ${isSelected ? 'fi-sr-badge-check' : 'fi-rr-angle-small-right'}`} aria-hidden />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {wizardStep === 2 ? (
            <div className="wizard-panel">
              <div className="wizard-panel-head">
                <div>
                  <p className="eyebrow">Tahap 2</p>
                  <h2>Detail pickup dan preferensi.</h2>
                  <p className="muted">Isi yang penting saja agar outlet bisa langsung bergerak.</p>
                </div>
              </div>

              <label className="field">
                <span>Estimasi {estimateUnit === 'kg' ? 'berat' : 'jumlah'} ({estimateUnit})</span>
                <input
                  className="input"
                  min={1}
                  onChange={(event) => setEstimasiPakaian(Number(event.target.value))}
                  required
                  step={estimateUnit === 'kg' ? '0.1' : '1'}
                  type="number"
                  value={estimasiPakaian}
                />
              </label>

              <div className="field">
                <span>Pilih wangi</span>
                <div className="preference-pills" aria-label="Pilih preferensi parfum">
                  {fragranceOptions.map((option) => (
                    <button
                      className={preferensiParfum === option ? 'active' : ''}
                      key={option}
                      onClick={() => setPreferensiParfum(option)}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

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
                  placeholder="Pisahkan pakaian putih, lipat rapi, dan lainnya"
                  value={catatan}
                />
              </label>
            </div>
          ) : null}

          {wizardStep === 3 ? (
            <div className="wizard-panel summary-panel">
              <div className="wizard-panel-head">
                <div>
                  <p className="eyebrow">Tahap 3</p>
                  <h2>Ringkasan sebelum dikirim.</h2>
                  <p className="muted">Cek outlet, layanan, jadwal, dan harga estimasi.</p>
                </div>
                <span className="status pending">Draf</span>
              </div>

              <div className="summary-grid">
                <span>
                  <i className="fi fi-rr-store-alt" aria-hidden />
                  <strong>{selectedOutlet ? outletName(selectedOutlet) : '-'}</strong>
                  <small>{selectedOutlet?.alamat_toko || selectedOutlet?.email || 'Outlet belum dipilih'}</small>
                </span>
                <span>
                  <i className={`fi ${selectedService?.icon || 'fi-rr-washer'}`} aria-hidden />
                  <strong>{selectedService?.nama_layanan || '-'}</strong>
                  <small>{formatCurrency(Number(selectedService?.harga || 0))}/{estimateUnit}</small>
                </span>
                <span>
                  <i className="fi fi-rr-map-marker-home" aria-hidden />
                  <strong>{alamat || 'Alamat belum diisi'}</strong>
                  <small>{pickupTime || 'Pickup fleksibel'}</small>
                </span>
                <span>
                  <i className="fi fi-rr-sparkles" aria-hidden />
                  <strong>{preferensiParfum}</strong>
                  <small>{catatan || 'Tidak ada catatan tambahan'}</small>
                </span>
              </div>

              <div className="price-summary">
                <span>Estimasi tagihan</span>
                <strong>{formatCurrency(estimatedPrice)}</strong>
              </div>
            </div>
          ) : null}

          <div className="wizard-actions">
            {wizardStep > 1 ? (
              <button className="button secondary" onClick={goToPreviousStep} type="button">
                <i className="fi fi-rr-angle-small-left" aria-hidden />
                Kembali
              </button>
            ) : null}

            {wizardStep < 3 ? (
              <button className="button primary" onClick={goToNextStep} type="button">
                Lanjut
                <i className="fi fi-rr-angle-small-right" aria-hidden />
              </button>
            ) : (
              <button className="button primary" disabled={submitting} type="submit">
                <span className="motion-icon">
                  <i className="fi fi-rr-paper-plane" aria-hidden />
                </span>
                {submitting ? 'Mengirim...' : 'Kirim Order'}
              </button>
            )}
          </div>
        </form>

        {message ? (
          <div className={`alert ${createdOrderId ? 'success' : 'error'}`}>
            {createdOrderId ? <i className="fi fi-sr-badge-check success-icon" aria-hidden /> : null}
            {' '}
            {message}
            {createdOrderId ? ` ID: ${createdOrderId.slice(0, 8)}` : ''}
            {createdOrderId ? (
              <div className="alert-actions">
                <Link className="button secondary" href={withCurrentContext(`/orders/${createdOrderId}/chat`)}>
                  <i className="fi fi-rr-comment-alt" aria-hidden />
                  Buka Chat & Status
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <aside className="order-side">
        <div className="ad-card" style={{ '--ad-accent': selectedOutlet?.flyer_accent || '#95DFD3' } as CSSProperties}>
          <span className="ad-pill">{selectedOutlet?.flyer_discount_label || 'Member aktif'}</span>
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
              <h2>Preview order</h2>
            </div>
            <span className="status pending">Draf</span>
          </div>
          <div className="receipt-preview modern">
            <p>UNGU LAUNDRY ORDER</p>
            <p>User: {profile.nama}</p>
            <p>Outlet: {selectedOutlet ? outletName(selectedOutlet) : '-'}</p>
            <p>Paket: {selectedService?.nama_layanan || '-'}</p>
            <p>Estimasi: {estimasiPakaian} {estimateUnit}</p>
            <p>Preferensi: {preferensiParfum}</p>
            <p>Harga: {formatCurrency(estimatedPrice)}</p>
            <p>Status: PENDING</p>
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
            {ordersLoading ? <ListSkeleton count={2} /> : null}
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
                  <div className="customer-timeline compact">
                    {orderSteps.map((status, index) => (
                      <div className={index <= currentIndex ? 'active' : ''} key={status}>
                        <span>
                          <i className={index <= currentIndex ? 'fi fi-rr-check' : 'fi fi-rr-circle'} aria-hidden />
                        </span>
                        <p>{orderStatusLabel(status)}</p>
                      </div>
                    ))}
                  </div>
                  <Link className="button secondary" href={withCurrentContext(`/orders/${order.id}/chat`)}>
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
