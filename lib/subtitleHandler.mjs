import { YoutubeTranscript } from 'youtube-transcript';
import { decode } from 'html-entities';

/**
 * Fetches and formats subtitles for a YouTube video
 * @param {string} videoId - YouTube video ID
 * @param {Object} logger - Logger instance for logging messages
 * @returns {Promise<Array>} - Array of formatted subtitle objects
 */
export async function fetchAndFormatSubtitles(videoId, logger) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  if (logger) {
    logger.info(`Fetching subtitles for video ID: ${videoId}`);
  }

  const transcripts = await YoutubeTranscript.fetchTranscript(videoUrl, { lang: 'pl' });
  return transcripts.map((item, index) => ({
    index,
    startTime: formatSrtTime(item.offset),
    endTime: formatSrtTime(item.offset + item.duration),
    offset: item.offset,
    duration: item.duration,
    text: decode(item.text, {level: 'html5'}), // Use html-entities library to decode HTML entities
  }));
}

/**
 * Updates or inserts subtitles for a video in the database
 * @param {Object} subtitlesCollection - MongoDB collection for subtitles
 * @param {string} videoId - YouTube video ID
 * @param {Array} formattedSubtitles - Array of formatted subtitle objects
 * @param {Object} logger - Logger instance for logging messages
 */
export async function updateSubtitlesInDatabase(subtitlesCollection, videoId, formattedSubtitles, logger) {
  await subtitlesCollection.updateOne(
    { video_id: videoId }, // Match by video_id
    { 
      $set: { 
        video_id: videoId, 
        subtitles: formattedSubtitles, 
        last_downloaded: new Date() // Add or update current date
      } 
    },
    { upsert: true } // Insert a new document if none exists
  );

  if (logger) {
    logger.info(`Subtitles for video ID: ${videoId} have been saved.`);
  }
}

/**
 * Fetches subtitles for a video and stores them in the database
 * @param {string} videoId - YouTube video ID
 * @param {Object} mongo - MongoDB client instance
 * @param {Object} logger - Logger instance for logging messages
 */
export async function fetchAndStoreSubtitlesForVideo(videoId, mongo, logger) {
  try {
    const database = mongo.db('youtube_data');
    const subtitlesCollection = database.collection('subtitles');

    logger.info(`Fetching subtitles for video ID: ${videoId}`);
    const formattedSubtitles = await fetchAndFormatSubtitles(videoId, logger);
    await updateSubtitlesInDatabase(subtitlesCollection, videoId, formattedSubtitles, logger);
    
    return formattedSubtitles;
  } catch (error) {
    logger.error(`Failed to fetch subtitles for video ID: ${videoId}: ${error.message}`);
    throw error;
  }
}

/**
 * Helper function to format time in SRT format
 * @param {number} milliseconds - Time in milliseconds
 * @returns {string} - Formatted time string (HH:MM:SS,mmm)
 */
export function formatSrtTime(milliseconds) {
  const date = new Date(milliseconds);
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const seconds = date.getUTCSeconds().toString().padStart(2, '0');
  const ms = date.getUTCMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds},${ms}`;
}

export default {
  fetchAndFormatSubtitles,
  updateSubtitlesInDatabase,
  fetchAndStoreSubtitlesForVideo,
  formatSrtTime
};
