export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const USERNAME = 'ignacio@simplezasa.com';
  const PASSWORD = 'nuDX73vj2483KSUgvenkj9t50oA0vgvA4WcuRAER';

  try {
    // Login para obtener token
    const loginRes = await fetch('https://api.primary.com.ar/auth/getToken', {
      method: 'POST',
      headers: {
        'X-Username': USERNAME,
        'X-Password': PASSWORD
      }
    });

    if (!loginRes.ok) {
      const txt = await loginRes.text();
      return res.status(401).json({ error: 'Login fallido: ' + loginRes.status + ' — ' + txt.slice(0,200) });
    }

    const token = loginRes.headers.get('X-Auth-Token');
    if (!token) {
      return res.status(401).json({ error: 'Login OK pero sin X-Auth-Token en respuesta' });
    }

    const simbolos = {
      'DLR/MAY26': 'Mayo 26',
      'DLR/NOV26': 'Nov 26',
      'DLR/MAY27': 'Mayo 27'
    };

    const precios = {};
    for (const [simbolo, etiqueta] of Object.entries(simbolos)) {
      const r = await fetch(
        `https://api.primary.com.ar/rest/marketdata/get?marketId=ROFX&symbol=${encodeURIComponent(simbolo)}&entries=SE,LA`,
        { headers: { 'X-Auth-Token': token } }
      );
      const d = await r.json();
      const md = d?.marketData;
      precios[etiqueta] = md?.SE?.price ?? md?.LA?.price ?? null;
    }

    res.status(200).json({ precios });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
