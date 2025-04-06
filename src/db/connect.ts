import { MongoClient } from "mongodb";
import config from "../config";

let client: MongoClient | null = null;

const connectDB = async (): Promise<MongoClient> => {
  try {
    if (client) {
      await client.db().admin().ping();
      return client;
    }

    client = new MongoClient(config.db.uri);
    await client.connect();
    // Verify connection
    await client.db().admin().ping();
    console.log("Successfully connected to MongoDB");
    return client;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    if (client) {
      await client.close();
      client = null;
    }
    throw error;
  }
};

const getDB = async () => {
  const client = await connectDB();
  return client.db(config.db.name);
};

const closeDB = async () => {
  if (client) {
    await client.close();
    client = null;
  }
};

export { connectDB, getDB, closeDB };
