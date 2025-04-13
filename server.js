// ✅ server.js (Gemini API Version - Shuffle Vocab & Full Text)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const app = express();
const PORT = 3000;

// --- Google AI 클라이언트 초기화 ---
if (!process.env.GOOGLE_API_KEY) {
  console.error("오류: GOOGLE_API_KEY 환경 변수가 설정되지 않았습니다.");
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// --- 안전 설정 ---
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// --- 모델 이름 설정 ---
const modelName = 'gemini-1.5-pro-latest'; // Pro 모델 사용

// --- 미들웨어 설정 ---
app.use(cors());
app.use(express.json());

// --- 배열 섞기 함수 (Fisher-Yates Shuffle) ---
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// --- Helper Function: Gemini API 호출 및 응답 처리 ---
async function callGemini(systemInstruction, userPrompt, generationConfigOverrides = {}) {
    const model = genAI.getGenerativeModel({ model: modelName, safetySettings: safetySettings });
    const fullPrompt = `${systemInstruction}\n\n---\n\n사용자 요청:\n${userPrompt}\n\n---\n\n위 지침에 따라 요청을 처리하고, 필요한 경우 JSON 형식으로만 응답해 주세요.`;
    const generationConfig = { temperature: 0.5, maxOutputTokens: 4096, ...generationConfigOverrides };
    console.log(`--- Gemini API 호출 (${modelName}) ---`);
    const result = await model.generateContent(fullPrompt, generationConfig);
    const response = result.response;
    if (!response) { throw new Error("Gemini API로부터 응답을 받지 못했습니다."); }
    if (!response.candidates || response.candidates.length === 0 || response.candidates[0].finishReason === 'SAFETY') { const feedback = response.promptFeedback || response.candidates?.[0]?.promptFeedback; const blockReason = feedback?.blockReason || response.candidates?.[0]?.finishReason || '알 수 없음'; const safetyRatings = feedback?.safetyRatings || response.candidates?.[0]?.safetyRatings; console.error(`Gemini 응답 차단 또는 비정상: ${blockReason}`, safetyRatings ? JSON.stringify(safetyRatings) : ''); throw new Error(`Gemini API 응답이 안전 문제 또는 다른 이유로 차단되었습니다. 이유: ${blockReason}`); }
    if (!response.candidates[0].content || !response.candidates[0].content.parts || response.candidates[0].content.parts.length === 0 || !response.candidates[0].content.parts[0].text) { console.error("Gemini API 응답 내용 없음:", JSON.stringify(response)); throw new Error("Gemini API 응답에 유효한 텍스트 내용이 없습니다."); }
    const rawText = response.candidates[0].content.parts[0].text.trim();
    console.log("--- Gemini API 응답 (Raw Text) ---"); console.log(rawText.substring(0, 500) + (rawText.length > 500 ? '...' : ''));
    const jsonString = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    return jsonString;
}

// --- 1. 문장 구조 분석 엔드포인트 (Gemini Version) ---
app.post('/analyze', async (req, res) => {
  const { sentence } = req.body;
  if (!sentence) return res.status(400).json({ error: '문장이 전달되지 않았습니다.' });
  const systemPrompt = `... (이전과 동일) ...`; // 프롬프트 내용 생략
  try {
    const jsonString = await callGemini(systemPrompt, `문장을 분석해줘: "${sentence}"`, { temperature: 0.2 });
    let parsed;
    try { parsed = JSON.parse(jsonString); if (!Array.isArray(parsed)) throw new Error("응답 형식이 JSON 배열이 아닙니다."); }
    catch (e) { console.error('Gemini 응답 JSON 파싱 실패 (구조 분석):', e.message); return res.status(500).json({ error: `Gemini 응답 처리 중 오류 발생 (${e.message})`, raw: jsonString }); }
    res.json(parsed);
  } catch (error) { console.error('Gemini API 오류 (구조 분석):', error); res.status(500).json({ error: '문장 분석 중 오류 발생', details: error.message }); }
});

// --- 2. 문제 생성 엔드포인트 (Shuffle & Full Text) ---
app.post('/generate-questions', async (req, res) => {
  const { text, quantity = 1 } = req.body;
  const requestedQuantity = parseInt(quantity, 10);
  if (!text || text.trim().length === 0) return res.status(400).json({ error: '지문 텍스트가 전달되지 않았습니다.' });
  if (isNaN(requestedQuantity) || requestedQuantity <= 0) return res.status(400).json({ error: '요청 문제 개수가 유효하지 않습니다.' });
  const questionGenSystemPrompt = `... (이전과 동일 - 전체 지문 포함 및 조건 3 고정 텍스트 지침) ...`; // 프롬프트 내용 생략
  const userPrompt = `다음 지문으로 조건 영작 문제를 ${requestedQuantity}개 생성해줘 (각 문제는 서로 다른 문장 기반이어야 함):\n\n"${text}"`;
  try {
    const jsonString = await callGemini(questionGenSystemPrompt, userPrompt, { temperature: 0.7 });
    let parsedArray;
    try {
      parsedArray = JSON.parse(jsonString);
      if (!Array.isArray(parsedArray)) { throw new Error("Gemini 응답 형식이 JSON 배열이 아닙니다."); }
      parsedArray.forEach((questionObject) => { if (questionObject.vocabulary && Array.isArray(questionObject.vocabulary)) { shuffleArray(questionObject.vocabulary); } }); // Shuffle 추가됨
      if (parsedArray.length > 0) { parsedArray.forEach((item, index) => { if (!item.questionText || !item.prompt || !item.conditions || !item.vocabulary || !item.answer) { console.error(`문제 ${index + 1} 객체 필드 누락:`, item); throw new Error(`배열의 ${index + 1}번째 문제 객체에서 필수 필드가 누락되었습니다.`); } }); }
      else { console.log("AI가 생성한 문제가 없습니다 (빈 배열 반환됨)."); }
    } catch (e) { console.error('Gemini 응답 JSON 배열 처리(파싱/검증/셔플링) 실패:', e.message); return res.status(500).json({ error: `Gemini 응답 처리 중 오류 발생 (${e.message})`, raw: jsonString }); }
    console.log(`요청 개수: ${requestedQuantity}, 실제 생성된 문제 개수: ${parsedArray.length}`);
    res.json(parsedArray);
  } catch (error) { console.error('Gemini API 오류 (문제 생성):', error); res.status(500).json({ error: '문제 생성 중 오류 발생', details: error.message }); }
});

// --- 서버 실행 ---
app.listen(PORT, () => {
  console.log(`✅ 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
  console.log(`   Gemini 모델: ${modelName}`);
});