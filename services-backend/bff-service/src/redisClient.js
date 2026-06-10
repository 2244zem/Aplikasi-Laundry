const crypto = require('crypto');
const { createClient } = require('redis');

const redisUrl = process.env.REDIS_URL || '';
const redisEnabledValue = (process.env.REDIS_ENABLED || '').toLowerCase();
const redisRequested = redisEnabledValue === 'true' || (redisEnabledValue !== 'false' && Boolean(redisUrl));
const defaultCacheTtlSeconds = Number(process.env.CACHE_TTL_SECONDS || 30);

let client;
let connectPromise;
let lastError = '';

function cacheTtlSeconds(fallbackSeconds = 30) {
  const ttl = Number.isFinite(defaultCacheTtlSeconds) && defaultCacheTtlSeconds > 0
    ? defaultCacheTtlSeconds
    : fallbackSeconds;

  return Math.max(1, Math.floor(ttl));
}

function isRedisEnabled() {
  return redisRequested && Boolean(redisUrl);
}

function getRedisStatus() {
  if (!isRedisEnabled()) {
    return {
      enabled: false,
      error: redisRequested && !redisUrl ? 'REDIS_URL belum diisi.' : '',
      status: 'disabled',
    };
  }

  if (client?.isReady) {
    return {
      enabled: true,
      error: '',
      status: 'ready',
    };
  }

  return {
    enabled: true,
    error: lastError,
    status: lastError ? 'offline' : 'connecting',
  };
}

async function getRedisClient() {
  if (!isRedisEnabled()) {
    return null;
  }

  if (!client) {
    client = createClient({
      socket: {
        reconnectStrategy: false,
      },
      url: redisUrl,
    });

    client.on('error', (error) => {
      lastError = error.message;
    });
    client.on('ready', () => {
      lastError = '';
    });
  }

  if (client.isReady) {
    return client;
  }

  if (!connectPromise) {
    connectPromise = client.connect().catch((error) => {
      lastError = error.message;
      try {
        client.destroy();
      } catch (_destroyError) {
        // Ignore cleanup errors; Redis is an optional cache path.
      }
      client = null;
      return null;
    }).finally(() => {
      connectPromise = null;
    });
  }

  await connectPromise;
  return client?.isReady ? client : null;
}

async function getJson(key) {
  const redis = await getRedisClient();

  if (!redis) {
    return null;
  }

  try {
    const rawValue = await redis.get(key);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch (error) {
    lastError = error.message;
    return null;
  }
}

async function setJson(key, value, ttlSeconds = cacheTtlSeconds()) {
  const redis = await getRedisClient();

  if (!redis) {
    return false;
  }

  try {
    await redis.set(key, JSON.stringify(value), {
      EX: Math.max(1, Math.floor(ttlSeconds)),
    });
    return true;
  } catch (error) {
    lastError = error.message;
    return false;
  }
}

async function acquireLock(key, ttlSeconds = 10) {
  const redis = await getRedisClient();
  const token = crypto.randomUUID();

  if (!redis) {
    return {
      acquired: true,
      release: async () => {},
      skipped: true,
    };
  }

  try {
    const result = await redis.set(key, token, {
      EX: Math.max(1, Math.floor(ttlSeconds)),
      NX: true,
    });

    if (result !== 'OK') {
      return {
        acquired: false,
        release: async () => {},
        skipped: false,
      };
    }

    return {
      acquired: true,
      release: async () => {
        try {
          const value = await redis.get(key);

          if (value === token) {
            await redis.del(key);
          }
        } catch (error) {
          lastError = error.message;
        }
      },
      skipped: false,
    };
  } catch (error) {
    lastError = error.message;
    return {
      acquired: true,
      release: async () => {},
      skipped: true,
    };
  }
}

module.exports = {
  acquireLock,
  cacheTtlSeconds,
  getJson,
  getRedisStatus,
  isRedisEnabled,
  setJson,
};
