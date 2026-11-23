const { chromium } = require('/home/ubuntu/antigravity/profiles/a4anaskhanshab_at_gmail_com/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  console.log('--- Step 1: Login ---');
  await page.goto('http://localhost:5173/login');
  await page.waitForLoadState('networkidle');

  // Fast One-Click Demo Access
  const adminBtn = await page.$('button:has-text("Admin")');
  if (adminBtn) {
    await adminBtn.click();
    await page.waitForTimeout(200);
  }
  await page.click('button:has-text("Sign In")');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  await page.waitForLoadState('networkidle');
  console.log('Login successful, on dashboard');

  // Helper to check for the word 'batch' on the page
  const checkPageForBatch = async (pageName) => {
    const text = await page.innerText('body');
    // Regex for whole word 'batch' or 'batches' case-insensitive
    const matches = text.match(/\b(batch|batches)\b/gi);
    if (matches && matches.length > 0) {
      console.error(`FAILED: ${pageName} contains batch words:`, matches);
      throw new Error(`${pageName} contains batch text!`);
    } else {
      console.log(`PASSED: ${pageName} has NO batch text`);
    }
  };

  console.log('--- Step 2: Admin Dashboard ---');
  await page.waitForTimeout(1000);
  await checkPageForBatch('Admin Dashboard');

  console.log('--- Step 3: Check Topbar & Coaching Apps Modal ---');
  // Check Topbar nav links
  const navText = await page.innerText('nav, header');
  if (/\b(batch|batches)\b/i.test(navText)) {
    throw new Error('Topbar contains batch link!');
  }
  console.log('PASSED: Topbar has no batch link');

  // Open App launcher modal
  const appLauncherBtn = await page.$('button[title*="Apps"], button[aria-label*="Apps"], button:has(svg.lucide-layout-grid)');
  if (appLauncherBtn) {
    await appLauncherBtn.click();
    await page.waitForTimeout(500);
    const modalText = await page.innerText('body');
    if (/\b(batch|batches)\b/i.test(modalText)) {
      throw new Error('Coaching ERP Apps Modal contains Batches tile!');
    }
    console.log('PASSED: Coaching Apps Modal has NO Batches tile');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  console.log('--- Step 4: Verify Direct /batches Route Redirects ---');
  await page.goto('http://localhost:5173/batches');
  await page.waitForTimeout(1000);
  const currentUrl = page.url();
  console.log('URL when visiting /batches:', currentUrl);
  if (currentUrl.endsWith('/batches')) {
    throw new Error('/batches route still exists!');
  }
  console.log('PASSED: /batches correctly redirected to:', currentUrl);

  console.log('--- Step 5: Subjects Page & Subject Detail ---');
  await page.goto('http://localhost:5173/subjects');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await checkPageForBatch('Subjects Page');

  // Click first subject
  const firstSubjectLink = await page.$('tbody tr td a, tbody tr td button');
  if (firstSubjectLink) {
    await firstSubjectLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await checkPageForBatch('Subject Detail Page');
    // Check fee breakup tab
    const breakupTab = await page.$('button:has-text("Breakup"), button:has-text("Ledger")');
    if (breakupTab) {
      await breakupTab.click();
      await page.waitForTimeout(500);
      await checkPageForBatch('Subject Detail - Breakup Tab');
    }
  }

  console.log('--- Step 6: Reports Page ---');
  await page.goto('http://localhost:5173/reports');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await checkPageForBatch('Reports Hub Page');

  // Verify tabs count
  const reportTabs = await page.$$eval('div[role="tablist"] button, .overflow-x-auto button', buttons => 
    buttons.map(b => b.innerText.trim()).filter(t => t.length > 0)
  );
  console.log('Visible report tabs:', reportTabs.slice(0, 12));
  if (reportTabs.some(t => /\bbatch\b/i.test(t))) {
    throw new Error('Reports page contains Batch tab!');
  }
  console.log('PASSED: No Batch tab in Reports');

  // Dues & Ageing report
  const duesTab = await page.$('button:has-text("Dues & Ageing")');
  if (duesTab) {
    await duesTab.click();
    await page.waitForTimeout(1000);
    await checkPageForBatch('Dues & Ageing Report');
  }

  console.log('--- Step 7: Reminders Page ---');
  await page.goto('http://localhost:5173/reminders');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await checkPageForBatch('Reminders Page');

  console.log('--- Step 8: Admissions Page ---');
  await page.goto('http://localhost:5173/admissions');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await checkPageForBatch('Admissions List Page');

  // Click on first admission detail
  const firstAdm = await page.$('tbody tr td:first-child');
  if (firstAdm) {
    await firstAdm.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await checkPageForBatch('Admission Detail Page');
  }

  console.log('--- Step 9: Students Page & Student Detail ---');
  await page.goto('http://localhost:5173/students');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await checkPageForBatch('Students Page');

  const firstStudent = await page.$('tbody tr td a, tbody tr td button');
  if (firstStudent) {
    await firstStudent.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await checkPageForBatch('Student Detail Page');
  }

  console.log('=============================================');
  console.log('ALL PLAYWRIGHT LIVE UI CHECKS PASSED WITH 0 BATCH REFERENCES!');
  console.log('=============================================');

  await browser.close();
}

main().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});
