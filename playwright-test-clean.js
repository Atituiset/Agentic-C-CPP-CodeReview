const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:8000';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  console.log('Page loaded:', await page.title());
  await page.waitForTimeout(2000);

  // 1. Dashboard view
  await page.screenshot({ path: '/tmp/fix-dashboard.png', fullPage: true });
  console.log('Dashboard screenshot saved');

  // 2. Click View Node Details on local worker
  await page.click('text=View Node Details →');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/fix-node-idle.png', fullPage: true });
  console.log('Node detail (idle) screenshot saved');

  // Go back
  await page.click('button:has-text("Back")');
  await page.waitForTimeout(1000);

  // 3. Trigger a scan
  await page.click('text=Trigger Global MR Scan');
  await page.waitForTimeout(3000);

  // 4. Click View Node Details while running
  await page.click('text=View Node Details →');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/fix-node-running.png', fullPage: true });
  console.log('Node detail (running) screenshot saved');

  // 5. Wait for logs to stream
  await page.waitForTimeout(8000);
  await page.screenshot({ path: '/tmp/fix-node-logs.png', fullPage: true });
  console.log('Node detail (with logs) screenshot saved');

  // Go back to dashboard
  await page.click('button:has-text("Back")');
  await page.waitForTimeout(1000);

  // 6. Check Jobs Queue
  await page.click('text=Scan Jobs Queue');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/fix-jobs.png', fullPage: true });
  console.log('Jobs queue screenshot saved');

  await browser.close();
  console.log('All fix tests completed!');
})();
