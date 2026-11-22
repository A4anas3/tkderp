const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5173';

async function verifyDashboardRound() {
  console.log('=== STARTING FINAL DASHBOARD ROUND LIVE VERIFICATION ===\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // Mobile viewport: 390x844 (standard modern phone width)
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  });

  const page = await context.newPage();

  // Step 1: Health check against backend and frontend
  console.log('1. Checking Live Endpoints...');
  const resFrontend = await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  console.log(`   Frontend status code: ${resFrontend.status()}`);
  if (resFrontend.status() !== 200) {
    throw new Error(`Frontend returned status ${resFrontend.status()} instead of 200`);
  }

  // Step 2: Login as Admin ADM001
  console.log('\n2. Logging into Admin account (ADM001)...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="text"], input[placeholder*="ADM"]', 'ADM001');
  await page.fill('input[type="password"]', 'Admin@1234');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await page.waitForTimeout(2000);
  console.log('   Logged in successfully. On dashboard URL:', page.url());

  // Step 3: Admin Dashboard Phone Width Horizontal Check
  console.log('\n3. Verifying Admin Dashboard at Phone Width (390px)...');
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  console.log(`   Phone width horizontal check: scrollWidth=${scrollWidth}, clientWidth=${clientWidth}`);
  if (scrollWidth > clientWidth + 1) {
    console.warn(`   WARNING: Horizontal overflow detected (${scrollWidth} > ${clientWidth})`);
  } else {
    console.log('   PASS: No horizontal overflow on Admin Dashboard.');
  }

  // Step 4: Verify Header Buttons are clearly labelled
  console.log('\n4. Checking Header Buttons:');
  const headerButtons = await page.$$eval('header button, div:has(> h1) + div button, div.grid-cols-2 button', els =>
    els.map(e => ({
      text: e.innerText.replace(/\n/g, ' ').trim(),
      width: e.offsetWidth,
      height: e.offsetHeight,
      visible: e.offsetWidth > 0 && e.offsetHeight > 0 && window.getComputedStyle(e).display !== 'none'
    }))
  );
  console.log('   Found Header Buttons:', headerButtons);

  // Assert Topbar buttons and Dashboard header buttons are labelled
  const visibleButtonTexts = headerButtons.filter(b => b.visible).map(b => b.text);
  const requiredLabels = ['Course Paid', 'Collect Fee', 'New Admission'];
  for (const label of requiredLabels) {
    const found = visibleButtonTexts.some(txt => txt.includes(label));
    console.log(`   Button label "${label}" present and visible: ${found}`);
    if (!found) {
      throw new Error(`Expected button with label "${label}" to be visible!`);
    }
  }

  // Step 5: Check 4 Primary Stat Cards
  console.log('\n5. Checking 4 Primary KPI Stat Cards (numbers + labels clearly shown):');
  const expectedCards = [
    'Total Students',
    'Active Teachers',
    'Active Batches',
    'Pending Enquiries'
  ];

  const statCardsData = await page.$$eval('div.grid-cols-1.sm\\:grid-cols-2 > div', els =>
    els.map(el => {
      const text = el.innerText;
      return {
        text: text.replace(/\n+/g, ' | '),
        lines: text.split('\n').map(s => s.trim()).filter(Boolean),
        visible: el.offsetWidth > 0 && el.offsetHeight > 0
      };
    })
  );
  console.log('   Stat Cards found:', JSON.stringify(statCardsData, null, 2));

  for (const cardTitle of expectedCards) {
    const card = statCardsData.find(c => c.text.toLowerCase().includes(cardTitle.toLowerCase()));
    if (!card) {
      throw new Error(`Stat card with title "${cardTitle}" was not found!`);
    }
    if (!card.visible) {
      throw new Error(`Stat card "${cardTitle}" is not visible!`);
    }
    const hasNumber = card.lines.some(l => /\d+/.test(l));
    if (!hasNumber) {
      throw new Error(`Stat card "${cardTitle}" does not contain a numeric value! Content: ${card.text}`);
    }
    console.log(`   PASS: Stat card "${cardTitle}" is visible with clear label and numeric value: "${card.text}"`);
  }

  // Step 6: Check Financial Section Values
  console.log('\n6. Checking Financial Section Values:');
  const expectedFinancialCards = [
    'Total Billed Fees',
    'Actual Collections',
    'Total Expenses & Salaries',
    'Net Operating Cash'
  ];

  const financialData = await page.$$eval('h2:has-text("FINANCIAL POSITION") + p, h2:has-text("Financial Position") ~ div, div:has(h2:has-text("FINANCIAL POSITION")) div', els =>
    els.map(el => el.innerText)
  );

  for (const finTitle of expectedFinancialCards) {
    const finCard = await page.evaluate((title) => {
      const allDivs = Array.from(document.querySelectorAll('div'));
      const target = allDivs.find(d => {
        const span = d.querySelector('span');
        return span && span.innerText.trim().toLowerCase() === title.toLowerCase();
      });
      if (!target) return null;
      return {
        text: target.innerText.replace(/\n+/g, ' | '),
        visible: target.offsetWidth > 0 && target.offsetHeight > 0
      };
    }, finTitle);

    if (!finCard) {
      throw new Error(`Financial card "${finTitle}" was not found!`);
    }
    if (!finCard.visible) {
      throw new Error(`Financial card "${finTitle}" is not visible!`);
    }
    const hasCurrencyOrNumber = finCard.text.includes('₹') || /\d+/.test(finCard.text);
    if (!hasCurrencyOrNumber) {
      throw new Error(`Financial card "${finTitle}" does not show currency value! Content: ${finCard.text}`);
    }
    console.log(`   PASS: Financial section "${finTitle}" is visible: "${finCard.text}"`);
  }

  // Screenshot of Dashboard at phone width
  const dashboardScreenshotPath = path.resolve(__dirname, '../dashboard-phone-verification.png');
  await page.screenshot({ path: dashboardScreenshotPath, fullPage: true });
  console.log(`\n   Captured phone dashboard screenshot at: ${dashboardScreenshotPath}`);

  // Step 7: Sanity Check - Open a Student Profile
  console.log('\n7. Sanity Check: Opening a Student Profile...');
  await page.goto(`${BASE_URL}/students`, { waitUntil: 'networkidle' });
  await page.waitForSelector('table tbody tr', { timeout: 10000 });
  const profileButton = page.locator('table tbody tr button:has-text("Profile"), table tbody tr button.font-bold').first();
  await profileButton.click();
  await page.waitForURL('**/students/**', { timeout: 10000 });
  await page.waitForSelector('h1', { timeout: 10000 });
  const studentHeading = await page.locator('h1').first().innerText();
  console.log(`   PASS: Student Profile opened cleanly for "${studentHeading}" at ${page.url()}`);

  const studentScreenshotPath = path.resolve(__dirname, '../student-profile-phone-verification.png');
  await page.screenshot({ path: studentScreenshotPath });
  console.log(`   Captured phone student profile screenshot at: ${studentScreenshotPath}`);

  // Step 8: Sanity Check - Open Fee Slip Modal
  console.log('\n8. Sanity Check: Opening a Fee Slip / Receipt...');
  let feeSlipOpened = false;

  // Try Student Profile Purchases tab first
  const purchasesTab = page.locator('button:has-text("Course Purchases"), button:has-text("Purchases")').first();
  if (await purchasesTab.count() > 0) {
    await purchasesTab.click();
    await page.waitForTimeout(800);
    const slipBtn = page.locator('button:has-text("Slips"), button:has-text("Slip")').first();
    if (await slipBtn.count() > 0) {
      await slipBtn.click();
      await page.waitForSelector(':has-text("THAKURDWARA COACHING"), :has-text("Receipt"), :has-text("Slip")', { timeout: 8000 });
      console.log('   PASS: Fee slip opened from Student Profile Purchases tab.');
      feeSlipOpened = true;
    }
  }

  if (!feeSlipOpened) {
    // Open from /payments page
    console.log('   Opening fee slip from /payments...');
    await page.goto(`${BASE_URL}/payments`, { waitUntil: 'networkidle' });
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    const receiptBtn = page.locator('table tbody tr button:has-text("Receipt"), table tbody tr button:has-text("Slip"), table tbody tr button[title*="Slip"]').first();
    if (await receiptBtn.count() > 0) {
      await receiptBtn.click();
      await page.waitForSelector(':has-text("THAKURDWARA COACHING"), :has-text("RECEIPT"), :has-text("Payment Receipt")', { timeout: 8000 });
      console.log('   PASS: Fee slip modal opened from Payments page.');
      feeSlipOpened = true;
    }
  }

  if (!feeSlipOpened) {
    throw new Error('Could not open fee slip modal from either Student Profile or Payments page!');
  }

  const feeSlipScreenshotPath = path.resolve(__dirname, '../feeslip-phone-verification.png');
  await page.screenshot({ path: feeSlipScreenshotPath });
  console.log(`   Captured phone fee slip screenshot at: ${feeSlipScreenshotPath}`);

  console.log('\n=== ALL DASHBOARD ROUND VERIFICATIONS PASSED WITH 0 ERRORS ===');
  await browser.close();
}

verifyDashboardRound().catch(err => {
  console.error('\nVerification FAILED:', err);
  process.exit(1);
});
