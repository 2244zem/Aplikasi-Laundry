'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ensureProfile } from '@/lib/profile';
import { getValidatedAuthSession } from '@/lib/authSession';
import { useAppLanguage } from '@/lib/i18n';
import type { UserProfile } from '@/lib/types';
import { UserDashboard } from '@/components/UserDashboard';

const shopCards = [
  { name: 'Washmart', distance: '0.8 km', rating: '4.8', image: 'fi-rr-washer', promo: 'Pickup 20 menit' },
  { name: 'TumbleDry', distance: '1.4 km', rating: '4.7', image: 'fi-rr-shirt-long-sleeve', promo: 'Express ready' },
  { name: 'DhoBiLite', distance: '2.1 km', rating: '4.6', image: 'fi-rr-iron', promo: 'Parfum premium' },
];

const copy = {
  id: {
    eyebrow: 'Ungu Laundry B2B2C',
    title: 'Aplikasi laundry modern untuk pickup, outlet, chat, dan POS.',
    androidTitle: 'Laundry pickup modern.',
    body: 'Customer memilih laundry terdekat, order masuk ke outlet yang dipilih, status bergerak realtime, dan chat menyimpan bukti kondisi pakaian.',
    order: 'Buat Order',
    admin: 'Dashboard Admin',
    history: 'Riwayat',
    realFeatures: 'Fitur nyata',
    featureTitle: 'Preview lama sudah jadi workflow asli.',
    featureBody: 'Tidak ada mock phone kosong. Tiap card menuju fitur yang bisa dipakai.',
    nearby: 'Laundry terdekat',
    nearbyTitle: 'Outlet yang mudah discan customer.',
    findOutlet: 'Cari outlet',
    adminPortal: 'Portal admin',
    adminBody: 'Kamu login sebagai admin. Buka dasbor untuk menerima pesanan, chat, stok, dan keuangan.',
    dashboard: 'Dasbor',
    statOutlet: 'dipilih user',
    statRealtime: 'status pesanan',
    statFlyer: 'promo admin',
  },
  en: {
    eyebrow: 'Ungu Laundry B2B2C',
    title: 'Modern laundry app for pickup, outlets, chat, and POS.',
    androidTitle: 'Modern laundry pickup.',
    body: 'Customers choose nearby laundry outlets, orders go to the selected outlet, status updates in realtime, and chat stores garment proof.',
    order: 'Create Order',
    admin: 'Admin Dashboard',
    history: 'History',
    realFeatures: 'Real features',
    featureTitle: 'The old preview is now a working flow.',
    featureBody: 'No empty phone mockup. Every card leads to a usable feature.',
    nearby: 'Nearby laundry',
    nearbyTitle: 'Outlet cards customers can scan quickly.',
    findOutlet: 'Find outlet',
    adminPortal: 'Admin portal',
    adminBody: 'You are logged in as admin. Open dashboard to manage orders, chat, stock, and finance.',
    dashboard: 'Dashboard',
    statOutlet: 'selected by user',
    statRealtime: 'order status',
    statFlyer: 'admin promo',
  },
};

const workflowCards = {
  id: [
    { href: '/orders/new', icon: 'fi-rr-location-crosshairs', title: 'Cari outlet dekat user', body: 'User aktifkan lokasi, pilih laundry, lalu order masuk ke outlet itu.' },
    { href: '/admin/dashboard', icon: 'fi-rr-tags', title: 'Harga layanan outlet', body: 'Customer memilih layanan aktif dan preview harga otomatis mengikuti outlet.' },
    { href: '/orders/history', icon: 'fi-rr-ballot', title: 'Riwayat order user', body: 'Timeline order, tagihan, dan tombol chat mengikuti status realtime.' },
    { href: '/admin/chat', icon: 'fi-rr-comment-alt', title: 'Inbox chat admin', body: 'Admin melihat pesan masuk, unread badge, dan quick reply status.' },
    { href: '/orders/payment', icon: 'fi-rr-credit-card', title: 'Bayar Midtrans', body: 'Customer menekan Bayar Sekarang dan status pembayaran berubah realtime dari webhook.' },
  ],
  en: [
    { href: '/orders/new', icon: 'fi-rr-location-crosshairs', title: 'Find nearby outlet', body: 'Users enable location, choose laundry, and route orders to that outlet.' },
    { href: '/admin/dashboard', icon: 'fi-rr-tags', title: 'Outlet service pricing', body: 'Customers choose active services and price previews follow the selected outlet.' },
    { href: '/orders/history', icon: 'fi-rr-ballot', title: 'User order history', body: 'Order timeline, bills, and chat buttons follow realtime status.' },
    { href: '/admin/chat', icon: 'fi-rr-comment-alt', title: 'Admin chat inbox', body: 'Admins see incoming messages, unread badges, and quick status replies.' },
    { href: '/orders/payment', icon: 'fi-rr-credit-card', title: 'Midtrans payment', body: 'Customers tap Pay Now and payment status changes realtime from the webhook.' },
  ],
};

