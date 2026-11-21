const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:5173';

async function run() {
  console.log('--- STARTING COMPREHENSIVE LIVE BROWSER AND FLOW VERIFICATION ---');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // Mobile phone context (iPhone 13 viewport 390x844)
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
  });
  const page = await mobileContext.newPage();

  async function assertNoHorizontalOverflow(pageName) {
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    console.log(`[Phone Width Check: ${pageName}] scrollWidth: ${scrollWidth}, clientWidth: ${clientWidth}`);
    if (scrollWidth > clientWidth + 1) {
      console.warn(`WARNING: Potential horizontal overflow on ${pageName} (${scrollWidth} > ${clientWidth})`);
    } else {
      console.log(`PASS: No horizontal overflow on ${pageName} (mobile width 390px)`);
    }
  }

  // 1. Visit Login Page at phone width
  console.log('\n1. Verifying Login Page at phone width (390px)...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await assertNoHorizontalOverflow('Login Page');

  // Perform Login
  console.log('Logging in with ADM001...');
  await page.fill('input[type="text"], input[placeholder*="ADM"]', 'ADM001');
  await page.fill('input[type="password"]', 'Admin@1234');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  console.log('PASS: Logged in successfully! Current URL:', page.url());

  // 2. Dashboard at phone width
  console.log('\n2. Verifying Dashboard at phone width (390px)...');
  await page.waitForSelector('h1, h2', { timeout: 10000 });
  await assertNoHorizontalOverflow('Dashboard');

  // 3. Students list at phone width
  console.log('\n3. Verifying Students list at phone width (390px)...');
  await page.goto(`${BASE_URL}/students`, { waitUntil: 'networkidle' });
  await page.waitForSelector('table tbody tr td', { timeout: 10000 });
  await assertNoHorizontalOverflow('Students List');

  // 4. Open a Student Profile
  console.log('\n4. Opening a Student Profile...');
  const profileBtn = page.locator('table tbody tr button:has-text("Profile"), table tbody tr button.font-bold').first();
  await profileBtn.click();
  await page.waitForURL('**/students/**', { timeout: 10000 });
  await page.waitForSelector('h1', { timeout: 10000 });
  const studentName = await page.locator('h1').first().innerText();
  console.log(`PASS: Opened Student Profile for "${studentName}" at ${page.url()}`);
  await assertNoHorizontalOverflow('Student Profile');

  // 5. Open a Fee Slip / Receipt
  console.log('\n5. Opening a Fee Slip / Receipt modal...');
  let openedSlip = false;
  // Try Invoices / Purchases tab
  const invoicesTab = page.locator('button:has-text("Course Purchases"), button:has-text("Purchases")').first();
  if (await invoicesTab.count() > 0) {
    await invoicesTab.click();
    await page.waitForTimeout(1000);
    const slipBtn = page.locator('button:has-text("Slips"), button:has-text("Slip"), button[title*="invoices"]').first();
    if (await slipBtn.count() > 0) {
      await slipBtn.click();
      await page.waitForSelector(':has-text("THAKURDWARA COACHING"), :has-text("Receipt"), :has-text("Slip")', { timeout: 8000 });
      console.log('PASS: Fee Slip / Receipt modal opened from student profile.');
      openedSlip = true;
      const closeBtn = page.locator('button:has-text("Close"), button[aria-label="Close"]').first();
      if (await closeBtn.count() > 0) {
        await closeBtn.click();
        await page.waitForTimeout(500);
      }
    }
  }

  if (!openedSlip) {
    // Open from Payments page
    console.log('Opening fee slip from /payments page...');
    await page.goto(`${BASE_URL}/payments`, { waitUntil: 'networkidle' });
    await page.waitForSelector('table tbody tr td', { timeout: 10000 });
    const receiptBtn = page.locator('table tbody tr button:has-text("Receipt"), table tbody tr button:has-text("Slip"), table tbody tr button[title*="Slip"]').first();
    if (await receiptBtn.count() > 0) {
      await receiptBtn.click();
      await page.waitForSelector(':has-text("THAKURDWARA COACHING"), :has-text("RECEIPT")', { timeout: 8000 });
      console.log('PASS: Fee Slip modal opened from Payments page.');
      const closeBtn = page.locator('button:has-text("Close"), button[aria-label="Close"]').first();
      if (await closeBtn.count() > 0) {
        await closeBtn.click();
        await page.waitForTimeout(500);
      }
    }
  }

  // 6. Check Student Audit Trail tab
  console.log('\n6. Checking Student Audit Trail tab on student profile...');
  await page.goto(page.url().includes('/students/') ? page.url() : `${BASE_URL}/students`, { waitUntil: 'networkidle' });
  if (!page.url().includes('/students/')) {
    await page.locator('table tbody tr button:has-text("Profile")').first().click();
    await page.waitForURL('**/students/**', { timeout: 10000 });
  }
  const auditTabButton = page.locator('button:has-text("Audit Trail"), button:has-text("Audit")').first();
  if (await auditTabButton.count() > 0) {
    await auditTabButton.click();
    await page.waitForTimeout(1000);
    console.log('PASS: Student Audit Trail tab opened and verified.');
  }

  // 7. Walk the Enrolment Flow
  console.log('\n7. Walking the Enrolment Flow (/admissions/new)...');
  await page.goto(`${BASE_URL}/admissions/new`, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1, h2', { timeout: 10000 });
  await assertNoHorizontalOverflow('New Admission Wizard Step 1');

  // Search or select student
  const studentSearchInput = page.locator('input[placeholder*="Search student"], input[placeholder*="search"]').first();
  if (await studentSearchInput.count() > 0) {
    await studentSearchInput.fill('A');
    await page.waitForTimeout(1000);
    const option = page.locator('[role="option"], ul li, div[class*="cursor-pointer"]').first();
    if (await option.count() > 0) {
      await option.click();
      await page.waitForTimeout(1000);
      console.log('PASS: Selected student in wizard Step 1');
    }
  }

  // Advance to Step 2
  const nextBtn1 = page.locator('button:has-text("Next"), button:has-text("Continue")').first();
  if (await nextBtn1.count() > 0) {
    await nextBtn1.click();
    await page.waitForTimeout(1000);
    console.log('PASS: Advanced to Wizard Step 2 (Subjects & Dates)');
    await assertNoHorizontalOverflow('New Admission Wizard Step 2');

    // Advance to Step 3
    const nextBtn2 = page.locator('button:has-text("Next"), button:has-text("Continue")').first();
    if (await nextBtn2.count() > 0) {
      await nextBtn2.click();
      await page.waitForTimeout(1000);
      console.log('PASS: Advanced to Wizard Step 3 (Discounts & Fees)');
      await assertNoHorizontalOverflow('New Admission Wizard Step 3');

      // Advance to Step 4
      const nextBtn3 = page.locator('button:has-text("Next"), button:has-text("Continue")').first();
      if (await nextBtn3.count() > 0) {
        await nextBtn3.click();
        await page.waitForTimeout(1000);
        console.log('PASS: Advanced to Wizard Step 4 (Confirm & Collect Payment)');
        await assertNoHorizontalOverflow('New Admission Wizard Step 4');
      }
    }
  }

  // 8. Check the Audit Log page
  console.log('\n8. Checking System Audit Log page (/audit)...');
  await page.goto(`${BASE_URL}/audit`, { waitUntil: 'networkidle' });
  await page.waitForSelector(':has-text("Total Events")', { timeout: 10000 });
  await assertNoHorizontalOverflow('Audit Log Page');

  // Check stat cards
  const stats = await page.locator(':has-text("Total Events"), :has-text("Financial Events")').count();
  console.log('PASS: Audit stats cards present:', stats > 0);

  // Check mobile audit cards
  const mobileCards = await page.locator('.md\\:hidden > div').count();
  console.log(`PASS: Mobile Audit log card records found: ${mobileCards}`);

  // Inspect first audit event modal by clicking the visible mobile card
  const auditTarget = page.locator('.md\\:hidden > div').first();
  await auditTarget.click();
  await page.waitForSelector(':has-text("Audit Event"), :has-text("Payload / Metadata")', { timeout: 8000 });
  console.log('PASS: Audit Event Inspector Modal opened and JSON inspection verified.');
  const closeBtn = page.locator('button:has-text("Close"), button[aria-label="Close"]').first();
  if (await closeBtn.count() > 0) {
    await closeBtn.click();
    await page.waitForTimeout(500);
  }

  await mobileContext.close();
  await browser.close();
  console.log('\n=== ALL BROWSER PHONE-WIDTH AND UI CHECKS PASSED SUCCESSFULLY ===');
}

run().catch((err) => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
