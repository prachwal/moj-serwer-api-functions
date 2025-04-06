/**
 * Converts ISO 8601 duration format to seconds
 * @param {string} isoDuration - Duration in ISO 8601 format (e.g., "PT1H10M30S")
 * @returns {number} - Duration in seconds
 */
export function convertISODurationToSeconds(isoDuration) {
  if (!isoDuration || typeof isoDuration !== 'string') {
    console.warn(`Invalid duration format: ${isoDuration}`);
    return 0;
  }

  // Remove the "PT" prefix that appears in ISO 8601 durations
  const duration = isoDuration.replace('PT', '');
  
  // Extract hours, minutes, and seconds
  const hours = duration.match(/(\d+)H/);
  const minutes = duration.match(/(\d+)M/);
  const seconds = duration.match(/(\d+)S/);
  
  // Calculate total seconds
  let totalSeconds = 0;
  if (hours) totalSeconds += parseInt(hours[1]) * 3600;
  if (minutes) totalSeconds += parseInt(minutes[1]) * 60;
  if (seconds) totalSeconds += parseInt(seconds[1]);
  
  return totalSeconds;
}

/**
 * Converts ISO 8601 duration format to human-readable format
 * @param {string} isoDuration - Duration in ISO 8601 format (e.g., "PT1H10M30S")
 * @returns {string} - Human-readable duration (e.g., "1h 10m 30s")
 */
export function isoFormatDuration(isoDuration) {
  if (!isoDuration) return 'Unknown';

  // Remove the "PT" prefix that appears in ISO 8601 durations
  const duration = isoDuration.replace('PT', '');

  // Extract hours, minutes, and seconds
  const hours = duration.match(/(\d+)H/);
  const minutes = duration.match(/(\d+)M/);
  const seconds = duration.match(/(\d+)S/);

  // Create human-readable string
  let result = '';
  if (hours) result += `${hours[1]}h `;
  if (minutes) result += `${minutes[1]}m `;
  if (seconds) result += `${seconds[1]}s`;

  // Trim any trailing space
  return result.trim() || 'Unknown';
}

/**
 * Converts seconds to human-readable format
 * @param {number} durationInSeconds - Duration in seconds
 * @returns {string} - Human-readable duration (e.g., "1h 10m 30s")
 */
export function seccondDormatDuration(durationInSeconds) {
  if (!durationInSeconds && durationInSeconds !== 0) return 'Unknown';

  const hours = Math.floor(durationInSeconds / 3600);
  const minutes = Math.floor((durationInSeconds % 3600) / 60);
  const seconds = Math.floor(durationInSeconds % 60);

  let result = '';
  if (hours > 0) result += `${hours}h `;
  if (minutes > 0 || hours > 0) result += `${minutes}m `;
  result += `${seconds}s`;

  return result.trim();
}
