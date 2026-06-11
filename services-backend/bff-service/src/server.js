const crypto = require('crypto');
const cors = require('cors');
const dotenv = require('dotenv');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { acquireLock, cacheTtlSeconds, getJson, getRedisStatus, setJson } = require('./redisClient');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const port = process.env.PORT || 8080;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const midtransServerKey = process.env.MIDTRANS_SERVER_KEY;
const midtransIsProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';
const midtransKeyEnvironment = (process.env.MIDTRANS_KEY_ENV || '').toLowerCase();
const publicBffBaseUrl = process.env.BFF_PUBLIC_BASE_URL || process.env.PUBLIC_BFF_BASE_URL || '';
const configuredMidtransWebhookUrl = process.env.MIDTRANS_WEBHOOK_URL || '';
const whatsappApiUrl = process.env.WHATSAPP_API_URL;
const whatsappApiToken = process.env.WHATSAPP_API_TOKEN;
const midtransStatusCacheTtlSeconds = Math.min(cacheTtlSeconds(30), 30);
const checkoutCacheTtlSeconds = 15 * 60;

if (!supabaseUrl || !supabaseServiceRoleKey || !midtransServerKey) {
  throw new Error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or MIDTRANS_SERVER_KEY.');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

function midtransSnapUrl() {
  return midtransIsProduction
    ? 'https://app.midtrans.com/snap/v1/transactions'
    : 'https://app.sandbox.midtrans.com/snap/v1/transactions';
}

function midtransAuthHeader() {
  return `Basic ${Buffer.from(`${midtransServerKey}:`).toString('base64')}`;
}

function midtransStatusUrl(midtransOrderId) {
  const baseUrl = midtransIsProduction
    ? 'https://api.midtrans.com/v2'
    : 'https://api.sandbox.midtrans.com/v2';

  return `${baseUrl}/${encodeURIComponent(midtransOrderId)}/status`;
}

function configuredMidtransKeyEnvironment() {
  return ['sandbox', 'production'].includes(midtransKeyEnvironment) ? midtransKeyEnvironment : '';
}

function classifyMidtransServerKey() {
  const configuredEnvironment = configuredMidtransKeyEnvironment();

  if (configuredEnvironment) {
    return {
      mode: configuredEnvironment,
      source: 'env',
    };
  }

  if (midtransServerKey.startsWith('SB-Mid-server-')) {
    return {
      mode: 'sandbox',
      source: 'prefix',
    };
  }

  if (midtransServerKey.startsWith('Mid-server-')) {
    return {
      mode: 'unknown',
      source: 'modern-prefix',
    };
  }

  return {
    mode: 'unknown',
    source: 'unknown',
  };
}

function resolveMidtransWebhookUrl() {
  if (configuredMidtransWebhookUrl) {
    return configuredMidtransWebhookUrl;
  }

  if (publicBffBaseUrl) {
    return `${publicBffBaseUrl.replace(/\/$/, '')}/api/v1/payment/midtrans-webhook`;
  }

  return '';
}

function buildMidtransReadiness() {
  const environment = midtransIsProduction ? 'production' : 'sandbox';
  const serverKey = classifyMidtransServerKey();
  const serverKeyMode = serverKey.mode;
  const keyEnvironmentVerified = serverKeyMode !== 'unknown';
  const webhookUrl = resolveMidtransWebhookUrl();
  const keyMatchesEnvironment = keyEnvironmentVerified ? serverKeyMode === environment : true;
  const webhookUrlConfigured = Boolean(webhookUrl);
  const webhookHttpsReady = webhookUrl.startsWith('https://');
  const warnings = [];

  if (!keyEnvironmentVerified) {
    warnings.push(
      'Checker tidak bisa memastikan key ini sandbox/production dari prefix. Jika dashboard Sandbox aktif, isi MIDTRANS_KEY_ENV=sandbox.',
    );
  }

  if (keyEnvironmentVerified && !keyMatchesEnvironment) {
    warnings.push(
      `MIDTRANS_IS_PRODUCTION=${midtransIsProduction} tetapi MIDTRANS_KEY_ENV/server key terbaca ${serverKeyMode}.`,
    );
  }

  if (midtransIsProduction && !webhookHttpsReady) {
    warnings.push('Production membutuhkan MIDTRANS_WEBHOOK_URL atau BFF_PUBLIC_BASE_URL HTTPS untuk webhook Midtrans.');
  }

  if (!midtransIsProduction) {
    warnings.push('Mode sandbox: QRIS/GoPay diuji dengan simulator Midtrans, bukan aplikasi pembayaran asli.');
  }

  return {
    environment,
    key_environment_verified: keyEnvironmentVerified,
    key_matches_environment: keyMatchesEnvironment,
    production_ready: midtransIsProduction && keyEnvironmentVerified && keyMatchesEnvironment && webhookHttpsReady,
    server_key_detection: serverKey.source,
    server_key_mode: serverKeyMode,
    webhook_https_ready: webhookHttpsReady,
    webhook_url_configured: webhookUrlConfigured,
    warnings,
  };
}

async function getCachedMidtransReadiness() {
  const cacheKey = 'health:midtrans-readiness';
  const cachedReadiness = await getJson(cacheKey);

  if (cachedReadiness) {
    return cachedReadiness;
  }

  const readiness = buildMidtransReadiness();
  await setJson(cacheKey, readiness, cacheTtlSeconds(30));
  return readiness;
}

function buildPaymentGateContract() {
  return {
    allowed_payment_statuses: ['UNPAID', 'PENDING', 'FAILED'],
    blocked_order_statuses: ['PENDING_CONFIRMATION', 'DIBATALKAN'],
    min_amount_idr: 1000,
    payable_order_statuses: ['DITERIMA', 'DICUCI', 'DISETRIKA', 'SELESAI'],
    source_of_truth: 'public.tabel_order.status_order, status_pembayaran, total_harga',
  };
}

function resolveRequestOrigin(req) {
  const origin = req.headers.origin;

  if (typeof origin === 'string' && origin.startsWith('http')) {
    return origin;
  }

  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'];
  const protocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;

  if (protocol && host) {
    return `${protocol}://${host}`;
  }

  return '';
}

function authFailure(status, code, error) {
  return { code, error, profile: null, status };
}

async function getRequestProfile(req) {
  const rawHeader = req.headers.authorization;
  const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

  if (!header) {
    return authFailure(
      401,
      'MISSING_AUTH_HEADER',
      'Authorization header belum ada. Login ulang lalu klik Bayar dari aplikasi.',
    );
  }

  const tokenMatch = header.match(/^Bearer\s+(.+)$/i);
  const token = tokenMatch?.[1]?.trim();

  if (!token) {
    return authFailure(
      401,
      'INVALID_AUTH_HEADER',
      'Format Authorization harus Bearer token. Login ulang lalu coba bayar lagi.',
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    console.warn('Payment auth rejected:', {
      code: 'INVALID_SESSION',
      reason: userError?.message ?? 'No auth user returned',
    });

    return authFailure(
      401,
      'INVALID_SESSION',
      'Session login tidak valid atau sudah kedaluwarsa. Login ulang lalu coba bayar lagi.',
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from('tabel_user')
    .select('id,role,auth_user_id,email')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('Payment profile lookup failed:', {
      authUserId: user.id,
      code: 'PROFILE_LOOKUP_FAILED',
      reason: profileError.message,
    });

    return authFailure(500, 'PROFILE_LOOKUP_FAILED', 'Gagal membaca profil user dari database.');
  }

  if (profile) {
    return { profile, user };
  }

  if (user.email) {
    const { data: emailProfile, error: emailProfileError } = await supabase
      .from('tabel_user')
      .select('id,role,auth_user_id,email')
      .eq('email', user.email)
      .maybeSingle();

    if (emailProfileError) {
      console.error('Payment email profile lookup failed:', {
        authUserId: user.id,
        code: 'PROFILE_EMAIL_LOOKUP_FAILED',
        reason: emailProfileError.message,
      });

      return authFailure(500, 'PROFILE_EMAIL_LOOKUP_FAILED', 'Gagal membaca profil user dari database.');
    }

    if (emailProfile?.auth_user_id && emailProfile.auth_user_id !== user.id) {
      console.warn('Payment profile auth mismatch:', {
        authUserId: user.id,
        code: 'PROFILE_AUTH_MISMATCH',
        profileId: emailProfile.id,
      });

      return authFailure(
        409,
        'PROFILE_AUTH_MISMATCH',
        'Profil email ini terhubung ke akun login lain. Login dengan akun yang benar.',
      );
    }

    if (emailProfile) {
      if (!emailProfile.auth_user_id) {
        const { error: syncError } = await supabase
          .from('tabel_user')
          .update({ auth_user_id: user.id })
          .eq('id', emailProfile.id);

        if (syncError) {
          console.error('Payment profile sync failed:', {
            authUserId: user.id,
            code: 'PROFILE_SYNC_FAILED',
            profileId: emailProfile.id,
            reason: syncError.message,
          });

          return authFailure(500, 'PROFILE_SYNC_FAILED', 'Gagal menyinkronkan profil user.');
        }
      }

      return {
        profile: {
          ...emailProfile,
          auth_user_id: user.id,
        },
        user,
      };
    }
  }

  console.warn('Payment profile missing:', {
    authUserId: user.id,
    code: 'PROFILE_NOT_FOUND',
  });

  return authFailure(
    401,
    'PROFILE_NOT_FOUND',
    'Profil user belum sinkron. Logout lalu login ulang agar profil dibuat ulang.',
  );
}

async function sendWhatsappMessage({ message, phoneNumber }) {
  if (!whatsappApiUrl || !whatsappApiToken || !phoneNumber) {
    return { skipped: true };
  }

  const response = await fetch(whatsappApiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${whatsappApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      to: phoneNumber,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || payload.message || 'WhatsApp provider rejected the message.');
  }

  return { payload, skipped: false };
}

function verifyMidtransSignature(payload) {
  const { order_id: orderId, status_code: statusCode, gross_amount: grossAmount, signature_key: signatureKey } = payload;

  if (!orderId || !statusCode || !grossAmount || !signatureKey) {
    return false;
  }

  const expected = crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${midtransServerKey}`)
    .digest('hex');

  if (expected.length !== signatureKey.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureKey));
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate.toISOString();
}

async function recordPaymentEvent(payload, related = {}) {
  const { error } = await supabase.from('tabel_payment_event').insert({
    user_id: related.userId ?? null,
    order_id: related.orderId ?? null,
    midtrans_order_id: payload.order_id ?? null,
    midtrans_transaction_id: payload.transaction_id ?? null,
    transaction_status: payload.transaction_status ?? null,
    payment_type: payload.payment_type ?? null,
    gross_amount: payload.gross_amount ? Number(payload.gross_amount) : null,
    payload,
  });

  if (error) {
    console.error('Failed to record Midtrans event:', error);
  }
}

async function activateAdminSubscription(userId, payload) {
  const expiresAt = addDays(new Date(), 30);

  const { error: userError } = await supabase
    .from('tabel_user')
    .update({
      role: 'ADMIN',
      status_langganan: 'ACTIVE',
      tgl_kadaluwarsa_langganan: expiresAt,
    })
    .eq('id', userId);

  if (userError) {
    throw userError;
  }

  const { error: subscriptionError } = await supabase.from('tabel_subscription').upsert(
    {
      admin_user_id: userId,
      midtrans_subscription_id: payload.subscription_id ?? payload.order_id,
      status: 'ACTIVE',
      amount: payload.gross_amount ? Number(payload.gross_amount) : 500000,
      current_period_start: new Date().toISOString(),
      current_period_end: expiresAt,
      metadata: payload,
    },
    { onConflict: 'midtrans_subscription_id' },
  );

  if (subscriptionError) {
    throw subscriptionError;
  }
}

async function deactivateAdminSubscription(userId, payload) {
  const { error: userError } = await supabase
    .from('tabel_user')
    .update({
      role: 'USER',
      status_langganan: 'INACTIVE',
      tgl_kadaluwarsa_langganan: new Date().toISOString(),
    })
    .eq('id', userId);

  if (userError) {
    throw userError;
  }

  const midtransSubscriptionId = payload.subscription_id ?? payload.order_id;
  const { error: subscriptionError } = await supabase
    .from('tabel_subscription')
    .update({
      status: 'INACTIVE',
      current_period_end: new Date().toISOString(),
      metadata: payload,
    })
    .eq('midtrans_subscription_id', midtransSubscriptionId);

  if (subscriptionError) {
    throw subscriptionError;
  }
}

async function markLaundryOrderPaid(payload) {
  const { error } = await supabase
    .from('tabel_order')
    .update({ status_pembayaran: 'PAID' })
    .eq('midtrans_order_id', payload.order_id);

  if (error) {
    throw error;
  }
}

async function markLaundryOrderFailed(payload) {
  const { error } = await supabase
    .from('tabel_order')
    .update({ status_pembayaran: 'FAILED' })
    .eq('midtrans_order_id', payload.order_id);

  if (error) {
    throw error;
  }
}

function laundryPaymentStatusFromMidtrans(transactionStatus) {
  if (['settlement', 'capture'].includes(transactionStatus)) {
    return 'PAID';
  }

  if (transactionStatus === 'pending') {
    return 'PENDING';
  }

  if (['expire', 'cancel', 'deny', 'failure'].includes(transactionStatus)) {
    return 'FAILED';
  }

  return null;
}

async function fetchMidtransTransactionStatus(midtransOrderId) {
  const cacheKey = `midtrans-status:${midtransOrderId}`;
  const cachedStatus = await getJson(cacheKey);

  if (cachedStatus) {
    return cachedStatus;
  }

  const response = await fetch(midtransStatusUrl(midtransOrderId), {
    headers: {
      Accept: 'application/json',
      Authorization: midtransAuthHeader(),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.status_message || payload.error_messages?.join(', ') || 'Midtrans status check failed.';
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  await setJson(cacheKey, payload, midtransStatusCacheTtlSeconds);
  return payload;
}

async function applyLaundryOrderPaymentStatus(order, midtransPayload) {
  const paymentStatus = laundryPaymentStatusFromMidtrans(midtransPayload.transaction_status);

  if (!paymentStatus) {
    return {
      order,
      paymentStatus: order.status_pembayaran,
      updated: false,
    };
  }

  if (order.status_pembayaran === paymentStatus) {
    return {
      order,
      paymentStatus,
      updated: false,
    };
  }

  const { data: updatedOrder, error } = await supabase
    .from('tabel_order')
    .update({ status_pembayaran: paymentStatus })
    .eq('id', order.id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return {
    order: updatedOrder,
    paymentStatus,
    updated: true,
  };
}

app.get('/health', async (_req, res) => {
  const readiness = await getCachedMidtransReadiness();
  const paymentGate = buildPaymentGateContract();
  const paymentReady = readiness.environment === 'sandbox'
    ? readiness.key_matches_environment
    : readiness.production_ready;

  res.json({
    auth: {
      payment_session_required: true,
      verifier: 'Supabase Auth Bearer token via auth.getUser(token)',
    },
    midtrans: readiness,
    midtrans_environment: readiness.environment,
    ok: true,
    payment_gate: paymentGate,
    payment_ready: paymentReady,
    redis: getRedisStatus(),
    service: 'scalewash-bff-service',
  });
});

app.post('/api/v1/payment/create-laundry-order-transaction', async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ ok: false, error: 'Missing orderId.' });
  }

  let createPaymentLock;

  try {
    const authResult = await getRequestProfile(req);

    if (authResult.error) {
      return res.status(authResult.status).json({
        ok: false,
        auth_code: authResult.code,
        error: authResult.error,
      });
    }

    const { profile } = authResult;
    createPaymentLock = await acquireLock(`lock:create-payment:${orderId}`, 20);

    if (!createPaymentLock.acquired) {
      return res.status(409).json({
        ok: false,
        error: 'Transaksi sedang dibuat. Tunggu beberapa detik lalu cek halaman Bayar.',
      });
    }

    const { data: order, error: orderError } = await supabase
      .from('tabel_order')
      .select('*, tabel_user:user_id(id,nama,email)')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError) {
      throw orderError;
    }

    if (!order) {
      return res.status(404).json({ ok: false, error: 'Order not found.' });
    }

    if (order.user_id !== profile.id && profile.role !== 'SUPERADMIN') {
      return res.status(403).json({ ok: false, error: 'This order does not belong to the current user.' });
    }

    if (order.status_order === 'DIBATALKAN') {
      return res.status(409).json({ ok: false, error: 'Order sudah dibatalkan dan tidak bisa dibayar.' });
    }

    if (order.status_order === 'PENDING_CONFIRMATION') {
      return res.status(409).json({
        ok: false,
        error: 'Order masih menunggu konfirmasi admin. Admin wajib menerima order dan memfinalkan harga sebelum customer bisa membayar.',
      });
    }

    if (order.status_pembayaran === 'PAID') {
      return res.status(409).json({ ok: false, error: 'Order ini sudah lunas.' });
    }

    if (!['UNPAID', 'PENDING', 'FAILED'].includes(order.status_pembayaran)) {
      return res.status(409).json({
        ok: false,
        error: `Status pembayaran ${order.status_pembayaran} tidak bisa dibuatkan transaksi baru.`,
      });
    }

    const amount = Number(order.total_harga || 0);

    if (!amount || amount < 1000) {
      return res.status(400).json({
        ok: false,
        error: 'Total order belum valid. Admin wajib mengisi harga final minimal Rp 1.000 sebelum customer bisa membayar.',
      });
    }

    const checkoutCacheKey = `payment-checkout:${order.id}`;
    const cachedCheckout = order.status_pembayaran === 'PENDING'
      ? await getJson(checkoutCacheKey)
      : null;

    if (
      cachedCheckout?.redirect_url
      && cachedCheckout?.midtrans_order_id
      && cachedCheckout.midtrans_order_id === order.midtrans_order_id
    ) {
      return res.json({
        ...cachedCheckout,
        cached: true,
        ok: true,
      });
    }

    const midtransOrderId = `UL-${order.id.slice(0, 8)}-${Date.now()}`;
    const customer = order.tabel_user ?? {};
    const requestOrigin = resolveRequestOrigin(req);
    const finishRedirectUrl = requestOrigin
      ? `${requestOrigin}/orders/payment/result?laundry_order_id=${encodeURIComponent(order.id)}&midtrans_order_id=${encodeURIComponent(midtransOrderId)}`
      : undefined;
    const snapPayload = {
      callbacks: finishRedirectUrl
        ? {
            finish: finishRedirectUrl,
          }
        : undefined,
      transaction_details: {
        order_id: midtransOrderId,
        gross_amount: Math.round(amount),
      },
      customer_details: {
        first_name: customer.nama ?? 'Customer Ungu Laundry',
        email: customer.email ?? undefined,
      },
      item_details: [
        {
          id: order.id,
          name: order.format_detail?.paket ?? 'Laundry order',
          price: Math.round(amount),
          quantity: 1,
        },
      ],
      custom_field1: order.user_id,
      custom_field2: 'LAUNDRY_ORDER',
      custom_field3: order.id,
    };

    const midtransResponse = await fetch(midtransSnapUrl(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: midtransAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(snapPayload),
    });

    const midtransPayload = await midtransResponse.json();

    if (!midtransResponse.ok) {
      return res.status(midtransResponse.status).json({ ok: false, error: midtransPayload });
    }

    const { error: updateError } = await supabase
      .from('tabel_order')
      .update({
        midtrans_order_id: midtransOrderId,
        status_pembayaran: 'PENDING',
      })
      .eq('id', order.id);

    if (updateError) {
      throw updateError;
    }

    const responsePayload = {
      ok: true,
      midtrans_order_id: midtransOrderId,
      redirect_url: midtransPayload.redirect_url,
      token: midtransPayload.token,
    };

    await setJson(checkoutCacheKey, responsePayload, checkoutCacheTtlSeconds);

    return res.json(responsePayload);
  } catch (error) {
    console.error('Failed to create Midtrans transaction:', error);
    return res.status(500).json({ ok: false, error: 'Failed to create Midtrans transaction.' });
  } finally {
    if (createPaymentLock?.acquired) {
      await createPaymentLock.release();
    }
  }
});

app.post('/api/v1/payment/sync-laundry-order-status', async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ ok: false, error: 'Missing orderId.' });
  }

  let syncPaymentLock;

  try {
    const authResult = await getRequestProfile(req);

    if (authResult.error) {
      return res.status(authResult.status).json({
        ok: false,
        auth_code: authResult.code,
        error: authResult.error,
      });
    }

    const { profile } = authResult;
    syncPaymentLock = await acquireLock(`lock:sync-payment:${orderId}`, 15);

    if (!syncPaymentLock.acquired) {
      return res.status(202).json({
        ok: true,
        syncing: true,
        updated: false,
      });
    }

    const { data: order, error: orderError } = await supabase
      .from('tabel_order')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError) {
      throw orderError;
    }

    if (!order) {
      return res.status(404).json({ ok: false, error: 'Order not found.' });
    }

    if (order.user_id !== profile.id && profile.role !== 'SUPERADMIN') {
      return res.status(403).json({ ok: false, error: 'This order does not belong to the current user.' });
    }

    if (!order.midtrans_order_id) {
      return res.status(400).json({ ok: false, error: 'Order belum punya transaksi Midtrans.' });
    }

    const midtransPayload = await fetchMidtransTransactionStatus(order.midtrans_order_id);
    const result = await applyLaundryOrderPaymentStatus(order, midtransPayload);

    if (result.updated) {
      await recordPaymentEvent(midtransPayload, { userId: order.user_id, orderId: order.id });
    }

    return res.json({
      ok: true,
      midtrans_order_id: order.midtrans_order_id,
      midtrans_status: midtransPayload.transaction_status ?? null,
      order: result.order,
      payment_status: result.paymentStatus,
      updated: result.updated,
    });
  } catch (error) {
    console.error('Failed to sync Midtrans transaction status:', error);
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message || 'Failed to sync Midtrans transaction status.',
    });
  } finally {
    if (syncPaymentLock?.acquired) {
      await syncPaymentLock.release();
    }
  }
});

app.post('/api/v1/payment/midtrans-webhook', async (req, res) => {
  const payload = req.body;

  if (!verifyMidtransSignature(payload)) {
    return res.status(401).json({ ok: false, error: 'Invalid Midtrans signature.' });
  }

  const transactionStatus = payload.transaction_status;
  const userId = payload.custom_field1;
  const purpose = payload.custom_field2;
  const relatedOrderId = payload.custom_field3;
  const successfulStatuses = new Set(['settlement', 'capture']);
  const failedStatuses = new Set(['expire', 'cancel', 'deny', 'failure']);

  try {
    await recordPaymentEvent(payload, { userId, orderId: relatedOrderId });

    if (purpose === 'ADMIN_SUBSCRIPTION') {
      if (!userId) {
        return res.status(400).json({ ok: false, error: 'Missing custom_field1 user id.' });
      }

      if (successfulStatuses.has(transactionStatus)) {
        await activateAdminSubscription(userId, payload);
      } else if (failedStatuses.has(transactionStatus)) {
        await deactivateAdminSubscription(userId, payload);
      }
    }

    if (purpose === 'LAUNDRY_ORDER') {
      if (successfulStatuses.has(transactionStatus)) {
        await markLaundryOrderPaid(payload);
      } else if (failedStatuses.has(transactionStatus)) {
        await markLaundryOrderFailed(payload);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Midtrans webhook handling failed:', error);
    return res.status(500).json({ ok: false, error: 'Webhook handling failed.' });
  }
});

app.post('/api/v1/crm/run-retention-scan', async (req, res) => {
  const { adminId, days = 14 } = req.body;

  if (!adminId) {
    return res.status(400).json({ ok: false, error: 'Missing adminId.' });
  }

  const threshold = new Date();
  threshold.setDate(threshold.getDate() - Number(days || 14));

  try {
    const { data: orders, error } = await supabase
      .from('tabel_order')
      .select('*, tabel_user:user_id(id,nama,email)')
      .eq('admin_outlet_id', adminId)
      .eq('status_order', 'SELESAI')
      .lt('updated_at', threshold.toISOString())
      .order('updated_at', { ascending: false })
      .limit(200);

    if (error) {
      throw error;
    }

    const latestByUser = new Map();
    (orders || []).forEach((order) => {
      if (!latestByUser.has(order.user_id)) {
        latestByUser.set(order.user_id, order);
      }
    });

    const rows = Array.from(latestByUser.values()).map((order) => ({
      admin_id: adminId,
      last_order_at: order.updated_at,
      metadata: {
        email: order.tabel_user?.email,
        order_id: order.id,
        paket: order.format_detail?.paket,
      },
      suggested_message: `Halo ${order.tabel_user?.nama || 'kak'}! Sudah ${days} hari belum laundry lagi. Ada diskon 10% khusus untuk layanan ${order.format_detail?.paket || 'favorit'} minggu ini di Ungu Laundry.`,
      user_id: order.user_id,
    }));

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from('tabel_customer_retention_queue').insert(rows);

      if (insertError && !String(insertError.message).includes('duplicate')) {
        throw insertError;
      }
    }

    return res.json({ ok: true, count: rows.length });
  } catch (error) {
    console.error('Retention scan failed:', error);
    return res.status(500).json({ ok: false, error: 'Retention scan failed.' });
  }
});

app.post('/api/v1/crm/send-retention/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: queueItem, error } = await supabase
      .from('tabel_customer_retention_queue')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!queueItem) {
      return res.status(404).json({ ok: false, error: 'Queue item not found.' });
    }

    const phoneNumber = queueItem.metadata?.phone_number || queueItem.metadata?.phone;
    const sendResult = await sendWhatsappMessage({
      message: queueItem.suggested_message,
      phoneNumber,
    });

    const { error: updateError } = await supabase
      .from('tabel_customer_retention_queue')
      .update({
        metadata: {
          ...queueItem.metadata,
          whatsapp_result: sendResult,
        },
        sent_at: sendResult.skipped ? null : new Date().toISOString(),
        status: sendResult.skipped ? 'PENDING' : 'SENT',
      })
      .eq('id', id);

    if (updateError) {
      throw updateError;
    }

    return res.json({ ok: true, skipped: sendResult.skipped });
  } catch (error) {
    console.error('Retention send failed:', error);

    await supabase
      .from('tabel_customer_retention_queue')
      .update({ status: 'FAILED' })
      .eq('id', id);

    return res.status(500).json({ ok: false, error: 'Retention send failed.' });
  }
});

app.listen(port, () => {
  console.log(`BFF Webhook Gateway active on port ${port}`);
});
