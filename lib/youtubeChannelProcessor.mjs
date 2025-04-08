import { google } from 'googleapis';
import { MongoClient } from 'mongodb';
import { convertISODurationToSeconds } from './durationConverter.mjs';
import { analyzeSentiment, initializeOpenAI } from './aiQueryBuilder.mjs';
import { fetchAndStoreSubtitlesForVideo } from './subtitleHandler.mjs';

// Global variables
let youtube;
let currentApiKeyIndex = 0;
let mongoClient = null;

/**
 * Initializes the YouTube API client with the current API key
 */
export function initializeYouTube(tokens, logger) {
  if (!tokens) {
    throw new Error("Environment variable YOUTUBE_API_KEYS is not defined.");
  }

  const apiKeys = tokens.split(',');
  if (!youtube || currentApiKeyIndex >= apiKeys.length) {
    if (currentApiKeyIndex >= apiKeys.length) {
      throw new Error("All YouTube API keys have exceeded their quota.");
    }
    youtube = google.youtube({
      version: 'v3',
      auth: apiKeys[currentApiKeyIndex],
    });
  }
  return youtube;
}

/**
 * Switches to the next API key in case of a quota error
 */
export function switchToNextApiKey(tokens, logger) {
  if (!tokens || tokens.trim() === "") {
    throw new Error("Environment variable YOUTUBE_API_KEYS is not defined or empty.");
  }

  const apiKeys = tokens.split(',');
  currentApiKeyIndex++;
  if (currentApiKeyIndex < apiKeys.length) {
    logger.info(`Switching to API key ${currentApiKeyIndex + 1}/${apiKeys.length}`);
    youtube = google.youtube({
      version: 'v3',
      auth: apiKeys[currentApiKeyIndex],
    });
  } else {
    throw new Error("All YouTube API keys have exceeded their quota.");
  }
}

/**
 * Initializes MongoDB connection
 */
export async function initializeMongo(uri, logger) {
  if (!mongoClient) {
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    logger.info("Connected to MongoDB");
  }
  return mongoClient;
}

/**
 * Fetches details for a specific YouTube channel
 * @param {string} channelId - The ID of the YouTube channel
 */
export async function fetchChannelDetails(channelId, logger) {
  try {
    logger.info(`Fetching details for channel ID: ${channelId}...`);
    
    let response;
    try {
      response = await youtube.channels.list({
        part: 'snippet,statistics,brandingSettings',
        id: channelId,
      });
    } catch (error) {
      if (error.errors && error.errors[0]?.reason === "quotaExceeded") {
        logger.warn("YouTube API quota exceeded. Switching to the next API key...");
        switchToNextApiKey(process.env.YOUTUBE_API_KEYS, logger);
        return fetchChannelDetails(channelId, logger);
      }
      throw error;
    }

    const channelData = response.data.items[0];
    if (!channelData) {
      throw new Error(`No data found for channel ID: ${channelId}`);
    }

    logger.info(`Successfully fetched details for channel: ${channelData.snippet.title}`);
    return channelData;
  } catch (error) {
    logger.error(`Error fetching details for channel ID: ${channelId}: ${error.message}`);
    throw error;
  }
}

/**
 * Updates or adds a channel to the database
 * @param {string} channelId - The ID of the YouTube channel
 * @param {Object} channelsCollection - MongoDB collection for channels
 */
export async function updateChannelInDatabase(channelId, channelsCollection, logger) {
  try {
    const channelData = await fetchChannelDetails(channelId, logger);
    
    const updatedData = {
      channel_id: channelData.id,
      channel_name: channelData.snippet.title,
      description: channelData.snippet.description,
      published_at: channelData.snippet.publishedAt,
      thumbnail_url: channelData.snippet.thumbnails.default.url,
      country: channelData.snippet.country || null,
      view_count: channelData.statistics.viewCount || "0",
      subscriber_count: channelData.statistics.subscriberCount || "0",
      video_count: channelData.statistics.videoCount || "0",
      banner_url: channelData.brandingSettings?.image?.bannerExternalUrl || null,
      last_updated: new Date().toISOString()
    };
    
    const result = await channelsCollection.updateOne(
      { channel_id: channelId },
      { $set: updatedData },
      { upsert: true }
    );
    
    if (result.modifiedCount > 0) {
      logger.info(`Channel data updated for: ${channelData.snippet.title}`);
    } else if (result.upsertedCount > 0) {
      logger.info(`New channel added: ${channelData.snippet.title}`);
    } else {
      logger.info(`No changes needed for channel: ${channelData.snippet.title}`);
    }
    
    return updatedData;
  } catch (error) {
    logger.error(`Error updating channel ID ${channelId}: ${error.message}`);
    throw error;
  }
}

