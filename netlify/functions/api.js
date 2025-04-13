// netlify/functions/api.js (Netlify 경로 기준)
const serverless = require('serverless-http');
console.log("--- netlify/functions/api.js - Top Level Start ---"); // 경로에 맞게 주석 수정

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

if (!googleApiKey && process.env.NODE_ENV !== 'production') { // NODE_ENV 체크를 'production'으로 변경 (Netlify 기본값)
  // Netlify에서는 기본적으로 process.env.NODE_ENV가 'production' 또는 'development'(빌드 시) 등으로 설정됨
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
  // CORS 설정 추가: 모든 출처 허용 (필요에 따라 더 제한적으로 변경 가능)
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
    // 참고: 실제 프로덕션에서는 매번 모델을 가져오는 대신 한 번 초기화하는 것이 더 효율적일 수 있습니다.
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
        // finishReason 체크 강화
        const candidate = response.candidates[0];
        if (candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') { // MAX_TOKENS도 일단 정상 종료로 간주
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
        // API 호출 레벨에서 오류 발생 시 더 구체적인 에러 throw
        throw new Error(`Gemini API 호출 실패: ${error.message}`);
    }
}
console.log("callGemini helper function defined");

// --- 1. 문장 구조 분석 엔드포인트 ---
app.post('/analyze', async (req, res) => {
  // ▼▼▼ 로그 추가 ▼▼▼
  console.log(`✅ --- ENTERED /analyze route handler ---`); // 핸들러 진입 확인 로그!
  console.log(`Request path received by Express: ${req.path}`);
  console.log(`Request method received by Express: ${req.method}`);
  // ▲▲▲ 여기까지 추가 ▲▲▲

  const { sentence } = req.body;
  console.log("구조 분석 요청 수신 (in handler):", sentence ? sentence.substring(0, 50) + '...' : 'empty');

  if (!sentence) {
    console.log("Bad request: sentence is missing");
    return res.status(400).json({ error: '문장이 전달되지 않았습니다.' });
  }

  const systemPrompt = `You are a helpful AI that analyzes English sentences. Provide the analysis in JSON format as an array of objects. Each object in the array represents a sentence or a clause if the input contains multiple. Each sentence object should have:
1.  "sentence": The original sentence text.
2.  "analysis": An array of phrase objects. Each phrase object should have "id" (sequential integer starting from 1), "text" (the phrase text), "role" (e.g., '주어', '동사', '목적어', '보어', '수식어', '주격보어', '목적격보어', '형용사', '부사', '전치사구', '접속사', '감탄사', '명사', '대명사', '동명사', 'to부정사', '분사', '관사', '형용사구', '형용사절', '부사구', '부사절', '명사구', '명사절'), "trans" (Korean translation of the phrase), and "modifies" (the 'id' of the element it modifies, if applicable, especially for adjectives/adverbs modifying nouns/verbs). Adjective phrases/clauses should modify nouns, pronouns, subjects, or objects. Adverb phrases/clauses should modify verbs, adjectives, or other adverbs.
3.  "grammarNotes": An array of strings, explaining key grammatical points or structures found in the sentence.
4.  "synonymsAntonyms": An array of strings, providing synonyms or antonyms for key vocabulary words (format: "word: syn. synonym1, synonym2 / ant. antonym1"). Focus on 1-2 key words.

Example for "The quick brown fox jumps over the lazy dog":
[
  {
    "sentence": "The quick brown fox jumps over the lazy dog",
    "analysis": [
      {"id": 1, "text": "The quick brown fox", "role": "주어", "trans": "그 빠른 갈색 여우는", "modifies": null},
      {"id": 2, "text": "jumps", "role": "동사", "trans": "뛰어넘는다", "modifies": null},
      {"id": 3, "text": "over the lazy dog", "role": "전치사구", "trans": "그 게으른 개 너머로", "modifies": 2}
    ],
    "grammarNotes": ["'The quick brown fox' is the subject.", "'jumps' is the main verb.", "'over the lazy dog' is a prepositional phrase acting as an adverbial modifier for 'jumps'."],
    "synonymsAntonyms": ["quick: syn. fast, speedy / ant. slow", "lazy: syn. idle, sluggish / ant. active, energetic"]
  }
]
Ensure the output is strictly JSON. Analyze the following sentence:`; // 프롬프트는 여기에 유지

  try {
    const jsonString = await callGemini(systemPrompt, `"${sentence}"`, { temperature: 0.2 });
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
      if (!Array.isArray(parsed)) {
        console.error('Parsed data is not an array:', parsed);
        throw new Error("응답 형식이 JSON 배열이 아닙니다.");
      }
      // 추가 검증: 배열의 각 요소가 예상된 구조를 가졌는지 (간단히)
      if (parsed.length > 0 && (!parsed[0].sentence || !parsed[0].analysis)) {
         console.error('Parsed array element structure is invalid:', parsed[0]);
         throw new Error("배열 요소의 구조가 유효하지 않습니다.");
      }
    } catch (e) {
      console.error('Gemini 응답 JSON 파싱 실패 (구조 분석):', e.message, 'Raw string:', jsonString);
      // 파싱 실패 시 클라이언트에게 원본 문자열도 함께 전달 (디버깅 목적)
      return res.status(500).json({ error: `Gemini 응답 처리 오류 (${e.message})`, rawResponse: jsonString });
    }
    console.log("구조 분석 응답 성공");
    res.status(200).json(parsed); // 성공 시 200 상태 코드 명시

  } catch (error) {
    console.error('Gemini API 또는 처리 오류 (구조 분석):', error);
    // 클라이언트에게 전송하는 오류 메시지 개선
    res.status(500).json({ error: '문장 분석 중 서버 오류 발생', details: error.message });
  }
});
console.log("/analyze route defined");

