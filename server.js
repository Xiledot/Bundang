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
  // return array; // 배열 자체가 변경됨
}

// --- Helper Function: Gemini API 호출 및 응답 처리 ---
async function callGemini(systemInstruction, userPrompt, generationConfigOverrides = {}) {
    const model = genAI.getGenerativeModel({
        model: modelName,
        safetySettings: safetySettings,
    });

    const fullPrompt = `${systemInstruction}\n\n---\n\n사용자 요청:\n${userPrompt}\n\n---\n\n위 지침에 따라 요청을 처리하고, 필요한 경우 JSON 형식으로만 응답해 주세요.`;

    const generationConfig = {
        temperature: 0.5,
        maxOutputTokens: 4096, // 여러 문제 생성 및 전체 지문 포함 위해 넉넉하게 설정
        ...generationConfigOverrides
    };

    console.log(`--- Gemini API 호출 (${modelName}) ---`);

    const result = await model.generateContent(fullPrompt, generationConfig);
    const response = result.response;

    if (!response) { throw new Error("Gemini API로부터 응답을 받지 못했습니다."); }
     if (!response.candidates || response.candidates.length === 0 || response.candidates[0].finishReason === 'SAFETY') {
         const feedback = response.promptFeedback || response.candidates?.[0]?.promptFeedback;
         const blockReason = feedback?.blockReason || response.candidates?.[0]?.finishReason || '알 수 없음';
         const safetyRatings = feedback?.safetyRatings || response.candidates?.[0]?.safetyRatings;
         console.error(`Gemini 응답 차단 또는 비정상: ${blockReason}`, safetyRatings ? JSON.stringify(safetyRatings) : '');
         throw new Error(`Gemini API 응답이 안전 문제 또는 다른 이유로 차단되었습니다. 이유: ${blockReason}`);
     }
     if (!response.candidates[0].content || !response.candidates[0].content.parts || response.candidates[0].content.parts.length === 0 || !response.candidates[0].content.parts[0].text) {
          console.error("Gemini API 응답 내용 없음:", JSON.stringify(response));
          throw new Error("Gemini API 응답에 유효한 텍스트 내용이 없습니다.");
     }

    const rawText = response.candidates[0].content.parts[0].text.trim();
    console.log("--- Gemini API 응답 (Raw Text) ---");
    console.log(rawText.substring(0, 500) + (rawText.length > 500 ? '...' : ''));

    const jsonString = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    return jsonString;
}


// --- 1. 문장 구조 분석 엔드포인트 (Gemini Version) ---
app.post('/analyze', async (req, res) => {
  // ... (이전 버전과 동일 - 변경 없음) ...
  const { sentence } = req.body;
  if (!sentence) return res.status(400).json({ error: '문장이 전달되지 않았습니다.' });
  const systemPrompt = `
당신은 영어 문장의 문법 구조를 분석하는 AI 도우미입니다. 입력된 문장을 분석하여 요청된 JSON 형식으로만 응답해야 합니다. JSON 외의 설명이나 추가 텍스트를 절대 포함하지 마세요.
분석 형식: 각 문장은 다음 JSON 객체 형식으로 표현됩니다. 결과는 항상 JSON 배열이어야 합니다.
{ "sentence": "...", "analysis": [ ... ], "grammarNotes": [ ... ], "synonymsAntonyms": [ ... ] }
번역 지침 (매우 중요): ... (생략 - 이전과 동일) ...
추가 조건: ... (생략 - 이전과 동일) ...
    `;
  try {
    const jsonString = await callGemini(systemPrompt, `문장을 분석해줘: "${sentence}"`, { temperature: 0.2 });
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
       if (!Array.isArray(parsed)) throw new Error("응답 형식이 JSON 배열이 아닙니다.");
    } catch (e) {
      console.error('Gemini 응답 JSON 파싱 실패 (구조 분석):', e.message);
      return res.status(500).json({ error: `Gemini 응답 처리 중 오류 발생 (${e.message})`, raw: jsonString });
    }
    res.json(parsed);
  } catch (error) {
    console.error('Gemini API 오류 (구조 분석):', error);
    res.status(500).json({ error: '문장 분석 중 오류 발생', details: error.message });
  }
});


