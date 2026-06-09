'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { ServicePricing, UserProfile } from '@/lib/types';

type Props = {
  profile: UserProfile;
};

type PricingForm = {
  aktif: boolean;
  deskripsi: string;
  estimasi_menit: number;
  harga: number;
  nama_layanan: string;
  satuan: ServicePricing['satuan'];
  urutan: number;
};

const starterPrices: PricingForm[] = [
  { aktif: true, deskripsi: 'Cuci dan lipat reguler', estimasi_menit: 1440, harga: 6000, nama_layanan: 'Cuci Kering', satuan: 'kg', urutan: 1 },
  { aktif: true, deskripsi: 'Cuci, kering, dan setrika rapi', estimasi_menit: 1440, harga: 8000, nama_layanan: 'Cuci Setrika', satuan: 'kg', urutan: 2 },
  { aktif: true, deskripsi: 'Prioritas selesai di hari yang sama', estimasi_menit: 360, harga: 15000, nama_layanan: 'Express 6 Jam', satuan: 'kg', urutan: 3 },
  { aktif: true, deskripsi: 'Setrika rapi untuk pakaian bersih', estimasi_menit: 720, harga: 5000, nama_layanan: 'Setrika Saja', satuan: 'kg', urutan: 4 },
];

const emptyForm: PricingForm = {
  aktif: true,
  deskripsi: '',
  estimasi_menit: 1440,
  harga: 0,
  nama_layanan: '',
  satuan: 'kg',
  urutan: 0,
};

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
  if (hours < 24) {
    return `${hours} jam`;
  }

  return `${Math.round(hours / 24)} hari`;
}

