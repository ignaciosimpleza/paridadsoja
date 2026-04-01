const { chromium } = require('playwright');
const fs = require('fs');

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('https://matbarofex.primary.ventures/fyo/futurosfinancieros', {
    waitUntil: 'networkidle',
    timeout: 30000
  });
  
  await page.waitForSelector('table tbody tr', { timeout: 20000 });
  
  const precios = await page.evaluate(() => {
    const result = {};
    const objetivos = {
      'DLR/MAY26': 'Mayo 26',
      'DLR/NOV26': 'Nov 26',
      'DLR/MAY27': 'Mayo 27'
    };
    document.querySelectorAll('table tbody tr').forEach(row => {
      const cells = row.querySelectorAll('td');
      if (!cells.length) return;
      const inst = cells[0]?.textContent?.trim();
      if (!objetivos[inst]) return;
      for (let i = 6; i >= 1; i--) {
        const raw = cells[i]?.textContent?.trim()
          ?.replace(/\./g, '')?.replace(',', '.');
        const num = parseFloat(raw);
        if (num > 100) {
          result[objetivos[inst]] = num;
          break;
        }
      }
    });
    return result;
  });
  
  await browser.close();
  
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/prices.json', JSON.stringify({
    precios,
    updated: new Date().toISOString()
  }, null, 2));
  
  console.log('Precios guardados:', precios);
}

main().catch(err => { console.error(err); process.exit(1); });
