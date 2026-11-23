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

async function verify() {
  console.log('=== STARTING TEACHER ATTENDANCE LIVE VERIFICATION ===\n');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const failures = [];

  try {
    // 1. Health check
    console.log('[1/6] Checking backend /health and frontend root status...');
    const healthRes = await fetch(`${BACKEND_URL}/health`);
    if (healthRes.ok) {
      const hData = await healthRes.json();
      console.log('  ✓ Backend /health is healthy:', hData);
    } else {
      failures.push(`Backend health check failed: ${healthRes.status}`);
    }

    const feRes = await fetch(FRONTEND_URL);
    if (feRes.ok) {
      console.log(`  ✓ Frontend returned HTTP ${feRes.status}`);
    } else {
      failures.push(`Frontend root returned: ${feRes.status}`);
    }

    // Monitor API requests to detect loops
    let apiRequests = [];
    page.on('request', req => {
      if (req.url().includes('/api/')) {
        apiRequests.push({ method: req.method(), url: req.url(), time: Date.now() });
      }
    });

    // 2. Login as Admin
    console.log('\n[2/6] Logging in as Admin (ADM001)...');
    await page.goto(`${FRONTEND_URL}/login`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    await page.fill('input:not([type="password"])', 'ADM001');
    await page.fill('input[type="password"]', 'Admin@1234');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard', { timeout: 10000 });
    console.log('  ✓ Logged in and reached dashboard');

    // 3. Open Teacher Attendance
    console.log('\n[3/6] Navigating to Teacher Attendance page...');
    apiRequests = [];
    await page.goto(`${FRONTEND_URL}/teacher-attendance`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('h1:has-text("Teacher Attendance")', { timeout: 10000 });
    await page.waitForTimeout(1500);

    const initialReqs = apiRequests.length;
    console.log(`  Teacher Attendance loaded. Requests during initial load: ${initialReqs}`);

    // Wait 2 seconds to confirm initial page settles (0 additional requests)
    const countBeforeInitialWait = apiRequests.length;
    await page.waitForTimeout(2000);
    const countAfterInitialWait = apiRequests.length;
    const initialLoopReqs = countAfterInitialWait - countBeforeInitialWait;
    console.log(`  Requests during 2s idle wait: ${initialLoopReqs}`);
    if (initialLoopReqs > 0) {
      failures.push(`Initial load did not settle: fired ${initialLoopReqs} requests in 2s`);
    } else {
      console.log('  ✓ Initial load settled cleanly with 0 loop requests');
    }

    // Helper functions
    async function setMonth(val) {
      const monthInput = page.locator('input[type="month"]').first();
      await monthInput.fill(val);
      await monthInput.dispatchEvent('change');
      await page.waitForTimeout(1000);
    }

    async function getDaysInMonthBadge() {
      const badge = await page.locator('text=Days in Month').locator('..').locator('span.font-mono').innerText();
      return badge;
    }

    async function getGridCellsCount() {
      return await page.locator('div.grid-cols-7 button[type="button"]').count();
    }

    // 4. Test Switching to December 2026, then back to November 2026
    console.log('\n[4/6] Testing switch to December 2026...');
    apiRequests = [];
    await setMonth('2026-12');

    let badgeDec = await getDaysInMonthBadge();
    let cellsDec = await getGridCellsCount();
    console.log(`  December 2026 badge: "${badgeDec}", grid cells: ${cellsDec}`);

    if (badgeDec.includes('31') && cellsDec === 31) {
      console.log('  ✓ December 2026 shows 31 days in month and 31 calendar grid cells');
    } else {
      failures.push(`Dec 2026 expected 31 days, got badge: "${badgeDec}", cells: ${cellsDec}`);
    }

    // Wait 2.5 seconds to confirm December 2026 settled without continuous reloading
    const reqsAtDecLoad = apiRequests.length;
    console.log(`  Requests fired for Dec 2026 switch: ${reqsAtDecLoad}`);
    await page.waitForTimeout(2500);
    const reqsAfterDecWait = apiRequests.length - reqsAtDecLoad;
    console.log(`  Requests during 2.5s idle wait in Dec 2026: ${reqsAfterDecWait}`);
    if (reqsAfterDecWait > 0) {
      failures.push(`December 2026 continuous reloading loop detected: ${reqsAfterDecWait} extra requests`);
    } else {
      console.log('  ✓ December 2026 loaded once and settled with NO continuous reloading');
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'live_december_2026_settled.png'), fullPage: true });

    // Switch back to November 2026
    console.log('\n  Switching back to November 2026...');
    apiRequests = [];
    await setMonth('2026-11');

    let badgeNov = await getDaysInMonthBadge();
    let cellsNov = await getGridCellsCount();
    console.log(`  November 2026 badge: "${badgeNov}", grid cells: ${cellsNov}`);

    if (badgeNov.includes('30') && cellsNov === 30) {
      console.log('  ✓ November 2026 shows 30 days in month and 30 calendar grid cells');
    } else {
      failures.push(`Nov 2026 expected 30 days, got badge: "${badgeNov}", cells: ${cellsNov}`);
    }

    const reqsAtNovLoad = apiRequests.length;
    console.log(`  Requests fired for Nov 2026 switch: ${reqsAtNovLoad}`);
    await page.waitForTimeout(2500);
    const reqsAfterNovWait = apiRequests.length - reqsAtNovLoad;
    console.log(`  Requests during 2.5s idle wait in Nov 2026: ${reqsAfterNovWait}`);
    if (reqsAfterNovWait > 0) {
      failures.push(`November 2026 continuous reloading loop detected: ${reqsAfterNovWait} extra requests`);
    } else {
      console.log('  ✓ November 2026 loaded once and settled with NO continuous reloading');
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'live_november_2026_settled.png'), fullPage: true });

    // 5. Test February 2027
    console.log('\n[5/6] Testing switch to February 2027...');
    apiRequests = [];
    await setMonth('2027-02');

    let badgeFeb27 = await getDaysInMonthBadge();
    let cellsFeb27 = await getGridCellsCount();
    console.log(`  February 2027 badge: "${badgeFeb27}", grid cells: ${cellsFeb27}`);

    if (badgeFeb27.includes('28') && cellsFeb27 === 28) {
      console.log('  ✓ February 2027 shows 28 days in month and 28 calendar grid cells');
    } else {
      failures.push(`Feb 2027 expected 28 days, got badge: "${badgeFeb27}", cells: ${cellsFeb27}`);
    }

    const reqsAtFebLoad = apiRequests.length;
    console.log(`  Requests fired for Feb 2027 switch: ${reqsAtFebLoad}`);
    await page.waitForTimeout(2500);
    const reqsAfterFebWait = apiRequests.length - reqsAtFebLoad;
    console.log(`  Requests during 2.5s idle wait in Feb 2027: ${reqsAfterFebWait}`);
    if (reqsAfterFebWait > 0) {
      failures.push(`February 2027 continuous reloading loop detected: ${reqsAfterFebWait} extra requests`);
    } else {
      console.log('  ✓ February 2027 loaded once and settled with NO continuous reloading');
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'live_february_2027_settled.png'), fullPage: true });

    // 6. Test Previous / Next Navigation Arrows
    console.log('\n[6/6] Testing Previous and Next arrows navigation...');
    // Click Next Month from Feb 2027 -> March 2027
    apiRequests = [];
    const nextBtn = page.locator('button[title="Next Month"]').first();
    await nextBtn.click();
    await page.waitForTimeout(1000);

    let badgeMar = await getDaysInMonthBadge();
    let cellsMar = await getGridCellsCount();
    console.log(`  After Next Month click (March 2027): badge: "${badgeMar}", cells: ${cellsMar}`);
    if (badgeMar.includes('31') && cellsMar === 31) {
      console.log('  ✓ Next Month navigation successfully moved to March 2027 (31 days)');
    } else {
      failures.push(`March 2027 navigation failed: badge: "${badgeMar}", cells: ${cellsMar}`);
    }

    // Click Previous Month from Mar 2027 -> Feb 2027
    apiRequests = [];
    const prevBtn = page.locator('button[title="Previous Month"]').first();
    await prevBtn.click();
    await page.waitForTimeout(1000);

    let badgeFebAgain = await getDaysInMonthBadge();
    let cellsFebAgain = await getGridCellsCount();
    console.log(`  After Prev Month click (back to Feb 2027): badge: "${badgeFebAgain}", cells: ${cellsFebAgain}`);
    if (badgeFebAgain.includes('28') && cellsFebAgain === 28) {
      console.log('  ✓ Previous Month navigation successfully returned to February 2027 (28 days)');
    } else {
      failures.push(`February 2027 prev navigation failed: badge: "${badgeFebAgain}", cells: ${cellsFebAgain}`);
    }

    // Wait 2s to confirm settles after arrow navigation
    const reqsArrowLoad = apiRequests.length;
    await page.waitForTimeout(2000);
    const reqsAfterArrowWait = apiRequests.length - reqsArrowLoad;
    if (reqsAfterArrowWait > 0) {
      failures.push(`Arrow navigation triggered continuous loop: ${reqsAfterArrowWait} extra requests`);
    } else {
      console.log('  ✓ Arrow navigation settled cleanly with 0 loop requests');
    }

    // Toggle attendance on a day and verify no loop
    console.log('\n  Testing attendance toggle on Day 10...');
    const day10 = page.locator('div.grid-cols-7 button[type="button"]:has-text("10")');
    apiRequests = [];
    await day10.click();
    await page.waitForTimeout(1000);
    const toggleReqs = apiRequests.filter(r => r.method === 'POST').length;
    console.log(`  POST requests fired on toggle: ${toggleReqs}`);
    await page.waitForTimeout(2000);
    const postToggleExtra = apiRequests.filter(r => r.method === 'GET').length;
    console.log(`  GET requests fired after toggle: ${postToggleExtra}`);
    if (postToggleExtra === 0) {
      console.log('  ✓ Attendance toggle updated state cleanly without reloading loop');
    } else {
      failures.push(`Toggle triggered unexpected GET requests: ${postToggleExtra}`);
    }

    // Untoggle
    await day10.click();
    await page.waitForTimeout(1000);

  } catch (err) {
    console.error('Error during verification:', err);
    failures.push(err.message);
  } finally {
    await browser.close();
  }

  console.log('\n=== LIVE VERIFICATION SUMMARY ===');
  if (failures.length === 0) {
    console.log('✓ ALL LIVE VERIFICATION CHECKS PASSED WITH 0 FAILURES!');
    process.exit(0);
  } else {
    console.error(`✗ ${failures.length} CHECKS FAILED:`);
    failures.forEach((f, i) => console.error(`  ${i + 1}. ${f}`));
    process.exit(1);
  }
}

verify();
