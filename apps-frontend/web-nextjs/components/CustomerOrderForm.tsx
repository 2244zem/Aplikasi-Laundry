'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Send } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import type { UserProfile } from '@/lib/types';

type Props = {
  profile: UserProfile;
};

export function CustomerOrderForm({ profile }: Props) {
  const [paket, setPaket] = useState('Cuci Setrika');
  const [estimasiPakaian, setEstimasiPakaian] = useState(12);
  const [alamat, setAlamat] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [catatan, setCatatan] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [createdOrderId, setCreatedOrderId] = useState('');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    setCreatedOrderId('');

    const { data, error } = await supabase
      .from('tabel_order')
      .insert({
        user_id: profile.id,
        format_detail: {
          paket,
          estimasi_pakaian: estimasiPakaian,
          alamat,
          pickup_time: pickupTime,
          catatan,
        },
        status_order: 'PENDING_CONFIRMATION',
        status_pembayaran: 'UNPAID',
      })
      .select('id')
      .single();

    setSubmitting(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setCreatedOrderId(data.id);
    setMessage('Order terkirim. Dashboard admin aktif akan menerima event realtime.');
    setAlamat('');
    setCatatan('');
    setPickupTime('');
  }

  return (
    <div className="grid two">
      <section className="panel">
        <p className="eyebrow">Order customer</p>
        <h1>Buat order laundry</h1>
        <p className="muted">
          Data masuk ke `tabel_order`; admin yang aktif dapat melihat order baru dan mencetak nota.
        </p>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field">
            <span>Paket</span>
            <select className="select" onChange={(event) => setPaket(event.target.value)} value={paket}>
              <option>Cuci Setrika</option>
              <option>Cuci Kering</option>
              <option>Setrika Saja</option>
              <option>Express 6 Jam</option>
            </select>
          </label>

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
            <Send aria-hidden size={18} />
            {submitting ? 'Mengirim...' : 'Kirim Order'}
          </button>
        </form>

        {message ? (
          <div className={`alert ${createdOrderId ? 'success' : 'error'}`}>
            {message}
            {createdOrderId ? ` ID: ${createdOrderId.slice(0, 8)}` : ''}
            {createdOrderId ? (
              <div style={{ marginTop: 10 }}>
                <Link className="button secondary" href={`/orders/${createdOrderId}/chat`}>
                  Buka Chat
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <aside className="panel soft">
        <h2>Preview payload</h2>
        <div className="receipt-preview">
          <p>SCALEWASH ORDER</p>
          <p>User: {profile.nama}</p>
          <p>Paket: {paket}</p>
          <p>Estimasi: {estimasiPakaian} pcs</p>
          <p>Status: PENDING_CONFIRMATION</p>
        </div>
      </aside>
    </div>
  );
}
