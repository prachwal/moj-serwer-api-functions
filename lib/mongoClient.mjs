import { MongoClient } from 'mongodb';
import { logger } from './logger.mjs';

let mongoClient = null;

/**
 * Initializes the MongoDB client.
 * Ensures a single shared instance is used across the application.
 * @param {string} uri - MongoDB connection URI.
 * @returns {Promise<Object>} - MongoDB client instance.
 */
export async function initializeMongo(uri) {
  if (!mongoClient) {
    logger.info('Initializing MongoDB client...');
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    logger.info('MongoDB client initialized successfully.');
  }
  return mongoClient;
}

/**
 * Closes the shared MongoDB client connection.
 * @returns {Promise<void>}
 */
export async function closeMongoConnection() {
  if (mongoClient) {
    logger.info('Closing MongoDB connection...');
    await mongoClient.close();
    mongoClient = null;
    logger.info('MongoDB connection closed.');
  }
}

