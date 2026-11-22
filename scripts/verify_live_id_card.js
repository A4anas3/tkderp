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

async function runLiveVerification() {
  console.log('===============================================================');
  console.log('THAKURDWARA ERP: LIVE PUBLIC ID CARD & VERIFICATION SYSTEM TEST');
  console.log('===============================================================');

  // STEP 1: Backend Health Check
  console.log('\n[1/5] Verifying Backend Health API...');
  const healthRes = await fetchJson(`${BACKEND_URL}/api/health`);
  console.log('Health API status:', healthRes.status, JSON.stringify(healthRes.data));
  if (healthRes.status !== 200 || healthRes.data?.status !== 'healthy') {
    throw new Error('Backend health check failed');
  }
  console.log('✓ Backend health check OK.');

  // STEP 2: Public ID Card Backend Endpoint Check
  console.log('\n[2/5] Testing Backend Public ID Card Endpoint...');
  // 2a. Active Student
  const activeAdm = 'ENR-2026-0001';
  console.log(`Checking Active student (${activeAdm})...`);
  const activeRes = await fetchJson(`${BACKEND_URL}/api/public/id-card/${activeAdm}`);
  console.log(`Status for active student: ${activeRes.status}`);
  if (activeRes.status !== 200) {
    throw new Error(`Expected 200 for active student, got ${activeRes.status}`);
  }
  if (!activeRes.data.student || !activeRes.data.active_courses?.length) {
    throw new Error('Expected active student data and active courses');
  }
  console.log(`✓ Active student retrieved: ${activeRes.data.student.name}, Courses: ${activeRes.data.active_courses.length}`);

  // 2b. Expired Student
  const expiredAdm = 'ENR-2026-0002';
  console.log(`Checking Expired student (${expiredAdm})...`);
  const expiredRes = await fetchJson(`${BACKEND_URL}/api/public/id-card/${expiredAdm}`);
  console.log(`Status for expired student: ${expiredRes.status}, detail: ${expiredRes.data?.detail}`);
  if (expiredRes.status !== 404) {
    throw new Error(`Expected 404 for expired student, got ${expiredRes.status}`);
  }
  if (expiredRes.data?.student) {
    throw new Error('Sensitive student data leaked for student with no active subjects!');
  }
  console.log('✓ Expired student correctly blocked with 404 and no student data leak.');

  // STEP 3: Launch Browser for Live UI Testing
  console.log('\n[3/5] Launching Headless Chromium for Frontend Live Checks...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 960 },
  });
  const page = await context.newPage();

  try {
    // 3a. Blank /id-card page
    console.log('\nNavigating to public ID card page: /id-card (no auth)...');
    await page.goto(`${FRONTEND_URL}/id-card`, { waitUntil: 'networkidle' });
    const pageTitle = await page.textContent('h1');
    console.log('Page header text:', pageTitle);
    const searchInput = await page.locator('input[placeholder*="Enter Admission Number"]');
    if (!(await searchInput.isVisible())) {
      throw new Error('Search input not visible on /id-card');
    }
    console.log('✓ Public page loaded with search input visible.');

    // 3b. Test entering ACTIVE admission number via input box
    console.log(`\nTyping active admission number "${activeAdm}" into search box...`);
    await searchInput.fill(activeAdm);
    await page.click('button:has-text("Get ID Card")');
    await page.waitForURL(`**/id-card/${activeAdm}`, { timeout: 10000 });
    await page.waitForSelector('#printable-id-card', { timeout: 10000 });

    const studentName = await page.textContent('#printable-id-card h2');
    console.log(`ID Card Rendered! Student Name: ${studentName.trim()}`);
    if (!studentName.includes('Aman Sharma')) {
      throw new Error(`Expected Aman Sharma on card, found: ${studentName}`);
    }

    const cardAdmNo = await page.textContent('#printable-id-card');
    if (!cardAdmNo.includes(activeAdm)) {
      throw new Error(`Expected admission number ${activeAdm} on card`);
    }

    // Verify QR code links to this public page pre-filled with that admission number
    const qrCode = await page.locator('#printable-id-card svg[role="img"], #printable-id-card .p-1 svg');
    if (!(await qrCode.isVisible())) {
      throw new Error('QR code not visible on ID card');
    }
    const cardText = await page.textContent('#printable-id-card');
    if (!cardText.includes(`/id-card/${activeAdm}`)) {
      throw new Error(`Expected /id-card/${activeAdm} QR URL label on card`);
    }

    const activeShotPath = path.join(SCREENSHOT_DIR, 'live_id_card_active.png');
    await page.screenshot({ path: activeShotPath, fullPage: true });
    console.log(`✓ Active ID Card live verified. Screenshot saved to ${activeShotPath}`);

    // 3c. Test entering EXPIRED admission number via input box
    console.log(`\n[4/5] Typing expired admission number "${expiredAdm}" into search box...`);
    await page.fill('input[placeholder*="Enter Admission Number"]', expiredAdm);
    await page.click('button:has-text("Get ID Card")');
    await page.waitForURL(`**/id-card/${expiredAdm}`, { timeout: 10000 });

    // Wait for the not-available message
    await page.waitForSelector('text=No Active Enrolment / ID Card Available', { timeout: 10000 });
    console.log('✓ Alert "No Active Enrolment / ID Card Available" is visible!');

    // Verify ID Card is NEVER shown
    const cardCount = await page.locator('#printable-id-card').count();
    if (cardCount > 0) {
      throw new Error('ID card container should NOT exist for student with no active subjects!');
    }

    // Verify student name is NOT leaked
    const bodyText = await page.textContent('body');
    if (bodyText.includes('Ananya Joshi')) {
      throw new Error('Student name was leaked for student with no active subjects!');
    }
    console.log('✓ Verified: ID card is not shown and student data is NOT leaked.');

    const expiredShotPath = path.join(SCREENSHOT_DIR, 'live_id_card_expired.png');
    await page.screenshot({ path: expiredShotPath, fullPage: true });
    console.log(`✓ Expired student live verified. Screenshot saved to ${expiredShotPath}`);

    // 3d. Direct URL test: pre-filled QR code link simulation
    console.log(`\n[5/5] Testing direct QR link navigation to: /id-card/${activeAdm}...`);
    await page.goto(`${FRONTEND_URL}/id-card/${activeAdm}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#printable-id-card', { timeout: 10000 });
    const directCardName = await page.textContent('#printable-id-card h2');
    console.log(`✓ Direct QR link loaded ID card successfully for: ${directCardName.trim()}`);

    // 3e. Test navigation from /verify to /id-card
    console.log('\nTesting /verify link to ID card portal...');
    await page.goto(`${FRONTEND_URL}/verify`, { waitUntil: 'networkidle' });
    const idCardLink = await page.locator('a:has-text("Get Student ID Card")');
    if (!(await idCardLink.isVisible())) {
      throw new Error('Link to Student ID Card not found on /verify');
    }
    await idCardLink.click();
    await page.waitForURL(`**/id-card`, { timeout: 10000 });
    console.log('✓ Successfully navigated from /verify to /id-card portal.');

    console.log('\n===============================================================');
    console.log('ALL LIVE VERIFICATIONS PASSED PERFECTLY!');
    console.log('===============================================================');
  } finally {
    await browser.close();
  }
}

runLiveVerification().catch(err => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
