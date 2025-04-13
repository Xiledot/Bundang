// 테스트용 임시 api/index.js
const express = require('express');
const app = express();

// CORS 추가 (프론트엔드에서 테스트하려면 필요)
const cors = require('cors');
app.use(cors());

// 함수 시작 로그
console.log("TEST: Minimal API handler starting up.");

// 간단한 GET 경로 추가 (브라우저 주소창에서 바로 테스트 가능)
app.get('/api/health', (req, res) => {
  console.log("TEST: /api/health GET request received!");
  res.status(200).send('Health check OK');
});

// 기존 POST 경로 테스트 (간단 응답)
app.post('/analyze', (req, res) => {
  console.log("TEST: /analyze POST request received!");
  res.status(200).json({ message: "Analyze test OK" });
});

app.post('/generate-questions', (req, res) => {
  console.log("TEST: /generate-questions POST request received!");
  res.status(200).json({ message: "Generate questions test OK" });
});

// Express 앱 내보내기
module.exports = app;