// TEMPORARY api/index.js for testing Vercel routing
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// 함수가 시작되는지 확인하기 위한 로그
console.log("Minimal API handler initialized successfully.");

// /analyze 경로 테스트
app.post('/analyze', (req, res) => {
  console.log("Received /analyze POST request"); // 요청 수신 로그
  res.status(200).json({ message: "Analyze endpoint test successful!" });
});

// /generate-questions 경로 테스트
app.post('/generate-questions', (req, res) => {
  console.log("Received /generate-questions POST request"); // 요청 수신 로그
  res.status(200).json({ message: "Generate questions endpoint test successful!" });
});

// 혹시 다른 경로로 잘못 라우팅되는지 확인
app.use((req, res) => {
    console.log(`Unhandled route accessed: ${req.method} ${req.path}`);
    res.status(404).send('Route not explicitly handled by Express app');
});

module.exports = app;