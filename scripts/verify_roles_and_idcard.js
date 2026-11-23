const path = require('path');
const fs = require('fs');

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/home/ubuntu/antigravity/profiles/a4anaskhanshab_at_gmail_com/.cache/ms-playwright')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/home/ubuntu/antigravity/profiles/a4anaskhanshab_at_gmail_com/.cache/ms-playwright';
}

const { chromium } = require('/home/ubuntu/antigravity/profiles/a4anaskhanshab_at_gmail_com/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');

const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:8080';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'verification_screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function run() {
  console.log('=== STARTING LIVE VERIFICATION SUITE ===\n');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const errors = [];

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    // -------------------------------------------------------------
    // 1. TEACHER LIVE VERIFICATION
    // -------------------------------------------------------------
    console.log('[Test 1] Logging in as TEACHER (TCH001 / Teacher@1234)...');
    await page.goto(`${FRONTEND_URL}/login`);
    await page.waitForLoadState('networkidle');

    await page.fill('input:not([type="password"])', 'TCH001');
    await page.fill('input[type="password"]', 'Teacher@1234');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Verify Header Nav Links
    const teacherNavTexts = await page.$$eval('header nav a', els => els.map(e => e.textContent.trim()));
    console.log('  Teacher Header Nav Items:', teacherNavTexts);
    const expectedTeacherNav = ['Dashboard', 'Subjects', 'Students'];
    if (JSON.stringify(teacherNavTexts) !== JSON.stringify(expectedTeacherNav)) {
      errors.push(`Teacher header nav mismatch! Expected ${JSON.stringify(expectedTeacherNav)} but got ${JSON.stringify(teacherNavTexts)}`);
    } else {
      console.log('  ✓ Teacher Header shows strictly [Dashboard, Subjects, Students]');
    }

    // Verify Role Badge in Header
    const teacherBadgeText = await page.$eval('header button[title="Active Staff Role"]', el => el.textContent.trim().toLowerCase());
    console.log('  Teacher Role Badge Text:', teacherBadgeText);
    if (!teacherBadgeText.includes('teacher')) {
      errors.push(`Teacher role badge mismatch! Got ${teacherBadgeText}`);
    } else {
      console.log('  ✓ Teacher Role Badge is correct ("teacher")');
    }

    // Verify Faculty Teaching Portal Banner
    const welcomeText = await page.$eval('h1', el => el.textContent.trim());
    console.log('  Teacher Dashboard Heading:', welcomeText);
    if (!welcomeText.includes('Welcome, K.K. Chauhan')) {
      errors.push(`Teacher welcome text unexpected: ${welcomeText}`);
    } else {
      console.log('  ✓ Faculty Teaching Portal loaded for K.K. Chauhan');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_teacher_dashboard_header.png') });
    console.log('  Saved screenshot: 01_teacher_dashboard_header.png');

    // -------------------------------------------------------------
    // 2. CASHIER LIVE VERIFICATION
    // -------------------------------------------------------------
    console.log('\n[Test 2] Logging in as CASHIER (CSH001 / Cashier@1234)...');
    // Clear storage to log out
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto(`${FRONTEND_URL}/login`);
    await page.waitForLoadState('networkidle');

    await page.fill('input:not([type="password"])', 'CSH001');
    await page.fill('input[type="password"]', 'Cashier@1234');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Verify Header Nav Links
    const cashierNavTexts = await page.$$eval('header nav a', els => els.map(e => e.textContent.trim()));
    console.log('  Cashier Header Nav Items:', cashierNavTexts);
    const expectedCashierNav = ['Dashboard', 'Students', 'Admissions', 'Fees & Dues', 'Payments', 'Reminders'];
    if (JSON.stringify(cashierNavTexts) !== JSON.stringify(expectedCashierNav)) {
      errors.push(`Cashier header nav mismatch! Expected ${JSON.stringify(expectedCashierNav)} but got ${JSON.stringify(cashierNavTexts)}`);
    } else {
      console.log('  ✓ Cashier Header shows strictly [Dashboard, Students, Admissions, Fees & Dues, Payments, Reminders]');
    }

    // Verify Role Badge in Header
    const cashierBadgeText = await page.$eval('header button[title="Active Staff Role"]', el => el.textContent.trim().toLowerCase());
    console.log('  Cashier Role Badge Text:', cashierBadgeText);
    if (!cashierBadgeText.includes('cashier')) {
      errors.push(`Cashier role badge mismatch! Got ${cashierBadgeText}`);
    } else {
      console.log('  ✓ Cashier Role Badge is correct ("cashier")');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_cashier_dashboard_header.png') });
    console.log('  Saved screenshot: 02_cashier_dashboard_header.png');

    // -------------------------------------------------------------
    // 3. ADMIN LIVE VERIFICATION
    // -------------------------------------------------------------
    console.log('\n[Test 3] Logging in as ADMIN (ADM001 / Admin@1234)...');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto(`${FRONTEND_URL}/login`);
    await page.waitForLoadState('networkidle');

    await page.fill('input:not([type="password"])', 'ADM001');
    await page.fill('input[type="password"]', 'Admin@1234');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Verify Header Nav Links
    const adminNavTexts = await page.$$eval('header nav a', els => els.map(e => e.textContent.trim()));
    console.log('  Admin Header Nav Items:', adminNavTexts);
    const expectedAdminNav = [
      'Dashboard', 'Students', 'Subjects', 'Admissions', 'Fees & Dues',
      'Payments', 'Reminders', 'Teachers', 'Enquiries', 'Reports', 'Settings'
    ];
    if (JSON.stringify(adminNavTexts) !== JSON.stringify(expectedAdminNav)) {
      errors.push(`Admin header nav mismatch! Expected ${JSON.stringify(expectedAdminNav)} but got ${JSON.stringify(adminNavTexts)}`);
    } else {
      console.log('  ✓ Admin Header shows all 11 navigation modules');
    }

    // Verify Role Badge
    const adminBadgeText = await page.$eval('header button[title="Active Staff Role"]', el => el.textContent.trim().toLowerCase());
    console.log('  Admin Role Badge Text:', adminBadgeText);
    if (!adminBadgeText.includes('admin')) {
      errors.push(`Admin role badge mismatch! Got ${adminBadgeText}`);
    } else {
      console.log('  ✓ Admin Role Badge is correct ("admin")');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_admin_dashboard_header.png') });
    console.log('  Saved screenshot: 03_admin_dashboard_header.png');

    // -------------------------------------------------------------
    // 4. PUBLIC ID CARD PAGE (LOGGED OUT)
    // -------------------------------------------------------------
    console.log('\n[Test 4] Testing Public ID Card page while logged out (/id-card)...');
    // Clear all tokens to be completely logged out
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.context().clearCookies();

    // 4A. Initial State: No admission number entered
    await page.goto(`${FRONTEND_URL}/id-card`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Verify NO topbar, NO sidebar, NO login prompt
    const hasHeader = (await page.$$('header')).length;
    const hasSidebar = (await page.$$('aside')).length;
    const hasLoginPrompt = (await page.content()).includes('Please log in');

    if (hasHeader > 0 || hasSidebar > 0 || hasLoginPrompt) {
      errors.push(`Public ID Card page has unwanted chrome! header=${hasHeader}, sidebar=${hasSidebar}, loginPrompt=${hasLoginPrompt}`);
    } else {
      console.log('  ✓ Public ID card page has no navbar, no sidebar, and no login prompt');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_public_idcard_initial.png') });
    console.log('  Saved screenshot: 04_public_idcard_initial.png');

    // 4B. Wrong Admission Number: Not found state
    console.log('  Searching with wrong admission number ADM-WRONG-9999...');
    await page.fill('input:not([type="password"])', 'ADM-WRONG-9999');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const notFoundText = await page.textContent('body');
    if (!notFoundText.toLowerCase().includes('not found') || !notFoundText.includes('ADM-WRONG-9999')) {
      errors.push('Wrong admission number did not show clear "not found" message!');
    } else {
      console.log('  ✓ Wrong admission number correctly shows clear "not found" message');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_public_idcard_not_found.png') });
    console.log('  Saved screenshot: 05_public_idcard_not_found.png');

    // 4C. Valid Admission Number: ID Card Displayed
    console.log('  Searching with valid admission number ADM-2026-0001...');
    await page.fill('input:not([type="password"])', 'ADM-2026-0001');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const cardContent = await page.textContent('#printable-id-card');
    console.log('  Card text snippet:', cardContent.slice(0, 150).replace(/\s+/g, ' '));
    if (!cardContent.includes('ADM-2026-0001') || !cardContent.includes('Aarav Gupta')) {
      errors.push('Valid admission number did not display student ID card with ADM-2026-0001 and Aarav Gupta!');
    } else {
      console.log('  ✓ Valid admission number displays official student ID card with name, admission number, active subjects & QR code');
    }

    // Check QR code presence
    const qrSvgCount = (await page.$$('#printable-id-card svg')).length;
    if (qrSvgCount === 0) {
      errors.push('ID card missing QR verification code SVG!');
    } else {
      console.log('  ✓ QR verification code is present on ID card');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_public_idcard_found.png') });
    console.log('  Saved screenshot: 06_public_idcard_found.png');

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log('\n=============================================');
    if (errors.length > 0) {
      console.error('LIVE VERIFICATION FAILED with errors:');
      errors.forEach(e => console.error('  - ' + e));
      process.exit(1);
    } else {
      console.log('ALL LIVE VERIFICATIONS PASSED SUCCESSFULLY!');
      console.log('=============================================');
    }
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
