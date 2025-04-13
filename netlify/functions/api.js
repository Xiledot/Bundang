// ✅ api/index.js (Add Initialization Logs)
const serverless = require('serverless-http');
console.log("--- api/index.js - Top Level Start ---"); // Log 1

require('dotenv').config();
console.log("dotenv configured"); // Log 2

const express = require('express');
console.log("express required"); // Log 3

const cors = require('cors');
console.log("cors required"); // Log 4

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
console.log("@google/generative-ai required"); // Log 5

const app = express();
console.log("express app initialized"); // Log 6

// --- Google AI 클라이언트 초기화 ---
let genAI;
let googleApiKey = process.env.GOOGLE_API_KEY || '';
// 환경 변수 값 자체를 로그로 찍는 것은 보안상 좋지 않으므로 길이만 확인
console.log(`GOOGLE_API_KEY length: ${googleApiKey.length}`); // Log 7

if (!googleApiKey && process.env.NODE_ENV !== 'development') {
  console.error("ERROR: GOOGLE_API_KEY environment variable is missing in Vercel settings!");
}

try {
  // API 키가 비어있더라도 new GoogleGenerativeAI() 자체는 오류를 발생시키지 않을 수 있음
  genAI = new GoogleGenerativeAI(googleApiKey);
  console.log("GoogleGenerativeAI client instance created (key validity not checked yet)"); // Log 8
} catch (e) {
  console.error("FATAL: GoogleGenerativeAI client initialization failed!", e); // Log 9
  // 여기서 오류 발생 시 함수 실행이 어려울 수 있음
}

