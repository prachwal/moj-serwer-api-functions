import { google } from 'googleapis';
import { MongoClient } from 'mongodb';
import { convertISODurationToSeconds } from './durationConverter.mjs';
import { analyzeSentiment } from './aiQueryBuilder.mjs'; // Import analyzeSentiment
import { YoutubeTranscript } from 'youtube-transcript'; // Import YoutubeTranscript

let youtube;
let currentApiKeyIndex = 0;

/**
 * Initializes the YouTube API client with the current API key.
 * @param {Object} env - Environment variables containing the list of YouTube API keys.
 */
function initializeYouTube(env) {
  if (!env.YOUTUBE_API_KEYS) {
    throw new Error("Environment variable YOUTUBE_API_KEYS is not defined.");
  }

  const apiKeys = env.YOUTUBE_API_KEYS.split(','); // Define a list of API keys
  if (!youtube || currentApiKeyIndex >= apiKeys.length) {
    if (currentApiKeyIndex >= apiKeys.length) {
      throw new Error("All YouTube API keys have exceeded their quota.");
    }
    youtube = google.youtube({
      version: 'v3',
      auth: apiKeys[currentApiKeyIndex],
    });
  }
}

/**
 * Switches to the next API key in case of a quota error.
 * @param {Object} env - Environment variables containing the list of YouTube API keys.
 */
function switchToNextApiKey(env) {
  if (!env.YOUTUBE_API_KEYS) {
    throw new Error("Environment variable YOUTUBE_API_KEYS is not defined.");
  }

  const apiKeys = env.YOUTUBE_API_KEYS.split(',');
  currentApiKeyIndex++;
  if (currentApiKeyIndex < apiKeys.length) {
    youtube = google.youtube({
      version: 'v3',
      auth: apiKeys[currentApiKeyIndex],
    });
  } else {
    throw new Error("All YouTube API keys have exceeded their quota.");
  }
}

export async function refreshSingleVideoData(videoId, env, logger) {
  initializeYouTube(env);

  const client = new MongoClient(env.MONGO_URI);
  await client.connect();
  const database = client.db("youtube_data");
  const videosCollection = database.collection("videos");
  const subtitlesCollection = database.collection("subtitles"); // Add subtitles collection

  try {
    logger.info(`Sprawdzanie istnienia wideo o ID: ${videoId} w bazie danych...`);
    let videoData = await videosCollection.findOne({ video_id: videoId });

    if (!videoData) {
      logger.info(`Wideo o ID: ${videoId} nie znaleziono w bazie danych. Pobieranie z API YouTube...`);
      let response;
      try {
        response = await youtube.videos.list({
          part: "snippet,statistics,contentDetails",
          id: videoId,
        });
      } catch (error) {
        if (error.errors && error.errors[0]?.reason === "quotaExceeded") {
          logger.warn("YouTube API quota exceeded. Switching to the next API key...");
          switchToNextApiKey(env);
          return await refreshSingleVideoData(videoId, env, logger); // Retry with the next API key
        }
        throw error;
      }

      const video = response.data.items[0];
      if (!video) {
        throw new Error(`Video with ID ${videoId} not found on YouTube.`);
      }

      videoData = {
        video_id: video.id,
        category_id: video.snippet.categoryId,
        channel_id: video.snippet.channelId,
        channel_name: video.snippet.channelTitle,
        comment_count: video.statistics.commentCount || "0",
        description: video.snippet.description,
        duration: video.contentDetails.duration,
        like_count: video.statistics.likeCount || "0",
        published_at: video.snippet.publishedAt,
        tags: video.snippet.tags || [],
        thumbnail_url: video.snippet.thumbnails.default.url,
        title: video.snippet.title,
        video_url: `https://www.youtube.com/watch?v=${video.id}`,
        view_count: video.statistics.viewCount || "0",
        sentiment: undefined, // Initialize sentiment as undefined
      };

      // Fetch subtitles for the new video
      try {
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        logger.info(`Fetching subtitles for new video ID: ${videoId}`);
        const transcripts = await YoutubeTranscript.fetchTranscript(videoUrl, { lang: 'pl' });
        const formattedSubtitles = transcripts.map((item, index) => ({
          index,
          startTime: formatSrtTime(item.offset),
          endTime: formatSrtTime(item.offset + item.duration),
          text: item.text,
        }));

        await subtitlesCollection.updateOne(
          { video_id: videoId },
          {
            $set: {
              video_id: videoId,
              subtitles: formattedSubtitles,
              last_downloaded: new Date()
            }
          },
          { upsert: true }
        );

        logger.info(`Subtitles for video ID: ${videoId} have been saved.`);
      } catch (error) {
        logger.error(`Failed to fetch subtitles for video ID: ${videoId}: ${error.message}`);
      }
    }

    // Check and calculate sentiment if missing, "Error", or undefined
    if (!videoData.sentiment || videoData.sentiment === "Error" || videoData.sentiment === undefined) {
      const textToAnalyze = videoData.title || videoData.description || "";
      let sentiment = "Neutral";
      if (textToAnalyze) {
        sentiment = await analyzeSentiment(textToAnalyze, env, logger); // Pass env and logger
        logger.info(`Analiza sentymentu dla wideo "${videoData.title}": ${sentiment}`);
      }
      videoData.sentiment = sentiment;
    }

    // Convert ISO duration to seconds
    const durationSeconds = convertISODurationToSeconds(videoData.duration);
    videoData.duration_seconds = durationSeconds;

    // Overwrite the object in the database
    await videosCollection.updateOne(
      { video_id: videoId },
      { $set: videoData },
      { upsert: true } // Insert if it doesn't exist
    );
    logger.info(`Dane wideo dla ID: ${videoId} zostały zaktualizowane w bazie danych.`);
  } catch (error) {
    logger.error(`Błąd podczas przetwarzania wideo o ID ${videoId}:`, error);
    throw error;
  } finally {
    await client.close();
    logger.info("Zamknięto połączenie z MongoDB.");
  }
}

