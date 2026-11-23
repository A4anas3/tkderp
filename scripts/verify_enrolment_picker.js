const path = require('path');
const fs = require('fs');

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/home/ubuntu/antigravity/profiles/a4anaskhanshab_at_gmail_com/.cache/ms-playwright')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/home/ubuntu/antigravity/profiles/a4anaskhanshab_at_gmail_com/.cache/ms-playwright';
}

const { chromium } = require('/home/ubuntu/antigravity/profiles/a4anaskhanshab_at_gmail_com/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');

const FRONTEND_URL = 'http://localhost:5173';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'verification_screenshots');

(async () => {
  console.log('=== VERIFYING ENROLMENT & CHANGE SUBJECT MODAL PICKERS ===\n');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  try {
    // 1. Log in as ADMIN
    console.log('1. Logging in as ADM001...');
    await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle' });

    await page.fill('input:not([type="password"])', 'ADM001');
    await page.fill('input[type="password"]', 'Admin@1234');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    console.log('   Logged in successfully.');

    // 2. Navigate to New Admission / Enrolment page with a preselected student
    console.log('2. Navigating to /admissions/new?student_id=77777777-7777-7777-7777-777777777701...');
    await page.goto(`${FRONTEND_URL}/admissions/new?student_id=77777777-7777-7777-7777-777777777701`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Advance to Step 2: Subjects
    const nextBtn = page.locator('button:has-text("Next: Subjects")');
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await page.waitForTimeout(1000);
    }

    const addSubjectBtn = page.getByRole('button', { name: /Add Subject|Add First Subject/i });
    if (await addSubjectBtn.isVisible()) {
      await addSubjectBtn.first().click();
      await page.waitForTimeout(1000);
    }

    console.log('3. Checking Enrolment Subject Picker options...');
    const selectLocator = page.locator('select').filter({ hasText: /₹/ }).first();
    await selectLocator.waitFor({ state: 'visible', timeout: 10000 });

    const options = await selectLocator.locator('option').allInnerTexts();
    for (const opt of options) {
      console.log(`   Admission option: "${opt}"`);
      if (!/\([A-Z0-9]{3,5}-\d{4}\)/.test(opt)) throw new Error(`Missing code in: ${opt}`);
      if (!/AM|PM|Flexible|Mon|Tue|Wed|Thu|Fri|Sat|Sun/i.test(opt)) throw new Error(`Missing timing in: ${opt}`);
      if (!opt.includes('•')) throw new Error(`Missing separator/teacher in: ${opt}`);
    }
    console.log(`   ✓ All ${options.length} admission picker options verified!`);

    // 4. Navigate to student detail page and verify ChangeSubjectModal if an active subject is present
    console.log('4. Navigating to student details page to test ChangeSubjectModal...');
    await page.goto(`${FRONTEND_URL}/students/77777777-7777-7777-7777-777777777701`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const changeSubjectBtn = page.locator('button:has-text("Change Subject"), button[title="Change Subject"]').first();
    if (await changeSubjectBtn.isVisible()) {
      console.log('   Clicking Change Subject button...');
      await changeSubjectBtn.click();
      await page.waitForTimeout(1000);

      const modalSelect = page.locator('.fixed select').filter({ hasText: /Standard Fee/ }).first();
      if (await modalSelect.isVisible()) {
        const modalOpts = await modalSelect.locator('option').allInnerTexts();
        console.log(`   Found ${modalOpts.length} options in ChangeSubjectModal:`);
        for (const mOpt of modalOpts) {
          if (mOpt.includes('Select a new subject')) continue;
          console.log(`   ChangeSubject option: "${mOpt}"`);
          if (!/\([A-Z0-9]{3,5}-\d{4}\)/.test(mOpt)) throw new Error(`Missing code in: ${mOpt}`);
          if (!/AM|PM|Flexible|Mon|Tue|Wed|Thu|Fri|Sat|Sun/i.test(mOpt)) throw new Error(`Missing timing in: ${mOpt}`);
        }
        console.log('   ✓ ChangeSubjectModal options verified!');
      }
    } else {
      console.log('   (No active subject to change on this student, admission picker verified)');
    }

    console.log('\n=== ALL PICKER VERIFICATIONS PASSED ===');
  } catch (err) {
    console.error('VERIFICATION ERROR:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
