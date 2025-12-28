// server.js
const express = require('express');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const path = require("path");
const PORT = process.env.PORT || 3000;
const USE_REDIS = process.env.USE_REDIS === 'true';

const app = express();
app.use(express.json());
app.use(express.static("public"));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/img', express.static(path.join(__dirname, 'public/img')));

app.set('view engine', 'ejs');
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

  async get(key) {
    if (USE_REDIS) {
      return await redisClient.get(key);
    } else {
      const item = memoryStore.get(key);

      if (!item) return null;

      if (Date.now() > item.expiresAt) {
        memoryStore.delete(key);
        return null;
      }
      return item.value;
    }
  },

  async del(key) {
    if (USE_REDIS) {
      return await redisClient.del(key);
    } else {
      memoryStore.delete(key);
      return 1;
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

app.post('/secret', async (req, res) => {
  const encryptedSecret = req.body.encryptedSecret;
  let timeToLive = req.body.ttl;

  if (!encryptedSecret) {
    return res.status(400).json({ error: 'ecryptedSecret missing' });
  }

  const id = uuidv4().replace(/-/g, '');

  if (timeToLive == "week") {
    timeToLive = 168;
  }
  let ttl = timeToLive * 3600;
  let ttlInt = parseInt(ttl);

  try {
    await storage.set(id, JSON.stringify(encryptedSecret), { EX: ttlInt });
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

app.post('/secret/:id/reveal', async (req, res) => {
  const { id } = req.params;

  try {
    const encryptedSecret = await storage.get(id);

    if (!encryptedSecret) {
      return res.status(404).json({ error: 'Secret not found or already revealed' });
    }

    await storage.del(id);

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

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Storage mode: ${USE_REDIS ? 'Redis' : 'In-Memory'}`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
  }
}

startServer();