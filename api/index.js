// ✅ api/index.js (기존 server.js에서 수정됨 - Vercel용)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const app = express();
// const PORT = 3000; // Vercel이 포트를 관리하므로 필요 없음

// --- Google AI 클라이언트 초기화 ---
if (!process.env.GOOGLE_API_KEY) {
  console.error("오류: GOOGLE_API_KEY 환경 변수가 Vercel 프로젝트 설정에 필요합니다.");
  // 로컬 개발 시 .env 파일 사용 가능
}
// 참고: Vercel 배포 시에는 .env 파일이 아닌 Vercel 대시보드의 환경 변수 설정을 사용합니다.
// 로컬 테스트를 위해선 .env 파일이 여전히 유용할 수 있습니다.
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || ''); // 키가 없어도 일단 초기화 시도

// --- 안전 설정 ---
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// --- 모델 이름 설정 ---
const modelName = 'gemini-1.5-pro-latest';

// --- 미들웨어 설정 ---
app.use(cors()); // CORS 허용
app.use(express.json()); // JSON 요청 본문 파싱

// --- 배열 섞기 함수 ---
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// --- Helper Function: Gemini API 호출 ---
async function callGemini(systemInstruction, userPrompt, generationConfigOverrides = {}) {
    // API 키가 설정되었는지 다시 확인 (Vercel 환경 변수)
    if (!process.env.GOOGLE_API_KEY) {
        throw new Error("서버에 GOOGLE_API_KEY가 설정되지 않았습니다.");
    }
    const currentGenAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY); // 요청 시마다 최신 키로 초기화 시도
    const model = currentGenAI.getGenerativeModel({ model: modelName, safetySettings: safetySettings });
    const fullPrompt = `${systemInstruction}\n\n---\n\n사용자 요청:\n${userPrompt}\n\n---\n\n위 지침에 따라 요청을 처리하고, 필요한 경우 JSON 형식으로만 응답해 주세요.`;
    const generationConfig = { temperature: 0.5, maxOutputTokens: 4096, ...generationConfigOverrides };
    console.log(`--- Gemini API 호출 (${modelName}) ---`);
    const result = await model.generateContent(fullPrompt, generationConfig);
    const response = result.response;
    // ... (이전과 동일한 응답 유효성 검사 로직) ...
     if (!response) { throw new Error("Gemini API로부터 응답을 받지 못했습니다."); }
     if (!response.candidates || response.candidates.length === 0 || response.candidates[0].finishReason === 'SAFETY') { const feedback = response.promptFeedback || response.candidates?.[0]?.promptFeedback; const blockReason = feedback?.blockReason || response.candidates?.[0]?.finishReason || '알 수 없음'; const safetyRatings = feedback?.safetyRatings || response.candidates?.[0]?.safetyRatings; console.error(`Gemini 응답 차단 또는 비정상: ${blockReason}`, safetyRatings ? JSON.stringify(safetyRatings) : ''); throw new Error(`Gemini API 응답이 안전 문제 또는 다른 이유로 차단되었습니다. 이유: ${blockReason}`); }
     if (!response.candidates[0].content || !response.candidates[0].content.parts || response.candidates[0].content.parts.length === 0 || !response.candidates[0].content.parts[0].text) { console.error("Gemini API 응답 내용 없음:", JSON.stringify(response)); throw new Error("Gemini API 응답에 유효한 텍스트 내용이 없습니다."); }
    const rawText = response.candidates[0].content.parts[0].text.trim();
    console.log("--- Gemini API 응답 (Raw Text) ---"); console.log(rawText.substring(0, 200) + '...'); // 로그 길이 조정
    const jsonString = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    return jsonString;
}

// --- 1. 문장 구조 분석 엔드포인트 ---
// Vercel에서는 파일 경로가 API 경로가 됩니다. (api/index.js -> /api/ 경로 담당)
// Express 라우터는 이 기본 경로 뒤에 붙습니다. -> POST /api/analyze
app.post('/api/analyze', async (req, res) => { // 경로 수정됨
  const { sentence } = req.body;
  if (!sentence) return res.status(400).json({ error: '문장이 전달되지 않았습니다.' });
  const systemPrompt = `... (이전과 동일한 구조 분석 프롬프트) ...`;
  try {
    const jsonString = await callGemini(systemPrompt, `문장을 분석해줘: "${sentence}"`, { temperature: 0.2 });
    let parsed;
    try { parsed = JSON.parse(jsonString); if (!Array.isArray(parsed)) throw new Error("응답 형식이 JSON 배열이 아닙니다."); }
    catch (e) { return res.status(500).json({ error: `Gemini 응답 처리 오류 (${e.message})`, raw: jsonString }); }
    res.json(parsed);
  } catch (error) { res.status(500).json({ error: '문장 분석 중 오류 발생', details: error.message }); }
});

// --- 2. 문제 생성 엔드포인트 ---
// 경로: POST /api/generate-questions
app.post('/api/generate-questions', async (req, res) => { // 경로 수정됨
  const { text, quantity = 1 } = req.body;
  const requestedQuantity = parseInt(quantity, 10);
  if (!text || text.trim().length === 0) return res.status(400).json({ error: '지문 텍스트가 전달되지 않았습니다.' });
  if (isNaN(requestedQuantity) || requestedQuantity <= 0) return res.status(400).json({ error: '요청 문제 개수가 유효하지 않습니다.' });
  const questionGenSystemPrompt = `... (이전과 동일한 문제 생성 프롬프트 - 전체 지문, 조건 3 고정 텍스트 등) ...`;
  const userPrompt = `다음 지문으로 조건 영작 문제를 ${requestedQuantity}개 생성해줘 (각 문제는 서로 다른 문장 기반이어야 함):\n\n"${text}"`;
  try {
    const jsonString = await callGemini(questionGenSystemPrompt, userPrompt, { temperature: 0.7 });
    let parsedArray;
    try {
      parsedArray = JSON.parse(jsonString);
      if (!Array.isArray(parsedArray)) { throw new Error("Gemini 응답 형식이 JSON 배열이 아닙니다."); }
      parsedArray.forEach((qo) => { if (qo.vocabulary && Array.isArray(qo.vocabulary)) { shuffleArray(qo.vocabulary); } }); // Shuffle
      if (parsedArray.length > 0) { /* ... 필수 필드 검증 ... */ } else { console.log("AI 생성 문제 없음"); }
    } catch (e) { return res.status(500).json({ error: `Gemini 응답 처리 오류 (${e.message})`, raw: jsonString }); }
    res.json(parsedArray);
  } catch (error) { res.status(500).json({ error: '문제 생성 중 오류 발생', details: error.message }); }
});

// --- Express 앱 내보내기 ---
// app.listen(...) 부분을 삭제하고 아래 코드를 추가합니다.
module.exports = app;