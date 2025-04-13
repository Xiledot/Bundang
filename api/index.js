// ✅ api/index.js (최종 버전 - Vercel용)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const app = express();

// --- Google AI 클라이언트 초기화 ---
if (!process.env.GOOGLE_API_KEY && process.env.NODE_ENV !== 'development') {
  console.error("오류: GOOGLE_API_KEY 환경 변수가 Vercel 프로젝트 설정에 필요합니다.");
}
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

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
app.use(cors());
app.use(express.json());

// --- 배열 섞기 함수 ---
function shuffleArray(array) {
  if (!array) return; // 배열이 null 이나 undefined인 경우 방지
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// --- Helper Function: Gemini API 호출 ---
async function callGemini(systemInstruction, userPrompt, generationConfigOverrides = {}) {
    if (!process.env.GOOGLE_API_KEY) { throw new Error("서버에 GOOGLE_API_KEY가 설정되지 않았습니다."); }
    const currentGenAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = currentGenAI.getGenerativeModel({ model: modelName, safetySettings: safetySettings });
    const fullPrompt = `${systemInstruction}\n\n---\n\n사용자 요청:\n${userPrompt}\n\n---\n\n위 지침에 따라 요청을 처리하고, 필요한 경우 JSON 형식으로만 응답해 주세요.`;
    const generationConfig = { temperature: 0.5, maxOutputTokens: 4096, ...generationConfigOverrides };
    console.log(`--- Gemini API 호출 (${modelName}) ---`);
    const result = await model.generateContent(fullPrompt, generationConfig);
    const response = result.response;
    if (!response) { throw new Error("Gemini API로부터 응답을 받지 못했습니다."); }
    if (!response.candidates || response.candidates.length === 0 || response.candidates[0].finishReason !== 'STOP') { // finishReason 확인 추가
         const feedback = response.promptFeedback || response.candidates?.[0]?.promptFeedback;
         const finishReason = response.candidates?.[0]?.finishReason || '알 수 없음';
         const blockReason = feedback?.blockReason || (finishReason !== 'STOP' ? finishReason : '차단 이유 없음');
         const safetyRatings = feedback?.safetyRatings || response.candidates?.[0]?.safetyRatings;
         console.error(`Gemini 응답 비정상 종료 또는 차단: ${blockReason}`, safetyRatings ? JSON.stringify(safetyRatings) : '');
         throw new Error(`Gemini API 응답이 비정상 종료 또는 차단되었습니다. 이유: ${blockReason}`);
     }
     if (!response.candidates[0].content || !response.candidates[0].content.parts || response.candidates[0].content.parts.length === 0 || !response.candidates[0].content.parts[0].text) { console.error("Gemini API 응답 내용 없음:", JSON.stringify(response)); throw new Error("Gemini API 응답에 유효한 텍스트 내용이 없습니다."); }
    const rawText = response.candidates[0].content.parts[0].text.trim();
    console.log("--- Gemini API 응답 (Raw Text) ---"); console.log(rawText.substring(0, 200) + '...');
    const jsonString = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    return jsonString;
}

// --- 1. 문장 구조 분석 엔드포인트 ---
app.post('/analyze', async (req, res) => {
  const { sentence } = req.body;
  if (!sentence) return res.status(400).json({ error: '문장이 전달되지 않았습니다.' });
  const systemPrompt = `
당신은 영어 문장의 문법 구조를 분석하는 AI 도우미입니다. 입력된 문장을 분석하여 요청된 JSON 형식으로만 응답해야 합니다. JSON 외의 설명이나 추가 텍스트를 절대 포함하지 마세요.
분석 형식: 각 문장은 다음 JSON 객체 형식으로 표현됩니다. 결과는 항상 JSON 배열이어야 합니다.
{ "sentence": "...", "analysis": [ { "id": "p1", "text": "구문", "role": "역할", "trans": "번역" }, ... ], "grammarNotes": [ "[단어] 설명" ], "synonymsAntonyms": [ "단어 - 뜻 [유의어] 유의어 [반의어] 반의어" ] }
번역 지침 (매우 중요): - 'trans' 필드는 'text' 필드만 직접 번역합니다. - 형용사 역할 구/절(of ~, 관계사절 등)은 자연스러운 연결을 위해 조사/어미('~의', '~하는')를 포함해야 합니다. (필수!) - 수식받는 명사의 의미는 절대 'trans'에 포함하지 마세요. (필수!) - 예: "of elderly people" -> "trans": "노인들의" (O), "노인들" (X), "노인들의 수" (X)
추가 조건: - 결과는 항상 JSON 배열 형식: [ {문장1 분석}, ... ] - modifies 필드는 형용사 역할 구/절만 가질 수 있습니다. - 유의어/반의어는 동사, 형용사, 명사 위주로 추출하고, 명확한 경우만 작성합니다. - grammarNotes, synonymsAntonyms 항목은 [단어] 또는 단어- 로 시작해야 합니다. - 모든 주요 어법 포인트를 grammarNotes에 포함하세요. - 출력은 JSON 배열 하나여야 하며, 다른 설명은 절대 불가합니다.
    `;
  try {
    const jsonString = await callGemini(systemPrompt, `문장을 분석해줘: "${sentence}"`, { temperature: 0.2 });
    let parsed;
    try { parsed = JSON.parse(jsonString); if (!Array.isArray(parsed)) throw new Error("응답 형식이 JSON 배열이 아닙니다."); }
    catch (e) { return res.status(500).json({ error: `Gemini 응답 처리 오류 (${e.message})`, raw: jsonString }); }
    res.json(parsed);
  } catch (error) { console.error('Gemini API 오류 (구조 분석):', error); res.status(500).json({ error: '문장 분석 중 오류 발생', details: error.message }); }
});

// --- 2. 문제 생성 엔드포인트 ---
app.post('/generate-questions', async (req, res) => {
  const { text, quantity = 1 } = req.body;
  const requestedQuantity = parseInt(quantity, 10);
  if (!text || text.trim().length === 0) return res.status(400).json({ error: '지문 텍스트가 전달되지 않았습니다.' });
  if (isNaN(requestedQuantity) || requestedQuantity <= 0) return res.status(400).json({ error: '요청 문제 개수가 유효하지 않습니다.' });
  const questionGenSystemPrompt = `
당신은 주어진 영어 지문을 바탕으로, 사용자가 요청한 개수(N)만큼 '조건 영작' 문제를 생성하는 AI입니다. **결과는 반드시 각 문제를 객체로 포함하는 JSON 배열 형식으로만 반환해야 합니다.** JSON 외의 설명은 절대 포함하지 마세요.
**요청 처리 단계:**
1.  **요청 개수(N) 확인:** 사용자 요청에 명시된 문제 개수(N)를 확인합니다.
2.  **핵심 문장 선정 (N개, 중복 없이):** 지문 내용 중에서, 영작 문제로 출제하기에 적합하고 **서로 다른 영어 문장을 N개** 엄격하게 선정합니다. **선정된 문장이 중복되어서는 안 됩니다.** 너무 짧거나 단순한 문장은 피해주세요. (만약 지문에서 N개의 적합한 문장을 찾기 어렵다면, 가능한 최대 개수만큼만 생성하고 그 개수만큼의 객체만 배열에 포함합니다.)
3.  **각 선정 문장에 대해 다음 작업 수행 (1개 문제 생성):**
    a.  **한국어 번역:** 선정한 영어 문장을 자연스러운 한국어 문장으로 번역합니다.
    b.  **지문 수정 및 포함:** 원본 지문 **전체** 텍스트를 가져와서, 1단계에서 선정한 해당 영어 문장 **하나만**을 \`<b>(A)</b> <b><u>\${'[a단계 번역]'}</u></b>\` 형태로 HTML 태그를 포함하여 대체합니다. 이렇게 **한 문장만 수정된 원본 지문 전체 텍스트**를 해당 문제 객체의 \`questionText\` 필드에 포함해야 합니다. 원본 지문의 줄바꿈 등 형식은 최대한 유지합니다.
    c.  **문제 지시문 생성:** "다음 글의 밑줄 친 (A)의 우리말 의미와 같도록 아래 조건에 맞추어 영작하시오."
    d.  **영작 조건 생성:** (선정한 원본 영어 문장 기반으로 **conditions 배열**에 포함될 문자열 3개 생성)
        * 조건 1 (단어 수): "총 [숫자]개의 단어로 서술하시오." 문자열 생성.
        * 조건 2 (문법/구문): 주요 문법/구문 1~2가지 활용 조건 문자열 생성.
        * **조건 3 (어휘 활용 - 고정 텍스트):** **다음 고정된 텍스트 문자열만 생성**합니다: "[보기]의 단어를 모두 활용하되, 필요시 어형을 변형하고 필요한 단어를 추가하시오." (**주의: 이 조건 문자열 안에 실제 보기 단어 목록을 절대 포함하지 마세요.**)
    e.  **보기 단어 목록 생성:** (별도의 **vocabulary 배열**에 포함될 문자열 배열 생성) 원본 영어 문장에서 **문법/의미적으로 중요하거나 형태 변화가 필요한 핵심 단어 5~8개를 원형(base form) 위주로 선정**하여 문자열 배열을 만듭니다. (만약 5개 미만이면 가능한 만큼만).
    f.  **답안 생성:** 선정한 원본 영어 문장을 'answer' 필드에 포함합니다.
    g.  **개별 문제 JSON 객체 생성:** 아래 형식의 객체를 만듭니다. { "questionText": "[3.b]", "prompt": "[3.c]", "conditions": [ "[조건1]", "[조건2]", "[조건3]" ], "vocabulary": [ "[3.e 단어1]", ... ], "answer": "[3.f]" }
4.  **최종 JSON 배열 출력:** 3단계에서 생성된 **N개의 (또는 가능한 최대 개수의) 문제 JSON 객체들을 포함하는 단일 JSON 배열**을 최종 결과로 반환합니다. 형식: \`[ {문제1 객체}, ... ]\`
**주의:** 출력은 반드시 **JSON 배열** 형식이어야 합니다. 다른 텍스트 절대 포함 금지. 각 문제는 **서로 다른 원본 문장** 기반. 각 \`questionText\`는 **지문 전체**. (A)는 \`<b>\`, 한국어 번역은 \`<b><u>...\</u></b>\`. **조건 3은 고정 텍스트.**
  `; // questionGenSystemPrompt 닫는 백틱

  const userPrompt = `다음 지문으로 조건 영작 문제를 ${requestedQuantity}개 생성해줘 (각 문제는 서로 다른 문장 기반이어야 함):\n\n"${text}"`;
  try {
    const jsonString = await callGemini(questionGenSystemPrompt, userPrompt, { temperature: 0.7 });
    let parsedArray;
    try {
      parsedArray = JSON.parse(jsonString);
      if (!Array.isArray(parsedArray)) { throw new Error("Gemini 응답 형식이 JSON 배열이 아닙니다."); }
      parsedArray.forEach((qo) => { if (qo.vocabulary && Array.isArray(qo.vocabulary)) { shuffleArray(qo.vocabulary); } }); // Shuffle
      if (parsedArray.length > 0) { parsedArray.forEach((item, index) => { if (!item.questionText || !item.prompt || !item.conditions || !item.vocabulary || !item.answer) { console.error(`문제 ${index + 1} 객체 필드 누락:`, item); throw new Error(`배열의 ${index + 1}번째 문제 객체에서 필수 필드가 누락되었습니다.`); } }); }
      else { console.log("AI가 생성한 문제가 없습니다 (빈 배열 반환됨)."); }
    } catch (e) { console.error('Gemini 응답 JSON 배열 처리(파싱/검증/셔플링) 실패:', e.message); return res.status(500).json({ error: `Gemini 응답 처리 중 오류 발생 (${e.message})`, raw: jsonString }); }
    console.log(`요청 개수: ${requestedQuantity}, 실제 생성된 문제 개수: ${parsedArray.length}`);
    res.json(parsedArray);
  } catch (error) { console.error('Gemini API 오류 (문제 생성):', error); res.status(500).json({ error: '문제 생성 중 오류 발생', details: error.message }); }
});

// --- Express 앱 내보내기 ---
module.exports = app;