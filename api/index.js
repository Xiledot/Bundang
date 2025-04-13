// 초간단 Vercel 함수 테스트용 api/index.js (Express 없음)
module.exports = (req, res) => {
  // 이 로그가 Vercel 함수 로그에 찍히는지 확인!
  console.log(`Vercel Function invoked: ${req.method} ${req.url}`);

  // 요청받은 경로를 그대로 응답
  res.status(200).send(`Request received for path: ${req.url}`);
};