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
  console.log('=== STARTING TEACHER ATTENDANCE REAL CALENDAR LIVE VERIFICATION ===\n');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const failures = [];

  try {
    // 1. Health check
    console.log('[1/5] Checking backend /health and frontend 200...');
    const healthRes = await fetch(`${BACKEND_URL}/health`);
    if (healthRes.ok) {
      console.log('  ✓ Backend /health is healthy:', await healthRes.json());
    } else {
      failures.push(`Backend health failed with status ${healthRes.status}`);
    }

    const feRes = await fetch(FRONTEND_URL);
    if (feRes.ok) {
      console.log(`  ✓ Frontend root returned HTTP ${feRes.status}`);
    } else {
      failures.push(`Frontend root failed with status ${feRes.status}`);
    }

    // 2. Login as Admin
    console.log('\n[2/5] Logging in as Admin (ADM001)...');
    await page.goto(`${FRONTEND_URL}/login`);
    await page.waitForLoadState('domcontentloaded');

    await page.fill('input:not([type="password"])', 'ADM001');
    await page.fill('input[type="password"]', 'Admin@1234');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await page.waitForTimeout(1000);
    console.log('  ✓ Admin logged in successfully');

    // 3. Open Teacher Attendance page
    console.log('\n[3/5] Navigating to Teacher Attendance page...');
    await page.goto(`${FRONTEND_URL}/teacher-attendance`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('h1:has-text("Teacher Attendance")', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Helper to set month in month input
    async function setPageMonth(my) {
      const monthInput = page.locator('input[type="month"]').first();
      await monthInput.fill(my);
      await monthInput.dispatchEvent('change');
      await page.waitForTimeout(800);
    }

    // Helper to count day cells in interactive calendar
    async function getCalendarDayCellsCount() {
      // Find all buttons inside the calendar matrix that have day numbers
      const cells = page.locator('div.grid-cols-7 button[type="button"]');
      return await cells.count();
    }

    // Helper to get text of DAYS IN MONTH badge and PRESENT DAYS
    async function getKpiValues() {
      const daysInMonthText = await page.locator('text=Days in Month').locator('..').locator('span.font-mono').innerText();
      const presentDaysText = await page.locator('text=Present Days').locator('..').locator('span.font-mono').innerText();
      const absentDaysText = await page.locator('text=Total Absent (Holidays)').locator('..').locator('span.font-mono').innerText();
      return { daysInMonthText, presentDaysText, absentDaysText };
    }

    // --- CASE A: December 2026 (31 days) ---
    console.log('\n--- Case A: December 2026 (31-day month) ---');
    await setPageMonth('2026-12');
    let kpi = await getKpiValues();
    let dayCount = await getCalendarDayCellsCount();
    console.log(`  KPI Days in Month: "${kpi.daysInMonthText}"`);
    console.log(`  KPI Present Days: "${kpi.presentDaysText}"`);
    console.log(`  KPI Total Absent: "${kpi.absentDaysText}"`);
    console.log(`  Calendar Grid Cell Count: ${dayCount}`);

    if (kpi.daysInMonthText.includes('31') && dayCount === 31) {
      console.log('  ✓ December 2026 correctly shows 31 days in month and 31 grid cells');
    } else {
      failures.push(`Dec 2026 expected 31 days, got KPI: ${kpi.daysInMonthText}, grid: ${dayCount}`);
    }

    // Parse absent number
    const decAbsentMatch = kpi.absentDaysText.match(/\d+/);
    const decAbsent = decAbsentMatch ? parseInt(decAbsentMatch[0], 10) : 0;
    const expectedDecPresent = `${31 - decAbsent} / 31 days`;
    if (kpi.presentDaysText.trim() === expectedDecPresent) {
      console.log(`  ✓ Present days figure matches real calendar: ${expectedDecPresent}`);
    } else {
      failures.push(`Dec 2026 present days mismatch: expected ${expectedDecPresent}, got ${kpi.presentDaysText}`);
    }

    // Check Summary tab
    await page.click('button:has-text("All Faculty Summary")');
    await page.waitForTimeout(500);
    const summaryHeaderDec = await page.locator('text=Days in Month').first().innerText();
    console.log(`  Summary Tab Header: "${summaryHeaderDec}"`);
    if (summaryHeaderDec.includes('31')) {
      console.log('  ✓ Summary Tab correctly shows 31 Days in Month for Dec 2026');
    } else {
      failures.push(`Summary Tab Dec 2026 expected 31 Days, got: ${summaryHeaderDec}`);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_december_2026_31_days.png'), fullPage: true });

    // Switch back to Calendar tab
    await page.click('button:has-text("Teacher Monthly Calendar")');
    await page.waitForTimeout(500);

    // --- CASE B: February 2027 (28 days, non-leap year) ---
    console.log('\n--- Case B: February 2027 (28-day month, non-leap year) ---');
    await setPageMonth('2027-02');
    kpi = await getKpiValues();
    dayCount = await getCalendarDayCellsCount();
    console.log(`  KPI Days in Month: "${kpi.daysInMonthText}"`);
    console.log(`  KPI Present Days: "${kpi.presentDaysText}"`);
    console.log(`  KPI Total Absent: "${kpi.absentDaysText}"`);
    console.log(`  Calendar Grid Cell Count: ${dayCount}`);

    if (kpi.daysInMonthText.includes('28') && dayCount === 28) {
      console.log('  ✓ February 2027 correctly shows 28 days in month and 28 grid cells');
    } else {
      failures.push(`Feb 2027 expected 28 days, got KPI: ${kpi.daysInMonthText}, grid: ${dayCount}`);
    }

    const feb27AbsentMatch = kpi.absentDaysText.match(/\d+/);
    const feb27Absent = feb27AbsentMatch ? parseInt(feb27AbsentMatch[0], 10) : 0;
    const expectedFeb27Present = `${28 - feb27Absent} / 28 days`;
    if (kpi.presentDaysText.trim() === expectedFeb27Present) {
      console.log(`  ✓ Present days figure matches real calendar: ${expectedFeb27Present}`);
    } else {
      failures.push(`Feb 2027 present days mismatch: expected ${expectedFeb27Present}, got ${kpi.presentDaysText}`);
    }

    // Check Summary tab
    await page.click('button:has-text("All Faculty Summary")');
    await page.waitForTimeout(500);
    const summaryHeaderFeb27 = await page.locator('text=Days in Month').first().innerText();
    console.log(`  Summary Tab Header: "${summaryHeaderFeb27}"`);
    if (summaryHeaderFeb27.includes('28')) {
      console.log('  ✓ Summary Tab correctly shows 28 Days in Month for Feb 2027');
    } else {
      failures.push(`Summary Tab Feb 2027 expected 28 Days, got: ${summaryHeaderFeb27}`);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_february_2027_28_days.png'), fullPage: true });

    // Switch back to Calendar tab
    await page.click('button:has-text("Teacher Monthly Calendar")');
    await page.waitForTimeout(500);

    // --- CASE C: February 2028 (29 days, leap year) ---
    console.log('\n--- Case C: February 2028 (29-day month, leap year) ---');
    await setPageMonth('2028-02');
    kpi = await getKpiValues();
    dayCount = await getCalendarDayCellsCount();
    console.log(`  KPI Days in Month: "${kpi.daysInMonthText}"`);
    console.log(`  KPI Present Days: "${kpi.presentDaysText}"`);
    console.log(`  KPI Total Absent: "${kpi.absentDaysText}"`);
    console.log(`  Calendar Grid Cell Count: ${dayCount}`);

    if (kpi.daysInMonthText.includes('29') && dayCount === 29) {
      console.log('  ✓ February 2028 (leap year) correctly shows 29 days in month and 29 grid cells');
    } else {
      failures.push(`Feb 2028 leap year expected 29 days, got KPI: ${kpi.daysInMonthText}, grid: ${dayCount}`);
    }

    const feb28AbsentMatch = kpi.absentDaysText.match(/\d+/);
    const feb28Absent = feb28AbsentMatch ? parseInt(feb28AbsentMatch[0], 10) : 0;
    const expectedFeb28Present = `${29 - feb28Absent} / 29 days`;
    if (kpi.presentDaysText.trim() === expectedFeb28Present) {
      console.log(`  ✓ Present days figure matches real calendar: ${expectedFeb28Present}`);
    } else {
      failures.push(`Feb 2028 present days mismatch: expected ${expectedFeb28Present}, got ${kpi.presentDaysText}`);
    }

    // Verify 29th day cell exists in grid
    const day29Cell = page.locator('div.grid-cols-7 button[type="button"]:has-text("29")');
    const day29Exists = await day29Cell.count() > 0;
    if (day29Exists) {
      console.log('  ✓ Day 29 cell is present and visible in February 2028 calendar');
    } else {
      failures.push('Day 29 cell missing from February 2028 leap year calendar');
    }

    // Toggle 29th day
    console.log('  Toggling Day 29 in Feb 2028...');
    await day29Cell.click();
    await page.waitForTimeout(1000);

    const kpiToggled = await getKpiValues();
    console.log(`  Post-toggle KPI Present Days: "${kpiToggled.presentDaysText}"`);
    console.log(`  Post-toggle KPI Total Absent: "${kpiToggled.absentDaysText}"`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_february_2028_leap_29_days.png'), fullPage: true });

    // Check Summary tab for 2028-02
    await page.click('button:has-text("All Faculty Summary")');
    await page.waitForTimeout(500);
    const summaryHeaderFeb28 = await page.locator('text=Days in Month').first().innerText();
    console.log(`  Summary Tab Header: "${summaryHeaderFeb28}"`);
    if (summaryHeaderFeb28.includes('29')) {
      console.log('  ✓ Summary Tab correctly shows 29 Days in Month for Feb 2028 (leap year)');
    } else {
      failures.push(`Summary Tab Feb 2028 expected 29 Days, got: ${summaryHeaderFeb28}`);
    }

    // Untoggle Day 29
    await page.click('button:has-text("Teacher Monthly Calendar")');
    await page.waitForTimeout(500);
    await day29Cell.click();
    await page.waitForTimeout(1000);

    // 4. Verify Expenses Page Salary Modal
    console.log('\n[4/5] Verifying Expenses page salary flow attendance figures...');
    await page.goto(`${FRONTEND_URL}/expenses`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Switch to Salaries tab
    await page.click('button:has-text("Faculty & Staff Payroll")');
    await page.waitForTimeout(600);

    // Click Create Salary Entry
    await page.click('button:has-text("Create Salary Entry")');
    await page.waitForTimeout(600);

    // Select Teacher type (already default) and pick a teacher name
    const teacherSelect = page.locator('select').first();
    const options = await page.$$eval('select option', opts => opts.map(o => o.value).filter(Boolean));
    if (options.length > 0) {
      await teacherSelect.selectOption(options[0]);
      await page.waitForTimeout(600);

      // Verify attendance banner in modal
      const bannerText = await page.locator('p.text-amber-800').first().innerText();
      console.log(`  Salary Modal Attendance Banner text: "${bannerText}"`);
      if (bannerText.includes('days in month') || bannerText.includes('present')) {
        console.log('  ✓ Salary modal displays dynamic calendar attendance');
      }
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_expenses_salary_modal_real_calendar.png') });

    // Close modal
    await page.click('button:has-text("Cancel")');

    console.log('\n[5/5] Live verification completed.');
  } catch (err) {
    console.error('Error during verification:', err);
    failures.push(err.message);
  } finally {
    await browser.close();
  }

  console.log('\n=== VERIFICATION SUMMARY ===');
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