// --- 안전 설정 ---
const safetySettings = [
 { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
 { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
 { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
 { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];
console.log("Safety settings defined"); // Log 10

// --- 모델 이름 설정 ---
const modelName = 'gemini-1.5-pro-latest';
console.log(`Model name set to: ${modelName}`); // Log 11

// --- 미들웨어 설정 ---
try {
  app.use(cors());
  console.log("cors middleware applied"); // Log 12
  app.use(express.json());
  console.log("express.json middleware applied"); // Log 13
} catch(e) {
   console.error("FATAL: Middleware setup failed!", e); // Log 14
}

// --- 배열 섞기 함수 ---
function shuffleArray(array) { if (!array) return; for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } }
console.log("shuffleArray function defined"); // Log 15

// --- Helper Function: Gemini API 호출 ---
async function callGemini(systemInstruction, userPrompt, generationConfigOverrides = {}) {
    // genAI 인스턴스가 유효한지 확인
    if (!genAI || !process.env.GOOGLE_API_KEY) { // API 키 존재 여부도 다시 확인
        console.error("FATAL: Google AI Client is not initialized or API key is missing!");
        throw new Error("Google AI Client is not available or API key is missing.");
    }
    console.log("callGemini - helper function entered"); // Log H1
    const currentGenAI = genAI; // 이미 생성된 인스턴스 사용
    const model = currentGenAI.getGenerativeModel({ model: modelName, safetySettings: safetySettings });
    const fullPrompt = `${systemInstruction}\n\n---\n\n사용자 요청:\n${userPrompt}\n\n---\n\n위 지침에 따라 요청을 처리하고, 필요한 경우 JSON 형식으로만 응답해 주세요.`;
    const generationConfig = { temperature: 0.5, maxOutputTokens: 4096, ...generationConfigOverrides };
    console.log(`--- Calling Gemini API (${modelName}) ---`); // Log H2
    const result = await model.generateContent(fullPrompt, generationConfig);
    console.log("--- Gemini API call finished ---"); // Log H3
    const response = result.response;
    // ... (이전과 동일한 응답 유효성 검사 로직) ...
     if (!response) { throw new Error("Gemini API로부터 응답을 받지 못했습니다."); }
     if (!response.candidates || response.candidates.length === 0 || response.candidates[0].finishReason !== 'STOP') { const feedback = response.promptFeedback || response.candidates?.[0]?.promptFeedback; const finishReason = response.candidates?.[0]?.finishReason || '알 수 없음'; const blockReason = feedback?.blockReason || (finishReason !== 'STOP' ? finishReason : '차단 이유 없음'); const safetyRatings = feedback?.safetyRatings || response.candidates?.[0]?.safetyRatings; console.error(`Gemini 응답 비정상 종료 또는 차단: ${blockReason}`, safetyRatings ? JSON.stringify(safetyRatings) : ''); throw new Error(`Gemini API 응답이 비정상 종료 또는 차단되었습니다. 이유: ${blockReason}`); }
     if (!response.candidates[0].content || !response.candidates[0].content.parts || response.candidates[0].content.parts.length === 0 || !response.candidates[0].content.parts[0].text) { console.error("Gemini API 응답 내용 없음:", JSON.stringify(response)); throw new Error("Gemini API 응답에 유효한 텍스트 내용이 없습니다."); }
    const rawText = response.candidates[0].content.parts[0].text.trim();
    console.log("--- Gemini API Response (Raw Text) ---"); console.log(rawText.substring(0, 200) + '...'); // Log H4
    const jsonString = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    return jsonString;
}
console.log("callGemini helper function defined"); // Log 16

// --- 1. 문장 구조 분석 엔드포인트 ---
app.post('/analyze', async (req, res) => {
  console.log("--- /analyze route handler entered ---"); // Log R1
  const { sentence } = req.body;
  // ... (이하 로직 동일, try/catch 내부에 console.log 추가 가능) ...
    if (!sentence) return res.status(400).json({ error: '문장이 전달되지 않았습니다.' });
  const systemPrompt = `...`; // 프롬프트 생략
  try {
    console.log("구조 분석 요청 수신:", sentence ? sentence.substring(0, 50) + '...' : 'empty');
    const jsonString = await callGemini(systemPrompt, `문장을 분석해줘: "${sentence}"`, { temperature: 0.2 });
    let parsed;
    try { parsed = JSON.parse(jsonString); if (!Array.isArray(parsed)) throw new Error("응답 형식이 JSON 배열이 아닙니다."); }
    catch (e) { console.error('Gemini 응답 JSON 파싱 실패 (구조 분석):', e.message); return res.status(500).json({ error: `Gemini 응답 처리 오류 (${e.message})`, raw: jsonString }); }
    console.log("구조 분석 응답 성공");
    res.json(parsed);
  } catch (error) { console.error('Gemini API 또는 처리 오류 (구조 분석):', error); res.status(500).json({ error: '문장 분석 중 오류 발생', details: error.message }); }
});
console.log("/analyze route defined"); // Log 17

// --- 2. 문제 생성 엔드포인트 ---
app.post('/generate-questions', async (req, res) => {
  console.log("--- /generate-questions route handler entered ---"); // Log R2
  const { text, quantity = 1 } = req.body;
 // ... (이하 로직 동일, try/catch 내부에 console.log 추가 가능) ...
   const requestedQuantity = parseInt(quantity, 10);
  if (!text || text.trim().length === 0) return res.status(400).json({ error: '지문 텍스트가 전달되지 않았습니다.' });
  if (isNaN(requestedQuantity) || requestedQuantity <= 0) return res.status(400).json({ error: '요청 문제 개수가 유효하지 않습니다.' });
  const questionGenSystemPrompt = `...`; // 프롬프트 생략
  const userPrompt = `다음 지문으로 조건 영작 문제를 ${requestedQuantity}개 생성해줘 (각 문제는 서로 다른 문장 기반이어야 함):\n\n"${text}"`;
  try {
    console.log(`문제 생성 요청 수신: ${requestedQuantity}개`);
    const jsonString = await callGemini(questionGenSystemPrompt, userPrompt, { temperature: 0.7 });
    let parsedArray;
    try {
      parsedArray = JSON.parse(jsonString);
      if (!Array.isArray(parsedArray)) { throw new Error("Gemini 응답 형식이 JSON 배열이 아닙니다."); }
      parsedArray.forEach((qo) => { if (qo.vocabulary && Array.isArray(qo.vocabulary)) { shuffleArray(qo.vocabulary); } }); // Shuffle
      if (parsedArray.length > 0) { parsedArray.forEach((item, index) => { if (!item.questionText || !item.prompt || !item.conditions || !item.vocabulary || !item.answer) { console.error(`문제 ${index + 1} 객체 필드 누락:`, item); throw new Error(`배열의 ${index + 1}번째 문제 객체에서 필수 필드가 누락되었습니다.`); } }); }
      else { console.log("AI가 생성한 문제가 없습니다 (빈 배열 반환됨)."); }
    } catch (e) { console.error('Gemini 응답 JSON 배열 처리(파싱/검증/셔플링) 실패:', e.message); return res.status(500).json({ error: `Gemini 응답 처리 중 오류 발생 (${e.message})`, raw: jsonString }); }
    console.log(`문제 생성 응답 성공: ${parsedArray.length}개`);
    res.json(parsedArray);
  } catch (error) { console.error('Gemini API 또는 처리 오류 (문제 생성):', error); res.status(500).json({ error: '문제 생성 중 오류 발생', details: error.message }); }
});
console.log("/generate-questions route defined"); // Log 18

// --- Express 앱 내보내기 ---
// module.exports = serverless(app); // 기존 방식 주석 처리 또는 삭제
exports.handler = serverless(app);   // 'handler'라는 이름으로 명시적 내보내기