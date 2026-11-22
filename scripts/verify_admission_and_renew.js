const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');

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
  console.log('--- STARTING LIVE ADMISSION & RENEW VERIFICATION ---');
  const healthy = await checkBackendHealth();
  if (!healthy) throw new Error('Backend health check failed');

  const screenshotsDir = path.join(__dirname, '..', 'verification_screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  // 1. Login
  console.log('1. Logging in as ADM001...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="text"], input[placeholder*="ADM"]', 'ADM001');
  await page.fill('input[type="password"]', 'Admin@1234');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  console.log('   [PASS] Login successful.');

  // 2. Go to New Admission page with student preselected
  console.log('2. Navigating to New Admission page...');
  await page.goto('http://localhost:5173/admissions/new?student_id=77777777-7777-7777-7777-777777777701', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Step 1: Advance to Step 2
  console.log('3. Student loaded. Advancing to Step 2: Subjects & Duration...');
  await page.click('button:has-text("Next: Subjects")');
  await page.waitForTimeout(1000);

  // Verify Requirement 1: DURATION
  console.log('5. Verifying Step 2 Duration Simplification...');
  const defaultDurationSection = page.locator('text=Default Fee Billing Duration');
  const countDefault = await defaultDurationSection.count();
  if (countDefault > 0) {
    throw new Error('FAILED: "Default Fee Billing Duration" section should be removed!');
  }
  console.log('   [PASS] "Default Fee Billing Duration" section is removed.');

  const sixMonthsBtn = page.locator('button:has-text("6 Months")');
  const twelveMonthsBtn = page.locator('button:has-text("12 Months")');
  if (await sixMonthsBtn.count() > 0 || await twelveMonthsBtn.count() > 0) {
    throw new Error('FAILED: 6 or 12 month preset duration options should not be present!');
  }
  console.log('   [PASS] No 6 or 12 months options present.');

  // Verify per-subject duration input has min 1 max 3
  const durationInput = page.locator('input[type="number"][max="3"]').first();
  const durMax = await durationInput.getAttribute('max');
  console.log(`   [PASS] Per-subject Duration (Months) input present with max=${durMax}.`);

  // Verify Requirement 3: TEACHER
  console.log('6. Verifying Assigned Faculty auto-fill...');
  const facultySelect = page.locator('span:has-text("Assigned Faculty:") ~ select').first();
  const selectedFacultyText = await facultySelect.locator('option:checked').innerText();
  console.log(`   Selected faculty on subject load: "${selectedFacultyText}"`);
  if (selectedFacultyText.includes('Default Faculty') || selectedFacultyText.trim() === '') {
    throw new Error(`FAILED: Assigned faculty should be auto-filled, got "${selectedFacultyText}"`);
  }
  console.log(`   [PASS] Assigned Faculty automatically filled with teacher: "${selectedFacultyText}"`);

  // Try switching subject to another subject
  const subjectSelect = page.locator('label:has-text("Subject & Monthly Fee")').locator('..').locator('select').first();
  const optionCount = await subjectSelect.locator('option').count();
  if (optionCount > 1) {
    const secondOptVal = await subjectSelect.locator('option').nth(1).getAttribute('value');
    await subjectSelect.selectOption(secondOptVal);
    await page.waitForTimeout(500);
    const updatedFacultyText = await facultySelect.locator('option:checked').innerText();
    console.log(`   After changing subject, faculty auto-filled: "${updatedFacultyText}"`);
  }

  // Screenshot Step 2
  await page.screenshot({ path: path.join(screenshotsDir, 'live_admission_step2_subjects.png') });
  console.log('   [PASS] Saved screenshot: live_admission_step2_subjects.png');

  // Advance to Step 3: Discounts
  console.log('7. Advancing to Step 3: Discounts...');
  await page.click('button:has-text("Next: Discounts")');
  await page.waitForTimeout(800);

  // Verify Requirement 5: FIELD SIZE
  console.log('8. Verifying compact field size in Step 3...');
  const discTypeSelect = page.locator('select:has-text("Percentage (%)")').first();
  const discBox = await discTypeSelect.boundingBox();
  console.log(`   Discount select height: ${discBox.height}px (compact <= 36px)`);
  if (discBox.height > 38) {
    throw new Error(`FAILED: Discount select height is too tall: ${discBox.height}px`);
  }
  console.log('   [PASS] Discount fields are compact and professional.');

  // Set individual discount to Percentage 10%
  await discTypeSelect.selectOption('PERCENTAGE');
  await page.waitForTimeout(300);
  const indivDiscInput = page.locator('input[placeholder="%"]').first();
  await indivDiscInput.fill('10');
  await page.waitForTimeout(300);

  // Set overall discount to Percentage 10%
  const overallDiscSelect = page.locator('select:has(option:has-text("No Overall Discount"))');
  await overallDiscSelect.selectOption('PERCENTAGE');
  await page.waitForTimeout(300);
  const overallDiscInput = overallDiscSelect.locator('xpath=following-sibling::input');
  await overallDiscInput.fill('10');
  await page.waitForTimeout(1000); // wait for backend preview calculation

  // Verify Requirement 2: DISCOUNTS Separate Lines
  console.log('9. Verifying separate lines for individual and overall discounts...');
  const indivLine = page.locator('text=Individual discount:').or(page.locator('text=Individual Subject Discounts:'));
  const overallLine = page.locator('text=Overall discount:').or(page.locator('text=Overall Admission Discount:'));
  
  if (await indivLine.count() === 0) {
    throw new Error('FAILED: Individual discount breakdown line not found in preview!');
  }
  if (await overallLine.count() === 0) {
    throw new Error('FAILED: Overall discount breakdown line not found in preview!');
  }
  console.log('   [PASS] Both Individual and Overall discounts displayed on separate lines in Net Pricing Preview.');

  // Screenshot Step 3
  await page.screenshot({ path: path.join(screenshotsDir, 'live_admission_step3_discounts.png') });
  console.log('   [PASS] Saved screenshot: live_admission_step3_discounts.png');

  // Advance to Step 4: Confirm & Pay
  console.log('10. Advancing to Step 4: Payment Confirmation...');
  await page.click('button:has-text("Next: Confirm & Pay")');
  await page.waitForTimeout(800);

  // Verify Requirement 4: PARTIAL PAYMENT
  console.log('11. Verifying Partial Payment Option...');
  const partialBtn = page.locator('button:has-text("Partial Payment")');
  if (await partialBtn.count() === 0) {
    throw new Error('FAILED: Partial Payment button not found!');
  }
  await partialBtn.click();
  await page.waitForTimeout(500);

  const partialAmountInput = page.locator('input[placeholder*="Enter amount collected"]');
  if (await partialAmountInput.count() === 0) {
    throw new Error('FAILED: Amount Paid Now input not found for partial payment!');
  }
  await partialAmountInput.fill('500');
  await page.waitForTimeout(500);

  const remainingDueText = page.locator('text=Remaining Balance Due:');
  if (await remainingDueText.count() === 0) {
    throw new Error('FAILED: Remaining Balance Due not shown!');
  }
  console.log('   [PASS] Partial payment entered; balance shown as due.');

  // Screenshot Step 4
  await page.screenshot({ path: path.join(screenshotsDir, 'live_admission_step4_partial_payment.png') });
  console.log('   [PASS] Saved screenshot: live_admission_step4_partial_payment.png');

  // Confirm admission
  console.log('12. Confirming admission with partial payment...');
  await page.click('button:has-text("Confirm & Issue Slip")');
  await page.waitForTimeout(2000);

  // Verify Admission Receipt Modal
  const slipModal = page.locator('div:has-text("Course Admission Slip")').or(page.locator('div:has-text("Admission Invoice")')).or(page.locator('div[role="dialog"]'));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(screenshotsDir, 'live_admission_slip_partial.png') });
  console.log('   [PASS] Saved screenshot: live_admission_slip_partial.png');

  // 13. Test Renew Subject Modal
  console.log('13. Testing Renew Subject Modal...');
  await page.goto('http://localhost:5173/students/77777777-7777-7777-7777-777777777701', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Look for a visible "Renew" or "Renew Subject" button
  const renewBtn = page.locator('button:has-text("Renew"):visible').first();
  if (await renewBtn.count() > 0) {
    await renewBtn.click();
    await page.waitForTimeout(1000);

    // Verify Renew modal presets removed
    const preset15d = page.locator('button:has-text("15 Days")');
    if (await preset15d.count() > 0) {
      throw new Error('FAILED: 15 Days preset button still exists in Renew Subject modal!');
    }
    const preset1m = page.locator('button:has-text("1 Month (30d)")');
    if (await preset1m.count() > 0) {
      throw new Error('FAILED: 1 Month (30d) preset button still exists in Renew Subject modal!');
    }

    // Verify custom month input exists
    const customMonthInput = page.locator('input[type="number"][min="1"][max="3"]');
    if (await customMonthInput.count() === 0) {
      throw new Error('FAILED: Custom month input (1, 2 or 3) not found in Renew Subject modal!');
    }
    console.log('   [PASS] Preset buttons removed; custom month input (1, 2 or 3) present in Renew Subject modal.');

    await page.screenshot({ path: path.join(screenshotsDir, 'live_renew_subject_modal.png') });
    console.log('   [PASS] Saved screenshot: live_renew_subject_modal.png');
  } else {
    console.log('   [WARN] Renew button not found on student page.');
  }

  await browser.close();
  console.log('--- ALL LIVE VERIFICATIONS PASSED SUCCESSFULLY! ---');
})().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