/**
 * Gets latest videos from a channel's uploads playlist
 */
export async function getLatestVideosFromChannel(channelId, maxResults = 50, logger) {
  try {
    logger.info(`Fetching uploads playlist for channel: ${channelId}`);
    
    // Get the uploads playlist ID for the channel
    let channelResponse;
    try {
      channelResponse = await youtube.channels.list({
        part: "contentDetails",
        id: channelId
      });
    } catch (error) {
      if (error.errors && error.errors[0]?.reason === "quotaExceeded") {
        logger.warn("YouTube API quota exceeded. Switching to the next API key...");
        switchToNextApiKey(process.env.YOUTUBE_API_KEYS, logger);
        return getLatestVideosFromChannel(channelId, maxResults, logger);
      }
      throw error;
    }
    
    if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
      throw new Error(`Channel not found: ${channelId}`);
    }
    
    // Get the uploads playlist ID
    const uploadsPlaylistId = channelResponse.data.items[0].contentDetails.relatedPlaylists.uploads;
    logger.debug(`Uploads playlist ID: ${uploadsPlaylistId}`);
    
    // Fetch videos from the uploads playlist
    let playlistResponse;
    try {
      playlistResponse = await youtube.playlistItems.list({
        part: "snippet,contentDetails",
        playlistId: uploadsPlaylistId,
        maxResults: maxResults
      });
    } catch (error) {
      if (error.errors && error.errors[0]?.reason === "quotaExceeded") {
        logger.warn("YouTube API quota exceeded. Switching to the next API key...");
        switchToNextApiKey(process.env.YOUTUBE_API_KEYS, logger);
        return getLatestVideosFromChannel(channelId, maxResults, logger);
      }
      throw error;
    }
    
    logger.info(`Retrieved ${playlistResponse.data.items.length} videos from channel ${channelId}`);
    return playlistResponse.data.items;
    
  } catch (error) {
    logger.error(`Error fetching videos for channel ${channelId}: ${error.message}`);
    throw error;
  }
}

/**
 * Gets detailed information for a specific video
 */
export async function getVideoDetails(videoId, logger) {
  try {
    logger.debug(`Fetching details for video: ${videoId}`);
    
    let response;
    try {
      response = await youtube.videos.list({
        part: "snippet,statistics,contentDetails",
        id: videoId,
      });
    } catch (error) {
      if (error.errors && error.errors[0]?.reason === "quotaExceeded") {
        logger.warn("YouTube API quota exceeded. Switching to the next API key...");
        switchToNextApiKey(process.env.YOUTUBE_API_KEYS, logger);
        return getVideoDetails(videoId, logger);
      }
      throw error;
    }

    const video = response.data.items[0];
    if (!video) {
      throw new Error(`Video with ID ${videoId} not found on YouTube.`);
    }

    return video;
  } catch (error) {
    logger.error(`Error fetching details for video ${videoId}: ${error.message}`);
    throw error;
  }
}

/**
 * Processes new videos from all channels or a specific channel
 */
