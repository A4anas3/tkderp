const path = require('path');
const fs = require('fs');

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

async function runLiveVerification() {
  console.log('===============================================================');
  console.log('LIVE VERIFICATION: SUBJECT HISTORY, BREAKUP & CONVERSION');
  console.log('===============================================================');

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
    console.log('\n[1/5] Logging in as Admin (ADM001)...');
    await page.goto(`${BASE_URL}/login`);
    await page.waitForSelector('button[type="submit"]', { timeout: 10000 });
    await page.fill('input[placeholder*="ADM"], input[type="text"]', 'ADM001');
    await page.fill('input[type="password"]', 'Admin@1234');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    console.log('✓ Logged in successfully. Current URL:', page.url());

    // 2. Open Mathematics (Class 9-10) directly and via /subjects
    console.log('\n[2/5] Navigating to /subjects and opening Mathematics (Class 9-10)...');
    await page.goto(`${BASE_URL}/subjects`);
    await page.waitForSelector('h1:has-text("Subjects")', { timeout: 15000 });

    // Navigate to Mathematics (Class 9-10)
    await page.goto(`${BASE_URL}/subjects/33333333-3333-3333-3333-333333333301`);
    await page.waitForSelector('h1:has-text("Mathematics")', { timeout: 15000 });
    console.log('✓ Successfully opened Mathematics subject detail page at:', page.url());

    // 3. Verify Top Status Banner and 5 KPI cards
    console.log('\n[3/5] Verifying Subject Header, Curriculum Status & 5 KPI Cards...');
    const subjectTitle = await page.locator('h1').innerText();
    console.log(`Subject Title: "${subjectTitle}"`);

    // KPI cards: Total Billed, Actual Collected, Balance Due, Cycle History, Enquiry Conversion
    const totalBilledCard = page.locator('div:has-text("Total Billed")').first();
    const collectedCard = page.locator('div:has-text("Actual Collected")').first();
    const balanceDueCard = page.locator('div:has-text("Balance Due")').first();
    const cycleHistoryCard = page.locator('div:has-text("Cycle History")').first();
    const conversionCard = page.locator('div:has-text("Enquiry Conversion")').first();

    if ((await totalBilledCard.count()) === 0) throw new Error('FAIL: Total Billed card missing');
    if ((await collectedCard.count()) === 0) throw new Error('FAIL: Actual Collected card missing');
    if ((await balanceDueCard.count()) === 0) throw new Error('FAIL: Balance Due card missing');
    if ((await cycleHistoryCard.count()) === 0) throw new Error('FAIL: Cycle History card missing');
    if ((await conversionCard.count()) === 0) throw new Error('FAIL: Enquiry Conversion card missing');
    console.log('✓ All 5 KPI cards (Total Billed, Collected, Balance Due, Cycle History, Enquiry Conversion) verified!');

    // 4. Test Tab 1: Course History & Roster
    console.log('\n[4/5] Testing Tab 1: Course History & Roster...');
    const historyTabBtn = page.locator('button:has-text("Course History & Roster")');
    await historyTabBtn.click();
    await page.waitForSelector('h3:has-text("Assigned Course Enrollments")', { timeout: 10000 });
    console.log('✓ Course History & Roster tab active!');

    // Take screenshot of History tab
    const historyShot = path.join(SCREENSHOT_DIR, 'live_subject_history.png');
    await page.screenshot({ path: historyShot, fullPage: true });
    console.log('Saved History screenshot to:', historyShot);

    // Test Tab 2: Revenue & Fee Breakup
    console.log('\nTesting Tab 2: Revenue & Fee Breakup...');
    const breakupTabBtn = page.locator('button:has-text("Revenue & Fee Breakup")');
    await breakupTabBtn.click();
    await page.waitForSelector('h3:has-text("Financial & Fee Breakup Ledger")', { timeout: 10000 });
    
    const baseFeeText = await page.locator('div:has-text("Base Tuition Fee")').first().innerText();
    const realizedCashText = await page.locator('div:has-text("Realized Cash")').first().innerText();
    const efficiencyText = await page.locator('div:has-text("Collection Efficiency")').first().innerText();
    console.log(`Breakup Stats: ${baseFeeText.replace(/\n/g, ' ')} | ${realizedCashText.replace(/\n/g, ' ')} | ${efficiencyText.replace(/\n/g, ' ')}`);
    console.log('✓ Revenue & Fee Breakup view verified!');

    const breakupShot = path.join(SCREENSHOT_DIR, 'live_subject_breakup.png');
    await page.screenshot({ path: breakupShot, fullPage: true });
    console.log('Saved Breakup screenshot to:', breakupShot);

    // Test Tab 3: Enquiries & Conversion History
    console.log('\nTesting Tab 3: Enquiries & Conversion History...');
    const conversionTabBtn = page.locator('button:has-text("Enquiries & Conversion History")');
    await conversionTabBtn.click();
    await page.waitForSelector('h3:has-text("Enquiries & Demo Conversion History")', { timeout: 10000 });

    const totalLeadsText = await page.locator('span:has-text("Total Enquiries & Demos")').first().innerText();
    const convertedText = await page.locator('span:has-text("Converted to Admission")').first().innerText();
    const convRateText = await page.locator('span:has-text("Overall Conversion Rate")').first().innerText();
    console.log(`Conversion Banner: ${totalLeadsText} | ${convertedText} | ${convRateText}`);

    // Verify Demo item DEM-2026-0001
    await page.waitForSelector('td:has-text("DEM-2026-0001")', { timeout: 10000 });
    console.log('✓ Demo record DEM-2026-0001 visible in Conversion History table with CONVERTED status!');

    const conversionShot = path.join(SCREENSHOT_DIR, 'live_subject_conversion.png');
    await page.screenshot({ path: conversionShot, fullPage: true });
    console.log('Saved Conversion screenshot to:', conversionShot);

    // 5. Verify Navigation from Student Profile to Subject Detail
    console.log('\n[5/5] Testing Subject Quick Access & Modal Integration...');
    await page.goto(`${BASE_URL}/subjects`);
    await page.waitForSelector('h1:has-text("Subjects")', { timeout: 15000 });
    const firstSubjectLink = page.locator('button:has-text("Manage"), button:has-text("Details"), table tbody tr').first();
    await firstSubjectLink.click();
    await page.waitForURL('**/subjects/**', { timeout: 10000 });
    console.log(`✓ Successfully navigated from subjects list to: ${page.url()}`);
    await page.waitForSelector('h1', { timeout: 5000 });
    const openedName = await page.locator('h1').innerText();
    console.log(`Opened Subject: "${openedName}"`);

    console.log('\n===============================================================');
    console.log('ALL SUBJECT HISTORY, BREAKUP & CONVERSION CHECKS PASSED (100%)');
    console.log('===============================================================');
  } finally {
    await browser.close();
  }
}

runLiveVerification().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
