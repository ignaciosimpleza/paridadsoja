// api/fob.js — Proxy DINEM MAGYP → datos FOB diarios actuales
// Subí este archivo como: api/fob.js en tu repo GitHub

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=3600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const NCM = {
    '12019000190C': 'soja',
    '15071000100Q': 'aceite',
    '23040010100B': 'harina',
    '10059010120A': 'maiz',
    '10011900110H': 'trigo',
  };

  function fmtFecha(d) {
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    return `${d.getFullYear()}${mm}${dd}`;
  }

  function buildSeries(posts) {
    const series = {};
    posts.forEach(item => {
      const prod = NCM[item.posicion];
      if (!prod) return;
      if (!series[prod]) series[prod] = [];
      series[prod].push({ p:item.precio, md:item.mesDesde, ad:item.añoDesde, mh:item.mesHasta, ah:item.añoHasta });
    });
    return series;
  }

  function getSpot(series) {
    const now = new Date();
    const t   = (now.getFullYear()) * 12 + (now.getMonth()+1);
    const spot = {};
    Object.entries(series).forEach(([prod, s]) => {
      const m = s.find(r => t >= r.ad*12+r.md && t <= r.ah*12+r.mh);
      spot[prod] = m?.p ?? s[0]?.p ?? null;
    });
    return spot;
  }

  const today = new Date();
  const errors = [];

  // PASO 1: Intentar consall para obtener circular más reciente
  try {
    const cr = await fetch('https://dinem.magyp.gob.ar/dinem_fob.wp_fob_consall.aspx');
    if (cr.ok) {
      const allData = await cr.json();
      const items = allData.posts || allData;
      if (Array.isArray(items) && items.length > 0) {
        items.sort((a,b) => String(b.fecha).localeCompare(String(a.fecha)));
        const last = items[0];
        const circular  = last.circular;
        const fecha8    = String(last.fecha).replace(/-/g,'').substring(0,8);
        const fechaISO  = String(last.fecha).substring(0,10);
        const url = `https://dinem.magyp.gob.ar/dinem_fob.wp_fob_conslistamod.aspx?${fecha8},${circular},60,1`;
        const fr = await fetch(url);
        if (fr.ok) {
          const json = await fr.json();
          const posts = json.posts || json;
          if (Array.isArray(posts) && posts.length > 0) {
            const series = buildSeries(posts);
            if (series.soja) {
              return res.status(200).json({ fecha:fechaISO, circular, spot:getSpot(series), series, source:'DINEM/consall' });
            }
          }
        }
      }
    }
  } catch(e) { errors.push('consall:'+e.message); }

  // PASO 2: Probar fechas recientes — circular base 1948 = 2026-04-01
  const BASE_D = new Date('2026-04-01');
  const BASE_C = 1948;

  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;

    const diff  = Math.round((d - BASE_D) / 86400000);
    const estC  = BASE_C + Math.round(diff * 5/7);
    const f8    = fmtFecha(d);
    const fISO  = d.toISOString().split('T')[0];

    for (let c = estC+3; c >= estC-3; c--) {
      try {
        const url = `https://dinem.magyp.gob.ar/dinem_fob.wp_fob_conslistamod.aspx?${f8},${c},60,1`;
        const r = await fetch(url);
        if (!r.ok) continue;
        const json = await r.json();
        const posts = json.posts || json;
        if (!Array.isArray(posts) || !posts.length) continue;
        const series = buildSeries(posts);
        if (!series.soja) continue;
        return res.status(200).json({ fecha:fISO, circular:c, spot:getSpot(series), series, source:'DINEM/brute' });
      } catch(e) { /* seguir */ }
    }
  }

  return res.status(502).json({ error: 'Sin datos DINEM', detail: errors });
}
