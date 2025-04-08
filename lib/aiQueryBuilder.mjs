import { OpenAI } from "openai";

let openai;

/**
 * Initializes the OpenAI client if not already initialized.
 * @param {Object} env - Environment variables containing the OpenAI API key.
 */
export function initializeOpenAI(env) {
  if (!openai) {
    openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }
}

/**
 * Generuje dynamiczny filtr MongoDB na podstawie zapytania użytkownika
 * @param {string} term - zapytanie użytkownika
 * @param {Object} env - Environment variables containing the OpenAI API key.
 * @returns {Promise<Object>} - obiekt filtra MongoDB
 */
export async function generateMongoQueryFromText(term, env) {
  initializeOpenAI(env);

  const prompt = `
    Twoim zadaniem jest przekształcić zapytanie użytkownika w obiekt filtra MongoDB, uwzględniając polską fleksję i naturalny język.
    
    Struktura dokumentu:
    {
        "_id": ObjectId,
        "video_id": string,                // np. "-D-LrE0B8GQ"
        "category_id": string,             // np. "20"
        "channel_id": string,              // np. "UC3H76oQXz_LpoULHWC8tG4g"
        "channel_name": string,            // np. "Olifiee Archiwum"
        "comment_count": string,           // liczba jako string, np. "1"
        "description": string,             // pełny opis filmu
        "duration": string,                // format ISO 8601, np. "PT2H29M40S"
        "like_count": string,              // liczba jako string
        "published_at": ISODate,           // np. "2025-02-26T13:00:00Z"
        "tags": [string],                  // tablica tagów
        "thumbnail_url": string,
        "title": string,                   // np. "Olifiee vs Sekiro"
        "video_url": string,
        "view_count": string,              // liczba jako string
        "sentiment": string,               // np. "Positive", "Negative", "Neutral"
        "duration_seconds": number         // czas w sekundach
    }
    
    Zasady:
    - Dokładnie analizuj semantykę zapytania, uwzględniając polską fleksję (np. "Kiszaka" → "Kiszak", "minut" → czas).
    - Rozbij zapytanie na osobne filtry w oparciu o słowa kluczowe i kontekst.
    
    - **Czas** (np. "dłuższe niż 120 minut", "krótsze niż 2 godziny"):
      - Rozpoznawaj "dłuższe" / "krótsze" i ich warianty (np. "dłuższy", "krótki").
      - Przelicz czas na sekundy, obsługując różne formy:
        - "minut", "minuty", "minutach" → × 60,
        - "godzin", "godziny", "godzinach" → × 3600,
        - "sekund", "sekundy", "sekundach" → × 1.
      - Przykład: "120 minut" → 120 × 60 = 7200 sekund.
      - Użyj operatorów: "dłuższe niż" → "$gt", "krótsze niż" → "$lt".
      - Filtr: "dłuższe niż 120 minut" → { "duration_seconds": { "$gt": 7200 } }.
    
    - **Tekst** (np. "filmy Kiszaka", "tytuł Sekiro", "opis z testem"):
      - Rozpoznawaj rzeczowniki w różnych przypadkach (np. "Kiszaka" → "Kiszak" jako "channel_name").
      - Kluczowe słowa: "kanał", "filmy", "tytuł", "opis" wskazują pole.
      - Użyj { "$regex": "<fragment>", "$options": "i" } dla niewrażliwości na wielkość liter.
      - Przykład: "filmy Kiszaka" → { "channel_name": { "$regex": "Kiszak", "$options": "i" } }.
    
    - **Daty** (np. "po 2025-01-01", "przed 2025-02-01"):
      - Rozpoznawaj "po" → "$gte", "przed" → "$lte".
      - Przykład: "po 2025-01-01" → { "published_at": { "$gte": ISODate("2025-01-01T00:00:00Z") } }.
    
    - **Liczby** (np. "więcej niż 1000 wyświetleń", "mniej niż 50 polubień"):
      - Rozpoznawaj "więcej" → "$gt", "mniej" → "$lt" i pola: "wyświetleń", "polubień", "komentarzy".
      - Użyj $expr z $toInt dla pól stringowych.
      - Przykład: "więcej niż 1000 wyświetleń" → { "view_count": { "$exists": true }, "$expr": { "$gt": [ { "$toInt": "$view_count" }, 1000 ] } }.
    
    - **Fallback**: Jeśli brak słów kluczowych, wyszukuj w "title" lub "description" za pomocą $or i $regex.
    - **Pusty filtr**: Jeśli zapytanie jest niejasne, zwróć {}.
    
    Zapytanie użytkownika: "${term}"
    
    Filtr:
  `;    

  try {
    console.log("[DEBUG] Sending prompt to OpenAI:", prompt);
    
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-0125",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0,
      max_tokens: 500,
    });

    console.log("[DEBUG] Received response from OpenAI:", 
      JSON.stringify(chatCompletion.choices[0].message, null, 2));
    
    const responseText = chatCompletion.choices[0].message.content?.trim();
    if (!responseText) {
      console.log("[DEBUG] Empty response received");
      return {};
    }

    console.log("[DEBUG] Raw response text:", responseText);
    
    const jsonStart = responseText.indexOf("{");
    const jsonEnd = responseText.lastIndexOf("}");
    
    if (jsonStart === -1 || jsonEnd === -1) {
      console.log("[DEBUG] No valid JSON found in response");
      return {};
    }
    
    const jsonString = responseText.slice(jsonStart, jsonEnd + 1);
    console.log("[DEBUG] Extracted JSON string:", jsonString);
    
    const parsedJson = JSON.parse(jsonString);
    console.log("[DEBUG] Parsed MongoDB query:", JSON.stringify(parsedJson, null, 2));
    
    return parsedJson;
  } catch (err) {
    console.error("[DEBUG] Error in AI query generation:", err);
    console.error("[DEBUG] Error details:", {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    return {};
  }
}

/**
 * Analyzes the sentiment of a given text using OpenAI.
 * @param {string} text - The text to analyze.
 * @param {Object} env - Environment variables containing the OpenAI API key.
 * @param {Object} logger - Logger for logging information and errors.
 * @returns {Promise<string>} - The sentiment result: 'Positive', 'Negative', or 'Neutral'.
 */
export async function analyzeSentiment(text, env, logger) {
  initializeOpenAI(env);

  logger.info(`Starting sentiment analysis for text: ${text.slice(0, 50)}...`);
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a sentiment analysis expert. Analyze the sentiment of the following text in Polish and respond with one word: 'Positive', 'Negative', or 'Neutral'.",
        },
        { role: "user", content: text },
      ],
      max_tokens: 10,
      temperature: 0,
    });

    const sentiment = response.choices[0].message.content.trim();
    logger.info(`Sentiment analysis completed. Result: ${sentiment}`);
    return sentiment;
  } catch (error) {
    logger.error(`Error analyzing sentiment: ${error.message}`);
    return "Error";
  }
}

export default { generateMongoQueryFromText, analyzeSentiment };
