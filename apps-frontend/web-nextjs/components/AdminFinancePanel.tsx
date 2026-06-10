'use client';

import { useEffect, useMemo, useState } from 'react';
import { ListSkeleton, MetricSkeleton, SkeletonBlock } from '@/components/Skeleton';
import { canManageFinance, operatorOutletId } from '@/lib/access';
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

type ChartPoint = {
  label: string;
  value: number;
};

function daysInPeriod(period: string) {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

function smoothPath(points: { x: number; y: number }[]) {
  if (points.length === 0) {
    return '';
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  return points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }

    const previous = points[index - 1];
    const controlDistance = (point.x - previous.x) / 2;

    return `${path} C ${previous.x + controlDistance} ${previous.y}, ${point.x - controlDistance} ${point.y}, ${point.x} ${point.y}`;
  }, '');
}

function FinanceAreaChart({ data, total }: { data: ChartPoint[]; total: number }) {
  const width = 640;
  const height = 180;
  const padding = 14;
  const chartBottom = height - padding;
  const values = data.map((item) => item.value);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const range = Math.max(1, max - min);
  const points = data.map((item, index) => ({
    x: padding + (index / Math.max(1, data.length - 1)) * (width - padding * 2),
    y: padding + ((max - item.value) / range) * (height - padding * 2),
  }));
  const linePath = smoothPath(points);
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x} ${chartBottom} L ${points[0].x} ${chartBottom} Z`
    : '';
  const lastPoint = points[points.length - 1];

  return (
    <section className="panel finance-chart-panel">
      <div className="finance-chart-head">
        <div>
          <p className="eyebrow">Grafik neraca</p>
          <h2>Arus bersih bulan ini</h2>
        </div>
        <strong>{formatCurrency(total)}</strong>
      </div>
      <div className="finance-chart" aria-label="Grafik area neraca bulanan">
        <svg viewBox={`0 0 ${width} ${height}`} role="img">
          <defs>
            <linearGradient id="financeAreaGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(149, 223, 211, 0.36)" />
              <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
            </linearGradient>
          </defs>
          {[0.2, 0.5, 0.8].map((ratio) => (
            <line
              className="finance-chart-grid"
              key={ratio}
              x1={padding}
              x2={width - padding}
              y1={padding + ratio * (height - padding * 2)}
              y2={padding + ratio * (height - padding * 2)}
            />
          ))}
          {areaPath ? <path className="finance-chart-area" d={areaPath} /> : null}
          {linePath ? <path className="finance-chart-line" d={linePath} /> : null}
          {lastPoint ? <circle className="finance-chart-dot" cx={lastPoint.x} cy={lastPoint.y} r="4" /> : null}
        </svg>
      </div>
    </section>
  );
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
  const isActiveAdmin = canManageFinance(profile);
  const outletId = operatorOutletId(profile);

  const expenseTotal = useMemo(
    () => expenses.reduce((total, expense) => total + Number(expense.nominal), 0),
    [expenses],
  );
  const grossTotal = Number(balance?.total_pendapatan_kotor ?? 0);
  const cleanTotal = Number(balance?.pendapatan_bersih ?? grossTotal - expenseTotal);
  const chartData = useMemo(() => {
    const days = daysInPeriod(period);
    const dailyExpenses = new Map<number, number>();

    expenses.forEach((expense) => {
      const day = new Date(expense.created_at).getDate();
      dailyExpenses.set(day, (dailyExpenses.get(day) ?? 0) + Number(expense.nominal || 0));
    });

    let runningExpense = 0;

    return Array.from({ length: days }).map((_, index) => {
      const day = index + 1;
      runningExpense += dailyExpenses.get(day) ?? 0;

      return {
        label: `${day}`,
        value: (grossTotal * day) / days - runningExpense,
      };
    });
  }, [expenses, grossTotal, period]);

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
        .eq('admin_id', outletId)
        .gte('created_at', monthStart)
        .lt('created_at', nextMonthIso)
        .order('created_at', { ascending: false }),
      supabase
        .from('tabel_neraca_bulanan')
        .select('*')
        .eq('admin_id', outletId)
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
  }, [isActiveAdmin, period, outletId]);

  async function handleCreateExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    const { error } = await supabase.from('tabel_pengeluaran').insert({
      admin_id: outletId,
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
              <i className="fi fi-rr-refresh" aria-hidden />
              Refresh
            </button>
          </div>
        </div>
      </section>

      <section className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {loading && !balance && expenses.length === 0 ? (
          <>
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </>
        ) : (
          <>
            <article className="panel">
              <p className="eyebrow">Pendapatan kotor</p>
              <h2>{formatCurrency(grossTotal)}</h2>
            </article>
            <article className="panel">
              <p className="eyebrow">Pengeluaran</p>
              <h2>{formatCurrency(Number(balance?.total_pengeluaran ?? expenseTotal))}</h2>
            </article>
            <article className="panel">
              <p className="eyebrow">Pendapatan bersih</p>
              <h2>{formatCurrency(cleanTotal)}</h2>
            </article>
          </>
        )}
      </section>

      {loading && !balance && expenses.length === 0 ? (
        <section className="panel finance-chart-panel" aria-hidden>
          <div className="finance-chart-head">
            <div>
              <SkeletonBlock className="skeleton-label" />
              <SkeletonBlock className="skeleton-line short" />
            </div>
            <SkeletonBlock className="skeleton-value" />
          </div>
          <SkeletonBlock className="finance-chart" />
        </section>
      ) : (
        <FinanceAreaChart data={chartData} total={cleanTotal} />
      )}

      <section className="grid two">
        <form className="panel form-grid" onSubmit={handleCreateExpense}>
          <div>
            <p className="eyebrow">Pengeluaran baru</p>
            <h2>Catat biaya operasional</h2>
          </div>

          <div className="field">
            <span>Kategori</span>
            <div className="choice-grid finance-category-grid" role="listbox" aria-label="Kategori pengeluaran">
              {categories.map((item) => (
                <button
                  aria-selected={category === item}
                  className={`choice-pill ${category === item ? 'active' : ''}`}
                  key={item}
                  onClick={() => setCategory(item)}
                  type="button"
                >
                  <i className="fi fi-rr-tag" aria-hidden />
                  {item}
                </button>
              ))}
            </div>
          </div>

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
            <i className="fi fi-rr-plus" aria-hidden />
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
                {loading && expenses.length === 0 ? (
                  <tr>
                    <td colSpan={3}>
                      <ListSkeleton count={3} />
                    </td>
                  </tr>
                ) : null}
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
