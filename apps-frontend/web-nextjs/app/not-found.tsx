import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <main className="page">
      <section className="panel soft">
        <p className="eyebrow">Halaman tidak ditemukan</p>
        <h1>Rute ini belum tersedia.</h1>
        <p className="muted">Kembali ke dashboard sesuai role atau buat order baru dari menu utama.</p>
        <div className="actions">
          <Link className="button primary" href="/">
            <i className="fi fi-rr-home" aria-hidden />
            Ke Beranda
          </Link>
          <Link className="button secondary" href="/orders/new">
            <i className="fi fi-rr-add-document" aria-hidden />
            Buat Order
          </Link>
        </div>
      </section>
    </main>
  );
}
