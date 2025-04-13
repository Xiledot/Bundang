// netlify/functions/api.js (Netlify 경로 기준)
const serverless = require('serverless-http');
console.log("--- netlify/functions/api.js - Top Level Start ---");

require('dotenv').config();
console.log("dotenv configured");

const express = require('express');
console.log("express required");

const cors = require('cors');
console.log("cors required");

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
console.log("@google/generative-ai required");

const app = express();
console.log("express app initialized");

// --- Google AI 클라이언트 초기화 ---
let genAI;
let googleApiKey = process.env.GOOGLE_API_KEY || '';
console.log(`GOOGLE_API_KEY length: ${googleApiKey.length}`);

if (!googleApiKey && process.env.NODE_ENV !== 'production') {
  console.error("ERROR: GOOGLE_API_KEY environment variable is missing!");
}

try {
  genAI = new GoogleGenerativeAI(googleApiKey);
  console.log("GoogleGenerativeAI client instance created (key validity not checked yet)");
} catch (e) {
  console.error("FATAL: GoogleGenerativeAI client initialization failed!", e);
}

// --- 안전 설정 ---
const safetySettings = [
 { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
 { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
 { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
 { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];
console.log("Safety settings defined");

// --- 모델 이름 설정 ---
const modelName = 'gemini-1.5-pro-latest';
console.log(`Model name set to: ${modelName}`);

// --- 미들웨어 설정 ---
try {
  app.use(cors({ origin: '*' }));
  console.log("cors middleware applied (allowing all origins)");
  app.use(express.json());
  console.log("express.json middleware applied");
} catch(e) {
   console.error("FATAL: Middleware setup failed!", e);
}

// --- 배열 섞기 함수 ---
function shuffleArray(array) { if (!array) return; for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } }
console.log("shuffleArray function defined");

// --- Helper Function: Gemini API 호출 ---
async function callGemini(systemInstruction, userPrompt, generationConfigOverrides = {}) {
    if (!genAI || !process.env.GOOGLE_API_KEY) {
        console.error("FATAL: Google AI Client is not initialized or API key is missing in callGemini!");
        throw new Error("Google AI Client is not available or API key is missing.");
    }
    console.log("callGemini - helper function entered");
    const currentGenAI = genAI;
    const model = currentGenAI.getGenerativeModel({ model: modelName, safetySettings: safetySettings });
    const fullPrompt = `${systemInstruction}\n\n---\n\n사용자 요청:\n${userPrompt}\n\n---\n\n위 지침에 따라 요청을 처리하고, 필요한 경우 JSON 형식으로만 응답해 주세요.`;
    const generationConfig = { temperature: 0.5, maxOutputTokens: 4096, ...generationConfigOverrides };

    console.log(`--- Calling Gemini API (${modelName}) ---`);
    try {
        const result = await model.generateContent(fullPrompt, generationConfig);
        console.log("--- Gemini API call finished ---");
        const response = result.response;

        if (!response) { throw new Error("Gemini API로부터 응답을 받지 못했습니다."); }
        if (!response.candidates || response.candidates.length === 0) {
             const feedback = response.promptFeedback;
             const blockReason = feedback?.blockReason || 'Unknown reason (no candidates)';
             const safetyRatings = feedback?.safetyRatings;
             console.error(`Gemini 응답 비정상 (후보 없음) 또는 차단: ${blockReason}`, safetyRatings ? JSON.stringify(safetyRatings) : '');
             throw new Error(`Gemini API 응답에 후보가 없거나 차단되었습니다. 이유: ${blockReason}`);
        }
        const candidate = response.candidates[0];
        if (candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
             const feedback = response.promptFeedback || candidate.promptFeedback;
             const blockReason = feedback?.blockReason || candidate.finishReason || '알 수 없음';
             const safetyRatings = feedback?.safetyRatings || candidate.safetyRatings;
             console.error(`Gemini 응답 비정상 종료 또는 차단: ${blockReason}`, safetyRatings ? JSON.stringify(safetyRatings) : '');
             throw new Error(`Gemini API 응답이 비정상 종료 또는 차단되었습니다. 이유: ${blockReason}`);
        }
        if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0 || !candidate.content.parts[0].text) {
             console.error("Gemini API 응답 내용 없음:", JSON.stringify(response));
             throw new Error("Gemini API 응답에 유효한 텍스트 내용이 없습니다.");
        }

        const rawText = candidate.content.parts[0].text.trim();
        console.log("--- Gemini API Response (Raw Text Sample) ---"); console.log(rawText.substring(0, 200) + '...');
        const jsonString = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        return jsonString;
    } catch (error) {
        console.error(`Gemini API 호출 중 오류 발생 (${modelName}):`, error);
        throw new Error(`Gemini API 호출 실패: ${error.message}`);
    }
}
console.log("callGemini helper function defined");

// --- 1. 문장 구조 분석 엔드포인트 (경로 수정!) ---
app.post('/api/analyze', async (req, res) => { // ★★★ 경로 수정: /analyze -> /api/analyze ★★★
  console.log(`✅ --- ENTERED /api/analyze route handler ---`); // 로그 경로도 수정
  console.log(`Request path received by Express: ${req.path}`);
  console.log(`Request method received by Express: ${req.method}`);

  const { sentence } = req.body;
  console.log("구조 분석 요청 수신 (in handler):", sentence ? sentence.substring(0, 50) + '...' : 'empty');

  if (!sentence) {
    console.log("Bad request: sentence is missing");
    return res.status(400).json({ error: '문장이 전달되지 않았습니다.' });
  }
  const systemPrompt = `You are a helpful AI that analyzes English sentences... [프롬프트 내용 생략] ...Analyze the following sentence:`; // 프롬프트 생략

  try {
    const jsonString = await callGemini(systemPrompt, `"${sentence}"`, { temperature: 0.2 });
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
      if (!Array.isArray(parsed)) { throw new Error("응답 형식이 JSON 배열이 아닙니다."); }
      if (parsed.length > 0 && (!parsed[0].sentence || !parsed[0].analysis)) { throw new Error("배열 요소의 구조가 유효하지 않습니다."); }
    } catch (e) {
      console.error('Gemini 응답 JSON 파싱 실패 (구조 분석):', e.message, 'Raw string:', jsonString);
      return res.status(500).json({ error: `Gemini 응답 처리 오류 (${e.message})`, rawResponse: jsonString });
    }
    console.log("구조 분석 응답 성공");
    res.status(200).json(parsed);

  } catch (error) {
    console.error('Gemini API 또는 처리 오류 (구조 분석):', error);
    res.status(500).json({ error: '문장 분석 중 서버 오류 발생', details: error.message });
  }
});
console.log("/api/analyze route defined"); // 로그 경로도 수정

// --- 2. 문제 생성 엔드포인트 (경로 수정!) ---
app.post('/api/generate-questions', async (req, res) => { // ★★★ 경로 수정: /generate-questions -> /api/generate-questions ★★★
  console.log(`✅ --- ENTERED /api/generate-questions route handler ---`); // 로그 경로도 수정
  console.log(`Request path received by Express: ${req.path}`);
  console.log(`Request method received by Express: ${req.method}`);

  const { text, quantity = 1 } = req.body;
  console.log(`문제 생성 요청 수신 (in handler): ${quantity}개`);

  const requestedQuantity = parseInt(quantity, 10);
  if (!text || text.trim().length === 0) { return res.status(400).json({ error: '지문 텍스트가 전달되지 않았습니다.' }); }
  if (isNaN(requestedQuantity) || requestedQuantity <= 0 || requestedQuantity > 10) { return res.status(400).json({ error: '요청 문제 개수가 유효하지 않습니다 (1~10개).' }); }
  const questionGenSystemPrompt = `You are an AI assistant that generates English sentence composition practice questions... [프롬프트 내용 생략] ...Output only the JSON array.`; // 프롬프트 생략
  const userPrompt = `다음 지문으로 조건 영작 문제를 ${requestedQuantity}개 생성해줘 (각 문제는 서로 다른 문장 기반이어야 함):\n\n"${text}"`;

  try {
    const jsonString = await callGemini(questionGenSystemPrompt, userPrompt, { temperature: 0.7 });
    let parsedArray;
    try {
      parsedArray = JSON.parse(jsonString);
      if (!Array.isArray(parsedArray)) { throw new Error("Gemini 응답 형식이 JSON 배열이 아닙니다."); }
      parsedArray.forEach((qo, index) => {
          if (!qo || typeof qo !== 'object') { throw new Error(`배열의 ${index + 1}번째 요소가 유효한 객체가 아닙니다.`); }
          if (qo.vocabulary && Array.isArray(qo.vocabulary)) { shuffleArray(qo.vocabulary); } else { qo.vocabulary = []; }
          const requiredFields = ['questionText', 'prompt', 'conditions', 'vocabulary', 'answer'];
          const missingFields = requiredFields.filter(field => !(field in qo) || qo[field] === null || qo[field] === undefined);
          if (missingFields.length > 0) { throw new Error(`배열의 ${index + 1}번째 문제 객체에서 필수 필드(${missingFields.join(', ')})가 누락되었습니다.`); }
      });
      if (parsedArray.length === 0) { console.log("AI가 생성한 문제가 없습니다 (빈 배열 반환됨)."); }
    } catch (e) {
      console.error('Gemini 응답 JSON 배열 처리(파싱/검증/셔플링) 실패:', e.message, 'Raw string:', jsonString);
      return res.status(500).json({ error: `Gemini 응답 처리 중 오류 발생 (${e.message})`, rawResponse: jsonString });
    }
    console.log(`문제 생성 응답 성공: ${parsedArray.length}개`);
    res.status(200).json(parsedArray);

  } catch (error) {
    console.error('Gemini API 또는 처리 오류 (문제 생성):', error);
    res.status(500).json({ error: '문제 생성 중 서버 오류 발생', details: error.message });
  }
});
console.log("/api/generate-questions route defined"); // 로그 경로도 수정

// --- Express 앱 내보내기 (Netlify 호환 방식) ---
// event 로깅 부분은 이제 원인 파악했으므로 제거해도 됩니다. (또는 유지해도 무방)
const appHandler = serverless(app);
exports.handler = async (event, context) => {
    // console.log("--- RAW EVENT RECEIVED BY HANDLER ---"); // 디버깅 완료 후 주석 처리 또는 삭제 권장
    // const getCircularReplacer = () => { /* ... */ }; // 디버깅 완료 후 주석 처리 또는 삭제 권장
    // console.log(JSON.stringify(event, getCircularReplacer(), 2)); // 디버깅 완료 후 주석 처리 또는 삭제 권장
    // console.log("--- Passing event to serverless-http handler ---"); // 디버깅 완료 후 주석 처리 또는 삭제 권장
    return appHandler(event, context);
};