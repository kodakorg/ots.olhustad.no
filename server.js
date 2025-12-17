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

// In-memory store for development
const memoryStore = new Map();

// Storage adapter interface
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

      // Check if expired
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

// Redis client setup (only used if USE_REDIS is true)
let redisClient;
if (USE_REDIS) {
  const redisURL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  redisClient = redis.createClient({
    url: redisURL
  });
  redisClient.on('error', (err) => console.error('Redis Client Error', err));
}

// Cleanup expired entries every minute (for in-memory store)
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

  console.log('encryptedSecret:', encryptedSecret);
  console.log('timeToLive:', timeToLive);

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

  // Set headers to discourage link previews
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');

  // Check if it's a bot/crawler/link previewer
  const userAgent = req.headers['user-agent'] || '';
  const isCrawler = /bot|crawler|spider|preview|facebook|twitter|linkedin|slack|discord|whatsapp|messenger/i.test(userAgent);

  if (isCrawler) {
    // For crawlers, return a generic page without accessing the actual secret
    return res.render('view_secret', { secret: "Please open this link directly in your browser" });
  }

  try {
    const encryptedSecret = await storage.get(id);
    if (!encryptedSecret) {
      return res.render('view_secret', { secret: "notfound" });
    }

    // Only delete the secret once the user explicitly requests to view it
    // The actual deletion will now happen via API call
    res.render('view_secret', { secret: encryptedSecret });
  } catch (error) {
    console.error('Error getting secret:', error);
    res.status(500).send('Error getting secret (500)');
  }
});

// New endpoint to delete the secret after user confirmation
app.delete('/secret/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await storage.del(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting secret:', error);
    res.status(500).json({ error: 'Error deleting secret' });
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