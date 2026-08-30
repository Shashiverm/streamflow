import { defineConfig } from 'vite';
import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import dns from 'dns';

// Fix Node.js SRV DNS lookup issues on Windows
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

function loadEnvUri() {
  try {
    const envPath = path.resolve(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/MONGODB_URI=["']?([^"'\r\n]+)["']?/);
      if (match) return match[1];
    }
  } catch {}
  return process.env.MONGODB_URI;
}

const mongoUri = loadEnvUri();
let cachedClient = null;
let lastErrorTime = 0;

async function getDbCollection() {
  if (!mongoUri) return null;
  if (Date.now() - lastErrorTime < 30000) return null;

  try {
    if (!cachedClient) {
      cachedClient = new MongoClient(mongoUri, {
        serverSelectionTimeoutMS: 3000,
        connectTimeoutMS: 3000,
      });
      await cachedClient.connect();
      console.log('[Vite Dev API] Connected to MongoDB Atlas.');
    }
    return cachedClient.db('streamflow').collection('feedback');
  } catch (err) {
    lastErrorTime = Date.now();
    cachedClient = null;
    return null;
  }
}

// In-memory fallback cache for dev server
const localDevFeedbacks = [];

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
              if (items.length > 0) {
                res.statusCode = 200;
                return res.end(JSON.stringify({
                  success: true,
                  data: items.map(i => ({
                    id: i._id.toString(),
                    name: i.name || 'Anonymous User',
                    rating: i.rating || 5,
                    comment: i.comment || i.message || '',
                    userAddress: i.userAddress || '',
                    timestamp: i.timestamp
                  }))
                }));
              }
            } catch (e) {
              lastErrorTime = Date.now();
            }
          }
          res.statusCode = 200;
          return res.end(JSON.stringify({ success: true, data: localDevFeedbacks }));
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const { name, comment, message, userAddress, rating } = parsed;
              const sanitizedName = (name || '').slice(0, 100).trim();
              const sanitizedComment = (comment || message || '').slice(0, 500).trim();
              const sanitizedAddress = (userAddress || '').slice(0, 64).trim();
              const numRating = parseInt(rating, 10) || 5;

              if (!sanitizedName) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ success: false, error: 'Name is required.' }));
              }

              if (!sanitizedComment) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ success: false, error: 'Message is required.' }));
              }

              const newEntry = {
                id: 'local_' + Date.now(),
                name: sanitizedName,
                rating: numRating,
                comment: sanitizedComment,
                userAddress: sanitizedAddress,
                timestamp: new Date().toISOString()
              };

              localDevFeedbacks.unshift(newEntry);

              if (col) {
                try {
                  const result = await col.insertOne({
                    name: newEntry.name,
                    rating: newEntry.rating,
                    comment: newEntry.comment,
                    userAddress: newEntry.userAddress,
                    timestamp: newEntry.timestamp
                  });
                  newEntry.id = result.insertedId.toString();
                } catch (insertErr) {
                  lastErrorTime = Date.now();
                }
              }

              res.statusCode = 201;
              return res.end(JSON.stringify({
                success: true,
                data: newEntry
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
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          stellar: ['@stellar/stellar-sdk'],
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  define: {
    global: 'globalThis',
  },
});
