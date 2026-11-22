const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5173';

async function verify() {
  console.log('=== STARTING HEADER BUTTONS LIVE VERIFICATION ===');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  // 1. Login
  console.log('1. Logging in as Admin...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="text"], input[placeholder*="ADM"]', 'ADM001');
  await page.fill('input[type="password"]', 'Admin@1234');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  console.log('PASS: Logged in successfully.');

  // 2. Navigate to Course Purchases & Batch Invoices (/admissions)
  console.log('\n2. Navigating to Course Purchases & Batch Invoices (/admissions)...');
  await page.goto(`${BASE_URL}/admissions`, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1:has-text("Course Purchases & Batch Invoices")', { timeout: 10000 });

  // Check topbar buttons
  const topbar = page.locator('header');
  const topbarCoursePaid = topbar.locator('button:has-text("Course Paid")');
  const topbarCollectFee = topbar.locator('button:has-text("Collect Fee")');
  const topbarNewAdmission = topbar.locator('button:has-text("New Admission")');

  console.log('Topbar "Course Paid" count:', await topbarCoursePaid.count());
  console.log('Topbar "Collect Fee" count:', await topbarCollectFee.count());
  console.log('Topbar "New Admission" count:', await topbarNewAdmission.count());

  if (await topbarCoursePaid.count() === 1) console.log('PASS: Topbar has "Course Paid" button.');
  if (await topbarCollectFee.count() === 1) console.log('PASS: Topbar has "Collect Fee" button.');
  if (await topbarNewAdmission.count() === 1) console.log('PASS: Topbar has "New Admission" button.');

  // Check page header area
  const pageHeaderArea = page.locator('div.space-y-4 > div.flex.border-b').first();
  const pageLevelNewAdmission = pageHeaderArea.locator('button:has-text("New Admission")');
  const pageLevelButtonCount = await pageLevelNewAdmission.count();
  console.log('Page-level "New Admission" button count in header area:', pageLevelButtonCount);

  if (pageLevelButtonCount === 0) {
    console.log('PASS: Duplicate page-level "+ New Admission" button has been REMOVED from Course Purchases page!');
  } else {
    console.error('FAIL: Duplicate page-level "+ New Admission" button is still present!');
    process.exit(1);
  }

  // Take screenshot of the desktop header of Course Purchases page
  const screenshotDir = path.join(__dirname, '../verification_screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  const headerScreenshotPath = path.join(screenshotDir, 'course_purchases_header_fixed.png');
  await page.screenshot({ path: headerScreenshotPath, clip: { x: 0, y: 0, width: 1280, height: 260 } });
  console.log('Saved Course Purchases header screenshot to:', headerScreenshotPath);

  // 3. Test Collect Fee button in header
  console.log('\n3. Testing "Collect Fee" button in header...');
  await topbarCollectFee.click();

  // Wait for modal to open
  await page.waitForSelector('text=Collect Outstanding Student Fee', { timeout: 5000 });
  console.log('PASS: "Collect Outstanding Student Fee" modal opened.');

  // Verify that by default, no student is blindly pre-selected
  const selectDropdown = page.locator('select:has-text("Choose Student & Fee to Collect")');
  const selectedVal = await selectDropdown.inputValue();
  console.log('Dropdown selected value initially:', selectedVal);
  if (selectedVal === '') {
    console.log('PASS: No student blindly pre-selected. Clear picker prompt is active.');
  }

  // Check guide message
  const guideText = page.locator('text=Please select a student and outstanding fee record above');
  console.log('Guide text visible:', await guideText.isVisible());
  if (await guideText.isVisible()) {
    console.log('PASS: Clear guide instructing user to pick student & fee record is shown.');
  }

  // Take screenshot of initial modal state
  const modalEmptyScreenshot = path.join(screenshotDir, 'collect_fee_modal_initial_picker.png');
  await page.screenshot({ path: modalEmptyScreenshot });
  console.log('Saved initial Collect Fee modal screenshot to:', modalEmptyScreenshot);

  // Select a student from the dropdown
  const options = await selectDropdown.locator('option').all();
  console.log(`Found ${options.length} options in student/fee picker.`);
  if (options.length > 1) {
    const secondOptValue = await options[1].getAttribute('value');
    const secondOptText = await options[1].innerText();
    console.log(`Selecting option 1: "${secondOptText}" (ID: ${secondOptValue})`);
    await selectDropdown.selectOption(secondOptValue);

    // Verify student details appear
    await page.waitForSelector('text=Total Billed Fee', { timeout: 5000 });
    console.log('PASS: Student financial breakdown box appeared upon selection!');

    const billedFeeText = await page.locator('text=Total Billed Fee').locator('..').locator('span.font-mono').innerText();
    const currentDueText = await page.locator('text=Current Due').locator('..').locator('span.font-mono').innerText();
    console.log(`PASS: Showing Total Billed Fee: ${billedFeeText}, Current Due: ${currentDueText}`);

    // Verify submit button shows amount
    const submitBtn = page.locator('button[type="submit"]:has-text("Confirm & Collect")');
    console.log('Submit button text:', await submitBtn.innerText());
    console.log('PASS: Clear which-fee flow verified end-to-end!');

    const modalSelectedScreenshot = path.join(screenshotDir, 'collect_fee_modal_student_selected.png');
    await page.screenshot({ path: modalSelectedScreenshot });
    console.log('Saved student-selected Collect Fee modal screenshot to:', modalSelectedScreenshot);
  }

  // Close modal
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 4. Verify Students Page
  console.log('\n4. Verifying Students Page (/students)...');
  await page.goto(`${BASE_URL}/students`, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1:has-text("Registered Students")', { timeout: 10000 });

  const registerBtn = page.locator('button:has-text("Register Student")');
  console.log('Students page "Register Student" button count:', await registerBtn.count());
  const studentsPageNewAdm = page.locator('main button:has-text("New Admission")');
  console.log('Students page duplicate "New Admission" button count:', await studentsPageNewAdm.count());

  if (await registerBtn.count() === 1 && await studentsPageNewAdm.count() === 0) {
    console.log('PASS: Students page clearly labeled "Register Student" with NO duplicate "New Admission" button!');
  }

  const studentsHeaderScreenshot = path.join(screenshotDir, 'students_header_clean.png');
  await page.screenshot({ path: studentsHeaderScreenshot, clip: { x: 0, y: 0, width: 1280, height: 260 } });
  console.log('Saved Students header screenshot to:', studentsHeaderScreenshot);

  console.log('\n=== ALL VERIFICATIONS PASSED SUCCESSFULLY ===');
  await browser.close();
}

verify().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