export async function processYoutubeChannels(options = {}, logger) {
  const { specificChannelId, videoLimit = 50 } = options;
  
  try {
    logger.info('Starting YouTube channel processing...');
    
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI environment variable is not defined');
    }
    
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not defined');
    }
    
    // Initialize clients
    const mongo = await initializeMongo(mongoUri, logger);
    const database = mongo.db("youtube_data");
    const channelsCollection = database.collection("channels");
    
    youtube = initializeYouTube(process.env.YOUTUBE_API_KEYS, logger);
    const openai = initializeOpenAI(openaiKey);
    
    // Get channels to process
    let channelQuery = {};
    if (specificChannelId) {
      channelQuery = { channel_id: specificChannelId };
      logger.info(`Processing specific channel: ${specificChannelId}`);
    }
    
    const channels = await channelsCollection.find(channelQuery).toArray();
    logger.info(`Found ${channels.length} channels to process`);
    
    // First, update all channel data
    logger.info('Updating channel metadata...');
    for (const channel of channels) {
      try {
        await updateChannelInDatabase(channel.channel_id, channelsCollection, logger);
      } catch (error) {
        logger.error(`Failed to update channel ${channel.channel_id}: ${error.message}`);
        // Continue with next channel
      }
    }
    
    // Process each channel for videos
    for (const channel of channels) {
      try {
        logger.info(`Processing videos for channel: ${channel.channel_name} (${channel.channel_id})`);
        
        // Get latest videos from channel
        const channelVideos = await getLatestVideosFromChannel(channel.channel_id, videoLimit, logger);
        
        // Extract video IDs
        const videoItems = channelVideos.map(item => ({
          videoId: item.contentDetails.videoId,
          publishedAt: item.snippet.publishedAt
        }));
        
        logger.info(`Processing ${videoItems.length} videos for channel ${channel.channel_name}`);
        
        // Process each video using the refreshSingleVideoData function
        for (const item of videoItems) {
          try {
            await refreshSingleVideoData(item.videoId, process.env, logger);
          } catch (error) {
            logger.error(`Error processing video ${item.videoId}: ${error.message}`);
            // Continue with next video
          }
        }
        
      } catch (error) {
        logger.error(`Error processing channel ${channel.channel_id}: ${error.message}`);
        // Continue with next channel
      }
    }
    
    logger.info('YouTube channel processing completed successfully');
    
  } catch (error) {
    logger.error(`Error in YouTube channel processing: ${error.message}`);
    throw error;
  } finally {
    // Close MongoDB connection
    if (mongoClient) {
      await mongoClient.close();
      logger.info('MongoDB connection closed');
      mongoClient = null;
    }
  }
}

/**
 * Refreshes data for a single YouTube video
 * @param {string} videoId - The ID of the YouTube video to refresh
 * @param {Object} env - Environment variables
 * @param {Object} logger - Logger instance
 * @returns {Object} The updated video data
 */
