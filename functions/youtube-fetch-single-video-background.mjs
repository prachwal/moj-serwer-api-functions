import { refreshSingleVideoData } from "../lib/YoutubeProcessor.mjs";
import { logger } from "../lib/logger.mjs";

export const config = {
  background: true,
};

export default async (req, context) => {
  const authHeader = req.headers.get("Authorization");
  const { videoId } = await req.json(); // Retrieve videoId from POST body

  logger.info("Otrzymano żądanie odświeżenia danych dla pojedynczego wideo...");

  if (!authHeader || !isValidAuth(authHeader)) {
    logger.error("Brak nagłówka autoryzacji lub jest on nieprawidłowy.");
    return new Response("Unauthorized", { status: 401 });
  }

  if (!videoId) {
    logger.error("Brak videoId w treści żądania.");
    return new Response("Missing videoId in request body", { status: 400 });
  }

  try {
    logger.info(`Rozpoczynanie odświeżania danych dla wideo o ID: ${videoId}...`);
    await refreshSingleVideoData(videoId, process.env, logger); // Use the imported function
    logger.info("Dane wideo zostały pomyślnie odświeżone.");
    return new Response(JSON.stringify({ message: "Video data refreshed successfully" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logger.error("Błąd podczas odświeżania danych wideo:", error);
    return new Response(JSON.stringify({ error: "Failed to refresh video data" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

function isValidAuth(token) {
  const validToken = process.env.BUILD_HOOK_SECRET;
  if (!validToken) {
    logger.error("Brak zmiennej środowiskowej BUILD_HOOK_SECRET.");
    return false;
  }
  const extractedToken = token.replace(/^Bearer\s+/i, "");
  const isValid = extractedToken === validToken;
  if (isValid) {
    logger.info("Token autoryzacyjny jest prawidłowy.");
  }
  return isValid;
}
