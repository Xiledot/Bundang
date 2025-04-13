// ✅ api/index.js (라우트 경로 수정됨)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const app = express();

// --- Google AI 클라이언트 초기화 ---
// Vercel 배포 시에는 Vercel 대시보드 환경 변수 사용. 로컬 테스트 시 .env 파일 사용.
// .gitignore 파일 이름이 정확해야 .env 파일이 Git에 올라가지 않음!
if (!process.env.GOOGLE_API_KEY && process.env.NODE_ENV !== 'development') {
  // 로컬 개발 환경이 아닐 때 키가 없으면 오류 로깅 (실제 Vercel 환경에서는 키가 있어야 함)
  console.error("오류: GOOGLE_API_KEY 환경 변수가 Vercel 프로젝트 설정에 필요합니다.");
}
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

// --- 안전 설정 ---
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  // ... (나머지 설정 동일)
];

// --- 모델 이름 설정 ---
const modelName = 'gemini-1.5-pro-latest';

// --- 미들웨어 설정 ---
app.use(cors());
app.use(express.json());

// --- 배열 섞기 함수 ---
function shuffleArray(array) { /* ... (이전과 동일) ... */ }

// --- Helper Function: Gemini API 호출 ---
async function callGemini(systemInstruction, userPrompt, generationConfigOverrides = {}) { /* ... (이전과 동일) ... */ }

// --- 1. 문장 구조 분석 엔드포인트 ---
// Vercel 요청 경로: /api/analyze -> 여기서 처리할 경로: /analyze
app.post('/analyze', async (req, res) => { // !!! '/api' 제거 !!!
  const { sentence } = req.body;
  if (!sentence) return res.status(400).json({ error: '문장이 전달되지 않았습니다.' });
  const systemPrompt = `... (구조 분석 프롬프트) ...`;
  try {
    const jsonString = await callGemini(systemPrompt, `문장을 분석해줘: "${sentence}"`, { temperature: 0.2 });
    let parsed;
    try { parsed = JSON.parse(jsonString); if (!Array.isArray(parsed)) throw new Error("응답 형식이 JSON 배열이 아닙니다."); }
    catch (e) { return res.status(500).json({ error: `Gemini 응답 처리 오류 (${e.message})`, raw: jsonString }); }
    res.json(parsed);
  } catch (error) { res.status(500).json({ error: '문장 분석 중 오류 발생', details: error.message }); }
});

// --- 2. 문제 생성 엔드포인트 ---
// Vercel 요청 경로: /api/generate-questions -> 여기서 처리할 경로: /generate-questions
app.post('/generate-questions', async (req, res) => { // !!! '/api' 제거 !!!
  const { text, quantity = 1 } = req.body;
  const requestedQuantity = parseInt(quantity, 10);
  if (!text || text.trim().length === 0) return res.status(400).json({ error: '지문 텍스트가 전달되지 않았습니다.' });
  if (isNaN(requestedQuantity) || requestedQuantity <= 0) return res.status(400).json({ error: '요청 문제 개수가 유효하지 않습니다.' });
  const questionGenSystemPrompt = `... (문제 생성 프롬프트) ...`;
  const userPrompt = `다음 지문으로 조건 영작 문제를 ${requestedQuantity}개 생성해줘 (각 문제는 서로 다른 문장 기반이어야 함):\n\n"${text}"`;
  try {
    const jsonString = await callGemini(questionGenSystemPrompt, userPrompt, { temperature: 0.7 });
    let parsedArray;
    try {
      parsedArray = JSON.parse(jsonString);
      if (!Array.isArray(parsedArray)) { throw new Error("Gemini 응답 형식이 JSON 배열이 아닙니다."); }
      parsedArray.forEach((qo) => { if (qo.vocabulary && Array.isArray(qo.vocabulary)) { shuffleArray(qo.vocabulary); } }); // Shuffle
      if (parsedArray.length > 0) { /* ... 필드 검증 ... */ } else { console.log("AI 생성 문제 없음"); }
    } catch (e) { return res.status(500).json({ error: `Gemini 응답 처리 오류 (${e.message})`, raw: jsonString }); }
    console.log(`요청 개수: ${requestedQuantity}, 실제 생성된 문제 개수: ${parsedArray.length}`);
    res.json(parsedArray);
  } catch (error) { console.error('Gemini API 오류 (문제 생성):', error); res.status(500).json({ error: '문제 생성 중 오류 발생', details: error.message }); }
});

// --- Express 앱 내보내기 (app.listen 없음) ---
module.exports = app;