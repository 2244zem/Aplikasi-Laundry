'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import type { Expense, ExpenseCategory, MonthlyBalance, UserProfile } from '@/lib/types';

const categories: ExpenseCategory[] = ['SABUN', 'PARFUM', 'LISTRIK', 'GAJI', 'SEWA', 'MAINTENANCE', 'LAINNYA'];

type Props = {
  profile: UserProfile;
};

function currentPeriod() {
  return new Intl.DateTimeFormat('en-CA', {
    month: '2-digit',
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
  })
    .format(new Date())
    .slice(0, 7);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    currency: 'IDR',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value || 0);
}

export function AdminFinancePanel({ profile }: Props) {
  const [period, setPeriod] = useState(currentPeriod());
  const [category, setCategory] = useState<ExpenseCategory>('SABUN');
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balance, setBalance] = useState<MonthlyBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const isActiveAdmin =
    profile.role === 'SUPERADMIN' || (profile.role === 'ADMIN' && profile.status_langganan === 'ACTIVE');

  const expenseTotal = useMemo(
    () => expenses.reduce((total, expense) => total + Number(expense.nominal), 0),
    [expenses],
  );

  async function loadFinance() {
    setLoading(true);
    setMessage('');

    const monthStart = `${period}-01T00:00:00+07:00`;
    const [year, month] = period.split('-').map(Number);
    const nextMonth = new Date(Date.UTC(year, month, 1));
    const nextMonthIso = nextMonth.toISOString();

    const [expensesResult, balanceResult] = await Promise.all([
      supabase
        .from('tabel_pengeluaran')
        .select('*')
        .eq('admin_id', profile.id)
        .gte('created_at', monthStart)
        .lt('created_at', nextMonthIso)
        .order('created_at', { ascending: false }),
      supabase
        .from('tabel_neraca_bulanan')
        .select('*')
        .eq('admin_id', profile.id)
        .eq('bulan_tahun', period)
        .maybeSingle(),
    ]);

    setLoading(false);

    if (expensesResult.error) {
      setMessage(expensesResult.error.message);
      return;
    }

    if (balanceResult.error) {
      setMessage(balanceResult.error.message);
      return;
    }

    setExpenses((expensesResult.data ?? []) as Expense[]);
    setBalance((balanceResult.data as MonthlyBalance | null) ?? null);
  }

  useEffect(() => {
    if (!isActiveAdmin) {
      setLoading(false);
      return;
    }

    void loadFinance();
  }, [isActiveAdmin, period, profile.id]);

  async function handleCreateExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    const { error } = await supabase.from('tabel_pengeluaran').insert({
      admin_id: profile.id,
      kategori: category,
      nominal: amount,
      keterangan: note.trim() || null,
    });

    if (error) {
      setLoading(false);
      setMessage(error.message);
      return;
    }

    setAmount(0);
    setNote('');
    setMessage('Pengeluaran tersimpan. Neraca bulanan diperbarui oleh finance-service.');
    await loadFinance();
  }

  if (!isActiveAdmin) {
    return (
      <section className="panel">
        <p className="eyebrow">Finance</p>
        <h1>Langganan admin belum aktif</h1>
        <p className="muted">Aktifkan subscription admin untuk mencatat pengeluaran outlet.</p>
      </section>
    );
  }

  return (
    <div className="grid">
      <section className="panel soft">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <div>
            <p className="eyebrow">Finance outlet</p>
            <h1>Neraca bulanan</h1>
            <p className="muted" style={{ marginBottom: 0 }}>
              Periode {period}
            </p>
          </div>
          <div className="actions">
            <input className="input" onChange={(event) => setPeriod(event.target.value)} type="month" value={period} />
            <button className="button secondary" disabled={loading} onClick={loadFinance} type="button">
              <RefreshCw aria-hidden size={18} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      <section className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <article className="panel">
          <p className="eyebrow">Pendapatan kotor</p>
          <h2>{formatCurrency(Number(balance?.total_pendapatan_kotor ?? 0))}</h2>
        </article>
        <article className="panel">
          <p className="eyebrow">Pengeluaran</p>
          <h2>{formatCurrency(Number(balance?.total_pengeluaran ?? expenseTotal))}</h2>
        </article>
        <article className="panel">
          <p className="eyebrow">Pendapatan bersih</p>
          <h2>{formatCurrency(Number(balance?.pendapatan_bersih ?? -expenseTotal))}</h2>
        </article>
      </section>

      <section className="grid two">
        <form className="panel form-grid" onSubmit={handleCreateExpense}>
          <div>
            <p className="eyebrow">Pengeluaran baru</p>
            <h2>Catat biaya operasional</h2>
          </div>

          <label className="field">
            <span>Kategori</span>
            <select className="select" onChange={(event) => setCategory(event.target.value as ExpenseCategory)} value={category}>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Nominal</span>
            <input
              className="input"
              min={0}
              onChange={(event) => setAmount(Number(event.target.value))}
              required
              step="500"
              type="number"
              value={amount}
            />
          </label>

          <label className="field">
            <span>Keterangan</span>
            <textarea className="textarea" onChange={(event) => setNote(event.target.value)} value={note} />
          </label>

          <button className="button primary" disabled={loading} type="submit">
            <Plus aria-hidden size={18} />
            Simpan Pengeluaran
          </button>
        </form>

        <section className="panel">
          <div className="page-header">
            <div>
              <p className="eyebrow">Riwayat</p>
              <h2>Pengeluaran bulan ini</h2>
            </div>
            <span className="status active">{expenses.length} item</span>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Kategori</th>
                  <th>Nominal</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>{new Date(expense.created_at).toLocaleDateString('id-ID')}</td>
                    <td>
                      <strong>{expense.kategori}</strong>
                      <p className="muted" style={{ margin: '4px 0 0' }}>
                        {expense.keterangan ?? '-'}
                      </p>
                    </td>
                    <td>{formatCurrency(Number(expense.nominal))}</td>
                  </tr>
                ))}
                {!loading && expenses.length === 0 ? (
                  <tr>
                    <td colSpan={3}>
                      <p className="muted" style={{ margin: 0 }}>
                        Belum ada pengeluaran pada periode ini.
                      </p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      {message ? <div className={`alert ${message.includes('tersimpan') ? 'success' : 'error'}`}>{message}</div> : null}
    </div>
  );
}
