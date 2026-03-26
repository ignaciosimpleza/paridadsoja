export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // API Key de producción — usada directamente como X-Auth-Token
  const API_KEY = 'nuDX73vj2483KSUgvenkj9t50oA0vgvA4WcuRAER';

  const simbolos = {
    'DLR/MAY26': 'Mayo 26',
    'DLR/NOV26': 'Nov 26',
    'DLR/MAY27': 'Mayo 27'
  };

  try {
    const precios = {};
    const errores = {};

    for (const [simbolo, etiqueta] of Object.entries(simbolos)) {
      const url = `https://api.primary.com.ar/rest/marketdata/get?marketId=ROFX&symbol=${encodeURIComponent(simbolo)}&entries=SE,LA`;
      const r = await fetch(url, {
        headers: { 'X-Auth-Token': API_KEY }
      });
      const txt = await r.text();
      try {
        const d = JSON.parse(txt);
        const md = d?.marketData;
        precios[etiqueta] = md?.SE?.price ?? md?.LA?.price ?? null;
        if (!precios[etiqueta]) errores[etiqueta] = JSON.stringify(d).slice(0,300);
      } catch {
        errores[etiqueta] = txt.slice(0, 300);
      }
    }

    res.status(200).json({ precios, errores });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