export async function processYoutubeData(env, logger) {
  initializeYouTube(env);

  let client;

  async function connectToDatabase() {
    if (!client) {
      logger.info("Connecting to MongoDB...");
      client = new MongoClient(env.MONGO_URI);
      await client.connect();
      logger.info("Connected to MongoDB.");
    }
  }

  async function closeDatabaseConnection() {
    if (client) {
      logger.info("Closing MongoDB connection...");
      await client.close();
      client = null;
      logger.info("Closed MongoDB connection.");
    }
  }

  try {
    await connectToDatabase();
    const database = client.db("youtube_data");
    const channelsCollection = database.collection("channels");
    const videosCollection = database.collection("videos");

    // Fetch all channels from the "channels" collection
    const channels = await channelsCollection.find({}).toArray();

    for (const channel of channels) {
      const { channel_id, channel_name } = channel;

      // Find the latest video publication date for the channel
      const latestVideo = await videosCollection
        .find({ channel_id })
        .sort({ published_at: -1 })
        .limit(1)
        .toArray();

      const lastPublishedDate = latestVideo[0]?.published_at || '1970-01-01T00:00:00Z';

      let nextPageToken = null;
      do {
        let response;
        try {
          // Fetch videos from YouTube API published after the last published date
          response = await youtube.search.list({
            part: 'snippet',
            channelId: channel_id,
            publishedAfter: lastPublishedDate,
            maxResults: 50,
            order: 'date',
            pageToken: nextPageToken,
          });
        } catch (error) {
          if (error.errors && error.errors[0]?.reason === "quotaExceeded") {
            logger.warn("YouTube API quota exceeded. Switching to the next API key...");
            switchToNextApiKey(env);
            continue; // Retry the current iteration with the next API key
          }
          throw error;
        }

        const videoIds = response.data.items.map(item => item.id.videoId).filter(Boolean);

        if (videoIds.length > 0) {
          for (const videoId of videoIds) {
            await refreshSingleVideoData(videoId, env, logger); // Use the single video refresh function
          }
        }

        nextPageToken = response.data.nextPageToken; // Update the token for the next page
      } while (nextPageToken);
    }

    logger.info('Pomyślnie pobrano i zapisano metadane wideo.');
  } catch (error) {
    logger.error(`Błąd: ${error.message}`);
    throw error;
  } finally {
    await closeDatabaseConnection();
    logger.info("Zamknięto połączenie z MongoDB.");
  }
}
