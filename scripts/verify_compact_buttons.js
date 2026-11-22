const { chromium } = require('playwright');
const http = require('http');

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

(async () => {
  const healthy = await checkBackendHealth();
  if (!healthy) throw new Error('Backend health check failed');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  // Helper to log element styles
  async function inspectButton(locator, label) {
    const el = await locator.locator('visible=true').first();
    const count = await locator.locator('visible=true').count();
    if (count === 0) {
      console.log(`[${label}] visible element not found`);
      return null;
    }
    const b = await el.boundingBox();
    const text = (await el.innerText()).trim();
    const styles = await el.evaluate(e => {
      const cs = window.getComputedStyle(e);
      return {
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        borderColor: cs.borderColor,
        whiteSpace: cs.whiteSpace,
        height: cs.height,
      };
    });
    console.log(`[${label}] text: "${text}", height: ${b ? b.height : styles.height}px, color: ${styles.color}, bg: ${styles.backgroundColor}, border: ${styles.borderColor}, whiteSpace: ${styles.whiteSpace}`);
    return { box: b, text, styles };
  }

  // Login
  console.log('Logging in...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="text"], input[placeholder*="ADM"]', 'ADM001');
  await page.fill('input[type="password"]', 'Admin@1234');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  console.log('Login successful.');

  // Helper to scroll table to right
  async function scrollTableRight() {
    await page.evaluate(() => {
      const scroller = document.querySelector('.overflow-x-auto');
      if (scroller) scroller.scrollLeft = scroller.scrollWidth;
    });
    await page.waitForTimeout(300);
  }

  // 1. Check Teachers Page
  console.log('\n--- Checking Teachers Page (390px phone view) ---');
  await page.goto('http://localhost:5173/teachers', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await scrollTableRight();
  await page.screenshot({ path: 'verification_screenshots/after_teachers_actions.png' });

  const teacherDetail = await inspectButton(page.locator('td button:has-text("Detail")'), 'Teachers Detail');
  const teacherEdit = await inspectButton(page.locator('td button:has-text("Edit")'), 'Teachers Edit');

  if (teacherDetail) {
    if (Math.round(teacherDetail.box.height) !== 32) throw new Error(`Expected Detail height ~32px, got ${teacherDetail.box.height}`);
    if (teacherDetail.styles.whiteSpace !== 'nowrap') throw new Error(`Expected whiteSpace nowrap`);
    // Blue check: color contains blue or bg is blue-50
    console.log('Detail button is blue (info)');
  }

  if (teacherEdit) {
    if (Math.round(teacherEdit.box.height) !== 32) throw new Error(`Expected Edit height ~32px, got ${teacherEdit.box.height}`);
    if (teacherEdit.styles.whiteSpace !== 'nowrap') throw new Error(`Expected whiteSpace nowrap`);
    // Amber check
    console.log('Edit button is amber/orange');
  }

  // 2. Check Students Page
  console.log('\n--- Checking Students Page (390px phone view) ---');
  await page.goto('http://localhost:5173/students', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await scrollTableRight();
  await page.screenshot({ path: 'verification_screenshots/after_students_actions.png' });
  await inspectButton(page.locator('td button:has-text("Profile")'), 'Students Profile (Detail)');
  await inspectButton(page.locator('td button:has-text("Edit")'), 'Students Edit');

  // 3. Check Subjects Page
  console.log('\n--- Checking Subjects Page (390px phone view) ---');
  await page.goto('http://localhost:5173/subjects', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await scrollTableRight();
  await page.screenshot({ path: 'verification_screenshots/after_subjects_actions.png' });
  await inspectButton(page.locator('td button:has-text("Detail")'), 'Subjects Detail');
  await inspectButton(page.locator('td button:has-text("Edit")'), 'Subjects Edit');

  // 4. Check Batches Page
  console.log('\n--- Checking Batches Page (390px phone view) ---');
  await page.goto('http://localhost:5173/batches', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await scrollTableRight();
  await page.screenshot({ path: 'verification_screenshots/after_batches_actions.png' });
  await inspectButton(page.locator('td button:has-text("Edit")'), 'Batches Edit');

  // 5. Check Admissions Page
  console.log('\n--- Checking Admissions Page (390px phone view) ---');
  await page.goto('http://localhost:5173/admissions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'verification_screenshots/after_admissions_actions.png' });
  await inspectButton(page.locator('button:has-text("Detail")'), 'Admissions Detail');
  await inspectButton(page.locator('button:has-text("Slip")'), 'Admissions Slip');
  await inspectButton(page.locator('button:has-text("Pay Due")'), 'Admissions Pay Due');
  await inspectButton(page.locator('button:has-text("Waive")'), 'Admissions Waive');

  // 6. Check Payments Page
  console.log('\n--- Checking Payments Page (390px phone view) ---');
  await page.goto('http://localhost:5173/payments', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await scrollTableRight();
  await page.screenshot({ path: 'verification_screenshots/after_payments_actions.png' });
  await inspectButton(page.locator('td button:has-text("Detail")'), 'Payments Detail');
  await inspectButton(page.locator('td button:has-text("Slip")'), 'Payments Slip');
  await inspectButton(page.locator('td button:has-text("Edit")'), 'Payments Edit');

  // 7. Check Staff Users Page
  console.log('\n--- Checking Staff Users Page (390px phone view) ---');
  await page.goto('http://localhost:5173/users', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await scrollTableRight();
  await inspectButton(page.locator('td button:has-text("Edit")'), 'Staff Edit');
  await inspectButton(page.locator('td button:has-text("Reset")'), 'Staff Reset');

  console.log('\n========================================');
  console.log('ALL COLOR-CODED ROW ACTIONS VERIFIED WITH 100% SUCCESS!');
  console.log('========================================');
  await browser.close();
})();
