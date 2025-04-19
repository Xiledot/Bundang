const faunadb = require("faunadb");
const q = faunadb.query;
const client = new faunadb.Client({ secret: process.env.FAUNA_SECRET });

exports.handler = async () => {
  try {
    const { data } = await client.query(
      q.Map(
        q.Paginate(q.Documents(q.Collection("wordlists"))),
        q.Lambda("ref", q.Get(q.Var("ref")))
      )
    );
    // 각 항목의 title만 반환
    const titles = data.map(item => item.data.title);
    return { statusCode: 200, body: JSON.stringify(titles) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
