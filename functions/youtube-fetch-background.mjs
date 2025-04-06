import { processYoutubeData } from "../lib/YoutubeProcessor.mjs"; // Import the function
import { logger } from "../lib/logger.mjs"; // Import the shared logger

export const config = {
    background: true
}; 

export default async (req, context) => {
    const authHeader = req.headers.get("Authorization");

    logger.info("Otrzymano żądanie dla zaplanowanego zadania w tle...");
    // Check if Authorization header exists and is valid
    if (!authHeader || !isValidAuth(authHeader)) {
        // Return a 401 Unauthorized response if authentication fails
        logger.error("Brak dostępu: nieprawidłowy token autoryzacyjny.");
        return new Response("Sorry, no access for you.", { 
        status: 401,
        headers: { "Content-Type": "text/plain" }
        });
    }

    logger.info("Nagłówek autoryzacji jest prawidłowy.");

    logger.info("Uruchamianie zaplanowanego zadania w tle...");
    someLongRunningTask(process.env); // nie awaitujemy, żeby funkcja się nie zablokowała
  
    return new Response(
      JSON.stringify({ message: "Task enqueued" }),
      {
        status: 202,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
};
  
async function someLongRunningTask(env) {
  logger.info("Uruchamianie zaplanowanego zadania w tle...");
  await new Promise(async resolve => {
    try {
      logger.info("Rozpoczynanie długotrwałego zadania...");
      await processYoutubeData(env, logger); // Call the function directly
      logger.info("Przetwarzanie zakończone pomyślnie.");
      resolve(); // Resolve the promise when done
    } catch (error) {
      logger.error("Błąd podczas wykonywania długotrwałego zadania:", error); // Log the error
      resolve(); // Resolve the promise even if there's an error
    }
  });
  logger.info("Zaplanowane zadanie w tle zakończone.");
}
  
// Funkcja do walidacji tokenu - sprawdza token ze zmienną środowiskową
function isValidAuth(token) {
    // Pobranie tokenu z zmiennej środowiskowej
    logger.debug('Token:', token); // Debugging line
    logger.debug('Valid token:', process.env.BUILD_HOOK_SECRET); // Debugging line   
    const validToken = process.env.BUILD_HOOK_SECRET;
    
    // Jeśli token nie został ustawiony w zmiennych środowiskowych
    if (!validToken) {
      logger.error('Błąd konfiguracji: brak zdefiniowanej zmiennej środowiskowej TOKEN.');
      return false;
    }
    
    let extractedToken = token.replace(/^Bearer\s+/i, ''); // usuwa "Bearer " z początku, ignoruje wielkość liter
    let result = extractedToken === validToken;

    logger.debug('Token valid:', result); // Debugging line
    // Zwróć wynik walidacji
     if (!result) {
        logger.error('Nieprawidłowy token:', token); // Debugging line
      } else {
        logger.info('Token autoryzacyjny jest prawidłowy.'); // Debugging line
      }

    return result;
}