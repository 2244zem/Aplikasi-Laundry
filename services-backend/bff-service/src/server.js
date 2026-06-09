const crypto = require('crypto');
const cors = require('cors');
const dotenv = require('dotenv');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const port = process.env.PORT || 8080;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const midtransServerKey = process.env.MIDTRANS_SERVER_KEY;
const midtransIsProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';

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

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'scalewash-bff-service' });
});

app.post('/api/v1/payment/create-laundry-order-transaction', async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ ok: false, error: 'Missing orderId.' });
  }

  try {
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

    const amount = Number(order.total_harga || order.format_detail?.estimasi_harga || 0);

    if (!amount || amount < 1000) {
      return res.status(400).json({
        ok: false,
        error: 'Total order belum valid. Admin perlu mengisi harga final atau estimasi harga minimal Rp 1.000.',
      });
    }

    const midtransOrderId = `UL-${order.id.slice(0, 8)}-${Date.now()}`;
    const customer = order.tabel_user ?? {};
    const snapPayload = {
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

    return res.json({
      ok: true,
      midtrans_order_id: midtransOrderId,
      redirect_url: midtransPayload.redirect_url,
      token: midtransPayload.token,
    });
  } catch (error) {
    console.error('Failed to create Midtrans transaction:', error);
    return res.status(500).json({ ok: false, error: 'Failed to create Midtrans transaction.' });
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

app.listen(port, () => {
  console.log(`BFF Webhook Gateway active on port ${port}`);
});
