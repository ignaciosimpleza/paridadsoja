// api/fob.js — DINEM MAGYP FOB proxy para Vercel
// Referencia conocida: 2026-04-01 = circular 1948

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Mapeo NCM → campo
  const NCM = {
    '12019000190C': 'soja',
    '15071000100Q': 'aceite',
    '23040010100B': 'harina',
    '10059010120A': 'maiz',
    '10011900110H': 'trigo',
  };

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
    if (!series.soja) return null; // datos sin soja = no válido

    const now = new Date();
    const t   = now.getFullYear()*12 + (now.getMonth()+1);
    const spot = {};
    Object.entries(series).forEach(([prod, s]) => {
      const m = s.find(r => t >= r.ad*12+r.md && t <= r.ah*12+r.mh);
      spot[prod] = m?.p ?? s[0]?.p ?? null;
    });
    return { fecha:fechaISO, circular, spot, series };
  }

  async function tryFetch(fecha8, circular) {
    const url = `https://dinem.magyp.gob.ar/dinem_fob.wp_fob_conslistamod.aspx?${fecha8},${circular},60,1`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const text = await r.text();
    if (text.trim().startsWith('<')) return null; // HTML = no data
    const json = JSON.parse(text);
    const posts = json.posts || json;
    if (!Array.isArray(posts) || !posts.length) return null;
    return posts;
  }

  // Referencia: 2026-04-01 = circular 1948
  const BASE_D = new Date('2026-04-01T12:00:00Z');
  const BASE_C = 1948;

  const today = new Date();
  const log   = [];

  // Probar desde hoy hacia atrás (hasta 3 semanas)
  for (let i = 0; i <= 21; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;

    const fechaISO = d.toISOString().split('T')[0];
    const f8       = yyyymmdd(d);

    // Estimar circular: días hábiles desde la referencia * 1 circular/día
    const diffDays = Math.round((d - BASE_D) / 86400000);
    const bizDays  = Math.round(diffDays * 5/7);
    const estC     = BASE_C + bizDays;

    log.push(`Probando ${fechaISO} circular ~${estC}`);

    // Probar rango ±5 alrededor del estimado, de mayor a menor
    for (let delta = 5; delta >= -5; delta--) {
      const c = estC + delta;
      if (c <= 0) continue;
      try {
        const posts = await tryFetch(f8, c);
        if (!posts) continue;
        const result = buildResult(posts, fechaISO, c);
        if (result) {
          result.log = log;
          return res.status(200).json(result);
        }
      } catch(e) {
        // seguir
      }
    }
  }

  return res.status(502).json({ error: 'Sin datos DINEM en los últimos 21 días', log });
}
