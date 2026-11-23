const path = require('path');
const fs = require('fs');
const http = require('http');

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/home/ubuntu/antigravity/profiles/a4anaskhanshab_at_gmail_com/.cache/ms-playwright')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/home/ubuntu/antigravity/profiles/a4anaskhanshab_at_gmail_com/.cache/ms-playwright';
}

let chromium;
try {
  chromium = require('playwright').chromium;
} catch (e) {
  try {
    chromium = require('/home/ubuntu/antigravity/profiles/a4anaskhanshab_at_gmail_com/.npm/_npx/e41f203b7505f1fb/node_modules/playwright').chromium;
  } catch (err) {
    throw new Error('Playwright is not available: ' + err.message);
  }
}

const BASE_URL = 'http://localhost:5173';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'verification_screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function checkBackendHealth() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:8080/health', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('[Backend Health]', res.statusCode, data);
        resolve(res.statusCode === 200);
      });
    }).on('error', reject);
  });
}

async function runLiveVerification() {
  console.log('===============================================================');
  console.log('LIVE VERIFICATION: TEACHER DETAIL PAGE (G3 MIRROR)');
  console.log('===============================================================');

  const healthy = await checkBackendHealth();
  if (!healthy) throw new Error('Backend health check failed');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    // 1. Login as Admin
    console.log('\n[1/6] Logging in as Admin (ADM001)...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button[type="submit"]', { timeout: 10000 });
    await page.fill('input[placeholder*="ADM"], input[type="text"]', 'ADM001');
    await page.fill('input[type="password"]', 'Admin@1234');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    console.log('✓ Logged in successfully. Current URL:', page.url());

    // 2. Open Teacher K.K. Chauhan via /teachers
    console.log('\n[2/6] Navigating to /teachers and searching for K.K. Chauhan...');
    await page.goto(`${BASE_URL}/teachers`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[placeholder*="Search teacher"]', { timeout: 15000 });

    // Search for Chauhan to filter directly
    await page.fill('input[placeholder*="Search teacher"]', 'Chauhan');
    await page.waitForTimeout(600); // allow debounce
    await page.waitForSelector('table tbody tr:has-text("Chauhan")', { timeout: 10000 });

    // Click on K.K. Chauhan's Detail button or row
    const chauhanRow = page.locator('tr:has-text("K.K. Chauhan")').first();
    await chauhanRow.waitFor({ state: 'visible', timeout: 10000 });
    const detailBtn = chauhanRow.locator('button:has-text("Detail")');
    await detailBtn.click();

    await page.waitForURL('**/teachers/**', { timeout: 10000 });
    console.log('✓ Successfully opened Teacher Detail Page at:', page.url());

    // 3. Verify Teacher Details Header, Active Status & KPI Cards
    console.log('\n[3/6] Verifying Teacher Details (a) & 6 Financial KPI Cards...');
    await page.waitForSelector('h1:has-text("K.K. Chauhan")', { timeout: 10000 });
    const teacherTitle = await page.locator('h1').innerText();
    console.log(`Teacher Name: "${teacherTitle}"`);

    // Verify Status Banner
    const statusBanner = page.locator('div:has-text("FACULTY STATUS:")').first();
    await statusBanner.waitFor({ state: 'visible', timeout: 5000 });
    const statusText = await statusBanner.innerText();
    console.log(`Status Banner: ${statusText.split('\n')[0]}`);

    // Verify Contact Details
    const mobileLink = page.locator('a[href^="tel:"]').first();
    const emailLink = page.locator('a[href^="mailto:"]').first();
    console.log(`Mobile: ${await mobileLink.innerText()}, Email: ${await emailLink.innerText()}`);

    // Verify Subjects Taught
    const subjectsSection = page.locator('div:has-text("ASSIGNED SUBJECTS CURRICULUM")').first();
    await subjectsSection.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Assigned Subjects section visible');

    // Verify KPI Cards: Total Billed, Actual Collected, Balance Due, Waived/Refunded, Active Scholars, Handled Receipts
    const billedCard = page.locator('div:has-text("Total Billed")').first();
    const collectedCard = page.locator('div:has-text("Actual Collected")').first();
    const balanceDueCard = page.locator('div:has-text("Balance Due")').first();
    const activeScholarsCard = page.locator('div:has-text("Active Scholars")').first();
    const handledCard = page.locator('div:has-text("Handled Receipts")').first();

    if ((await billedCard.count()) === 0) throw new Error('FAIL: Total Billed card missing');
    if ((await collectedCard.count()) === 0) throw new Error('FAIL: Actual Collected card missing');
    if ((await balanceDueCard.count()) === 0) throw new Error('FAIL: Balance Due card missing');
    if ((await activeScholarsCard.count()) === 0) throw new Error('FAIL: Active Scholars card missing');
    if ((await handledCard.count()) === 0) throw new Error('FAIL: Handled Receipts card missing');

    const billedText = await billedCard.innerText();
    const collectedText = await collectedCard.innerText();
    const dueText = await balanceDueCard.innerText();
    console.log(`Financial KPIs: ${billedText.replace(/\n/g, ' ')} | ${collectedText.replace(/\n/g, ' ')} | ${dueText.replace(/\n/g, ' ')}`);

    // 4. Test Tab 1: Subject History & Lifecycle Events (Part b)
    console.log('\n[4/6] Verifying Tab 1: Subject History & Lifecycle Events (b)...');
    const historyTabBtn = page.locator('button:has-text("Subject History & Lifecycle Events")');
    await historyTabBtn.click();
    await page.waitForSelector('h3:has-text("Chronological Lifecycle History")', { timeout: 10000 });
    console.log('✓ Subject History & Lifecycle Events view loaded!');

    // Verify event rows exist in history table
    const historyRows = page.locator('table tbody tr');
    const hCount = await historyRows.count();
    console.log(`   Found ${hCount} history event rows displayed on first page.`);
    if (hCount === 0) throw new Error('FAIL: No history event rows displayed in history table');

    // Take screenshot of History tab
    const historyShot = path.join(SCREENSHOT_DIR, 'live_teacher_history.png');
    await page.screenshot({ path: historyShot, fullPage: true });
    console.log('✓ Saved Teacher History screenshot to:', historyShot);

    // 5. Test Tab 2: Teacher & Subject Fee Breakup (Part c)
    console.log('\n[5/6] Verifying Tab 2: Teacher & Subject Fee Breakup (c)...');
    const breakupTabBtn = page.locator('button:has-text("Teacher & Subject Fee Breakup")');
    await breakupTabBtn.click();
    await page.waitForSelector('h3:has-text("Financial & Fee Breakup Ledger")', { timeout: 10000 });

    await page.waitForSelector('h4:has-text("Per-Subject Financial Breakup")', { timeout: 10000 });
    const subBreakupRows = page.locator('table').first().locator('tbody tr');
    const sbCount = await subBreakupRows.count();
    console.log(`   Found ${sbCount} subjects in per-subject financial breakup.`);
    if (sbCount === 0) throw new Error('FAIL: No subject rows in per-subject financial breakup');

    const firstSubRowText = await subBreakupRows.first().innerText();
    console.log(`   First Subject Breakup Row: ${firstSubRowText.replace(/\t/g, ' | ').replace(/\n/g, ' ')}`);

    // Take screenshot of Breakup tab
    const breakupShot = path.join(SCREENSHOT_DIR, 'live_teacher_breakup.png');
    await page.screenshot({ path: breakupShot, fullPage: true });
    console.log('✓ Saved Teacher Breakup screenshot to:', breakupShot);

    // 6. Test Tab 3: Collections Handled (Part d)
    console.log('\n[6/6] Verifying Tab 3: Collections Handled (d)...');
    const collectionsTabBtn = page.locator('button:has-text("Collections Handled")');
    await collectionsTabBtn.click();
    await page.waitForSelector('h3:has-text("Collections Handled by Faculty")', { timeout: 10000 });

    const totalHandledBanner = page.locator('span:has-text("Total Handled by Faculty")').first();
    await totalHandledBanner.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Collections Handled view verified!');

    // Take screenshot of Collections tab
    const collectionsShot = path.join(SCREENSHOT_DIR, 'live_teacher_collections.png');
    await page.screenshot({ path: collectionsShot, fullPage: true });
    console.log('✓ Saved Teacher Collections screenshot to:', collectionsShot);

    // 7. Test opening Dr. Amit Sharma directly
    console.log('\nTesting direct navigation to Dr. Amit Sharma (TCH002)...');
    await page.goto(`${BASE_URL}/teachers/22222222-2222-2222-2222-222222222202`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1:has-text("Dr. Amit Sharma")', { timeout: 10000 });

    const sharmaBilled = await page.locator('div:has-text("Total Billed")').first().innerText();
    const sharmaCollected = await page.locator('div:has-text("Actual Collected")').first().innerText();
    const sharmaScholars = await page.locator('div:has-text("Active Scholars")').first().innerText();
    console.log(`✓ Dr. Amit Sharma loaded: ${sharmaBilled.replace(/\n/g, ' ')} | ${sharmaCollected.replace(/\n/g, ' ')} | ${sharmaScholars.replace(/\n/g, ' ')}`);

    console.log('\n===============================================================');
    console.log('ALL TEACHER DETAIL PAGE (G3 MIRROR) CHECKS PASSED (100%)');
    console.log('===============================================================');
  } finally {
    await browser.close();
  }
}

runLiveVerification().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
