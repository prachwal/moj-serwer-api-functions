import { processYoutubeData } from "../lib/YoutubeProcessor.mjs"; // Import the function
import { logger } from "../lib/logger.mjs"; // Import the shared logger

export default async (req, context) => {
  logger.info("Uruchamianie zaplanowanego zadania w tle...");

  try {
    logger.debug("Rozpoczynanie przetwarzania danych z YouTube...");
    await processYoutubeData(process.env, logger); // Pass environment variables and logger
    logger.info("Zaplanowane zadanie w tle zakończone pomyślnie.");
  } catch (error) {
    logger.error("Błąd podczas wykonywania zaplanowanego zadania w tle:", error);
  }
};

export const config = {
  schedule: "@daily", // Run at midnight every day
}; 