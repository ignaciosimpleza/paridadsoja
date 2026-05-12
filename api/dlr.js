// api/dlr.js — proxy server-side para Ambito dólar futuro
// Evita CORS: el browser no puede llamar directamente a mercados.ambito.com

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const r = await fetch('https://mercados.ambito.com/dolarfuturo/datos', {
      headers: {
        'Accept': 'application/json, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.ambito.com/',
        'Origin': 'https://www.ambito.com'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!r.ok) throw new Error('Ambito HTTP ' + r.status);

    const data = await r.json();
    return res.status(200).json(data);

  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
