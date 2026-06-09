'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { CourierLocation, LaundryOrder } from '@/lib/types';

type Props = {
  order: LaundryOrder;
};

function distanceKm(from?: { latitude?: number; longitude?: number }, to?: { latitude?: number; longitude?: number }) {
  if (from?.latitude == null || from.longitude == null || to?.latitude == null || to.longitude == null) {
    return null;
  }

  const radiusKm = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRad(to.latitude - from.latitude);
  const deltaLng = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function LivePickupTracker({ order }: Props) {
  const [location, setLocation] = useState<CourierLocation | null>(null);
  const [message, setMessage] = useState('');
  const customer = {
    latitude: order.format_detail?.customer_latitude,
    longitude: order.format_detail?.customer_longitude,
  };
  const courier = location
    ? {
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
      }
    : null;
  const rangeKm = distanceKm(courier ?? undefined, customer);
  const mapPosition = useMemo(() => {
    if (!courier || customer.latitude == null || customer.longitude == null) {
      return { left: 18, top: 62 };
    }

    const latDelta = courier.latitude - customer.latitude;
    const lngDelta = courier.longitude - customer.longitude;

    return {
      left: Math.max(14, Math.min(82, 48 + lngDelta * 3600)),
      top: Math.max(18, Math.min(78, 54 - latDelta * 3600)),
    };
  }, [courier, customer.latitude, customer.longitude]);

  async function loadLocation() {
    const { data, error } = await supabase
      .from('tabel_courier_location')
      .select('*')
      .eq('order_id', order.id)
      .maybeSingle();

    if (error) {
      setMessage(error.message);
      return;
    }

    setLocation((data as CourierLocation | null) ?? null);
  }

  useEffect(() => {
    void loadLocation();

    const channel = supabase
      .channel(`ungu-laundry:courier-location:${order.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          filter: `order_id=eq.${order.id}`,
          schema: 'public',
          table: 'tabel_courier_location',
        },
        (payload) => setLocation(payload.new as CourierLocation),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [order.id]);

  return (
    <section className="pickup-map-card">
      <div>
        <p className="eyebrow">Live pickup</p>
        <h2>Tracking kurir</h2>
        <p className="muted">
          {location
            ? `Update ${new Date(location.updated_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
            : 'Lokasi kurir akan muncul saat admin mengaktifkan tracking.'}
        </p>
      </div>

      <div className="pickup-map" aria-label="Peta pickup realtime">
        <span className="map-grid-line horizontal" />
        <span className="map-grid-line vertical" />
        <span className="map-home">
          <i className="fi fi-rr-home" aria-hidden />
        </span>
        <span className="map-bike" style={{ left: `${mapPosition.left}%`, top: `${mapPosition.top}%` }}>
          <i className="fi fi-rr-motorcycle" aria-hidden />
        </span>
      </div>

      <div className="pickup-map-meta">
        <span>
          <strong>{rangeKm == null ? '-' : `${rangeKm.toFixed(1)} km`}</strong>
          jarak estimasi
        </span>
        <span>
          <strong>{location?.speed_kmh ? `${Number(location.speed_kmh).toFixed(0)} km/j` : '-'}</strong>
          kecepatan
        </span>
      </div>

      {message ? <div className="alert error">{message}</div> : null}
    </section>
  );
}
