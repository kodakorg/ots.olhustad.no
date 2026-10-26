// server.js
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const path = require("path");
const PORT = process.env.PORT || 3000;
const USE_REDIS = process.env.USE_REDIS === 'true';

const KEY_PREFIX = 'ots:';
const ID_PATTERN = /^[0-9a-f]{32}$/;
const TTL_SECONDS = {
  '24': 24 * 3600,
  '48': 48 * 3600,
  'week': 168 * 3600
};

const app = express();
// Requests arrive through Cloudflare; trust one proxy hop so req.ip is the client IP
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ['https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'https://img.shields.io'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  xFrameOptions: { action: 'deny' }
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');

const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many secrets created, try again later' }
});

const revealLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' }
});

const memoryStore = new Map();
const storage = {
  async set(key, value, options) {
    if (USE_REDIS) {
      return await redisClient.set(key, value, options);
    } else {
      memoryStore.set(key, { value, expiresAt: Date.now() + (options.EX * 1000) });
      return 'OK';
    }
  },

  // Atomically read and delete, so a secret can never be returned twice
  async getDel(key) {
    if (USE_REDIS) {
      return await redisClient.getDel(key);
    } else {
      const item = memoryStore.get(key);
      memoryStore.delete(key);

      if (!item || Date.now() > item.expiresAt) return null;
      return item.value;
    }
  }
};

let redisClient;
if (USE_REDIS) {
  const redisURL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  redisClient = redis.createClient({
    url: redisURL
  });
  redisClient.on('error', (err) => console.error('Redis Client Error', err));
}

if (!USE_REDIS) {
  setInterval(() => {
    const now = Date.now();
    for (const [key, item] of memoryStore.entries()) {
      if (now > item.expiresAt) {
        memoryStore.delete(key);
      }
    }
  }, 60000);
}

app.get('/', (req, res) => {
  res.render('create_secret');
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    storage: USE_REDIS ? 'redis' : 'memory',
    secrets: USE_REDIS ? 'N/A' : memoryStore.size
  });
});

app.post('/secret', createLimiter, async (req, res) => {
  const encryptedSecret = req.body.encryptedSecret;
  const ttl = Object.hasOwn(TTL_SECONDS, req.body.ttl) ? TTL_SECONDS[req.body.ttl] : null;

  if (!encryptedSecret) {
    return res.status(400).json({ error: 'ecryptedSecret missing' });
  }

  if (!ttl) {
    return res.status(400).json({ error: 'Invalid ttl' });
  }

  const id = uuidv4().replace(/-/g, '');

  try {
    await storage.set(KEY_PREFIX + id, JSON.stringify(encryptedSecret), { EX: ttl });
    res.json({ id });
  } catch (error) {
    console.error('Could not store secret:', error);
    res.status(500).json({ error: 'Could not store secret' });
  }
});

app.get('/secret/:id', async (req, res) => {
  const { id } = req.params;

  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');

  const userAgent = req.headers['user-agent'] || '';
  const isCrawler = /bot|crawler|spider|preview|facebook|twitter|linkedin|slack|discord|whatsapp|messenger/i.test(userAgent);

  res.render('view_secret', { isCrawler });
});

app.post('/secret/:id/reveal', revealLimiter, async (req, res) => {
  const { id } = req.params;

  if (!ID_PATTERN.test(id)) {
    return res.status(404).json({ error: 'Secret not found or already revealed' });
  }

  try {
    let encryptedSecret = await storage.getDel(KEY_PREFIX + id);

    // Secrets created before keys were prefixed. Safe to remove once the
    // longest TTL (one week) has passed since this was deployed.
    if (!encryptedSecret && USE_REDIS) {
      encryptedSecret = await storage.getDel(id);
    }

    if (!encryptedSecret) {
      return res.status(404).json({ error: 'Secret not found or already revealed' });
    }

    res.json({ encryptedSecret: JSON.parse(encryptedSecret) });
  } catch (error) {
    console.error('Error revealing secret:', error);
    res.status(500).json({ error: 'Error retrieving secret' });
  }
});

async function startServer() {
  try {
    if (USE_REDIS) {
      await redisClient.connect();
      console.log('Connected to Redis');
    } else {
      console.log('Using in-memory storage (development mode)');
    }

    app.listen(PORT, (err) => {
      if (err) throw err;
      console.log(`Server running on port ${PORT}`);
      console.log(`Storage mode: ${USE_REDIS ? 'Redis' : 'In-Memory'}`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
  }
}

startServer();