// --- 2. 문제 생성 엔드포인트 ---
app.post('/generate-questions', async (req, res) => {
  // ▼▼▼ 로그 추가 ▼▼▼
  console.log(`✅ --- ENTERED /generate-questions route handler ---`); // 핸들러 진입 확인 로그!
  console.log(`Request path received by Express: ${req.path}`);
  console.log(`Request method received by Express: ${req.method}`);
  // ▲▲▲ 여기까지 추가 ▲▲▲

  const { text, quantity = 1 } = req.body;
  console.log(`문제 생성 요청 수신 (in handler): ${quantity}개`);

  const requestedQuantity = parseInt(quantity, 10);
  if (!text || text.trim().length === 0) {
    console.log("Bad request: text is missing");
    return res.status(400).json({ error: '지문 텍스트가 전달되지 않았습니다.' });
  }
  if (isNaN(requestedQuantity) || requestedQuantity <= 0 || requestedQuantity > 10) { // 최대 개수 제한 추가
    console.log(`Bad request: invalid quantity ${quantity}`);
    return res.status(400).json({ error: '요청 문제 개수가 유효하지 않습니다 (1~10개).' });
  }

  const questionGenSystemPrompt = `You are an AI assistant that generates English sentence composition practice questions based on a given text passage. Create exactly the specified number of questions. Each question must be based on a DIFFERENT sentence from the passage. For each question, provide a JSON object with the following fields:
1.  "prompt": The original sentence from the passage that the question is based on.
2.  "questionText": The instruction asking the user to compose a sentence using the provided conditions and vocabulary. (e.g., "다음 단어들을 모두 포함하고, 주어진 조건을 만족하도록 문장을 완성하시오.")
3.  "conditions": A string describing the grammatical conditions or structures the user must use. (e.g., "주어진 단어를 모두 사용할 것.\n'not only A but also B' 구문을 포함할 것.\n총 10단어 이내로 작성할 것.")
4.  "vocabulary": An array of strings containing the Korean meanings of key words or phrases that the user should use in their answer sentence. These should be shuffled.
5.  "answer": The target correct English sentence that satisfies the conditions.

The output must be a JSON array containing exactly the requested number of question objects. Ensure the vocabulary array is shuffled.

Example output format for one question object:
{
  "prompt": "The quick brown fox jumps over the lazy dog.",
  "questionText": "다음 단어들을 모두 포함하고, 주어진 조건을 만족하도록 문장을 완성하시오.",
  "conditions": "주어진 단어를 모두 사용할 것.\\n수동태 문장으로 작성할 것.",
  "vocabulary": ["게으른", "뛰어넘다", "~에 의해", "그", "개", "빠른", "여우", "갈색"],
  "answer": "The lazy dog is jumped over by the quick brown fox."
}

Generate the questions based on the provided passage. Output only the JSON array.`; // 프롬프트는 여기에 유지

  const userPrompt = `다음 지문으로 조건 영작 문제를 ${requestedQuantity}개 생성해줘 (각 문제는 서로 다른 문장 기반이어야 함):\n\n"${text}"`;

  try {
    const jsonString = await callGemini(questionGenSystemPrompt, userPrompt, { temperature: 0.7 });
    let parsedArray;
    try {
      parsedArray = JSON.parse(jsonString);
      if (!Array.isArray(parsedArray)) {
        console.error('Parsed data is not an array:', parsedArray);
        throw new Error("Gemini 응답 형식이 JSON 배열이 아닙니다.");
      }
      // 셔플 및 필드 검증 강화
      parsedArray.forEach((qo, index) => {
          if (!qo || typeof qo !== 'object') {
              console.error(`문제 ${index + 1} 객체가 유효하지 않음:`, qo);
              throw new Error(`배열의 ${index + 1}번째 요소가 유효한 객체가 아닙니다.`);
          }
          if (qo.vocabulary && Array.isArray(qo.vocabulary)) {
              shuffleArray(qo.vocabulary);
          } else {
              // 어휘가 없거나 배열이 아닌 경우 빈 배열로 설정 (오류 방지)
              qo.vocabulary = [];
          }
          // 필수 필드 확인
          const requiredFields = ['questionText', 'prompt', 'conditions', 'vocabulary', 'answer'];
          const missingFields = requiredFields.filter(field => !(field in qo) || qo[field] === null || qo[field] === undefined);
          if (missingFields.length > 0) {
               console.error(`문제 ${index + 1} 객체 필드 누락: ${missingFields.join(', ')}`, qo);
               throw new Error(`배열의 ${index + 1}번째 문제 객체에서 필수 필드(${missingFields.join(', ')})가 누락되었습니다.`);
          }
      });

      if (parsedArray.length === 0) {
        console.log("AI가 생성한 문제가 없습니다 (빈 배열 반환됨).");
      }
    } catch (e) {
      console.error('Gemini 응답 JSON 배열 처리(파싱/검증/셔플링) 실패:', e.message, 'Raw string:', jsonString);
      return res.status(500).json({ error: `Gemini 응답 처리 중 오류 발생 (${e.message})`, rawResponse: jsonString });
    }
    console.log(`문제 생성 응답 성공: ${parsedArray.length}개`);
    res.status(200).json(parsedArray); // 성공 시 200 상태 코드 명시

  } catch (error) {
    console.error('Gemini API 또는 처리 오류 (문제 생성):', error);
    res.status(500).json({ error: '문제 생성 중 서버 오류 발생', details: error.message });
  }
});
console.log("/generate-questions route defined");

// --- Express 앱 내보내기 (Netlify 호환 방식) ---
const appHandler = serverless(app); // 기존 serverless-http 핸들러 생성

// Netlify가 호출할 실제 핸들러 함수
exports.handler = async (event, context) => {
    console.log("--- RAW EVENT RECEIVED BY HANDLER ---"); // <-- 이 로그가 보이는지 확인!

    // event 객체 전체를 로깅 (내용 확인용)
    // 순환 참조 오류 방지를 위한 replacer 함수
    const getCircularReplacer = () => {
        const seen = new WeakSet();
        return (key, value) => {
            if (typeof value === "object" && value !== null) {
                if (seen.has(value)) {
                    return "[Circular]"; // 순환 참조 시 대체 문자열
                }
                seen.add(value);
            }
            return value;
        };
    };
    // JSON.stringify를 사용하여 event 객체를 문자열로 변환 후 로깅
    console.log(JSON.stringify(event, getCircularReplacer(), 2)); // <-- 이 아래에 출력될 JSON 데이터가 중요!

    console.log("--- Passing event to serverless-http handler ---");

    // 생성해둔 기존 serverless-http 핸들러를 호출하여 요청 처리
    return appHandler(event, context);
};