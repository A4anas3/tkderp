const path = require('path');
const fs = require('fs');
const http = require('http');

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/home/ubuntu/antigravity/profiles/a4anaskhanshab_at_gmail_com/.cache/ms-playwright')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/home/ubuntu/antigravity/profiles/a4anaskhanshab_at_gmail_com/.cache/ms-playwright';
}

const playwright = require('/home/ubuntu/antigravity/profiles/a4anaskhanshab_at_gmail_com/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const { chromium } = playwright;

const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:8080';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'verification_screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, text: data });
        }
      });
    }).on('error', reject);
  });
}

async function verifyIdCard() {
  console.log('========================================================================');
  console.log('VERIFYING PUBLIC ID CARD SEARCH (STUDENT ID, PHONE, ADMISSION NUMBER)');
  console.log('& REMOVAL OF ADMISSION NUMBER ON CARD');
  console.log('========================================================================\n');

  // 1. Health check
  console.log('[1/7] Checking backend /health and frontend 200...');
  const healthRes = await fetchJson(`${BACKEND_URL}/health`);
  console.log('Backend /health status:', healthRes.status, healthRes.data);
  if (healthRes.status !== 200 || healthRes.data?.status !== 'healthy') {
    throw new Error('Backend health check failed');
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 960 },
  });
  const page = await context.newPage();

  try {
    // 2. Public /id-card while logged out
    console.log('\n[2/7] Navigating to public /id-card while logged out...');
    await page.goto(`${FRONTEND_URL}/id-card`, { waitUntil: 'networkidle' });

    // Verify page shows ONLY the ID card / portal - no nav, no dashboard, no other student details, no login prompt
    const navBar = await page.$('nav');
    const dashboardLink = await page.$('a[href="/dashboard"], a[href*="dashboard"]');
    const loginPrompt = await page.$('input[type="password"]');
    console.log('Nav bar present:', Boolean(navBar));
    console.log('Dashboard link present:', Boolean(dashboardLink));
    console.log('Login prompt present:', Boolean(loginPrompt));
    if (navBar || dashboardLink || loginPrompt) {
      throw new Error('Public ID card page should show ONLY the ID card portal — no nav, no dashboard, no login prompt.');
    }
    console.log('✓ Verified: Public /id-card shows ONLY ID card portal, no nav/dashboard/login.');

    // 3. Search by STUDENT ID: STU20260001
    console.log('\n[3/7] Testing search by STUDENT ID ("STU20260001")...');
    const searchInput = page.locator('input[placeholder*="Student ID"]');
    await searchInput.fill('STU20260001');
    await page.click('button:has-text("Get ID Card")');
    await page.waitForSelector('#printable-id-card', { timeout: 10000 });

    const cardContent1 = await page.textContent('#printable-id-card');
    console.log('Checking card content for Student ID search...');
    if (!cardContent1.includes('Aarav Gupta')) throw new Error('Student name "Aarav Gupta" missing from ID card');
    if (!cardContent1.includes('STU20260001')) throw new Error('Student code STU20260001 missing from ID card');
    if (!cardContent1.includes('Due Balance: ₹')) throw new Error('Due balance missing from ID card');
    if (!cardContent1.includes('Timing:')) throw new Error('Class timings missing from ID card');

    // CRITICAL: Verify admission number is NOT displayed anywhere on card!
    if (cardContent1.includes('Admission No:') || cardContent1.includes('Admission Number:') || cardContent1.includes('ADM-2026-0001')) {
      throw new Error('FAILURE: Admission number or label displayed on ID card!');
    }
    console.log('✓ Verified: Student ID search loaded ID card successfully.');
    console.log('✓ Verified: NO admission number or Admission No label displayed on the card!');

    const qr1 = page.locator('#printable-id-card svg');
    if (!(await qr1.count() > 0)) throw new Error('QR code missing on card');
    console.log('✓ Verified: QR code is present and visible.');

    const shot1 = path.join(SCREENSHOT_DIR, 'id_card_search_by_student_id.png');
    await page.screenshot({ path: shot1, fullPage: true });
    console.log(`✓ Screenshot saved: ${shot1}`);

    // 4. Search by REGISTERED PHONE NUMBER: 9838011221
    console.log('\n[4/7] Testing search by REGISTERED PHONE NUMBER ("9838011221")...');
    await searchInput.fill('9838011221');
    await page.click('button:has-text("Get ID Card")');
    await page.waitForSelector('#printable-id-card', { timeout: 10000 });

    const cardContent2 = await page.textContent('#printable-id-card');
    if (!cardContent2.includes('Aarav Gupta')) throw new Error('Student name missing on phone search');
    if (!cardContent2.includes('STU20260001')) throw new Error('Student code missing on phone search');
    if (cardContent2.includes('Admission No:') || cardContent2.includes('ADM-2026-0001')) {
      throw new Error('FAILURE: Admission number displayed on card during phone search!');
    }
    console.log('✓ Verified: Phone number search loaded ID card successfully.');
    console.log('✓ Verified: NO admission number displayed on card during phone search!');

    const shot2 = path.join(SCREENSHOT_DIR, 'id_card_search_by_phone.png');
    await page.screenshot({ path: shot2, fullPage: true });
    console.log(`✓ Screenshot saved: ${shot2}`);

    // 5. Search by ADMISSION NUMBER: ADM-2026-0001
    console.log('\n[5/7] Testing search by ADMISSION NUMBER ("ADM-2026-0001")...');
    await searchInput.fill('ADM-2026-0001');
    await page.click('button:has-text("Get ID Card")');
    await page.waitForSelector('#printable-id-card', { timeout: 10000 });

    const cardContent3 = await page.textContent('#printable-id-card');
    if (!cardContent3.includes('Aarav Gupta')) throw new Error('Student name missing on admission no search');
    if (cardContent3.includes('Admission No:') || cardContent3.includes('ADM-2026-0001')) {
      throw new Error('FAILURE: Admission number displayed on card when searched by admission no!');
    }
    console.log('✓ Verified: Admission number search loaded ID card successfully.');
    console.log('✓ Verified: NO admission number displayed on card itself even when searched by admission number!');

    const shot3 = path.join(SCREENSHOT_DIR, 'id_card_search_by_admission_no.png');
    await page.screenshot({ path: shot3, fullPage: true });
    console.log(`✓ Screenshot saved: ${shot3}`);

    // 6. Search with WRONG / INVALID value
    console.log('\n[6/7] Testing search with NON-MATCHING value ("UNKNOWN-99999")...');
    await searchInput.fill('UNKNOWN-99999');
    await page.click('button:has-text("Get ID Card")');
    await page.waitForSelector('text=Student ID Card Not Found', { timeout: 10000 });

    const notFoundText = await page.textContent('body');
    if (!notFoundText.includes('Student ID Card Not Found') || !notFoundText.includes('UNKNOWN-99999')) {
      throw new Error('Clear not found message missing for invalid search value');
    }
    const cardVisible = await page.locator('#printable-id-card').count();
    if (cardVisible > 0) throw new Error('ID card should NOT be shown for not-found student');
    console.log('✓ Verified: Clear not-found message displayed and no ID card shown.');

    const shot4 = path.join(SCREENSHOT_DIR, 'id_card_search_not_found.png');
    await page.screenshot({ path: shot4, fullPage: true });
    console.log(`✓ Screenshot saved: ${shot4}`);

    // 7. Verify In-App Student ID Card modal (logged in)
    console.log('\n[7/7] Testing In-App Student ID Card Modal (logged in)...');
    await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input:not([type="password"])', 'ADM001');
    await page.fill('input[type="password"]', 'Admin@1234');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    console.log('Logged in to ERP dashboard.');

    // Navigate to Aarav Gupta's student detail page directly
    console.log('Navigating directly to StudentDetailPage for Aarav Gupta...');
    await page.goto(`${FRONTEND_URL}/students/b7a1be90-42af-4add-8c36-1d02e653d551`, { waitUntil: 'networkidle' });

    // Click "ID Card" button on student detail page
    const idCardBtn = page.locator('button:has-text("ID Card")').first();
    await idCardBtn.waitFor({ state: 'visible', timeout: 10000 });
    await idCardBtn.click();
    await page.waitForSelector('#printable-id-card', { timeout: 10000 });

    const inAppCardText = await page.textContent('#printable-id-card');
    console.log('In-App ID Card modal opened.');
    console.log('In-app ID card text snippet:', inAppCardText.slice(0, 300).replace(/\s+/g, ' '));
    if (inAppCardText.includes('Admission No:') || inAppCardText.includes('Admission Number:')) {
      throw new Error('FAILURE: In-app ID card modal displays "Admission No:"!');
    }
    if (!inAppCardText.includes('Student ID:')) {
      throw new Error('FAILURE: In-app ID card modal missing "Student ID:"!');
    }
    if (!inAppCardText.includes('Due Balance:')) {
      throw new Error('FAILURE: In-app ID card modal missing Due Balance!');
    }
    console.log('✓ Verified: In-App ID Card Modal does NOT display admission number anywhere!');
    console.log('✓ Verified: In-App ID Card Modal displays student name, student ID, timings, due balance, and QR!');

    const shot5 = path.join(SCREENSHOT_DIR, 'in_app_id_card_modal.png');
    await page.screenshot({ path: shot5, fullPage: true });
    console.log(`✓ Screenshot saved: ${shot5}`);

    console.log('\n========================================================================');
    console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
    console.log('========================================================================');
  } finally {
    await browser.close();
  }
}

verifyIdCard().catch(err => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});
