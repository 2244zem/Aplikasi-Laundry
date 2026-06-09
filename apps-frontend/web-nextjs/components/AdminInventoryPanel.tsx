'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ListSkeleton, MetricSkeleton } from '@/components/Skeleton';
import { supabase } from '@/lib/supabaseClient';
import type { InventoryItem, UserProfile } from '@/lib/types';

type Props = {
  profile: UserProfile;
};

type InventoryForm = {
  catatan: string;
  kategori: string;
  nama_barang: string;
  satuan: string;
  stok: number;
  stok_minimum: number;
};

const starterItems: InventoryForm[] = [
  { catatan: 'Starter stock', kategori: 'DETERGEN', nama_barang: 'Detergen liquid', satuan: 'liter', stok: 10, stok_minimum: 2 },
  { catatan: 'Starter stock', kategori: 'PARFUM', nama_barang: 'Parfum laundry', satuan: 'liter', stok: 5, stok_minimum: 1 },
  { catatan: 'Starter stock', kategori: 'PACKAGING', nama_barang: 'Plastik 5kg', satuan: 'pcs', stok: 100, stok_minimum: 20 },
];

const emptyForm: InventoryForm = {
  catatan: '',
  kategori: 'OPERASIONAL',
  nama_barang: '',
  satuan: 'unit',
  stok: 0,
  stok_minimum: 0,
};

function isLowStock(item: InventoryItem) {
  return Number(item.stok) <= Number(item.stok_minimum);
}

