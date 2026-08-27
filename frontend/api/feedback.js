import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
let cachedClient = null;

async function getClient() {
  if (cachedClient) return cachedClient;
  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  });
  await client.connect();
  cachedClient = client;
  return cachedClient;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const client = await getClient();
    const db = client.db('streamflow');
    const collection = db.collection('feedback');

    if (req.method === 'GET') {
      const limit = parseInt(req.query?.limit || '50', 10);
      const items = await collection
        .find({})
        .sort({ timestamp: -1 })
        .limit(Math.min(limit, 100))
        .toArray();

      return res.status(200).json({
        success: true,
        data: items.map(item => ({
          id: item._id.toString(),
          rating: item.rating,
          comment: item.comment,
          userAddress: item.userAddress || '',
          timestamp: item.timestamp,
        })),
      });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { rating, comment, userAddress } = body || {};

      const numRating = parseInt(rating, 10);
      if (!numRating || numRating < 1 || numRating > 5) {
        return res.status(400).json({ success: false, error: 'Invalid rating (must be 1-5).' });
      }

      const sanitizedComment = (comment || '').toString().slice(0, 500).trim();
      const sanitizedAddress = (userAddress || '').toString().slice(0, 64).trim();

      const newEntry = {
        rating: numRating,
        comment: sanitizedComment,
        userAddress: sanitizedAddress,
        timestamp: new Date().toISOString(),
      };

      const result = await collection.insertOne(newEntry);

      return res.status(201).json({
        success: true,
        data: {
          id: result.insertedId.toString(),
          ...newEntry,
        },
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('MongoDB Feedback API Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Database connection failed.',
      details: error.message,
    });
  }
}
