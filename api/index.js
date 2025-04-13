// 초간단 테스트용 api/index.js (Express 없음)
module.exports = (req, res) => {
  // Vercel 함수 로그에 이 메시지가 찍히는지 확인하는 것이 중요!
  console.log(`Request received at Vercel function: ${req.method} ${req.url}`);

  // 간단한 성공 응답 보내기
  res.status(200).send(`Vercel Function received request for: ${req.url}`);
};