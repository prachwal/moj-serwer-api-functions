import { YoutubeTranscript } from 'youtube-transcript';
import { logger } from './logger.mjs';
import { initializeMongo } from './mongoClient.mjs';


export async function fetchAndStoreSubtitles(mongoUri) {
  const mongoClient = await initializeMongo(mongoUri);
  const database = mongoClient.db('youtube_data');
  const videosCollection = database.collection('videos');
  const subtitlesCollection = database.collection('subtitles');

  try {
    logger.info('Fetching a batch of 50 videos from the database...');
    const limit = 50;

    const videos = await videosCollection
      .find({
        $or: [
          { subtitles: { $exists: false } },
          { last_downloaded: { $exists: false } }
        ]
      })
      .sort({ published_at: -1 })
      .limit(limit)
      .toArray();

    if (videos.length === 0) {
      logger.info('No videos to process.');
      return;
    }

    const totalVideos = videos.length;
    let processedVideos = 0;

    for (const video of videos) {
      const videoId = video.video_id;
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      logger.info(`Processing subtitles for video ID: ${videoId}`);

      try {
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

      processedVideos++;
      const progress = ((processedVideos / totalVideos) * 100).toFixed(2);
      logger.info(`Progress: ${progress}% (${processedVideos}/${totalVideos})`);
    }
  } catch (error) {
    logger.error(`Error during subtitle processing: ${error.message}`);
    throw error;
  } finally {
    await mongoClient.close();
    logger.info('MongoDB connection closed.');
  }
}

export async function countVideosWithoutSubtitles(mongoUri) {
  const mongoClient = await initializeMongo(mongoUri);
  const database = mongoClient.db('youtube_data');
  const videosCollection = database.collection('videos');

  try {
    const count = await videosCollection.countDocuments({
      $or: [
        { subtitles: { $exists: false } },
        { last_downloaded: { $exists: false } }
      ]
    });

    logger.info(`Number of videos without subtitles: ${count}`);
  } catch (error) {
    logger.error(`Error counting videos without subtitles: ${error.message}`);
    throw error;
  } finally {
    await mongoClient.close();
    logger.info('MongoDB connection closed.');
  }
}

export async function countTotalSubtitles(mongoUri) {
  const mongoClient = await initializeMongo(mongoUri);
  const database = mongoClient.db('youtube_data');
  const subtitlesCollection = database.collection('subtitles');

  try {
    const count = await subtitlesCollection.countDocuments();
    logger.info(`Total number of subtitles in the database: ${count}`);
  } catch (error) {
    logger.error(`Error counting total subtitles: ${error.message}`);
    throw error;
  } finally {
    await mongoClient.close();
    logger.info('MongoDB connection closed.');
  }
}

export async function printSubtitlesForVideo(mongoUri, videoId) {
  const mongoClient = await initializeMongo(mongoUri);
  const database = mongoClient.db('youtube_data');
  const subtitlesCollection = database.collection('subtitles');

  try {
    const subtitles = await subtitlesCollection.findOne({ video_id: videoId });

    if (!subtitles || !subtitles.subtitles) {
      logger.info(`No subtitles found for video ID: ${videoId}`);
      return;
    }

    logger.info(`Subtitles for video ID: ${videoId}:`);
    subtitles.subtitles.forEach((subtitle) => {
      console.log(`[${subtitle.startTime} --> ${subtitle.endTime}] ${subtitle.text}`);
    });
  } catch (error) {
    logger.error(`Error fetching subtitles for video ID: ${videoId}: ${error.message}`);
    throw error;
  } finally {
    await mongoClient.close();
    logger.info('MongoDB connection closed.');
  }
}

export async function scanUniqueFieldsInSubtitles(mongoUri) {
  const mongoClient = await initializeMongo(mongoUri);
  const database = mongoClient.db('youtube_data');
  const subtitlesCollection = database.collection('subtitles');

  try {
    const result = await subtitlesCollection.aggregate([
      { $project: { fields: { $objectToArray: "$$ROOT" } } },
      { $unwind: "$fields" },
      { $group: { _id: null, uniqueProperties: { $addToSet: "$fields.k" } } }
    ]).toArray();

    if (result.length > 0) {
      logger.info('Unique fields in subtitles collection:');
      console.log(result[0].uniqueProperties);
    } else {
      logger.info('No unique fields found in subtitles collection.');
    }
  } catch (error) {
    logger.error(`Error scanning unique fields in subtitles collection: ${error.message}`);
    throw error;
  } finally {
    await mongoClient.close();
    logger.info('MongoDB connection closed.');
  }
}

export async function cleanSubtitlesCollection(mongoUri) {
  const mongoClient = await initializeMongo(mongoUri);
  const database = mongoClient.db('youtube_data');
  const subtitlesCollection = database.collection('subtitles');

  try {
    const result = await subtitlesCollection.updateMany(
      { subtitles_file_content: { $exists: true } },
      { $unset: { subtitles_file_content: "" } }
    );

    logger.info(`Cleaned ${result.modifiedCount} documents by removing 'subtitles_file_content' field.`);
  } catch (error) {
    logger.error(`Error cleaning subtitles collection: ${error.message}`);
    throw error;
  } finally {
    await mongoClient.close();
    logger.info('MongoDB connection closed.');
  }
}

export function formatSrtTime(milliseconds) {
  const date = new Date(milliseconds);
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const seconds = date.getUTCSeconds().toString().padStart(2, '0');
  const ms = date.getUTCMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds},${ms}`;
}
