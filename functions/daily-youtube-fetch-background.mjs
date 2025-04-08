import { processYoutubeChannels } from '../lib/youtubeChannelProcessor.mjs';
import { logger } from "../lib/logger.mjs"; // Import the shared logger

export default async (req, context) => {
  logger.info("Uruchamianie zaplanowanego zadania w tle...");

  try {
    logger.debug("Rozpoczynanie przetwarzania danych z YouTube...");
    // await processYoutubeData(process.env, logger); // Pass environment variables and logger

    processYoutubeChannels({
      specificChannelId: false,
      videoLimit: 10
    }, logger)

    logger.info("Zaplanowane zadanie w tle zakończone pomyślnie.");
  } catch (error) {
    logger.error("Błąd podczas wykonywania zaplanowanego zadania w tle:", error);
  }
};

export const config = {
  schedule: "0 */6 * * *", // Uruchamia się co 6 godzin (o 0:00, 6:00, 12:00, 18:00)
};