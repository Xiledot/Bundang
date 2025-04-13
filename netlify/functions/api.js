// netlify/functions/api.js (Express Router 적용 최종본)
const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

console.log("--- netlify/functions/api.js - Top Level Start ---");

// 환경 변수 로드 (.env 파일 사용)
require('dotenv').config();
console.log("dotenv configured");

console.log("express required");
console.log("cors required");
console.log("@google/generative-ai required");

const app = express(); // 메인 Express 앱 생성
const router = express.Router(); // ★★★ API 라우트를 위한 Express 라우터 생성 ★★★
console.log("express app and router initialized");

// --- Google AI 클라이언트 초기화 ---
let genAI;
let googleApiKey = process.env.GOOGLE_API_KEY || '';
console.log(`GOOGLE_API_KEY length: ${googleApiKey.length > 0 ? googleApiKey.length : 0}`); // 길이 로깅

if (!googleApiKey && process.env.NODE_ENV !== 'development') { // Netlify 환경 고려
  console.error("CRITICAL ERROR: GOOGLE_API_KEY environment variable is missing or empty in Netlify settings!");
  // 실제 운영 시 여기서 에러를 던지거나 기본값 처리를 고려해야 할 수 있음
}

try {
  // API 키가 없어도 객체 생성은 가능할 수 있으나, 실제 호출 시 오류 발생
  genAI = new GoogleGenerativeAI(googleApiKey);
  console.log("GoogleGenerativeAI client instance potentially created (key validity not checked yet)");
} catch (e) {
  console.error("FATAL: GoogleGenerativeAI client initialization failed!", e);
  // 초기화 실패 시 genAI는 undefined 상태가 됨
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
const modelName = 'gemini-1.5-pro-latest'; // 또는 gemini-pro 등 사용 가능 모델
console.log(`Model name set to: ${modelName}`);

// --- 미들웨어 설정 (메인 앱에 적용) ---
try {
  // CORS 설정: 모든 출처 허용 (실제 서비스 시에는 보안을 위해 특정 출처만 허용하는 것이 좋음)
  app.use(cors({ origin: '*' }));
  console.log("cors middleware applied to app (allowing all origins)");
  // JSON 요청 본문 파싱 미들웨어
  app.use(express.json());
  console.log("express.json middleware applied to app");
} catch(e) {
   console.error("FATAL: Middleware setup failed!", e);
   // 미들웨어 설정 실패 시 에러 처리 로직 추가 가능
}

// --- Helper Functions ---

// 배열 랜덤 섞기 함수
function shuffleArray(array) {
  if (!array || !Array.isArray(array)) return; // 배열이 아니거나 없으면 반환
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
console.log("shuffleArray function defined");

// Gemini API 호출 함수
async function callGemini(systemInstruction, userPrompt, generationConfigOverrides = {}) {
  // genAI 클라이언트 및 API 키 유효성 재확인
  if (!genAI || !googleApiKey) {
    console.error("FATAL: Google AI Client is not initialized or API key is missing in callGemini!");
    throw new Error("Google AI Client is not available or API key is missing.");
  }
  console.log("callGemini - helper function entered");

  try {
    const model = genAI.getGenerativeModel({ model: modelName, safetySettings: safetySettings, systemInstruction }); // 시스템 프롬프트 직접 전달
    const generationConfig = { temperature: 0.5, maxOutputTokens: 4096, ...generationConfigOverrides };

    console.log(`--- Calling Gemini API (${modelName}) ---`);
    // 시스템 프롬프트는 모델 초기화 시 전달했으므로 사용자 프롬프트만 전달
    const result = await model.generateContent(userPrompt, generationConfig);
    console.log("--- Gemini API call finished ---");
    const response = result.response;

    // 응답 유효성 검사 (이전 버전보다 강화)
    if (!response) { throw new Error("Gemini API로부터 빈 응답을 받았습니다."); }
    if (!response.candidates || response.candidates.length === 0) {
      const feedback = response.promptFeedback;
      const blockReason = feedback?.blockReason || '후보 없음(No candidates)';
      const safetyRatings = feedback?.safetyRatings;
      console.error(`Gemini 응답 비정상 (후보 없음) 또는 차단: ${blockReason}`, safetyRatings ? JSON.stringify(safetyRatings) : '');
      throw new Error(`Gemini API 응답에 후보가 없거나 차단되었습니다. 이유: ${blockReason}`);
    }
    const candidate = response.candidates[0];
    // finishReason이 STOP 또는 MAX_TOKENS가 아닌 경우 상세 로깅 및 오류 발생
    if (candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
      const feedback = response.promptFeedback || candidate.promptFeedback;
      const blockReason = feedback?.blockReason || candidate.finishReason || '알 수 없음';
      const safetyRatings = feedback?.safetyRatings || candidate.safetyRatings;
      console.error(`Gemini 응답 비정상 종료 또는 차단: ${blockReason}`, safetyRatings ? JSON.stringify(safetyRatings) : '');
      throw new Error(`Gemini API 응답이 비정상 종료 또는 차단되었습니다. 이유: ${blockReason}`);
    }
    // content 또는 text 누락 시 오류 발생
    if (!candidate.content?.parts?.[0]?.text) {
      console.error("Gemini API 응답 내용 없음:", JSON.stringify(response));
      throw new Error("Gemini API 응답에 유효한 텍스트 내용이 없습니다.");
    }

    // 성공적인 응답 텍스트 추출 및 후처리
    const rawText = candidate.content.parts[0].text.trim();
    console.log("--- Gemini API Response (Raw Text Sample) ---"); console.log(rawText.substring(0, 200) + '...');
    // JSON 마크다운(` ```json ... ``` `) 제거
    const jsonString = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    return jsonString;

  } catch (error) {
    console.error(`Gemini API 호출 중 오류 발생 (${modelName}):`, error);
    // API 호출 자체의 오류를 좀 더 명확하게 전달
    throw new Error(`Gemini API 호출 실패 (${error.name || 'Error'}): ${error.message || 'Unknown error'}`);
  }
}
console.log("callGemini helper function defined");


// --- ★★★ API 라우트 정의 (Express Router 사용) ★★★ ---

// 1. 문장 구조 분석 엔드포인트 (/api/analyze)
router.post('/analyze', async (req, res) => { // 'app.' 대신 'router.', 경로는 '/analyze'
  console.log(`✅ --- ENTERED router /analyze handler ---`);
  console.log(`Request path received by router: ${req.path}`);
  console.log(`Request method received by router: ${req.method}`);

  const { sentence } = req.body;
  console.log("Structure analysis request received (in handler):", sentence ? sentence.substring(0, 50) + '...' : 'empty');

  if (!sentence) {
    console.log("Bad request: sentence is missing");
    return res.status(400).json({ error: 'Sentence not provided.' });
  }

  // 시스템 프롬프트 (구조 분석용)
  const systemInstruction_analyze = `You are a helpful AI that analyzes English sentences. Provide the analysis in JSON format as an array of objects. Each object in the array represents a sentence or a clause if the input contains multiple. Each sentence object should have:
1.  "sentence": The original sentence text.
2.  "analysis": An array of phrase objects. Each phrase object must have "id" (sequential integer starting from 1), "text" (the phrase text), "role" (e.g., '주어', '동사', '목적어', '보어', '수식어', '접속사', '전치사구'), "trans" (Korean translation), and "modifies" (the 'id' of the element it modifies, null if none). Focus on core grammatical roles and modifications.
3.  "grammarNotes": An array of 1-2 strings, explaining key grammatical points.
4.  "synonymsAntonyms": An array of 1-2 strings for key vocabulary (format: "word: syn. synonym / ant. antonym").
Output only the JSON array. Do not include explanations outside the JSON structure.`;

  try {
    // 시스템 프롬프트는 모델 초기화 시 전달했으므로 사용자 프롬프트만 전달
    const jsonString = await callGemini(systemInstruction_analyze, `Analyze the following sentence: "${sentence}"`, { temperature: 0.2 });
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
      // 간단한 응답 구조 검증
      if (!Array.isArray(parsed)) throw new Error("Response is not a JSON array.");
      if (parsed.length > 0 && (!parsed[0].sentence || !parsed[0].analysis)) throw new Error("Invalid array element structure.");
    } catch (e) {
      console.error('JSON parsing failed (Analysis):', e.message, 'Raw string:', jsonString);
      return res.status(500).json({ error: `Failed to parse AI response (${e.message})`, rawResponse: jsonString });
    }
    console.log("Structure analysis successful");
    res.status(200).json(parsed);

  } catch (error) {
    console.error('Error during structure analysis:', error);
    res.status(500).json({ error: 'Server error during analysis', details: error.message });
  }
});
console.log("Router POST /analyze defined");

// 2. 문제 생성 엔드포인트 (/api/generate-questions)
router.post('/generate-questions', async (req, res) => { // 'app.' 대신 'router.', 경로는 '/generate-questions'
  console.log(`✅ --- ENTERED router /generate-questions handler ---`);
  console.log(`Request path received by router: ${req.path}`);
  console.log(`Request method received by router: ${req.method}`);

  const { text, quantity = 1 } = req.body;
  console.log(`Question generation request received (in handler): ${quantity} question(s)`);

  // 입력값 검증
  const requestedQuantity = parseInt(quantity, 10);
  if (!text || text.trim().length === 0) return res.status(400).json({ error: 'Text passage not provided.' });
  if (isNaN(requestedQuantity) || requestedQuantity <= 0 || requestedQuantity > 5) { // 최대 5개로 제한
      return res.status(400).json({ error: 'Invalid number of questions requested (1-5).' });
  }

  // 시스템 프롬프트 (문제 생성용)
  const systemInstruction_generate = `You are an AI assistant that generates English sentence composition practice questions based on a given text passage. Create exactly the specified number of questions. Each question must be based on a DIFFERENT sentence from the passage. For each question, provide a JSON object with the following fields:
1.  "prompt": The original sentence from the passage.
2.  "questionText": Instruction like "다음 단어들을 모두 포함하고, 주어진 조건을 만족하도록 문장을 완성하시오."
3.  "conditions": Grammatical conditions (e.g., "주어진 단어 모두 사용.\n과거 완료 시제 사용.").
4.  "vocabulary": Array of Korean meanings for key words to be used, shuffled.
5.  "answer": The target correct English sentence.
Output must be a JSON array containing exactly the requested number of question objects. Ensure vocabulary is shuffled. Do not include explanations outside the JSON structure.`;

  const userPrompt = `Generate ${requestedQuantity} question(s) based on the following passage (each from a different sentence):\n\n"${text}"`;

  try {
    const jsonString = await callGemini(systemInstruction_generate, userPrompt, { temperature: 0.7 });
    let parsedArray;
    try {
      parsedArray = JSON.parse(jsonString);
      if (!Array.isArray(parsedArray)) throw new Error("Response is not a JSON array.");
      // 결과 검증 및 처리 (셔플, 필드 확인)
      parsedArray.forEach((qo, index) => {
        if (!qo || typeof qo !== 'object') throw new Error(`Item ${index + 1} is not a valid object.`);
        if (qo.vocabulary && Array.isArray(qo.vocabulary)) { shuffleArray(qo.vocabulary); } else { qo.vocabulary = []; }
        const requiredFields = ['questionText', 'prompt', 'conditions', 'vocabulary', 'answer'];
        const missingFields = requiredFields.filter(field => !(field in qo) || qo[field] === null || qo[field] === undefined);
        if (missingFields.length > 0) throw new Error(`Item ${index + 1} is missing required fields: ${missingFields.join(', ')}`);
      });
      if (parsedArray.length === 0) console.log("No questions generated by AI.");

    } catch (e) {
      console.error('JSON processing failed (Questions):', e.message, 'Raw string:', jsonString);
      return res.status(500).json({ error: `Failed to process AI response (${e.message})`, rawResponse: jsonString });
    }
    console.log(`Question generation successful: ${parsedArray.length} question(s)`);
    res.status(200).json(parsedArray);

  } catch (error) {
    console.error('Error during question generation:', error);
    res.status(500).json({ error: 'Server error during question generation', details: error.message });
  }
});
console.log("Router POST /generate-questions defined");

// --- ★★★ 메인 앱에 라우터 연결 ★★★ ---
// '/api' 경로로 시작하는 모든 요청을 위에서 정의한 router가 처리하도록 설정
app.use('/api', router);
console.log("Router mounted on '/api' path");

// --- Express 앱 내보내기 (Netlify 호환 방식) ---
// 이제 exports.handler는 serverless(app)을 직접 내보냅니다.
exports.handler = serverless(app);
console.log("Handler exported");