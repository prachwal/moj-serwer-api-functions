// Utwórz plik test-runner.mjs (rozszerzenie .mjs dla modułów ES)
import handlerFunction from '../functions/youtube-fetch-single-video-background.mjs'; // Importuj funkcję
import 'dotenv/config'; // Załaduj zmienne środowiskowe z pliku .env

// Pobierz token z pliku .env
const authToken = process.env.BUILD_HOOK_SECRET;

// Symuluj obiekt request
const mockRequest = {
  httpMethod: 'GET',
  path: '/',
  headers: {
    'content-type': 'application/json',
    'Authorization': `Bearer ${authToken}`, // Użyj tokena z .env
    get: function(headerName) {
      return this[headerName];
    }
  },
  queryStringParameters: {
    test: 'value'
  },
  body: JSON.stringify({ videoId: "-D-LrE0B8GQ" }), // Przykładowe dane w body
  json: async function() {
    return JSON.parse(this.body); // Parsuj body jako JSON
  }
};

// Symuluj obiekt context
const mockContext = {
  functionName: 'test-function',
  functionVersion: '1.0',
  invokedFunctionArn: 'local:test',
  awsRequestId: 'local-request-id-123',
  getRemainingTimeInMillis: () => 10000
};

// Uruchom funkcję
async function runHandler() {
  try {
    const response = await handlerFunction(mockRequest, mockContext);
    console.log('Odpowiedź funkcji:', response);
  } catch (error) {
    console.error('Błąd podczas uruchamiania funkcji:', error);
  }
}

runHandler();