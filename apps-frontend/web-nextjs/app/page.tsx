import Link from 'next/link';

const features = [
  {
    icon: 'fi-rr-waveform-path',
    title: 'Order realtime',
    body: 'Admin menerima update order dari outlet yang dipilih user, bukan queue random.',
  },
  {
    icon: 'fi-rr-print',
    title: 'Nota thermal',
    body: 'Dashboard admin menyiapkan struk 58mm dan memicu print untuk POS laundry.',
  },
  {
    icon: 'fi-rr-comment-alt',
    title: 'Chat & status live',
    body: 'User melihat perubahan status dan chat bukti pakaian di satu layar.',
  },
];

const shopCards = [
  { name: 'Washmart', distance: '0.8 km', rating: '4.8', image: 'fi-rr-washer', promo: 'Pickup 20 menit' },
  { name: 'TumbleDry', distance: '1.4 km', rating: '4.7', image: 'fi-rr-shirt-long-sleeve', promo: 'Express ready' },
  { name: 'DhoBiLite', distance: '2.1 km', rating: '4.6', image: 'fi-rr-iron', promo: 'Parfum premium' },
];

const workflowCards = [
  {
    href: '/orders/new',
    icon: 'fi-rr-location-crosshairs',
    title: 'Cari outlet dekat user',
    body: 'User aktifkan lokasi, pilih laundry, lalu order masuk ke outlet itu.',
  },
  {
    href: '/admin/dashboard',
    icon: 'fi-rr-megaphone',
    title: 'Flyer membership admin',
    body: 'Admin aktif bisa edit promo, warna, nama toko, dan lokasi outlet.',
  },
  {
    href: '/orders/new',
    icon: 'fi-rr-badge-check',
    title: 'Progress realtime',
    body: 'Status admin tampil di sisi user dengan progress bar dan live chat.',
  },
];

export default function HomePage() {
  return (
    <main className="page home-screen">
      <section className="home-hero no-mockup">
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
              <strong>Outlet</strong>
              selected by user
            </span>
            <span>
              <strong>Realtime</strong>
              order status
            </span>
            <span>
              <strong>Flyer</strong>
              admin promo
            </span>
          </div>
        </div>

        <aside className="workflow-panel" aria-label="Fitur nyata ScaleWash">
          <div className="workflow-header">
            <span className="ad-pill">Real features</span>
            <h2>Preview lama sudah jadi workflow asli.</h2>
            <p>Tidak ada mock phone kosong. Tiap card di sini menuju fitur yang bisa dipakai.</p>
          </div>

          {workflowCards.map((card) => (
            <Link className="workflow-card" href={card.href} key={card.title}>
              <span>
                <i className={`fi ${card.icon}`} aria-hidden />
              </span>
              <div>
                <strong>{card.title}</strong>
                <small>{card.body}</small>
              </div>
              <i className="fi fi-rr-angle-small-right" aria-hidden />
            </Link>
          ))}

          <div className="real-mini-board">
            <div className="app-search">
              <i className="fi fi-rr-search" aria-hidden />
              <span>Laundry terdekat muncul di Order page</span>
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
              <small>{shop.rating} rating - {shop.distance}</small>
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
