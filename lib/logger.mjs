import { createLogger, format, transports } from "winston";

/**
 * Creates a configured logger instance
 * @param {string} [level="debug"] - The logging level
 * @returns {object} Winston logger instance
 */
export function createAppLogger(level = "debug") {
  return createLogger({
    level: level,
    format: format.combine(
      format.timestamp(),
      format.printf(({ timestamp, level, message }) => 
        `${timestamp} [${level.toUpperCase()}]: ${message}`)
    ),
    transports: [
      new transports.Console(),
    ],
  });
}

// Default logger instance for quick imports
export const logger = createAppLogger();
