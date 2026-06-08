import Link from 'next/link';

const features = [
  {
    icon: 'fi-rr-waveform-path',
    title: 'Order realtime',
    body: 'Pesanan masuk ke Supabase dan muncul di dashboard admin tanpa refresh.',
  },
  {
    icon: 'fi-rr-print',
    title: 'Nota thermal',
    body: 'Dashboard admin menyiapkan struk 58mm dan memicu print untuk POS laundry.',
  },
  {
    icon: 'fi-rr-credit-card',
    title: 'Pembayaran Midtrans',
    body: 'Webhook backend mengamankan update status pembayaran dan langganan admin.',
  },
];

export default function HomePage() {
  return (
    <main className="page">
      <section className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">Platform laundry B2B2C</p>
          <h1>Laundry operations yang terasa seperti app modern, bukan form internal lama.</h1>
          <p className="muted">
            ScaleWash menyatukan order customer, dashboard outlet, chat bukti kondisi pakaian,
            neraca bulanan, pembayaran Midtrans, dan POS print dalam satu alur yang cepat discan.
          </p>
          <div className="actions hero-actions">
            <Link className="button primary" href="/orders/new">
              <span className="motion-icon">
                <i className="fi fi-rr-add-document" aria-hidden />
              </span>
              Buat Order
            </Link>
            <Link className="button secondary" href="/admin/dashboard">
              <span className="motion-icon">
                <i className="fi fi-rr-apps" aria-hidden />
              </span>
              Dashboard Admin
            </Link>
          </div>
        </div>

        <aside className="hero-visual" aria-label="Preview aplikasi ScaleWash">
          <div className="mock-phone">
            <div className="mock-phone-header">
              <div className="mock-user">
                <span className="mock-avatar" />
                <div>
                  <strong>Home</strong>
                  <p className="mock-caption muted">Outlet nearby</p>
                </div>
              </div>
              <i className="fi fi-rr-bell" aria-hidden />
            </div>
            <div className="mock-body">
              <div className="service-row">
                <div className="service-tile">
                  <i className="fi fi-rr-washer" aria-hidden />
                  Washing
                </div>
                <div className="service-tile">
                  <i className="fi fi-rr-iron" aria-hidden />
                  Ironing
                </div>
                <div className="service-tile">
                  <i className="fi fi-rr-tshirt" aria-hidden />
                  Dry clean
                </div>
              </div>
              <div className="promo-strip">
                <strong>Express pickup ready</strong>
                <span className="promo-copy">Auto-print nota saat order baru masuk.</span>
              </div>
              <div className="order-card">
                <strong>ORDER NO-1299</strong>
                <span className="muted">Cuci Setrika - PENDING_CONFIRMATION</span>
                <span className="status active">Realtime</span>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section className="grid three feature-grid">
        {features.map((feature) => (
          <article className="panel feature-card" key={feature.title}>
            <i className={`fi ${feature.icon}`} aria-hidden />
            <h2>{feature.title}</h2>
            <p className="muted feature-copy">{feature.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
