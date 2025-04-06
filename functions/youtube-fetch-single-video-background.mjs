import { handleSingleVideoRequest } from "../lib/SingleVideoHandler.mjs"; // Import reusable logic

export const config = {
  background: true,
};

export default async (req, context) => {
  return await handleSingleVideoRequest(req, process.env); // Delegate to reusable logic
};
