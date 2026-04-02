// api/fob.js — DINEM MAGYP FOB proxy para Vercel
// Simula headers de browser para obtener JSON de ASP.NET

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const NCM = {
    '12019000190C': 'soja',
    '15071000100Q': 'aceite',
    '23040010100B': 'harina',
    '10059010120A': 'maiz',
    '10011900110H': 'trigo',
  };

  const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': 'https://dinem.magyp.gob.ar/dinem_fob.wp_fob_consall.aspx',
    'Origin': 'https://dinem.magyp.gob.ar',
  };

  const BASE_URL = 'https://dinem.magyp.gob.ar/dinem_fob.wp_fob_consall.aspx';
  const DATA_URL = 'https://dinem.magyp.gob.ar/dinem_fob.wp_fob_conslistamod.aspx';

  function yyyymmdd(d) {
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  }

  function buildResult(posts, fechaISO, circular) {
    const series = {};
    posts.forEach(item => {
      const prod = NCM[item.posicion];
      if (!prod) return;
      if (!series[prod]) series[prod] = [];
      series[prod].push({ p:item.precio, md:item.mesDesde, ad:item.añoDesde, mh:item.mesHasta, ah:item.añoHasta });
    });
    if (!series.soja) return null;
    const now = new Date();
    const t   = now.getFullYear()*12 + (now.getMonth()+1);
    const spot = {};
    Object.entries(series).forEach(([prod, s]) => {
      const m = s.find(r => t >= r.ad*12+r.md && t <= r.ah*12+r.mh);
      spot[prod] = m?.p ?? s[0]?.p ?? null;
    });
    return { fecha:fechaISO, circular, spot, series };
  }

  // PASO 1: Obtener cookie de sesión del servidor ASP.NET
  let sessionCookie = '';
  try {
    const sessionRes = await fetch(BASE_URL, {
      headers: {
        'User-Agent': BROWSER_HEADERS['User-Agent'],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': BROWSER_HEADERS['Accept-Language'],
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000)
    });
    const raw = sessionRes.headers.get('set-cookie') || '';
    // Extraer solo el nombre=valor de cada cookie (sin atributos)
    sessionCookie = raw.split(',')
      .map(c => c.trim().split(';')[0])
      .filter(Boolean)
      .join('; ');
    console.log('[FOB] Session cookie:', sessionCookie ? 'OK' : 'vacía');
  } catch(e) {
    console.warn('[FOB] No se pudo obtener cookie:', e.message);
  }

  const headers = {
    ...BROWSER_HEADERS,
    ...(sessionCookie ? { 'Cookie': sessionCookie } : {})
  };

  // PASO 2: Buscar datos — referencia 2026-04-01 = circular 1948
  const BASE_D = new Date('2026-04-01T12:00:00Z');
  const BASE_C = 1948;
  const today  = new Date();
  const log    = [];

  for (let i = 0; i <= 21; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;

    const fechaISO = d.toISOString().split('T')[0];
    const f8       = yyyymmdd(d);
    const diffDays = Math.round((d - BASE_D) / 86400000);
    const estC     = BASE_C + Math.round(diffDays * 5/7);

    log.push(`${fechaISO} circ~${estC}`);

    for (let delta = 5; delta >= -5; delta--) {
      const c = estC + delta;
      if (c <= 0) continue;
      try {
        const url = `${DATA_URL}?${f8},${c},60,1`;
        const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
        if (!r.ok) continue;
        const text = await r.text();
        if (!text || text.trim().startsWith('<')) continue;
        const json  = JSON.parse(text);
        const posts = json.posts || json;
        if (!Array.isArray(posts) || !posts.length) continue;
        const result = buildResult(posts, fechaISO, c);
        if (result) return res.status(200).json({ ...result, log });
      } catch(e) { /* seguir */ }
    }
  }

  // PASO 3: Fallback a datos.gob.ar con nota de fecha desactualizada
  try {
    const ids = '358.1_HABAS_SOJAADO__52,358.1_ACEITE_SOJNEL__18,358.1_TORTAS_EXPXTR__56,358.1_MAIZ_DEMASADO__52,358.1_TRIGO_GRANADO__41';
    const r   = await fetch(`https://apis.datos.gob.ar/series/api/series/?ids=${ids}&limit=1&sort=desc`);
    const j   = await r.json();
    const row = j.data?.[0];
    if (row) {
      return res.status(200).json({
        fecha: row[0], circular: null, source: 'fallback_datosgob',
        spot: { soja:row[1], aceite:row[2], harina:row[3], maiz:row[4], trigo:row[5] },
        series: {},
        log
      });
    }
  } catch(e) {}

  return res.status(502).json({ error: 'Sin datos disponibles', log });
}
