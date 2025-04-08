import { createAppLogger } from '../lib/logger.mjs';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { config } from 'dotenv';
import { processYoutubeChannels, processYoutubeVideo } from '../lib/youtubeChannelProcessor.mjs';

config();

// Parse command-line arguments
const argv = yargs(hideBin(process.argv))
  .option('channel', {
    type: 'string',
    description: 'Process only a specific channel ID',
  })
  .option('video', {
    type: 'string',
    description: 'Process only a specific video ID (e.g., sHUnCk3JC1s)',
  })
  .option('limit', {
    type: 'number',
    default: 50,
    description: 'Limit number of videos to process per channel',
  })
  .option('verbose', {
    type: 'boolean',
    default: false,
    description: 'Enable verbose logging',
  })
  .help()
  .alias('help', 'h')
  .argv;

// Create logger
const logger = createAppLogger(argv.verbose ? "debug" : "info");

// Main execution
if (new URL(import.meta.url).pathname.slice(1) === process.argv[1].replace(/\\/g, '/')) {
  if (argv.video) {
    // Process a single video if video ID is provided
    processYoutubeVideo(argv.video, logger)
      .then(() => logger.info(`YouTube video ${argv.video} refreshed successfully`))
      .catch(error => {
        logger.error(`YouTube video refresh failed: ${error.message}`);
        process.exit(1);
      });
  } else {
    // Process channels as before
    processYoutubeChannels({
      specificChannelId: argv.channel,
      videoLimit: argv.limit
    }, logger)
      .then(() => logger.info('YouTube data fetching completed successfully'))
      .catch(error => {
        logger.error(`YouTube data fetching failed: ${error.message}`);
        process.exit(1);
      });
  }
}

// Export the main functions
export { processYoutubeChannels, processYoutubeVideo };

// You can also re-export all functions from the module
// export * from '../lib/youtubeChannelProcessor.mjs;