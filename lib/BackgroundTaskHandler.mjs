import { processYoutubeData } from "./YoutubeProcessor.mjs";
import { logger } from "./logger.mjs";

export async function handleBackgroundTask(req, env) {
  const authHeader = req.headers.get("Authorization");

  logger.info("Otrzymano żądanie dla zaplanowanego zadania w tle...");
  if (!authHeader || !isValidAuth(authHeader, env)) {
    logger.error("Brak dostępu: nieprawidłowy token autoryzacyjny.");
    return new Response("Unauthorized", { status: 401 });
  }

  logger.info("Nagłówek autoryzacji jest prawidłowy.");
  logger.info("Uruchamianie zaplanowanego zadania w tle...");

  someLongRunningTask(env);

  return new Response(
    JSON.stringify({ message: "Task enqueued" }),
    {
      status: 202,
      headers: { "Content-Type": "application/json" },
    }
  );
}

async function someLongRunningTask(env) {
  logger.info("Uruchamianie zaplanowanego zadania w tle...");
  try {
    await processYoutubeData(env, logger);
    logger.info("Przetwarzanie zakończone pomyślnie.");
  } catch (error) {
    logger.error("Błąd podczas wykonywania długotrwałego zadania:", error);
  }
  logger.info("Zaplanowane zadanie w tle zakończone.");
}

function isValidAuth(token, env) {
  const validToken = env.BUILD_HOOK_SECRET;
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
