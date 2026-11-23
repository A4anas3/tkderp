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
  console.log('=== STARTING RENEWALS LIVE VERIFICATION ===\n');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const failures = [];

  try {
    // -------------------------------------------------------------
    // PART 1: Cashier Login and Navigation Checks
    // -------------------------------------------------------------
    console.log('[1/5] Logging in as Cashier (CSH001)...');
    await page.goto(`${FRONTEND_URL}/login`);
    await page.waitForLoadState('domcontentloaded');

    await page.fill('input:not([type="password"])', 'CSH001');
    await page.fill('input[type="password"]', 'Cashier@1234');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await page.waitForTimeout(1000);
    console.log('  ✓ Cashier logged in successfully');

    // Verify Cashier Topbar Navigation has 'Renewals'
    const topbarNavTexts = await page.$$eval('header nav a', els => els.map(e => e.textContent.trim()));
    console.log('  Cashier Header Nav Items:', topbarNavTexts);
    if (topbarNavTexts.includes('Renewals')) {
      console.log('  ✓ Renewals link present in Cashier topbar nav');
    } else {
      failures.push('Renewals link missing from Cashier topbar nav');
    }

    // Verify Apps Launcher Modal has 'Renewals'
    await page.click('button[title="Open Coaching ERP Apps"]');
    await page.waitForTimeout(500);
    const modalContent = await page.locator('div[role="dialog"]').textContent();
    if (modalContent.includes('Renewals')) {
      console.log('  ✓ Renewals app tile present in Coaching Apps Modal');
    } else {
      failures.push('Renewals app tile missing from Coaching Apps Modal');
    }
    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // -------------------------------------------------------------
    // PART 2: Navigate to Renewals Page and inspect both lists
    // -------------------------------------------------------------
    console.log('\n[2/5] Navigating to /renewals...');
    await page.goto(`${FRONTEND_URL}/renewals`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    const heading = await page.locator('h1').textContent();
    console.log(`  ✓ Page header: "${heading.trim()}"`);
    if (!heading.includes('Renewals')) {
      failures.push(`Expected heading to include "Renewals", got "${heading}"`);
    }

    // Check for Section 1: "Expiring in 1-5 days"
    const expSection = await page.locator('h2:has-text("Expiring in 1–5 days"), h2:has-text("Expiring in 1-5 days")');
    const hasExp = await expSection.count();
    if (hasExp > 0) {
      console.log('  ✓ Section "(1) Expiring in 1–5 days" rendered');
    } else {
      failures.push('Section "(1) Expiring in 1–5 days" missing');
    }

    // Check for Section 2: "Recently Expired (1-5 days ago)"
    const recSection = await page.locator('h2:has-text("Recently Expired (1–5 days ago)"), h2:has-text("Recently Expired (1-5 days ago)")');
    const hasRec = await recSection.count();
    if (hasRec > 0) {
      console.log('  ✓ Section "(2) Recently Expired (1–5 days ago)" rendered');
    } else {
      failures.push('Section "(2) Recently Expired (1–5 days ago)" missing');
    }

    // Check student rows in expiring list
    const whatsappButtons = await page.locator('button:has-text("WhatsApp")');
    const waCount = await whatsappButtons.count();
    console.log(`  ✓ Found ${waCount} WhatsApp Renew button(s) in renewals rows`);
    if (waCount === 0) {
      failures.push('No WhatsApp Renew buttons found in renewals rows');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_cashier_renewals_view.png'), fullPage: true });
    console.log('  ✓ Saved screenshot: 01_cashier_renewals_view.png');

    // Test Clicking on a student row opens student profile
    const firstRow = page.locator('tbody tr').first();
    const rowStudentName = await firstRow.locator('td').first().textContent();
    console.log(`  ✓ Clicking row for student: ${rowStudentName.trim().slice(0, 30)}...`);
    await firstRow.click();
    await page.waitForURL('**/students/**', { timeout: 10000 });
    console.log(`  ✓ Navigated to student profile: ${page.url()}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_student_profile_from_row_click.png') });

    // -------------------------------------------------------------
    // PART 3: Verify Student Renewal Disappearance
    // -------------------------------------------------------------
    console.log('\n[3/5] Verifying Renewal Disappearance...');
    await page.goto(`${FRONTEND_URL}/renewals`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const pageText = await page.content();
    if (pageText.includes('Rohan Srivastava') && pageText.includes('STU20260003')) {
      failures.push('Renewed student Rohan Srivastava still visible in renewals lists!');
    } else {
      console.log('  ✓ Confirmed previously renewed student (Rohan Srivastava) is absent from both lists');
    }

    // Now let's renew Ananya Verma (who is expiring in 2 days) and confirm live disappearance
    console.log('  Renewing Ananya Verma (STU20260002) via API...');
    const token = await page.evaluate(() => localStorage.getItem('token') || localStorage.getItem('access_token'));
    
    // Fetch renewals data to get Ananya's item details
    const renewalsJson = await page.evaluate(async (tok) => {
      const res = await fetch('/api/renewals', { headers: { Authorization: `Bearer ${tok}` } });
      return await res.json();
    }, token);

    const ananyaItem = renewalsJson.expiring.find(x => x.student_code === 'STU20260002');
    if (ananyaItem) {
      console.log(`    Found Ananya Verma expiring item: ${ananyaItem.subject_name}`);
      const renewPayload = {
        student_id: ananyaItem.student_id,
        subject_id: ananyaItem.subject_id,
        valid_from: '2026-11-26',
        valid_to: '2026-12-25',
        months: 1,
        fee: 1500.0,
        price_override_reason: 'Regular course renewal',
        discount_type: 'NONE',
        discount_value: 0.0,
        notes: 'Live verification course renewal'
      };

      const renewResp = await page.evaluate(async ({ payload, tok }) => {
        const res = await fetch('/api/admissions/renew-subject', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tok}`
          },
          body: JSON.stringify(payload)
        });
        return { status: res.status, data: await res.json() };
      }, { payload: renewPayload, tok: token });

      console.log(`    Renewal API status: ${renewResp.status}`);

      // Refresh /renewals page and verify Ananya disappeared
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);

      const refreshedText = await page.content();
      if (refreshedText.includes('STU20260002')) {
        failures.push('Ananya Verma (STU20260002) still visible after renewal!');
      } else {
        console.log('  ✓ Live verification: Ananya Verma immediately disappeared from expiring list upon renewal!');
      }
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_after_renewal_disappearance.png'), fullPage: true });
    }

    // -------------------------------------------------------------
    // PART 4: Teacher Login and Navigation Checks (Teacher must NOT see it)
    // -------------------------------------------------------------
    console.log('\n[4/5] Logging in as Teacher (TCH001)...');
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${FRONTEND_URL}/login`);
    await page.waitForLoadState('domcontentloaded');

    await page.fill('input:not([type="password"])', 'TCH001');
    await page.fill('input[type="password"]', 'Teacher@1234');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await page.waitForTimeout(1000);
    console.log('  ✓ Teacher logged in successfully');

    // Verify Teacher Topbar Navigation does NOT have 'Renewals'
    const teacherNavTexts = await page.$$eval('header nav a', els => els.map(e => e.textContent.trim()));
    console.log('  Teacher Header Nav Items:', teacherNavTexts);
    if (!teacherNavTexts.includes('Renewals')) {
      console.log('  ✓ Renewals link strictly absent from Teacher topbar nav');
    } else {
      failures.push('Renewals link unexpectedly visible in Teacher topbar nav!');
    }

    // Verify Teacher Apps Launcher Modal does NOT have 'Renewals'
    await page.click('button[title="Open Coaching ERP Apps"]');
    await page.waitForTimeout(500);
    const teacherModalAppsTexts = await page.$$eval('div[role="dialog"] button, div[role="dialog"] a', els => els.map(e => e.textContent.trim()));
    const teacherHasRenewalsInModal = teacherModalAppsTexts.some(t => t.includes('Renewals'));
    if (!teacherHasRenewalsInModal) {
      console.log('  ✓ Renewals app tile strictly absent from Teacher Coaching Apps Modal');
    } else {
      failures.push('Renewals app tile unexpectedly visible in Teacher Coaching Apps Modal!');
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Attempt direct URL access to /renewals as Teacher -> Must redirect to /dashboard
    console.log('  Testing Teacher direct navigation to /renewals...');
    await page.goto(`${FRONTEND_URL}/renewals`);
    await page.waitForTimeout(1000);
    const teacherUrl = page.url();
    console.log(`  Teacher current URL after navigating to /renewals: ${teacherUrl}`);
    if (teacherUrl.endsWith('/renewals')) {
      failures.push('Teacher was NOT blocked from /renewals!');
    } else {
      console.log('  ✓ Teacher was blocked and redirected to /dashboard');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_teacher_blocked_from_renewals.png') });

    // -------------------------------------------------------------
    // PART 5: Admin Login and Navigation Checks (Admin sees all)
    // -------------------------------------------------------------
    console.log('\n[5/5] Logging in as Admin (ADM001)...');
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${FRONTEND_URL}/login`);
    await page.waitForLoadState('domcontentloaded');

    await page.fill('input:not([type="password"])', 'ADM001');
    await page.fill('input[type="password"]', 'Admin@1234');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await page.waitForTimeout(1000);
    console.log('  ✓ Admin logged in successfully');

    // Verify Admin Topbar Navigation has 'Renewals'
    const adminNavTexts = await page.$$eval('header nav a', els => els.map(e => e.textContent.trim()));
    console.log('  Admin Header Nav Items:', adminNavTexts);
    if (adminNavTexts.includes('Renewals')) {
      console.log('  ✓ Renewals link present in Admin topbar nav');
    } else {
      failures.push('Renewals link missing from Admin topbar nav');
    }

    // Verify Apps Launcher Modal has 'Renewals'
    await page.click('button[title="Open Coaching ERP Apps"]');
    await page.waitForTimeout(500);
    const adminModalContent = await page.locator('div[role="dialog"]').textContent();
    if (adminModalContent.includes('Renewals')) {
      console.log('  ✓ Renewals app tile present in Admin Coaching Apps Modal');
    } else {
      failures.push('Renewals app tile missing from Admin Coaching Apps Modal');
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Navigate to /renewals as Admin
    await page.goto(`${FRONTEND_URL}/renewals`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_admin_renewals_view.png'), fullPage: true });
    console.log('  ✓ Saved screenshot: 05_admin_renewals_view.png');

  } catch (err) {
    console.error('Test error:', err);
    failures.push(`Execution error: ${err.message}`);
  } finally {
    await browser.close();
  }

  console.log('\n=== VERIFICATION SUMMARY ===');
  if (failures.length === 0) {
    console.log('ALL VERIFICATION CHECKS PASSED WITH 0 FAILURES!');
    process.exit(0);
  } else {
    console.error(`FAILED WITH ${failures.length} ISSUE(S):`);
    failures.forEach((f, idx) => console.error(`  ${idx + 1}. ${f}`));
    process.exit(1);
  }
}

verify();
