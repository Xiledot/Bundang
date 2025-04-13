// netlify/functions/api.js (Manual Routing - 최종 테스트)
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

console.log("--- netlify/functions/api.js (MANUAL ROUTING) - Top Level Start ---");

// 환경 변수 로드
require('dotenv').config();
console.log("dotenv configured");
console.log("@google/generative-ai required");

// --- Google AI 클라이언트 초기화 ---
let genAI;
let googleApiKey = process.env.GOOGLE_API_KEY || '';
console.log(`GOOGLE_API_KEY length: ${googleApiKey.length > 0 ? googleApiKey.length : 0}`);
// API 키 누락 시 에러 발생 가능성 있음 (호출 시점에서 체크)
try {
  genAI = new GoogleGenerativeAI(googleApiKey);
  console.log("GoogleGenerativeAI client instance potentially created");
} catch (e) {
  console.error("FATAL: GoogleGenerativeAI client initialization failed!", e);
  genAI = null; // 명시적으로 null 처리
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

// --- Helper Functions (shuffleArray, callGemini) ---
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
    // ... (응답 유효성 검사 강화 버전) ...
     if (!response) { throw new Error("Gemini API로부터 빈 응답을 받았습니다."); } if (!response.candidates || response.candidates.length === 0) { /* ... */ throw new Error(`Gemini API 응답에 후보가 없거나 차단됨.`); } const candidate = response.candidates[0]; if (candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') { /* ... */ throw new Error(`Gemini API 응답 비정상 종료/차단.`); } if (!candidate.content?.parts?.[0]?.text) { /* ... */ throw new Error("Gemini API 응답 내용 없음."); }
    const rawText = candidate.content.parts[0].text.trim();
    console.log("Gemini raw response sample:", rawText.substring(0, 100) + '...');
    const jsonString = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    return jsonString;
  } catch (error) { console.error(`Gemini API Call Error:`, error); throw new Error(`Gemini API Call Failed: ${error.message}`); }
}
console.log("callGemini helper function defined");


// ★★★ Netlify Handler (Manual Routing) ★★★
exports.handler = async (event, context) => {
    console.log("--- ✅ MANUAL ROUTING HANDLER INVOKED ---"); // <-- 이 로그 확인!
    console.log("Received path:", event.path);
    console.log("Received method:", event.httpMethod);

    // CORS 및 기본 헤더 설정 (Express/cors 대신 수동 설정)
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // 필요시 실제 도메인으로 변경
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS" // OPTIONS 추가
    };

    // OPTIONS (Preflight) 요청 처리
    if (event.httpMethod === 'OPTIONS') {
        console.log("Handling OPTIONS preflight request");
        return { statusCode: 204, headers }; // 204 No Content 응답
    }

    try {
        // 요청 본문 파싱 (Netlify는 body를 문자열로 전달)
        let requestBody;
        try {
            // body가 null, undefined, 빈 문자열인 경우 빈 객체로 처리
            requestBody = event.body ? JSON.parse(event.body) : {};
        } catch (e) {
            console.error("Failed to parse request body:", event.body, e);
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON body" }) };
        }

        // 경로와 메소드로 직접 분기
        if (event.path && event.path.endsWith('/api/analyze') && event.httpMethod === 'POST') {
            console.log("--- Routing to /api/analyze logic ---");
            const sentence = requestBody.sentence;
            console.log("Analyze sentence received:", sentence);
            if (!sentence) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Sentence not provided.' }) };

            const systemInstruction_analyze = `...[Analyze Prompt]...`; // 이전 프롬프트 사용
            const jsonString = await callGemini(systemInstruction_analyze, `"${sentence}"`, { temperature: 0.2 });
            let parsed;
            try { parsed = JSON.parse(jsonString); if (!Array.isArray(parsed)) throw new Error("Not Array"); }
            catch (e) { console.error('Parse Fail:', e.message); return { statusCode: 500, headers, body: JSON.stringify({ error: `Parse Fail (${e.message})`, raw: jsonString }) }; }
            console.log("Analyze successful");
            return { statusCode: 200, headers, body: JSON.stringify(parsed) }; // 성공 응답

        } else if (event.path && event.path.endsWith('/api/generate-questions') && event.httpMethod === 'POST') {
            console.log("--- Routing to /api/generate-questions logic ---");
            const { text, quantity = 1 } = requestBody;
            console.log("Generate questions received:", quantity);
            const requestedQuantity = parseInt(quantity, 10);
            // ... (Input validation) ...
             if (!text) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Text missing.' }) }; if (isNaN(requestedQuantity) || requestedQuantity <= 0 || requestedQuantity > 5) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid quantity (1-5).' }) };

            const questionGenSystemPrompt = `...[Generate Prompt]...`; // 이전 프롬프트 사용
            const userPrompt = `...`;
            const jsonString = await callGemini(questionGenSystemPrompt, userPrompt, { temperature: 0.7 });
            let parsedArray;
            try { parsedArray = JSON.parse(jsonString); if (!Array.isArray(parsedArray)) throw new Error("Not Array"); /* ... validation ... */ }
            catch (e) { console.error('Parse/Validate Fail:', e.message); return { statusCode: 500, headers, body: JSON.stringify({ error: `Parse/Validate Fail (${e.message})`, raw: jsonString }) }; }
            console.log("Generate successful");
            return { statusCode: 200, headers, body: JSON.stringify(parsedArray) }; // 성공 응답

        } else {
            // 일치하는 경로/메소드가 없는 경우 404 반환
            console.log("--- Route not found by manual router ---");
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