export function AdminServicePricingPanel({ profile }: Props) {
  const [prices, setPrices] = useState<ServicePricing[]>([]);
  const [form, setForm] = useState<PricingForm>(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const activeCount = useMemo(() => prices.filter((price) => price.aktif).length, [prices]);

  async function loadPricing() {
    setLoading(true);
    setMessage('');

    const { data, error } = await supabase
      .from('tabel_service_pricing')
      .select('*')
      .eq('admin_id', profile.id)
      .order('urutan', { ascending: true })
      .order('created_at', { ascending: true });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setPrices((data ?? []) as ServicePricing[]);
  }

  useEffect(() => {
    void loadPricing();
  }, [profile.id]);

  function editPrice(price: ServicePricing) {
    setEditingId(price.id);
    setForm({
      aktif: price.aktif,
      deskripsi: price.deskripsi || '',
      estimasi_menit: Number(price.estimasi_menit || 1440),
      harga: Number(price.harga || 0),
      nama_layanan: price.nama_layanan,
      satuan: price.satuan,
      urutan: Number(price.urutan || 0),
    });
  }

  function resetForm() {
    setEditingId('');
    setForm(emptyForm);
  }

  async function savePrice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    const payload = {
      admin_id: profile.id,
      aktif: form.aktif,
      deskripsi: form.deskripsi.trim() || null,
      estimasi_menit: form.estimasi_menit,
      harga: form.harga,
      nama_layanan: form.nama_layanan.trim(),
      satuan: form.satuan,
      urutan: form.urutan,
    };

    const request = editingId
      ? supabase.from('tabel_service_pricing').update(payload).eq('id', editingId)
      : supabase.from('tabel_service_pricing').insert(payload);

    const { error } = await request;

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(editingId ? 'Harga layanan diperbarui.' : 'Harga layanan ditambahkan.');
    resetForm();
    await loadPricing();
  }

  async function addStarterPrices() {
    setSaving(true);
    setMessage('');

    const { error } = await supabase
      .from('tabel_service_pricing')
      .insert(starterPrices.map((price) => ({ ...price, admin_id: profile.id })));

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Starter harga layanan ditambahkan.');
    await loadPricing();
  }

  async function toggleActive(price: ServicePricing) {
    const { error } = await supabase
      .from('tabel_service_pricing')
      .update({ aktif: !price.aktif })
      .eq('id', price.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadPricing();
  }

  return (
    <section className="app-card pricing-panel">
      <div className="page-header">
        <div>
          <p className="eyebrow">Harga layanan</p>
          <h2>Pricelist outlet</h2>
          <p className="muted">Harga ini muncul di order customer dan menghitung estimasi otomatis.</p>
        </div>
        <span className="status active">{activeCount} aktif</span>
      </div>

      <div className="grid two pricing-grid">
        <form className="form-grid pricing-form" onSubmit={savePrice}>
          <div className="page-header compact-header">
            <div>
              <p className="eyebrow">{editingId ? 'Edit layanan' : 'Layanan baru'}</p>
              <h3>{editingId ? 'Update harga' : 'Tambah harga'}</h3>
            </div>
            {editingId ? (
              <button className="button ghost" onClick={resetForm} type="button">
                Batal
              </button>
            ) : null}
          </div>

          <label className="field">
            <span>Nama layanan</span>
            <input
              className="input"
              onChange={(event) => setForm((current) => ({ ...current, nama_layanan: event.target.value }))}
              placeholder="Cuci Setrika"
              required
              value={form.nama_layanan}
            />
          </label>

          <div className="grid two equal">
            <label className="field">
              <span>Harga</span>
              <input
                className="input"
                min={0}
                onChange={(event) => setForm((current) => ({ ...current, harga: Number(event.target.value) }))}
                step="500"
                type="number"
                value={form.harga}
              />
            </label>
            <label className="field">
              <span>Satuan</span>
              <div className="choice-grid">
                {(['kg', 'pcs', 'item'] as ServicePricing['satuan'][]).map((unit) => (
                  <button
                    aria-selected={form.satuan === unit}
                    className={`choice-pill ${form.satuan === unit ? 'active' : ''}`}
                    key={unit}
                    onClick={() => setForm((current) => ({ ...current, satuan: unit }))}
                    type="button"
                  >
                    {unit}
                  </button>
                ))}
              </div>
            </label>
          </div>

          <div className="grid two equal">
            <label className="field">
              <span>Estimasi menit</span>
              <input
                className="input"
                min={30}
                onChange={(event) => setForm((current) => ({ ...current, estimasi_menit: Number(event.target.value) }))}
                step="30"
                type="number"
                value={form.estimasi_menit}
              />
            </label>
            <label className="field">
              <span>Urutan</span>
              <input
                className="input"
                onChange={(event) => setForm((current) => ({ ...current, urutan: Number(event.target.value) }))}
                type="number"
                value={form.urutan}
              />
            </label>
          </div>

          <label className="field">
            <span>Deskripsi</span>
            <textarea
              className="textarea compact"
              onChange={(event) => setForm((current) => ({ ...current, deskripsi: event.target.value }))}
              placeholder="Prioritas, parfum, estimasi selesai, dll."
              value={form.deskripsi}
            />
          </label>

          <label className="switch-field">
            <input
              checked={form.aktif}
              onChange={(event) => setForm((current) => ({ ...current, aktif: event.target.checked }))}
              type="checkbox"
            />
            <span>Layanan aktif</span>
          </label>

          <button className="button primary" disabled={saving} type="submit">
            <i className="fi fi-rr-disk" aria-hidden />
            {saving ? 'Menyimpan' : 'Simpan Harga'}
          </button>
        </form>

        <div className="pricing-list">
          {message ? <div className={`alert ${message.includes('Gagal') ? 'error' : 'success'}`}>{message}</div> : null}
          {loading ? <p className="muted">Memuat harga layanan...</p> : null}
          {!loading && prices.length === 0 ? (
            <div className="empty-state compact">
              <i className="fi fi-rr-tags" aria-hidden />
              <strong>Belum ada harga</strong>
              <span>Tambahkan manual atau gunakan starter layanan.</span>
              <button className="button secondary" disabled={saving} onClick={addStarterPrices} type="button">
                Starter harga
              </button>
            </div>
          ) : null}

          {prices.map((price) => (
            <article className={`pricing-card ${price.aktif ? '' : 'inactive'}`} key={price.id}>
              <div>
                <strong>{price.nama_layanan}</strong>
                <small>{price.deskripsi || 'Tanpa deskripsi'} - {formatEta(Number(price.estimasi_menit))}</small>
              </div>
              <div className="pricing-price">
                <strong>{formatCurrency(Number(price.harga))}</strong>
                <span>/{price.satuan}</span>
              </div>
              <div className="actions">
                <button className="button secondary" onClick={() => editPrice(price)} type="button">
                  <i className="fi fi-rr-edit" aria-hidden />
                  Edit
                </button>
                <button className="button ghost" onClick={() => toggleActive(price)} type="button">
                  {price.aktif ? 'Nonaktif' : 'Aktifkan'}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
