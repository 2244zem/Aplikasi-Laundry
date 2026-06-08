import Link from 'next/link';
import { ArrowRight, BellRing, CreditCard, Printer, RadioTower } from 'lucide-react';

const features = [
  {
    icon: RadioTower,
    title: 'Order realtime',
    body: 'Pesanan masuk ke Supabase dan muncul di dashboard admin tanpa refresh.',
  },
  {
    icon: Printer,
    title: 'Nota thermal',
    body: 'Dashboard admin menyiapkan struk 58mm dan memicu print untuk POS laundry.',
  },
  {
    icon: CreditCard,
    title: 'Pembayaran Midtrans',
    body: 'Webhook backend mengamankan update status pembayaran dan langganan admin.',
  },
];

export default function HomePage() {
  return (
    <main className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Platform laundry B2B2C</p>
          <h1>ScaleWash menghubungkan pelanggan, outlet laundry, dan subscription admin.</h1>
          <p className="muted">
            Scaffold ini sudah tersambung ke desain Supabase, Midtrans webhook, dan alur POS
            printing untuk validasi produk awal.
          </p>
        </div>
        <div className="actions">
          <Link className="button primary" href="/orders/new">
            Buat Order
            <ArrowRight aria-hidden size={18} />
          </Link>
          <Link className="button secondary" href="/admin/dashboard">
            Dashboard Admin
            <BellRing aria-hidden size={18} />
          </Link>
        </div>
      </section>

      <section className="grid three" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {features.map((feature) => {
          const Icon = feature.icon;

          return (
            <article className="panel" key={feature.title}>
              <Icon aria-hidden color="#16587B" size={24} />
              <h2 style={{ marginTop: 14 }}>{feature.title}</h2>
              <p className="muted" style={{ marginBottom: 0 }}>
                {feature.body}
              </p>
            </article>
          );
        })}
      </section>
    </main>
  );
}
