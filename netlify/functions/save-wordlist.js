// npm install faunadb
const faunadb = require("faunadb");
const q = faunadb.query;
const client = new faunadb.Client({
  secret: process.env.FAUNA_SECRET,  // Netlify 환경 변수에 FAUNA_SECRET 추가
});

exports.handler = async (event) => {
  try {
    const { title, words } = JSON.parse(event.body);
    // 컬렉션이 없다면 Fauna 콘솔에서 먼저 컬렉션(wordlists)과 인덱스(titleByWordlists)을 생성해주세요.
    const result = await client.query(
      q.Create(q.Collection("wordlists"), { data: { title, words } })
    );
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
