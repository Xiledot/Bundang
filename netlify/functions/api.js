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
            const systemInstruction_generate = `You are an AI assistant that creates English sentence unscramble/composition exercises from a given English text passage. Generate exactly the specified number of exercises. Each exercise MUST be based on a DIFFERENT sentence or meaningful clause from the passage.

            For each exercise, create a JSON object with the following fields:
            1.  "korean_prompt": Provide the accurate Korean translation of the *specific* English sentence/clause selected from the passage for this exercise. This Korean sentence serves as the target meaning the user should construct.
            2.  "vocabulary": Extract ALL individual English words from the selected English sentence/clause. Separate words by spaces, remove punctuation attached to words (like commas, periods). Provide these extracted English words as an array of strings, SHUFFLED randomly.
            3.  "conditions": Provide an array containing standard conditions for this type of exercise. Use these exact conditions: ["주어진 단어는 모두 한 번씩만 사용할 것 (Use all given words exactly once)", "필요시 문맥과 어법에 맞게 변형할 것 (Transform words if necessary for grammar/context)", "문장 부호는 최종 답안에 포함하지 말 것 (Do not include punctuation in the final answer)"].
            4.  "questionText": Use the standard Korean instruction: "다음 <보기>의 단어들을 모두 사용하여, 우리말 뜻과 일치하도록 문장을 완성하시오." (Using all the words in <보기> below, complete the sentence to match the Korean meaning.)
            5.  "answer": The original, correct English sentence/clause that was selected from the passage and translated for "korean_prompt". Ensure this is just the plain sentence text without any labels like "(A)".
            
            Example of ONE output JSON object:
            {
              "korean_prompt": "그 빠른 갈색 여우는 그 게으른 개를 뛰어넘는다.",
              "vocabulary": ["lazy", "jumps", "quick", "dog", "over", "fox", "the", "brown", "the"],
              "conditions": ["주어진 단어는 모두 한 번씩만 사용할 것", "필요시 문맥과 어법에 맞게 변형할 것", "문장 부호는 최종 답안에 포함하지 말 것"],
              "questionText": "다음 <보기>의 단어들을 모두 사용하여, 우리말 뜻과 일치하도록 문장을 완성하시오.",
              "answer": "The quick brown fox jumps over the lazy dog."
            }
            
            ABSOLUTELY CRITICAL INSTRUCTIONS:
            - Output ONLY the JSON array (starting with '[' and ending with ']').
            - Each object in the array must strictly follow the defined fields: korean_prompt, vocabulary, conditions, questionText, answer.
            - The 'vocabulary' array MUST contain shuffled ENGLISH words extracted from the 'answer' sentence.
            - The 'korean_prompt' field MUST contain the KOREAN translation of the 'answer' sentence.
            - Do NOT include ANY text outside the JSON array. Do NOT use markdown fences. Ensure valid JSON.
            
            Generate the exercises based on the passage provided by the user.`; // 사용자 지문은 userPrompt로 전달됨

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