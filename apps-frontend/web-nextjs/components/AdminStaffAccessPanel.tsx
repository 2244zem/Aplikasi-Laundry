'use client';

import { useEffect, useMemo, useState } from 'react';
import { canManageFinance, operatorOutletId } from '@/lib/access';
import { supabase } from '@/lib/supabaseClient';
import type { UserProfile } from '@/lib/types';

type StaffRole = 'OWNER' | 'KASIR' | 'TUKANG_CUCI';

type Props = {
  profile: UserProfile;
};

const staffRoles: Array<{ body: string; label: StaffRole }> = [
  { body: 'Akses penuh outlet kecuali superadmin.', label: 'OWNER' },
  { body: 'Timbang, input harga, order, dan stok.', label: 'KASIR' },
  { body: 'Fokus status kerja dan chat order.', label: 'TUKANG_CUCI' },
];

export function AdminStaffAccessPanel({ profile }: Props) {
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('KASIR');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const outletId = operatorOutletId(profile);
  const canManage = canManageFinance(profile);

  const staffCount = useMemo(() => staff.filter((item) => item.staff_outlet_id === outletId).length, [outletId, staff]);

  async function loadStaff() {
    if (!canManage) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage('');

    const { data, error } = await supabase
      .from('tabel_user')
      .select('*')
      .eq('staff_outlet_id', outletId)
      .order('nama', { ascending: true });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setStaff((data ?? []) as UserProfile[]);
  }

  useEffect(() => {
    void loadStaff();
  }, [canManage, outletId]);

  async function assignStaff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    const { data, error } = await supabase
      .from('tabel_user')
      .update({
        staff_outlet_id: outletId,
        staff_role: role,
      })
      .eq('email', email.trim().toLowerCase())
      .eq('role', 'USER')
      .select('*')
      .maybeSingle();

    setSaving(false);

    if (error || !data) {
      setMessage(error?.message || 'User belum ditemukan. Staff harus daftar akun customer dulu.');
      return;
    }

    setEmail('');
    setMessage(`${data.nama} menjadi ${role}.`);
    await loadStaff();
  }

  async function removeStaff(staffId: string) {
    setSaving(true);
    setMessage('');

    const { error } = await supabase
      .from('tabel_user')
      .update({
        staff_outlet_id: null,
        staff_role: null,
      })
      .eq('id', staffId);

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Akses staff dicabut.');
    await loadStaff();
  }

  if (!canManage) {
    return (
      <section className="app-card">
        <p className="eyebrow">Staff outlet</p>
        <h2>Akses staff hanya untuk owner.</h2>
        <p className="muted">Kasir dan tukang cuci tetap bisa bekerja dari dashboard sesuai role yang diberikan owner.</p>
      </section>
    );
  }

  return (
    <section className="staff-panel app-card">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">RBAC outlet</p>
          <h2>Staff & hak akses</h2>
          <p className="muted">{staffCount} staff terhubung ke outlet ini.</p>
        </div>
        <button className="button secondary" disabled={loading} onClick={loadStaff} type="button">
          <i className="fi fi-rr-refresh" aria-hidden />
          Refresh
        </button>
      </div>

      <form className="staff-form" onSubmit={assignStaff}>
        <label className="field">
          <span>Email akun staff</span>
          <input
            className="input"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="staff@email.com"
            required
            type="email"
            value={email}
          />
        </label>
        <div className="choice-grid staff-role-grid">
          {staffRoles.map((item) => (
            <button
              className={`choice-pill ${role === item.label ? 'active' : ''}`}
              key={item.label}
              onClick={() => setRole(item.label)}
              type="button"
            >
              <i className="fi fi-rr-user-gear" aria-hidden />
              <span>
                <strong>{item.label}</strong>
                <small>{item.body}</small>
              </span>
            </button>
          ))}
        </div>
        <button className="button primary" disabled={saving} type="submit">
          <i className="fi fi-rr-user-add" aria-hidden />
          Tambah Staff
        </button>
      </form>

      <div className="staff-list">
        {!loading && staff.length === 0 ? (
          <div className="empty-state compact">
            <i className="fi fi-rr-users" aria-hidden />
            <strong>Belum ada staff</strong>
            <span>Masukkan email user yang sudah daftar, lalu pilih rolenya.</span>
          </div>
        ) : null}

        {staff.map((item) => (
          <article className="staff-card" key={item.id}>
            <span className="conversation-avatar">
              <i className="fi fi-rr-user" aria-hidden />
            </span>
            <div>
              <strong>{item.nama}</strong>
              <small>{item.email}</small>
            </div>
            <span className="status active">{item.staff_role}</span>
            <button className="button destructive" disabled={saving} onClick={() => removeStaff(item.id)} type="button">
              <i className="fi fi-rr-trash" aria-hidden />
            </button>
          </article>
        ))}
      </div>

      {message ? <div className={`alert ${message.includes('menjadi') || message.includes('dicabut') ? 'success' : 'error'}`}>{message}</div> : null}
    </section>
  );
}
