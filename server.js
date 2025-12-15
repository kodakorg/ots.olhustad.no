const express = require('express');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static("public"));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/img', express.static(path.join(__dirname, 'public/img')));

app.set('view engine', 'ejs');

const redisURL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const client = redis.createClient({
  url: redisURL
});
const PORT = process.env.PORT || 8088;

client.on('error', (err) => console.error('Redis Client Error', err));

app.get('/', (req, res) => {
  res.render('create_secret');
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
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
    await client.set(id, JSON.stringify(encryptedSecret), { EX: ttlInt });
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
    const encryptedSecret = await client.get(id);
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
    await client.del(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting secret:', error);
    res.status(500).json({ error: 'Error deleting secret' });
  }
});

async function startServer() {
  try {
    await client.connect();
    console.log('Connected to Redis');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
  }
}

startServer();