// api/fob.js — MAGYP WebService API (diseñada para acceso programático)
// Docs: https://www.magyp.gob.ar/sitio/areas/ss_mercados_agropecuarios/fob_oficiales/_archivos/000021_Precios%20Fob%20Api.php

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const BASE = 'https://www.magyp.gob.ar/sitio/areas/ss_mercados_agropecuarios/ws/ssma/precios_fob.php?Fecha=';
  const log  = [];

  function fmtDDMMYYYY(d) {
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }

  // Intentar hasta 30 días hábiles hacia atrás
  const today = new Date();
  let rawSample = null;

  for (let i = 1; i <= 60; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;

    const fechaStr = fmtDDMMYYYY(d);
    const fechaISO = d.toISOString().split('T')[0];

    try {
      const r = await fetch(BASE + encodeURIComponent(fechaStr), {
        signal: AbortSignal.timeout(6000),
        headers: { 'Accept': 'application/json, */*', 'User-Agent': 'Mozilla/5.0' }
      });

      if (!r.ok) { log.push(`${fechaStr}: HTTP ${r.status}`); continue; }

      const text = await r.text();
      const data = JSON.parse(text);

      log.push(`${fechaStr}: ${Array.isArray(data) ? data.length + ' items' : JSON.stringify(data).substring(0,80)}`);

      // Guardar muestra del primer resultado no vacío para debug
      if (!rawSample && Array.isArray(data) && data.length > 0) {
        rawSample = { fecha: fechaStr, sample: data.slice(0, 5) };
      }

      if (!Array.isArray(data) || data.length === 0) continue;

      // ── Intentar parsear la respuesta (probamos múltiples formatos) ──
      const spot   = { soja:null, aceite:null, harina:null, maiz:null, trigo:null };
      const series = {};

      data.forEach(item => {
        // Normalizar campos (pueden venir en mayús o minús)
        const prod  = String(item.Producto || item.producto || item.PRODUCTO || item.descripcion || '').toUpperCase().trim();
        const precio = parseFloat(item.Precio || item.precio || item.PRECIO || item.fob || 0);
        if (!prod || !precio || precio <= 0) return;

        // Mapeo por palabras clave en el nombre del producto
        let campo = null;
        if (prod.includes('SOJA') && !prod.includes('ACEITE') && !prod.includes('PELLET') && !prod.includes('HARINA') && !prod.includes('EXPELLER')) campo = 'soja';
        else if (prod.includes('ACEITE') && prod.includes('SOJA')) campo = 'aceite';
        else if ((prod.includes('PELLET') || prod.includes('HARINA') || prod.includes('EXPELLER')) && prod.includes('SOJA')) campo = 'harina';
        else if (prod.includes('MA') && (prod.includes('MAÍ') || prod.includes('MAI') || prod.includes('MAIZ'))) campo = 'maiz';
        else if (prod.includes('TRIGO')) campo = 'trigo';

        if (campo && !spot[campo]) spot[campo] = precio;
      });

      // Si obtuvimos al menos soja, es válido
      if (spot.soja) {
        return res.status(200).json({ fecha:fechaISO, circular:null, spot, series, source:'MAGYP', log, rawSample });
      }

      // Si tenemos items pero no pudimos parsear, loguear para debug
      if (rawSample && !spot.soja) {
        log.push(`PARSE_FAIL: campos disponibles: ${Object.keys(rawSample.sample[0]).join(',')}`);
      }

    } catch(e) {
      log.push(`${fechaStr}: ERROR ${e.message}`);
    }
  }

  // Fallback a datos.gob.ar
  try {
    log.push('Usando fallback datos.gob.ar...');
    const ids = '358.1_HABAS_SOJAADO__52,358.1_ACEITE_SOJNEL__18,358.1_TORTAS_EXPXTR__56,358.1_MAIZ_DEMASADO__52,358.1_TRIGO_GRANADO__41';
    const r   = await fetch(`https://apis.datos.gob.ar/series/api/series/?ids=${ids}&limit=1&sort=desc`);
    const j   = await r.json();
    const row = j.data?.[0];
    if (row) {
      return res.status(200).json({
        fecha: row[0], source:'fallback_datosgob',
        spot: { soja:row[1], aceite:row[2], harina:row[3], maiz:row[4], trigo:row[5] },
        series: {}, log, rawSample
      });
    }
  } catch(e) { log.push('fallback error: ' + e.message); }

  return res.status(502).json({ error:'Sin datos disponibles', log, rawSample });
}
