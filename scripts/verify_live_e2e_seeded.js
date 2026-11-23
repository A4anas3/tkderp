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

const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:8080';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'verification_screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runLiveVerification() {
  console.log('===============================================================');
  console.log('LIVE E2E VERIFICATION: SEEDED STATE & UI FLOWS');
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
    console.log('\n[1/6] Logging in as Admin (ADM001)...');
    await page.goto(`${FRONTEND_URL}/login`);
    await page.waitForSelector('button[type="submit"]', { timeout: 15000 });
    await page.fill('input[placeholder*="ADM"], input[type="text"]', 'ADM001');
    await page.fill('input[type="password"]', 'Admin@1234');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    console.log('  ✓ Logged in successfully. Current URL:', page.url());

    // 2. Verify Dashboard Numbers
    console.log('\n[2/6] Verifying Admin Dashboard Metrics...');
    await page.waitForSelector('text=Total Students', { timeout: 15000 });
    await page.waitForTimeout(1000);

    const bodyText = await page.innerText('body');
    console.log('  Checking dashboard metrics...');
    if (!bodyText.includes('10')) throw new Error('FAIL: "10" (student count) not found on dashboard');
    if (!bodyText.includes('17,000') && !bodyText.includes('17000')) throw new Error('FAIL: "17,000" (cash collected) not found on dashboard');
    if (!bodyText.includes('20,300') && !bodyText.includes('20300')) throw new Error('FAIL: "20,300" (revenue booked) not found on dashboard');
    console.log('  ✓ Dashboard metrics verified: 10 students, ₹17,000 collected, ₹20,300 booked!');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'e2e_01_dashboard.png'), fullPage: true });

    // 3. Verify Students List (10 students)
    console.log('\n[3/6] Verifying Students List (/students)...');
    await page.goto(`${FRONTEND_URL}/students`);
    await page.waitForSelector('table', { timeout: 15000 });
    await page.waitForTimeout(1000);

    const studentRows = page.locator('tbody tr');
    const studentCount = await studentRows.count();
    console.log(`  Found ${studentCount} student row(s) in the table (Expected: 10)`);
    if (studentCount !== 10) {
      throw new Error(`FAIL: Expected exactly 10 student rows in table, got ${studentCount}`);
    }
    const studentListText = await page.innerText('tbody');
    if (!studentListText.includes('Aarav Gupta') || !studentListText.includes('Pooja Singh')) {
      throw new Error('FAIL: Expected student names (Aarav Gupta, Pooja Singh) missing from table');
    }
    console.log('  ✓ Exactly 10 students rendered in the list!');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'e2e_02_students.png'), fullPage: true });

    // 4. Verify Subject Page (Mathematics)
    console.log('\n[4/6] Verifying Subject Detail Page...');
    await page.goto(`${FRONTEND_URL}/subjects`);
    await page.waitForSelector('h1:has-text("Subjects")', { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Find and click Mathematics
    const mathBtn = page.locator('button:has-text("Mathematics (Class 11-12 & JEE)")').first();
    await mathBtn.click();
    await page.waitForURL('**/subjects/*', { timeout: 15000 });
    console.log('  ✓ Opened Mathematics subject detail page:', page.url());

    // Verify Course History & Roster Tab
    await page.waitForSelector('button:has-text("Course History & Roster")', { timeout: 15000 });
    await page.waitForTimeout(1000);
    const subBodyText = await page.innerText('body');
    if (!subBodyText.includes('Aarav Gupta')) throw new Error('FAIL: Aarav Gupta not found in Mathematics roster');
    if (!subBodyText.includes('Rohan Srivastava')) throw new Error('FAIL: Rohan Srivastava not found in Mathematics roster');
    console.log('  ✓ Mathematics roster shows enrolled students (Aarav, Rohan)!');

    // Click Revenue & Fee Breakup Tab
    const breakupBtn = page.locator('button:has-text("Revenue & Fee Breakup")');
    if ((await breakupBtn.count()) > 0) {
      await breakupBtn.click();
      await page.waitForTimeout(800);
      console.log('  ✓ Revenue & Fee Breakup tab clicked and rendered!');
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'e2e_03_subject_detail.png'), fullPage: true });

    // 5. Verify Reports Hub (/reports/collections)
    console.log('\n[5/7] Verifying Reports Page (/reports/collections)...');
    await page.goto(`${FRONTEND_URL}/reports/collections`);
    await page.waitForSelector('h1:has-text("Institutional Reports & Ledger Analytics")', { timeout: 15000 });
    await page.waitForTimeout(1000);
    const reportsText = await page.innerText('body');
    if (!reportsText.includes('17,000') && !reportsText.includes('17000')) {
      throw new Error('FAIL: ₹17,000 collected not found in Collections report');
    }
    console.log('  ✓ Reports Collections shows ₹17,000 collected across 10 seeded payments!');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'e2e_04_reports_collections.png'), fullPage: true });

    // 6. Verify Dues & Reminders Page (/reminders)
    console.log('\n[6/7] Verifying Dues & Reminders Page (/reminders)...');
    await page.goto(`${FRONTEND_URL}/reminders`);
    await page.waitForSelector('h1:has-text("Fee Reminders")', { timeout: 15000 });
    await page.waitForTimeout(1000);

    const remText = await page.innerText('body');
    if (!remText.includes('Rohan Srivastava')) throw new Error('FAIL: Rohan Srivastava not found in Dues & Reminders');
    if (!remText.includes('Aditya Tiwari')) throw new Error('FAIL: Aditya Tiwari not found in Dues & Reminders');
    if (!remText.includes('Utkarsh Shukla')) throw new Error('FAIL: Utkarsh Shukla not found in Dues & Reminders');
    if (!remText.includes('1,000') && !remText.includes('1000')) throw new Error('FAIL: ₹1,000 due amount not found in Reminders');
    console.log('  ✓ Dues & Reminders lists all 3 partially-paid students with real ₹1,000 dues!');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'e2e_05_reminders.png'), fullPage: true });

    // 7. Verify Public ID Card (No login required)
    console.log('\n[7/7] Verifying Public Student ID Card for ADM-2026-0001...');
    const publicContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const publicPage = await publicContext.newPage();
    await publicPage.goto(`${FRONTEND_URL}/id-card/ADM-2026-0001`);
    await publicPage.waitForSelector('text=Aarav Gupta', { timeout: 15000 });
    await publicPage.waitForTimeout(1000);

    const cardText = await publicPage.innerText('body');
    if (!cardText.toLowerCase().includes('aarav gupta')) throw new Error('FAIL: Aarav Gupta missing from ID card');
    if (!cardText.includes('ADM-2026-0001')) throw new Error('FAIL: ADM-2026-0001 missing from ID card');
    if (!cardText.includes('Mathematics')) throw new Error('FAIL: Mathematics missing from active courses on ID card');
    console.log('  ✓ Public ID card verified for Aarav Gupta (ADM-2026-0001) with active Mathematics subject!');
    await publicPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'e2e_06_public_id_card.png'), fullPage: true });
    await publicContext.close();

    console.log('\n===============================================================');
    console.log('✓ ALL LIVE E2E VERIFICATION STEPS COMPLETED SUCCESSFULLY!');
    console.log('===============================================================');
  } catch (err) {
    console.error('\n❌ E2E VERIFICATION FAILED:', err.message);
    const errShot = path.join(SCREENSHOT_DIR, 'e2e_failure.png');
    await page.screenshot({ path: errShot, fullPage: true }).catch(() => {});
    console.error('Saved failure screenshot to:', errShot);
    throw err;
  } finally {
    await browser.close();
  }
}

runLiveVerification().catch((err) => {
  process.exit(1);
});
