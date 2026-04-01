export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const r = await fetch(
    'https://api.primary.com.ar/rest/marketdata/get?marketId=ROFX&symbol=DLR%2FMAY26&entries=LA,CL,SE,BI',
    { headers: { 'X-Auth-Token': 'nuDX73vj2483KSUgvenkj9t50oA0vgvA4WcuRAER' } }
  );
  const data = await r.json();
  res.status(200).json(data);
}
