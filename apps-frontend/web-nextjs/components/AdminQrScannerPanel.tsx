'use client';

import { useEffect, useRef, useState } from 'react';
import { operatorOutletId } from '@/lib/access';
import { supabase } from '@/lib/supabaseClient';
import type { LaundryOrder, UserProfile } from '@/lib/types';

type Props = {
  onScanned: (order: LaundryOrder) => void;
  profile: UserProfile;
};

function parseScanValue(value: string) {
  const trimmed = value.trim();
  const prefixed = trimmed.match(/UNGU:([0-9a-f-]{36})/i);

  if (prefixed) {
    return prefixed[1];
  }

  const uuid = trimmed.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return uuid?.[0] ?? '';
}

export function AdminQrScannerPanel({ onScanned, profile }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState('');
  const [lastCode, setLastCode] = useState('');

  async function markOrderWashing(rawCode: string) {
    const token = parseScanValue(rawCode);

    if (!token || token === lastCode) {
      return;
    }

    setLastCode(token);
    setMessage('Mencari order dari label QR...');

    const { data: orderData, error: orderError } = await supabase
      .from('tabel_order')
      .select('*')
      .or(`id.eq.${token},qr_token.eq.${token}`)
      .maybeSingle();

    if (orderError || !orderData) {
      setMessage(orderError?.message || 'Order tidak ditemukan atau bukan outlet ini.');
      return;
    }

    const order = orderData as LaundryOrder;
    if (profile.role !== 'SUPERADMIN' && order.admin_outlet_id !== operatorOutletId(profile)) {
      setMessage('Label QR ini bukan milik outlet yang sedang login.');
      return;
    }

    const { data, error } = await supabase
      .from('tabel_order')
      .update({ status_order: 'DICUCI' })
      .eq('id', order.id)
      .select('*')
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    const nextOrder = data as LaundryOrder;
    onScanned(nextOrder);
    setMessage(`Status #${nextOrder.id.slice(0, 8)} berubah ke DICUCI.`);
  }

  async function startCamera() {
    setMessage('');

    if (!('BarcodeDetector' in window)) {
      setMessage('Scanner native belum tersedia di browser ini. Pakai input manual label order.');
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'environment' },
    });

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }

    setScanning(true);
  }

  function stopCamera() {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setScanning(false);
  }

  useEffect(() => {
    if (!scanning || !videoRef.current || !('BarcodeDetector' in window)) {
      return;
    }

    let cancelled = false;
    const detector = new (window as unknown as { BarcodeDetector: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector({
      formats: ['qr_code'],
    });

    async function loop() {
      if (cancelled || !videoRef.current) {
        return;
      }

      try {
        const codes = await detector.detect(videoRef.current);
        if (codes[0]?.rawValue) {
          await markOrderWashing(codes[0].rawValue);
        }
      } catch {
        // Some devices throw until the video has a full frame.
      }

      window.setTimeout(loop, 850);
    }

    void loop();

    return () => {
      cancelled = true;
    };
  }, [lastCode, scanning]);

  useEffect(() => stopCamera, []);

  return (
    <section className="app-card qr-scanner-panel">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">QR keranjang</p>
          <h2>Scan label untuk mulai cuci</h2>
          <p className="muted">Kamera membaca label order, lalu status otomatis menjadi DICUCI.</p>
        </div>
        <button className="button secondary" onClick={scanning ? stopCamera : startCamera} type="button">
          <i className={`fi ${scanning ? 'fi-rr-cross-small' : 'fi-rr-camera'}`} aria-hidden />
          {scanning ? 'Tutup kamera' : 'Scan QR'}
        </button>
      </div>

      <div className="qr-scanner-grid">
        <video className="qr-video" muted playsInline ref={videoRef} />
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void markOrderWashing(manualCode);
          }}
        >
          <label className="field">
            <span>Input manual QR / ID order</span>
            <input
              className="input"
              onChange={(event) => setManualCode(event.target.value)}
              placeholder="UNGU:order-id atau UUID"
              value={manualCode}
            />
          </label>
          <button className="button primary" type="submit">
            <i className="fi fi-rr-badge-check" aria-hidden />
            Update ke DICUCI
          </button>
        </form>
      </div>

      {message ? <div className={`alert ${message.includes('berubah') ? 'success' : 'error'}`}>{message}</div> : null}
    </section>
  );
}
