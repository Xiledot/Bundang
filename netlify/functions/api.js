// netlify/functions/api.js (Manual Routing + Strict Prompts)
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

console.log("--- netlify/functions/api.js (MANUAL ROUTING + Strict Prompts) - Top Level Start ---");

// 환경 변수 로드
require('dotenv').config();
console.log("dotenv configured");
console.log("@google/generative-ai required");

// --- Google AI 클라이언트 초기화 ---
let genAI;
let googleApiKey = process.env.GOOGLE_API_KEY || '';
console.log(`GOOGLE_API_KEY length: ${googleApiKey.length > 0 ? googleApiKey.length : 0}`);
if (!googleApiKey && process.env.NODE_ENV !== 'development') {
  console.error("CRITICAL ERROR: GOOGLE_API_KEY environment variable is missing!");
}
try {
  genAI = new GoogleGenerativeAI(googleApiKey);
  console.log("GoogleGenerativeAI client instance potentially created");
} catch (e) {
  console.error("FATAL: GoogleGenerativeAI client initialization failed!", e);
  genAI = null;
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

// --- Helper Functions ---
function shuffleArray(array) { if (!array || !Array.isArray(array)) return; for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } }
console.log("shuffleArray function defined");

async function callGemini(systemInstruction, userPrompt, generationConfigOverrides = {}) {
  if (!genAI || !googleApiKey) { throw new Error("Google AI Client/API Key missing."); }
  console.log("callGemini entered");
  try {
    const model = genAI.getGenerativeModel({ model: modelName, safetySettings, systemInstruction });
    const generationConfig = { temperature: 0.5, maxOutputTokens: 4096, ...generationConfigOverrides };
    console.log(`Calling Gemini (${modelName})...`);
    const result = await model.generateContent(userPrompt, generationConfig);
    console.log("Gemini call finished.");
    const response = result.response;
    // 응답 유효성 검사
    if (!response) { throw new Error("Gemini API로부터 빈 응답을 받았습니다."); }
    if (!response.candidates || response.candidates.length === 0) { const feedback = response.promptFeedback; const blockReason = feedback?.blockReason || '후보 없음(No candidates)'; console.error(`Gemini 응답 비정상 (후보 없음) 또는 차단: ${blockReason}`); throw new Error(`Gemini API 응답에 후보가 없거나 차단됨. 이유: ${blockReason}`); }
    const candidate = response.candidates[0];
    if (candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') { const feedback = response.promptFeedback || candidate.promptFeedback; const blockReason = feedback?.blockReason || candidate.finishReason || '알 수 없음'; console.error(`Gemini 응답 비정상 종료 또는 차단: ${blockReason}`); throw new Error(`Gemini API 응답 비정상 종료/차단. 이유: ${blockReason}`); }
    if (!candidate.content?.parts?.[0]?.text) { console.error("Gemini API 응답 내용 없음:", JSON.stringify(response)); throw new Error("Gemini API 응답 내용 없음."); }
    const rawText = candidate.content.parts[0].text.trim();
    console.log("Gemini raw response sample:", rawText.substring(0, 100) + '...');
    const jsonString = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    return jsonString;
  } catch (error) { console.error(`Gemini API Call Error:`, error); throw new Error(`Gemini API Call Failed: ${error.message}`); }
}
console.log("callGemini helper function defined");

// ★★★ Netlify Handler (Manual Routing + Strict Prompts) ★★★
exports.handler = async (event, context) => {
    console.log("--- ✅ MANUAL ROUTING HANDLER INVOKED ---");
    console.log("Received path:", event.path);
    console.log("Received method:", event.httpMethod);

    // 기본 헤더 (CORS 포함)
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
    };

    // OPTIONS (Preflight) 요청 처리
    if (event.httpMethod === 'OPTIONS') {
        console.log("Handling OPTIONS preflight request");
        return { statusCode: 204, headers };
    }

    try {
        // 요청 본문 파싱
        let requestBody;
        try {
            requestBody = event.body ? JSON.parse(event.body) : {};
        } catch (e) {
            console.error("Failed to parse request body:", event.body, e);
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON body" }) };
        }

        // 경로 및 메소드 기반 분기
        if (event.path && event.path.endsWith('/api/analyze') && event.httpMethod === 'POST') {
            console.log("--- Routing to /api/analyze logic ---");
            const sentence = requestBody.sentence;
            console.log("Analyze sentence received:", sentence);
            if (!sentence) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Sentence not provided.' }) };

            // 시스템 프롬프트 (구조 분석용 - ★★★ JSON 출력 강조 수정 ★★★)
            const systemInstruction_analyze = `You are an AI assistant that analyzes English sentences. Your SOLE task is to return ONLY a valid JSON array containing sentence analysis objects based on the user's input sentence.

            Each object in the array represents a sentence or clause and MUST have the following fields:
            1.  "sentence": The original sentence text.
            2.  "analysis": An array of phrase objects (each MUST have "id", "text", "role", "trans", "modifies"). Define roles clearly (e.g., '주어', '동사', '목적어', '보어', '수식어', '접속사').
            3.  "grammarNotes": An array of 1-2 short strings explaining key grammar points.
            4.  "synonymsAntonyms": An array of 1-2 strings for key vocabulary (format: "word: syn. synonym / ant. antonym").

            Example format for ONE sentence object:
            {
              "sentence": "Example sentence text.",
              "analysis": [{"id": 1, "text": "Example", "role": "명사", "trans": "예시", "modifies": null}],
              "grammarNotes": ["Note 1.", "Note 2."],
              "synonymsAntonyms": ["Example: syn. sample / ant. original"]
            }

            ABSOLUTELY CRITICAL INSTRUCTIONS:
            - Your entire response MUST start with '[' and end with ']'.
            - Output ONLY the raw JSON array data.
            - Do NOT include ANY introductory text, concluding text, explanations, apologies, notes, or any other text outside the JSON structure.
            - Do NOT use markdown formatting like \`\`\`json ... \`\`\`.
            - Ensure the generated JSON is 100% valid according to JSON specifications.

            Analyze the sentence provided by the user.`; // 사용자 문장은 userPrompt로 전달됨

            const jsonString = await callGemini(systemInstruction_analyze, `"${sentence}"`, { temperature: 0.2 });
            let parsed;
            try {
                parsed = JSON.parse(jsonString); // 파싱 시도
                if (!Array.isArray(parsed)) throw new Error("Response is not a JSON array.");
                // 추가적인 내부 구조 검증 생략 (필요 시 추가)
            } catch (e) {
                console.error('JSON parsing failed (Analysis):', e.message, 'Raw string from Gemini:', jsonString);
                return { statusCode: 500, headers, body: JSON.stringify({ error: `Failed to parse AI response as JSON array (${e.message})`, rawResponse: jsonString }) };
            }
            console.log("Analyze successful, returning JSON.");
            return { statusCode: 200, headers, body: JSON.stringify(parsed) }; // 성공 응답

        } else if (event.path && event.path.endsWith('/api/generate-questions') && event.httpMethod === 'POST') {
            console.log("--- Routing to /api/generate-questions logic ---");
            const { text, quantity = 1 } = requestBody;
            console.log("Generate questions received:", quantity);
            const requestedQuantity = parseInt(quantity, 10);
            // 입력값 검증
            if (!text || text.trim().length === 0) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Text passage not provided.' }) };
            if (isNaN(requestedQuantity) || requestedQuantity <= 0 || requestedQuantity > 5) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid number of questions requested (1-5).' }) };

            // 시스템 프롬프트 (문제 생성용 - ★★★ JSON 출력 강조 수정 ★★★)
            const systemInstruction_generate = `You are an AI assistant that generates English sentence composition practice questions based on a given text passage. Create exactly the specified number of questions. Your SOLE task is to return ONLY a valid JSON array containing the question objects.

            Each question object MUST have the following fields:
            1.  "prompt": The original sentence from the passage.
            2.  "questionText": Instruction like "다음 단어들을 모두 포함하고, 주어진 조건을 만족하도록 문장을 완성하시오."
            3.  "conditions": Grammatical conditions (e.g., "주어진 단어 모두 사용.\n과거 완료 시제 사용.").
            4.  "vocabulary": Array of Korean meanings for key words (shuffled).
            5.  "answer": The target correct English sentence.

            Example format for ONE question object:
            {
              "prompt": "The quick brown fox jumps over the lazy dog.",
              "questionText": "다음 단어들을 모두 포함하고, 주어진 조건을 만족하도록 문장을 완성하시오.",
              "conditions": "주어진 단어를 모두 사용할 것.\\n수동태 문장으로 작성할 것.",
              "vocabulary": ["게으른", "뛰어넘다", "~에 의해", "그", "개", "빠른", "여우", "갈색"],
              "answer": "The lazy dog is jumped over by the quick brown fox."
            }

            ABSOLUTELY CRITICAL INSTRUCTIONS:
            - Output ONLY the JSON array (starting with '[' and ending with ']').
            - Do NOT include ANY introductory text, concluding text, explanations, apologies, notes, or any other text outside the JSON structure.
            - Do NOT use markdown formatting like \`\`\`json ... \`\`\`.
            - Ensure the generated JSON is 100% valid according to JSON specifications.
            - Ensure the 'vocabulary' array is properly shuffled within each object.

            Generate the questions based on the passage provided by the user.`; // 사용자 지문은 userPrompt로 전달됨

            const userPrompt = `Generate ${requestedQuantity} question(s) based on the following passage (each from a different sentence):\n\n"${text}"`;

            const jsonString = await callGemini(systemInstruction_generate, userPrompt, { temperature: 0.7 });
            let parsedArray;
            try {
                parsedArray = JSON.parse(jsonString); // 파싱 시도
                if (!Array.isArray(parsedArray)) throw new Error("Response is not a JSON array.");
                // 결과 검증 및 처리 (셔플, 필드 확인 - 생략, 필요 시 추가)
                parsedArray.forEach(qo => { if (qo.vocabulary && Array.isArray(qo.vocabulary)) { shuffleArray(qo.vocabulary); }});
            } catch (e) {
                console.error('JSON processing failed (Questions):', e.message, 'Raw string from Gemini:', jsonString);
                return { statusCode: 500, headers, body: JSON.stringify({ error: `Failed to process AI response as JSON array (${e.message})`, rawResponse: jsonString }) };
            }
            console.log(`Question generation successful: ${parsedArray.length} question(s)`);
            return { statusCode: 200, headers, body: JSON.stringify(parsedArray) }; // 성공 응답

        } else {
            // 일치하는 경로/메소드가 없는 경우 404 반환
            console.log(`--- Route not found by manual router for: ${event.httpMethod} ${event.path} ---`);
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: `Not Found - Manual router cannot handle: ${event.httpMethod} ${event.path}` }),
            };
        }
    } catch (error) {
        // 핸들러 내에서 예상치 못한 오류 발생 시 500 반환
        console.error('--- Unhandled Error in Manual Handler ---:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error', details: error.message }),
        };
    }
};

console.log("Manual routing handler exported");