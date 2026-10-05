const { MongoClient, ServerApiVersion } = require('mongodb');

const DEFAULT_DB_NAME = process.env.MONGODB_DB_NAME || 'postcard';

let clientPromise = null;
let indexesPromise = null;

async function getMongoClient() {
  if (!process.env.MONGODB_URI) {
    throw new Error('Missing MONGODB_URI environment variable.');
  }

  if (!clientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI, {
      serverApi: ServerApiVersion.v1,
      tls: true,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
    });

    clientPromise = client.connect().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }

  return clientPromise;
}

async function ensureIndexes(database) {
  if (!indexesPromise) {
    indexesPromise = Promise.all([
      database.collection('postcards').createIndex({ userId: 1, createdAt: -1 }),
      database.collection('postcards').createIndex({ travelerId: 1, createdAt: -1 }),
      database.collection('postcards').createIndex({ city: 1, createdAt: -1 }),
      database
        .collection('cities')
        .createIndex({ userId: 1, cityName: 1, countryName: 1 }, { unique: true }),
      database.collection('cities').createIndex({ userId: 1, updatedAt: -1 }),
    ]).catch((error) => {
      indexesPromise = null;
      throw error;
    });
  }

  await indexesPromise;
}

async function getDatabase() {
  const client = await getMongoClient();
  const database = client.db(DEFAULT_DB_NAME);

  await ensureIndexes(database);

  return database;
}

async function closeMongoConnection() {
  if (!clientPromise) {
    return;
  }

  const client = await clientPromise;
  await client.close();
  clientPromise = null;
  indexesPromise = null;
}

module.exports = {
  closeMongoConnection,
  getDatabase,
};
