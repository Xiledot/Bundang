const faunadb = require("faunadb");
const q = faunadb.query;
const client = new faunadb.Client({ secret: process.env.FAUNA_SECRET });

exports.handler = async (event) => {
  try {
    const title = event.queryStringParameters.title;
    // 제목으로 검색하는 인덱스(titleByWordlists)가 있어야 합니다.
    const result = await client.query(
      q.Get(q.Match(q.Index("titleByWordlists"), title))
    );
    return { statusCode: 200, body: JSON.stringify(result.data.words) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
