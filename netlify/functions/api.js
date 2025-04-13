// netlify/functions/api.js (Basic Test Code)

exports.handler = async (event, context) => {
  // ★★★ 이 로그가 보이는지 확인하는 것이 핵심 ★★★
  console.log("--- ✅ BASIC TEST HANDLER INVOKED ---");
  console.log("Received path:", event.path);
  console.log("Received method:", event.httpMethod);
  console.log("Received headers:", JSON.stringify(event.headers || {}, null, 2)); // headers가 없을 수도 있으니 기본값 추가
  console.log("Received body:", event.body);

  // 요청 경로에 따라 다른 응답 메시지 설정 (테스트용)
  let responseMessage = "Basic handler default response.";
  if (event.path && event.path.endsWith('/api/analyze')) {
      responseMessage = "Basic handler successfully received request for /api/analyze!";
  } else if (event.path && event.path.endsWith('/api/generate-questions')) {
      responseMessage = "Basic handler successfully received request for /api/generate-questions!";
  }

  // 간단한 성공(200 OK) JSON 응답 반환
  return {
      statusCode: 200,
      headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*", // CORS 헤더 포함
      },
      body: JSON.stringify({
          message: responseMessage,
          receivedPath: event.path // 받은 경로 정보 포함
      }),
  };
};