const features = {
  id: [
    { icon: 'fi-rr-waveform-path', title: 'Order realtime', body: 'Admin menerima update order dari outlet yang dipilih user.' },
    { icon: 'fi-rr-print', title: 'Nota thermal', body: 'Dashboard admin menyiapkan struk 58mm untuk POS laundry.' },
    { icon: 'fi-rr-tags', title: 'Harga layanan', body: 'Setiap outlet bisa mengatur harga cuci kering, cuci setrika, dan express.' },
    { icon: 'fi-rr-credit-card', title: 'Pembayaran', body: 'Tombol Midtrans membuat transaksi, webhook mengubah status pembayaran realtime.' },
  ],
  en: [
    { icon: 'fi-rr-waveform-path', title: 'Realtime orders', body: 'Admins receive updates for orders routed to their outlet.' },
    { icon: 'fi-rr-print', title: 'Thermal receipt', body: 'The admin dashboard prepares 58mm POS receipts.' },
    { icon: 'fi-rr-tags', title: 'Service pricing', body: 'Each outlet manages dry wash, wash iron, and express pricing.' },
    { icon: 'fi-rr-credit-card', title: 'Payment', body: 'The Midtrans button creates a transaction and webhooks update payment status in realtime.' },
  ],
};

export function HomeExperience() {
  const language = useAppLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const t = copy[language];

  function withCurrentContext(path: string) {
    const params = new URLSearchParams();

    ['isandroid', 'istablet', 'isdesktop', 'lang'].forEach((key) => {
      const value = searchParams.get(key);
      if (searchParams.has(key)) {
        params.set(key, value ?? '');
      }
    });

    const query = params.toString();
    return `${path}${query ? `?${query}` : ''}`;
  }

  useEffect(() => {
    let mounted = true;

    async function loadSessionProfile() {
      const { user } = await getValidatedAuthSession();

      if (!user) {
        if (mounted) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      const nextProfile = await ensureProfile(user);

      if (mounted) {
        setProfile(nextProfile);
        setLoading(false);
      }
    }

    void loadSessionProfile();

    return () => {
      mounted = false;
    };
  }, []);

  const isAdminProfile = profile?.role === 'ADMIN' || profile?.role === 'SUPERADMIN' || Boolean(profile?.staff_role);

  useEffect(() => {
    if (isAdminProfile) {
      router.replace(withCurrentContext('/admin/dashboard'));
    }
  }, [isAdminProfile, router, searchParams]);

  if (loading) {
    return (
      <main className="page user-dashboard-screen">
        <section className="panel soft auth-skeleton">
          <span className="skeleton skeleton-label" />
          <span className="skeleton skeleton-value" />
          <span className="skeleton skeleton-line" />
          <span className="skeleton skeleton-line short" />
        </section>
      </main>
    );
  }

  if (profile && !isAdminProfile) {
    return <UserDashboard profile={profile} />;
  }

  if (profile && isAdminProfile) {
    return (
      <main className="page user-dashboard-screen">
        <section className="panel soft dashboard-hero">
          <div>
            <p className="eyebrow">{t.adminPortal}</p>
            <h1>Membuka {t.dashboard.toLowerCase()}...</h1>
            <p className="muted">{t.adminBody}</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page home-screen">
      <section className="home-hero no-mockup">
        <div className="android-showcase-card" aria-hidden="true">
          <div className="android-showcase-visual">
            <span className="android-scene-orb" />
            <span className="android-scene-machine">
              <i className="fi fi-rr-washer" aria-hidden />
            </span>
            <span className="android-scene-shirt">
              <i className="fi fi-rr-shirt-long-sleeve" aria-hidden />
            </span>
          </div>
          <div className="android-showcase-info">
            <div>
              <strong>{language === 'id' ? 'Pickup siap' : 'Pickup ready'}</strong>
              <span>{language === 'id' ? 'Outlet premium terdekat' : 'Nearby premium outlet'}</span>
            </div>
            <em>4.8</em>
          </div>
        </div>

        <div className="home-copy">
          <p className="eyebrow">{t.eyebrow}</p>
          <h1>
            <span className="home-title-full">{t.title}</span>
            <span className="home-title-android">{t.androidTitle}</span>
          </h1>
          <p className="muted">{t.body}</p>
          <div className="actions hero-actions">
            <Link className="button primary" href="/orders/new">
              <span className="motion-icon">
                <i className="fi fi-rr-add-document" aria-hidden />
              </span>
              {t.order}
            </Link>
            <Link className="button secondary" href="/orders/history">
              <span className="motion-icon">
                <i className="fi fi-rr-ballot" aria-hidden />
              </span>
              {t.history}
            </Link>
          </div>

          <div className="home-stats">
            <span>
              <strong>Outlet</strong>
              {t.statOutlet}
            </span>
            <span>
              <strong>Realtime</strong>
              {t.statRealtime}
            </span>
            <span>
              <strong>Flyer</strong>
              {t.statFlyer}
            </span>
          </div>
        </div>

        <aside className="workflow-panel" aria-label="Fitur nyata Ungu Laundry">
          <div className="workflow-header">
            <span className="ad-pill">{t.realFeatures}</span>
            <h2>{t.featureTitle}</h2>
            <p>{t.featureBody}</p>
          </div>

          {workflowCards[language].map((card) => (
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
        </aside>
      </section>

      <section className="section-heading home-section-head">
        <div>
          <p className="eyebrow">{t.nearby}</p>
          <h2>{t.nearbyTitle}</h2>
        </div>
        <Link className="button secondary" href="/orders/new">
          <i className="fi fi-rr-location-crosshairs" aria-hidden />
          {t.findOutlet}
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
        {features[language].map((feature) => (
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
