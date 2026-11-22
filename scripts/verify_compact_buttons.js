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
  console.log('\n--- Checking Teachers Page (390px) ---');
  await page.goto('http://localhost:5173/teachers', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const addTeacherBtn = await page.locator('button:has-text("Add Teacher")').first();
  const addTeacherBox = await addTeacherBtn.boundingBox();
  console.log('Add Teacher button height:', addTeacherBox.height, 'width:', addTeacherBox.width);
  if (Math.round(addTeacherBox.height) !== 36) {
    throw new Error(`Expected Add Teacher height ~36px, got ${addTeacherBox.height}`);
  }

  await scrollTableRight();
  await page.screenshot({ path: 'verification_screenshots/after_teachers_actions.png' });

  const detailButtons = await page.locator('td button:has-text("Detail")').all();
  const editButtons = await page.locator('td button:has-text("Edit")').all();
  console.log(`Teachers Page: ${detailButtons.length} Detail buttons, ${editButtons.length} Edit buttons`);

  if (detailButtons.length > 0) {
    const dBox = await detailButtons[0].boundingBox();
    const dText = (await detailButtons[0].innerText()).trim();
    const dWhiteSpace = await detailButtons[0].evaluate(el => window.getComputedStyle(el).whiteSpace);
    console.log(`Detail button: height = ${dBox.height}, width = ${dBox.width}, text = "${dText}", whiteSpace = ${dWhiteSpace}`);
    if (Math.round(dBox.height) !== 32) throw new Error(`Expected Detail height ~32px, got ${dBox.height}`);
    if (dText !== 'Detail') throw new Error(`Expected text "Detail" without wrapped arrow, got "${dText}"`);
    if (dWhiteSpace !== 'nowrap') throw new Error(`Expected whiteSpace nowrap, got ${dWhiteSpace}`);
  }

  if (editButtons.length > 0) {
    const eBox = await editButtons[0].boundingBox();
    const eText = (await editButtons[0].innerText()).trim();
    const eWhiteSpace = await editButtons[0].evaluate(el => window.getComputedStyle(el).whiteSpace);
    console.log(`Edit button: height = ${eBox.height}, width = ${eBox.width}, text = "${eText}", whiteSpace = ${eWhiteSpace}`);
    if (Math.round(eBox.height) !== 32) throw new Error(`Expected Edit height ~32px, got ${eBox.height}`);
    if (eText !== 'Edit') throw new Error(`Expected text "Edit", got "${eText}"`);
    if (eWhiteSpace !== 'nowrap') throw new Error(`Expected whiteSpace nowrap, got ${eWhiteSpace}`);
  }

  // 2. Check Students Page
  console.log('\n--- Checking Students Page (390px) ---');
  await page.goto('http://localhost:5173/students', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await scrollTableRight();
  await page.screenshot({ path: 'verification_screenshots/after_students_actions.png' });
  const studentEditBtn = await page.locator('td button:has-text("Edit")').first();
  if (studentEditBtn) {
    const b = await studentEditBtn.boundingBox();
    const ws = await studentEditBtn.evaluate(el => window.getComputedStyle(el).whiteSpace);
    console.log(`Students Edit button: height = ${b.height}, width = ${b.width}, whiteSpace = ${ws}`);
    if (Math.round(b.height) !== 32) throw new Error(`Expected Students Edit height ~32px, got ${b.height}`);
  }

  // 3. Check Subjects Page
  console.log('\n--- Checking Subjects Page (390px) ---');
  await page.goto('http://localhost:5173/subjects', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await scrollTableRight();
  await page.screenshot({ path: 'verification_screenshots/after_subjects_actions.png' });
  const subjectDetailBtn = await page.locator('td button:has-text("Detail")').first();
  if (subjectDetailBtn) {
    const b = await subjectDetailBtn.boundingBox();
    const text = (await subjectDetailBtn.innerText()).trim();
    const ws = await subjectDetailBtn.evaluate(el => window.getComputedStyle(el).whiteSpace);
    console.log(`Subjects Detail button: height = ${b.height}, width = ${b.width}, text = "${text}", whiteSpace = ${ws}`);
    if (Math.round(b.height) !== 32) throw new Error(`Expected Subjects Detail height ~32px, got ${b.height}`);
    if (text !== 'Detail') throw new Error(`Expected text "Detail", got "${text}"`);
  }

  // 4. Check Batches Page
  console.log('\n--- Checking Batches Page (390px) ---');
  await page.goto('http://localhost:5173/batches', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await scrollTableRight();
  await page.screenshot({ path: 'verification_screenshots/after_batches_actions.png' });
  const batchEditBtn = await page.locator('td button:has-text("Edit")').first();
  if (batchEditBtn) {
    const b = await batchEditBtn.boundingBox();
    const ws = await batchEditBtn.evaluate(el => window.getComputedStyle(el).whiteSpace);
    console.log(`Batches Edit button: height = ${b.height}, width = ${b.width}, whiteSpace = ${ws}`);
    if (Math.round(b.height) !== 32) throw new Error(`Expected Batches Edit height ~32px, got ${b.height}`);
  }

  // 5. Check Admissions Page
  console.log('\n--- Checking Admissions Page (390px) ---');
  await page.goto('http://localhost:5173/admissions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'verification_screenshots/after_admissions_actions.png' });
  const admDetailBtn = await page.locator('button:has-text("Detail")').first();
  if (admDetailBtn) {
    const b = await admDetailBtn.boundingBox();
    const text = (await admDetailBtn.innerText()).trim();
    const ws = await admDetailBtn.evaluate(el => window.getComputedStyle(el).whiteSpace);
    console.log(`Admissions Detail button: height = ${b.height}, width = ${b.width}, text = "${text}", whiteSpace = ${ws}`);
    if (Math.round(b.height) !== 32) throw new Error(`Expected Admissions Detail height ~32px, got ${b.height}`);
    if (text !== 'Detail') throw new Error(`Expected text "Detail", got "${text}"`);
  }

  // 6. Check Payments Page
  console.log('\n--- Checking Payments Page (390px) ---');
  await page.goto('http://localhost:5173/payments', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await scrollTableRight();
  await page.screenshot({ path: 'verification_screenshots/after_payments_actions.png' });
  const paymentDetailBtn = await page.locator('td button:has-text("Detail")').first();
  if (paymentDetailBtn) {
    const b = await paymentDetailBtn.boundingBox();
    const text = (await paymentDetailBtn.innerText()).trim();
    const ws = await paymentDetailBtn.evaluate(el => window.getComputedStyle(el).whiteSpace);
    console.log(`Payments Detail button: height = ${b.height}, width = ${b.width}, text = "${text}", whiteSpace = ${ws}`);
    if (Math.round(b.height) !== 32) throw new Error(`Expected Payments Detail height ~32px, got ${b.height}`);
    if (text !== 'Detail') throw new Error(`Expected text "Detail", got "${text}"`);
  }

  console.log('\n========================================');
  console.log('ALL VERIFICATIONS PASSED WITH 100% SUCCESS!');
  console.log('========================================');
  await browser.close();
})();
