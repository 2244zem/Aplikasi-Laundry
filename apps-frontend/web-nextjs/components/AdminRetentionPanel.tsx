'use client';

import { useEffect, useState } from 'react';
import { canManageFinance, operatorOutletId } from '@/lib/access';
import { supabase } from '@/lib/supabaseClient';
import type { CustomerRetentionQueue, LaundryOrder, UserProfile } from '@/lib/types';

type Props = {
  profile: UserProfile;
};

type OrderWithUser = LaundryOrder & {
  tabel_user?: {
    id: string;
    nama: string;
    email: string;
  };
};

export function AdminRetentionPanel({ profile }: Props) {
  const [queue, setQueue] = useState<CustomerRetentionQueue[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const outletId = operatorOutletId(profile);
  const canManage = canManageFinance(profile);

  async function loadQueue() {
    if (!canManage) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from('tabel_customer_retention_queue')
      .select('*')
      .eq('admin_id', outletId)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .limit(12);

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setQueue((data ?? []) as CustomerRetentionQueue[]);
  }

  useEffect(() => {
    void loadQueue();
  }, [canManage, outletId]);

  async function generateQueue() {
    setRunning(true);
    setMessage('');

    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 14);

    const { data, error } = await supabase
      .from('tabel_order')
      .select('*, tabel_user:user_id(id,nama,email)')
      .eq('admin_outlet_id', outletId)
      .eq('status_order', 'SELESAI')
      .lt('updated_at', threshold.toISOString())
      .order('updated_at', { ascending: false })
      .limit(80);

    if (error) {
      setRunning(false);
      setMessage(error.message);
      return;
    }

    const latestByUser = new Map<string, OrderWithUser>();
    ((data ?? []) as OrderWithUser[]).forEach((order) => {
      if (!latestByUser.has(order.user_id)) {
        latestByUser.set(order.user_id, order);
      }
    });

    const payload = Array.from(latestByUser.values()).map((order) => ({
      admin_id: outletId,
      last_order_at: order.updated_at,
      metadata: {
        email: order.tabel_user?.email,
        order_id: order.id,
        paket: order.format_detail?.paket,
      },
      suggested_message: `Halo ${order.tabel_user?.nama || 'kak'}! Sudah 14 hari belum laundry lagi. Ada diskon 10% khusus untuk layanan ${order.format_detail?.paket || 'favorit'} minggu ini di Ungu Laundry.`,
      user_id: order.user_id,
    }));

    if (payload.length > 0) {
      const { data: existingQueue, error: existingError } = await supabase
        .from('tabel_customer_retention_queue')
        .select('user_id')
        .eq('admin_id', outletId)
        .eq('status', 'PENDING')
        .in('user_id', payload.map((item) => item.user_id));

      if (existingError) {
        setRunning(false);
        setMessage(existingError.message);
        return;
      }

      const existingUserIds = new Set((existingQueue ?? []).map((item) => item.user_id));
      const nextPayload = payload.filter((item) => !existingUserIds.has(item.user_id));

      if (nextPayload.length > 0) {
        const { error: insertError } = await supabase.from('tabel_customer_retention_queue').insert(nextPayload);

        if (insertError) {
          setRunning(false);
          setMessage(insertError.message);
          return;
        }
      }
    }

    setRunning(false);
    setMessage(`${payload.length} kandidat retensi diproses.`);
    await loadQueue();
  }

  async function markQueue(id: string, status: CustomerRetentionQueue['status']) {
    const { error } = await supabase
      .from('tabel_customer_retention_queue')
      .update({
        sent_at: status === 'SENT' ? new Date().toISOString() : null,
        status,
      })
      .eq('id', id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadQueue();
  }

  if (!canManage) {
    return null;
  }

  return (
    <section className="retention-panel app-card">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">CRM retensi</p>
          <h2>Customer idle 14 hari</h2>
          <p className="muted">Queue ini siap disambungkan ke provider WhatsApp saat token bisnis tersedia.</p>
        </div>
        <button className="button secondary" disabled={running || loading} onClick={generateQueue} type="button">
          <i className="fi fi-rr-bell-ring" aria-hidden />
          {running ? 'Memindai' : 'Scan Retensi'}
        </button>
      </div>

      <div className="retention-list">
        {!loading && queue.length === 0 ? (
          <div className="empty-state compact">
            <i className="fi fi-rr-heart-partner-handshake" aria-hidden />
            <strong>Belum ada queue</strong>
            <span>Jalankan scan setelah data order selesai sudah cukup.</span>
          </div>
        ) : null}

        {queue.map((item) => (
          <article className="retention-card" key={item.id}>
            <div>
              <strong>{item.suggested_message}</strong>
              <small>Last order {item.last_order_at ? new Date(item.last_order_at).toLocaleDateString('id-ID') : '-'}</small>
            </div>
            <div className="actions">
              <button className="button primary" onClick={() => markQueue(item.id, 'SENT')} type="button">
                Tandai Terkirim
              </button>
              <button className="button ghost" onClick={() => markQueue(item.id, 'SKIPPED')} type="button">
                Skip
              </button>
            </div>
          </article>
        ))}
      </div>

      {message ? <div className={`alert ${message.includes('diproses') ? 'success' : 'error'}`}>{message}</div> : null}
    </section>
  );
}