// --- 2. 문제 생성 엔드포인트 (Shuffle & Full Text) ---
app.post('/generate-questions', async (req, res) => {
  const { text, quantity = 1 } = req.body;
  const requestedQuantity = parseInt(quantity, 10);

  if (!text || text.trim().length === 0) return res.status(400).json({ error: '지문 텍스트가 전달되지 않았습니다.' });
  if (isNaN(requestedQuantity) || requestedQuantity <= 0) return res.status(400).json({ error: '요청 문제 개수가 유효하지 않습니다.' });

  // --- 문제 생성용 시스템 프롬프트 (수정됨) ---
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
    g.  **개별 문제 JSON 객체 생성:** 아래 형식의 객체를 만듭니다.
        {
          "questionText": "[3.b 단계: 한 문장만 수정된 원본 지문 전체]",
          "prompt": "[3.c 단계의 문제 지시문]",
          "conditions": [ "[조건 1 문자열]", "[조건 2 문자열]", "[조건 3 고정 문자열]" ],
          "vocabulary": [ "[3.e 단계 보기 단어1]", "[3.e 단계 보기 단어2]", ... ],
          "answer": "[3.f 단계의 원본 영어 문장]"
        }
4.  **최종 JSON 배열 출력:** 3단계에서 생성된 **N개의 (또는 가능한 최대 개수의) 문제 JSON 객체들을 포함하는 단일 JSON 배열**을 최종 결과로 반환합니다. 형식: \`[ {문제1 객체}, {문제2 객체}, ... ]\`

**주의:**
* 출력은 반드시 **JSON 배열** 형식이어야 합니다. 다른 텍스트는 절대 포함하지 마세요.
* 각 문제는 **서로 다른 원본 문장**을 기반으로 해야 합니다.
* 각 문제 객체 내의 \`questionText\`는 해당 문제의 (A) 부분만 수정된 **지문 전체**여야 합니다.
* (A)는 \`<b>\` 태그로, 한국어 번역은 \`<b><u>...\</u></b>\` 태그로 각각 감싸야 합니다.
* **조건 3 (conditions 배열의 세 번째 항목)은 반드시 고정된 설명 텍스트여야 하며, 실제 단어 목록을 포함해서는 안 됩니다.**
  `; // questionGenSystemPrompt 닫는 백틱

  const userPrompt = `다음 지문으로 조건 영작 문제를 ${requestedQuantity}개 생성해줘 (각 문제는 서로 다른 문장 기반이어야 함):\n\n"${text}"`;

  try {
    const jsonString = await callGemini(questionGenSystemPrompt, userPrompt, { temperature: 0.7 });

    let parsedArray;
    try {
      parsedArray = JSON.parse(jsonString);
      if (!Array.isArray(parsedArray)) { throw new Error("Gemini 응답 형식이 JSON 배열이 아닙니다."); }

      // --- 각 문제의 vocabulary 배열 섞기 ---
      parsedArray.forEach((questionObject) => {
        if (questionObject.vocabulary && Array.isArray(questionObject.vocabulary)) {
          shuffleArray(questionObject.vocabulary); // 정의된 함수로 섞기
        }
      });
      // --- 섞기 완료 ---

      // (선택적) 배열 내 각 객체의 필수 필드 검증
      if (parsedArray.length > 0) {
          parsedArray.forEach((item, index) => {
              if (!item.questionText || !item.prompt || !item.conditions || !item.vocabulary || !item.answer) {
                  console.error(`문제 ${index + 1} 객체 필드 누락:`, item);
                  throw new Error(`배열의 ${index + 1}번째 문제 객체에서 필수 필드가 누락되었습니다.`);
              }
          });
      } else {
          console.log("AI가 생성한 문제가 없습니다 (빈 배열 반환됨).");
      }

    } catch (e) {
      console.error('Gemini 응답 JSON 배열 처리(파싱/검증/셔플링) 실패:', e.message);
      return res.status(500).json({ error: `Gemini 응답 처리 중 오류 발생 (${e.message})`, raw: jsonString });
    }

    console.log(`요청 개수: ${requestedQuantity}, 실제 생성된 문제 개수: ${parsedArray.length}`);
    res.json(parsedArray); // 성공 시 (vocabulary가 섞인) JSON 배열 결과 전송

  } catch (error) {
    console.error('Gemini API 오류 (문제 생성):', error);
    res.status(500).json({ error: '문제 생성 중 오류 발생', details: error.message });
  }
});


// --- 서버 실행 ---
app.listen(PORT, () => {
  console.log(`✅ 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
  console.log(`   Gemini 모델: ${modelName}`);
});