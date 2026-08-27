import { defineConfig } from 'vite';
import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';

function loadEnvUri() {
  try {
    const envPath = path.resolve(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/MONGODB_URI=["']?([^"'\r\n]+)["']?/);
      if (match) return match[1];
    }
  } catch { }
  return process.env.MONGODB_URI;
}

const mongoUri = loadEnvUri();
let cachedClient = null;

async function getDbCollection() {
  if (!mongoUri) return null;
  try {
    if (!cachedClient) {
      cachedClient = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 4000 });
      await cachedClient.connect();
    }
    return cachedClient.db('streamflow').collection('feedback');
  } catch (err) {
    console.warn('[Vite Dev API] MongoDB connection fallback:', err.message);
    return null;
  }
}

function feedbackApiPlugin() {
  return {
    name: 'feedback-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/feedback')) {
          return next();
        }

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          return res.end();
        }

        const col = await getDbCollection();

        if (req.method === 'GET') {
          if (col) {
            try {
              const items = await col.find({}).sort({ timestamp: -1 }).limit(50).toArray();
              res.statusCode = 200;
              return res.end(JSON.stringify({
                success: true,
                data: items.map(i => ({
                  id: i._id.toString(),
                  rating: i.rating,
                  comment: i.comment,
                  userAddress: i.userAddress || '',
                  timestamp: i.timestamp
                }))
              }));
            } catch (e) {
              console.error('[Vite Dev API] Query error:', e);
            }
          }
          res.statusCode = 200;
          return res.end(JSON.stringify({ success: true, data: [] }));
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const { rating, comment, userAddress } = parsed;
              const numRating = parseInt(rating, 10);
              if (!numRating || numRating < 1 || numRating > 5) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ success: false, error: 'Invalid rating.' }));
              }

              const newEntry = {
                rating: numRating,
                comment: (comment || '').slice(0, 500),
                userAddress: (userAddress || '').slice(0, 64),
                timestamp: new Date().toISOString()
              };

              let id = 'local_' + Date.now();
              if (col) {
                const result = await col.insertOne(newEntry);
                id = result.insertedId.toString();
              }

              res.statusCode = 201;
              return res.end(JSON.stringify({
                success: true,
                data: { id, ...newEntry }
              }));
            } catch (err) {
              res.statusCode = 500;
              return res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [feedbackApiPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    open: true,
  },
  define: {
    global: 'globalThis',
  },
});
