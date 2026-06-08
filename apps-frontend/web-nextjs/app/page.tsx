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

const shopCards = [
  { name: 'Washmart', distance: '0.8 km', rating: '4.8', image: 'fi-rr-washer', promo: 'Pickup 20 menit' },
  { name: 'TumbleDry', distance: '1.4 km', rating: '4.7', image: 'fi-rr-shirt-long-sleeve', promo: 'Express ready' },
  { name: 'DhoBiLite', distance: '2.1 km', rating: '4.6', image: 'fi-rr-iron', promo: 'Parfum premium' },
];

export default function HomePage() {
  return (
    <main className="page home-screen">
      <section className="home-hero">
        <div className="home-copy">
          <p className="eyebrow">Platform laundry B2B2C</p>
          <h1>Laundry app for pickup, outlet, chat, and POS.</h1>
          <p className="muted">
            Customer pilih laundry terdekat, admin outlet menerima order yang memang ditujukan ke tokonya,
            status bergerak realtime, dan chat menyimpan bukti kondisi pakaian.
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

          <div className="home-stats">
            <span>
              <strong>4</strong>
              screen modes
            </span>
            <span>
              <strong>Realtime</strong>
              order status
            </span>
            <span>
              <strong>POS</strong>
              receipt print
            </span>
          </div>
        </div>

        <aside className="phone-preview" aria-label="Preview aplikasi ScaleWash">
          <div className="mock-phone app-preview-phone">
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
              <div className="app-search">
                <i className="fi fi-rr-search" aria-hidden />
                <span>Laundry near me</span>
              </div>
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
              <div className="app-banner">
                <div>
                  <span>Membership active</span>
                  <strong>Buat flyer promo outlet sendiri.</strong>
                </div>
                <i className="fi fi-rr-megaphone" aria-hidden />
              </div>
              <div className="shop-list-preview">
                {shopCards.slice(0, 2).map((shop) => (
                  <div className="mini-store-card" key={shop.name}>
                    <span>
                      <i className={`fi ${shop.image}`} aria-hidden />
                    </span>
                    <div>
                      <strong>{shop.name}</strong>
                      <small>{shop.distance} · {shop.rating}</small>
                    </div>
                    <em>Book</em>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section className="section-heading home-section-head">
        <div>
          <p className="eyebrow">Laundry nearby</p>
          <h2>Cards yang user memang butuh scan cepat.</h2>
        </div>
        <Link className="button secondary" href="/orders/new">
          <i className="fi fi-rr-location-crosshairs" aria-hidden />
          Cari outlet
        </Link>
      </section>

      <section className="nearby-grid">
        {shopCards.map((shop) => (
          <article className="nearby-card" key={shop.name}>
            <div className="nearby-media">
              <i className={`fi ${shop.image}`} aria-hidden />
            </div>
            <div className="nearby-content">
              <div>
                <strong>{shop.name}</strong>
                <span>{shop.promo}</span>
              </div>
              <small>{shop.rating} rating · {shop.distance}</small>
            </div>
          </article>
        ))}
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