export async function refreshSingleVideoData(videoId, env, logger) {
  let mongo = null;
  
  try {
    logger.info(`Starting refresh for video ID: ${videoId}`);
    
    // Initialize YouTube API
    youtube = initializeYouTube(env.YOUTUBE_API_KEYS, logger);
    
    // Initialize MongoDB connection
    const mongoUri = env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI environment variable is not defined');
    }
    
    mongo = await initializeMongo(mongoUri, logger);
    const database = mongo.db("youtube_data");
    const videosCollection = database.collection("videos");
    
    // Get video details from YouTube API
    const videoDetails = await getVideoDetails(videoId, logger);
    if (!videoDetails) {
      throw new Error(`Video with ID ${videoId} not found on YouTube.`);
    }
    
    // Check if video already exists in database
    const existingVideo = await videosCollection.findOne({ video_id: videoId });
    const isNew = !existingVideo;
    
    // Create video data object
    const videoData = {
      video_id: videoDetails.id,
      category_id: videoDetails.snippet.categoryId,
      channel_id: videoDetails.snippet.channelId,
      channel_name: videoDetails.snippet.channelTitle,
      comment_count: videoDetails.statistics.commentCount || "0",
      description: videoDetails.snippet.description,
      duration: videoDetails.contentDetails.duration,
      like_count: videoDetails.statistics.likeCount || "0",
      published_at: videoDetails.snippet.publishedAt,
      tags: videoDetails.snippet.tags || [],
      thumbnail_url: videoDetails.snippet.thumbnails.default?.url || "",
      title: videoDetails.snippet.title,
      video_url: `https://www.youtube.com/watch?v=${videoDetails.id}`,
      view_count: videoDetails.statistics.viewCount || "0",
      scan_date: new Date().toISOString(),
    };
    
    // Convert ISO duration to seconds
    const durationSeconds = convertISODurationToSeconds(videoData.duration);
    videoData.duration_seconds = durationSeconds;
    
    // Handle sentiment - preserve existing value or analyze for new videos
    if (isNew) {
      // For new videos, analyze sentiment
      const textToAnalyze = videoData.title + " " + (videoData.description || "");
      let sentiment = "Neutral";
      if (textToAnalyze.trim()) {
        sentiment = await analyzeSentiment(textToAnalyze, env, logger);
        logger.info(`Sentiment for new video "${videoData.title}": ${sentiment}`);
      }
      videoData.sentiment = sentiment;
    } else {
      // For existing videos, keep the existing sentiment
      videoData.sentiment = existingVideo.sentiment || "Neutral";
      logger.info(`Preserving existing sentiment for video "${videoData.title}": ${videoData.sentiment}`);
    }
    
    // Check and fetch subtitles if needed
    try {
      const subtitlesCollection = database.collection("subtitles");
      const existingSubtitles = await subtitlesCollection.findOne({ video_id: videoId });
      
      if (existingSubtitles && existingSubtitles.subtitles && existingSubtitles.subtitles.length > 0) {
        logger.debug(`Subtitles already exist for video: ${videoId}`);
        videoData.has_subtitles = true;
      } else {
        logger.debug(`No subtitles found in database, will attempt to fetch for: ${videoId}`);
        // Removed duplicate log message - fetchAndStoreSubtitlesForVideo will log on its own
        await fetchAndStoreSubtitlesForVideo(videoId, mongo, logger);
        videoData.has_subtitles = true;
      }
    } catch (error) {
      logger.warn(`Failed to fetch subtitles for video ${videoId}: ${error.message}`);
      videoData.has_subtitles = false;
    }
    
    // Save or update video in database
    if (isNew) {
      await videosCollection.insertOne(videoData);
      logger.info(`Added new video: ${videoData.title} (${videoId})`);
    } else {
      await videosCollection.updateOne(
        { video_id: videoId },
        { $set: videoData }
      );
      logger.info(`Updated existing video: ${videoData.title} (${videoId})`);
    }
    
    logger.info(`Successfully refreshed data for video ID: ${videoId}`);
    return videoData;
    
  } catch (error) {
    logger.error(`Error refreshing video ${videoId}: ${error.message}`);
    throw error;
  } finally {
    // Don't close the global mongo client if we're using it
    if (mongo && mongo !== mongoClient) {
      await mongo.close();
      logger.info('MongoDB connection closed');
    }
  }
}

/**
 * Processes a single YouTube video by its ID
 * @param {string} videoId - The ID of the YouTube video to process
 * @param {Object} logger - Logger instance
 * @returns {Promise<Object>} The processed video data
 */
export async function processYoutubeVideo(videoId, logger) {
  try {
    logger.info(`Processing single YouTube video: ${videoId}`);
    
    // Check for required environment variables
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI environment variable is not defined');
    }
    
    const youtubeApiKeys = process.env.YOUTUBE_API_KEYS;
    if (!youtubeApiKeys) {
      throw new Error('YOUTUBE_API_KEYS environment variable is not defined');
    }
    
    // Initialize YouTube API
    youtube = initializeYouTube(youtubeApiKeys, logger);
    
    // Process the video using the existing function
    const videoData = await refreshSingleVideoData(videoId, process.env, logger);
    
    logger.info(`Successfully processed video: ${videoData.title} (${videoId})`);
    return videoData;
    
  } catch (error) {
    logger.error(`Error processing video ${videoId}: ${error.message}`);
    throw error;
  } finally {
    // Close MongoDB connection if it's open
    if (mongoClient) {
      await mongoClient.close();
      logger.info('MongoDB connection closed');
      mongoClient = null;
    }
  }
}

export default {
  initializeYouTube,
  switchToNextApiKey,
  initializeMongo,
  fetchChannelDetails,
  updateChannelInDatabase,
  getLatestVideosFromChannel,
  getVideoDetails,
  processYoutubeChannels,
  refreshSingleVideoData,
  processYoutubeVideo
};