export function AdminInventoryPanel({ profile }: Props) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [form, setForm] = useState<InventoryForm>(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const isActiveAdmin =
    profile.role === 'SUPERADMIN' || (profile.role === 'ADMIN' && profile.status_langganan === 'ACTIVE');

  const summary = useMemo(() => {
    const low = items.filter(isLowStock).length;
    const units = items.reduce((sum, item) => sum + Number(item.stok || 0), 0);

    return { low, units };
  }, [items]);
  const lowStockNames = useMemo(
    () => items.filter(isLowStock).map((item) => item.nama_barang).slice(0, 3),
    [items],
  );

  async function loadInventory() {
    setLoading(true);
    setMessage('');

    const { data, error } = await supabase
      .from('tabel_inventory_item')
      .select('*')
      .eq('admin_id', profile.id)
      .order('updated_at', { ascending: false });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setItems((data ?? []) as InventoryItem[]);
  }

  useEffect(() => {
    if (!isActiveAdmin) {
      setLoading(false);
      return;
    }

    void loadInventory();
  }, [isActiveAdmin, profile.id]);

  useEffect(() => {
    if (!isActiveAdmin) {
      return;
    }

    const channel = supabase
      .channel(`ungu-laundry:inventory:${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          filter: `admin_id=eq.${profile.id}`,
          schema: 'public',
          table: 'tabel_inventory_item',
        },
        () => {
          void loadInventory();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isActiveAdmin, profile.id]);

  function editItem(item: InventoryItem) {
    setEditingId(item.id);
    setForm({
      catatan: item.catatan || '',
      kategori: item.kategori,
      nama_barang: item.nama_barang,
      satuan: item.satuan,
      stok: Number(item.stok || 0),
      stok_minimum: Number(item.stok_minimum || 0),
    });
  }

  function resetForm() {
    setEditingId('');
    setForm(emptyForm);
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    const payload = {
      admin_id: profile.id,
      catatan: form.catatan.trim() || null,
      kategori: form.kategori.trim() || 'OPERASIONAL',
      nama_barang: form.nama_barang.trim(),
      satuan: form.satuan.trim() || 'unit',
      stok: form.stok,
      stok_minimum: form.stok_minimum,
    };

    const request = editingId
      ? supabase.from('tabel_inventory_item').update(payload).eq('id', editingId)
      : supabase.from('tabel_inventory_item').insert(payload);

    const { error } = await request;

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    resetForm();
    setMessage(editingId ? 'Stok diperbarui.' : 'Barang stok ditambahkan.');
    await loadInventory();
  }

  async function deleteItem(id: string) {
    setSaving(true);
    setMessage('');

    const { error } = await supabase.from('tabel_inventory_item').delete().eq('id', id);

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Barang stok dihapus.');
    await loadInventory();
  }

  async function addStarterStock() {
    setSaving(true);
    setMessage('');

    const { error } = await supabase.from('tabel_inventory_item').insert(
      starterItems.map((item) => ({
        ...item,
        admin_id: profile.id,
      })),
    );

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Starter stock ditambahkan.');
    await loadInventory();
  }

  if (!isActiveAdmin) {
    return (
      <section className="panel">
        <p className="eyebrow">Inventory</p>
        <h1>Langganan admin belum aktif</h1>
        <p className="muted">Aktifkan subscription admin untuk mencatat stok outlet.</p>
      </section>
    );
  }

  return (
    <div className="inventory-screen">
      <section className="panel soft">
        <div className="page-header">
          <div>
            <p className="eyebrow">Inventory outlet</p>
            <h1>Stok operasional yang bisa dipantau cepat.</h1>
            <p className="muted">Diadaptasi dari referensi, tapi datanya tersimpan di Supabase dan realtime.</p>
          </div>
          <button className="button secondary" disabled={saving || loading} onClick={loadInventory} type="button">
            <i className="fi fi-rr-refresh" aria-hidden />
            Refresh
          </button>
        </div>
      </section>

      <section className="grid three metric-grid">
        {loading && items.length === 0 ? (
          <>
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </>
        ) : (
          <>
            <article className="panel metric-card">
              <span>Total barang</span>
              <strong>{items.length}</strong>
              <small>item stok</small>
            </article>
            <article className="panel metric-card">
              <span>Stok rendah</span>
              <strong>{summary.low}</strong>
              <small>perlu restock</small>
            </article>
            <article className="panel metric-card">
              <span>Total unit</span>
              <strong>{summary.units}</strong>
              <small>akumulasi stok</small>
            </article>
          </>
        )}
      </section>

      {!loading && summary.low > 0 ? (
        <section className="low-stock-banner">
          <i className="fi fi-rr-triangle-warning" aria-hidden />
          <div>
            <strong>{summary.low} stok operasional menipis</strong>
            <span>{lowStockNames.join(', ')} perlu dicek sebelum order berikutnya diproses.</span>
          </div>
          <button className="button secondary" onClick={loadInventory} type="button">
            Refresh
          </button>
        </section>
      ) : null}

      <section className="grid two inventory-grid">
        <form className="panel form-grid" onSubmit={saveItem}>
          <div className="page-header compact-header">
            <div>
              <p className="eyebrow">{editingId ? 'Edit stok' : 'Barang baru'}</p>
              <h2>{editingId ? 'Update barang' : 'Tambah stok outlet'}</h2>
            </div>
            {editingId ? (
              <button className="button ghost" onClick={resetForm} type="button">
                Batal
              </button>
            ) : null}
          </div>

          <label className="field">
            <span>Nama barang</span>
            <input
              className="input"
              onChange={(event) => setForm((current) => ({ ...current, nama_barang: event.target.value }))}
              placeholder="Detergen liquid"
              required
              value={form.nama_barang}
            />
          </label>

          <div className="grid two equal">
            <label className="field">
              <span>Kategori</span>
              <input
                className="input"
                onChange={(event) => setForm((current) => ({ ...current, kategori: event.target.value.toUpperCase() }))}
                value={form.kategori}
              />
            </label>
            <label className="field">
              <span>Satuan</span>
              <input
                className="input"
                onChange={(event) => setForm((current) => ({ ...current, satuan: event.target.value }))}
                value={form.satuan}
              />
            </label>
          </div>

          <div className="grid two equal">
            <label className="field">
              <span>Stok saat ini</span>
              <input
                className="input"
                min={0}
                onChange={(event) => setForm((current) => ({ ...current, stok: Number(event.target.value) }))}
                step="0.1"
                type="number"
                value={form.stok}
              />
            </label>
            <label className="field">
              <span>Minimum</span>
              <input
                className="input"
                min={0}
                onChange={(event) => setForm((current) => ({ ...current, stok_minimum: Number(event.target.value) }))}
                step="0.1"
                type="number"
                value={form.stok_minimum}
              />
            </label>
          </div>

          <label className="field">
            <span>Catatan</span>
            <textarea
              className="textarea compact"
              onChange={(event) => setForm((current) => ({ ...current, catatan: event.target.value }))}
              placeholder="Supplier, aroma, ukuran pack, dll."
              value={form.catatan}
            />
          </label>

          <button className="button primary" disabled={saving} type="submit">
            <i className="fi fi-rr-disk" aria-hidden />
            {saving ? 'Menyimpan' : editingId ? 'Simpan Update' : 'Tambah Barang'}
          </button>
        </form>

        <section className="app-card">
          <div className="page-header">
            <div>
              <p className="eyebrow">Daftar stok</p>
              <h2>Barang outlet</h2>
            </div>
            {items.length === 0 ? (
              <button className="button secondary" disabled={saving} onClick={addStarterStock} type="button">
                <i className="fi fi-rr-box-open" aria-hidden />
                Starter stock
              </button>
            ) : (
              <span className="status active">{items.length} item</span>
            )}
          </div>

          {message ? <div className={`alert ${message.includes('Gagal') ? 'error' : 'success'}`}>{message}</div> : null}
          {loading && items.length === 0 ? <ListSkeleton count={3} /> : null}

          <div className="inventory-list">
            {!loading && items.length === 0 ? (
              <div className="empty-state compact">
                <i className="fi fi-rr-box-open" aria-hidden />
                <strong>Belum ada stok</strong>
                <span>Tambah manual atau pakai starter stock.</span>
              </div>
            ) : null}

            {items.map((item) => (
              <article className={`inventory-card ${isLowStock(item) ? 'low' : ''}`} key={item.id}>
                <div>
                  <span className="inventory-icon">
                    <i className="fi fi-rr-box" aria-hidden />
                  </span>
                  <div>
                    <strong>{item.nama_barang}</strong>
                    <small>{item.kategori} - update {new Date(item.updated_at).toLocaleDateString('id-ID')}</small>
                  </div>
                </div>
                <div className="inventory-stock">
                  <strong>{Number(item.stok)}</strong>
                  <span>{item.satuan}</span>
                  <em>{isLowStock(item) ? 'Stok rendah' : 'Aman'}</em>
                </div>
                <div className="actions">
                  <button className="button secondary" onClick={() => editItem(item)} type="button">
                    <i className="fi fi-rr-edit" aria-hidden />
                    Edit
                  </button>
                  <button className="button destructive" disabled={saving} onClick={() => deleteItem(item.id)} type="button">
                    <i className="fi fi-rr-trash" aria-hidden />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
