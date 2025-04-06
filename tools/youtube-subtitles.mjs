import { logger } from '../lib/logger.mjs';
import { countVideosWithoutSubtitles, countTotalSubtitles, printSubtitlesForVideo, scanUniqueFieldsInSubtitles, cleanSubtitlesCollection, fetchAndStoreSubtitles } from '../lib/countVideosWithoutSubtitles.mjs';

// Main execution
if (import.meta.url === `file:///${process.argv[1]}`.replace(/\\/g, '/')) {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('Please set the MONGO_URI environment variable.');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  if (args.includes('--count')) {
    Promise.all([
      countVideosWithoutSubtitles(mongoUri),
      countTotalSubtitles(mongoUri)
    ])
      .then(() => logger.info('Count operations completed successfully.'))
      .catch((error) => logger.error(`Count operations failed: ${error.message}`));
  } else if (args.includes('--print')) {
    const videoId = args[args.indexOf('--print') + 1];
    if (!videoId) {
      console.error('Please provide a video ID after --print.');
      process.exit(1);
    }
    printSubtitlesForVideo(mongoUri, videoId)
      .then(() => logger.info('Subtitle printing completed successfully.'))
      .catch((error) => logger.error(`Subtitle printing failed: ${error.message}`));
  } else if (args.includes('--scan')) {
    scanUniqueFieldsInSubtitles(mongoUri)
      .then(() => logger.info('Scan operation completed successfully.'))
      .catch((error) => logger.error(`Scan operation failed: ${error.message}`));
  } else if (args.includes('--clean')) {
    cleanSubtitlesCollection(mongoUri)
      .then(() => logger.info('Clean operation completed successfully.'))
      .catch((error) => logger.error(`Clean operation failed: ${error.message}`));
  } else {
    fetchAndStoreSubtitles(mongoUri)
      .then(() => logger.info('Subtitle processing completed successfully.'))
      .catch((error) => logger.error(`Subtitle processing failed: ${error.message}`));
  }
}