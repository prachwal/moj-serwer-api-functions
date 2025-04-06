// Utwórz plik test-runner.mjs (rozszerzenie .mjs dla modułów ES)
import handlerFunction from '../functions/daily-youtube-fetch-background.mjs'; // Importuj funkcję

// Symuluj obiekt request
const mockRequest = {
  httpMethod: 'GET',
  path: '/',
  headers: {
    'content-type': 'application/json'
  },
  queryStringParameters: {
    test: 'value'
  },
  body: JSON.stringify({ message: "test" })
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