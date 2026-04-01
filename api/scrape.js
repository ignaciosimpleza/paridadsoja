import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let browser = null;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    await page.goto(
      'https://matbarofex.primary.ventures/fyo/futurosfinancieros',
      { waitUntil: 'networkidle2', timeout: 25000 }
    );

    // Esperar que cargue la tabla
    await page.waitForSelector('table tbody tr', { timeout: 15000 });

    const precios = await page.evaluate(() => {
      const result = {};
      const objetivos = {
        'DLR/MAY26': 'Mayo 26',
        'DLR/NOV26': 'Nov 26',
        'DLR/MAY27': 'Mayo 27'
      };

      document.querySelectorAll('table tbody tr').forEach(row => {
        const celdas = row.querySelectorAll('td');
        if (!celdas.length) return;

        const instrumento = celdas[0]?.textContent?.trim();
        if (!objetivos[instrumento]) return;

        // Buscar el último precio operado (columna "Últ.")
        // Intentar varias columnas en orden
        for (let i = 4; i >= 1; i--) {
          const val = celdas[i]?.textContent?.trim()
            ?.replace(/\./g, '')   // quitar separador de miles
            ?.replace(',', '.');    // coma decimal → punto

          const num = parseFloat(val);
          if (num && num > 100) {
            result[objetivos[instrumento]] = num;
            break;
          }
        }
      });

      return result;
    });

    res.status(200).json({ precios });

  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
}
```

Commit → **"Commit changes"**

---

## Paso 4 — Actualizar el HTML

En `index.html`, buscá:
```
/api/primary
```

Reemplazá por:
```
/api/scrape
