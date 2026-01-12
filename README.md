# Money Agent API (Cloud Run)

## Local
npm install
npm start

Health check:
GET http://localhost:8787/

Chat:
POST http://localhost:8787/api/chat
Body: {"message":"hello"}

## Env
OPENAI_API_KEY required in runtime environment.
