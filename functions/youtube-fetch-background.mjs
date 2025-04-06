import { handleBackgroundTask } from "../lib/BackgroundTaskHandler.mjs"; // Import reusable logic

export const config = {
  background: true,
};

export default async (req, context) => {
  return await handleBackgroundTask(req, process.env); // Delegate to reusable logic
};