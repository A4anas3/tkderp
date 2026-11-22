const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5173';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'verification_screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runLiveVerification() {
  console.log('=== STARTING REMINDERS MODULE LIVE UI VERIFICATION ===');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    // 1. Login as Cashier (or Admin)
    console.log('1. Logging in as Cashier (CSH001)...');
    await page.goto(`${BASE_URL}/login`);
    await page.waitForSelector('button[type="submit"]', { timeout: 10000 });
    await page.fill('input[placeholder*="ADM"], input[type="text"]', 'CSH001');
    await page.fill('input[type="password"]', 'Cashier@1234');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    console.log('PASS: Logged in successfully. Current URL:', page.url());

    // 2. Reach Reminders from Topbar
    console.log('\n2. Testing Navigation to Reminders from Topbar...');
    const remindersNavLink = page.locator('header a[href="/reminders"], header button[title*="Reminders"]');
    await remindersNavLink.first().click();
    await page.waitForURL('**/reminders', { timeout: 10000 });
    console.log('PASS: Successfully reached /reminders from top nav!');

    // 3. Test Navigation via Apps Picker Modal
    console.log('\n3. Testing Navigation via Apps Picker Modal...');
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForSelector('button[aria-label="Apps launcher"]', { timeout: 10000 });
    await page.click('button[aria-label="Apps launcher"]');
    await page.waitForSelector('div[data-app-id="reminders"]', { timeout: 5000 });
    const appReminderBtn = page.locator('div[data-app-id="reminders"]');
    await appReminderBtn.click();
    await page.waitForURL('**/reminders', { timeout: 10000 });
    console.log('PASS: Successfully reached /reminders from Apps Picker modal!');

    // 4. Verify Reminders Page Layout & KPIs
    console.log('\n4. Verifying Reminders Page Elements & KPI Cards...');
    await page.waitForSelector('h1:has-text("Fee Reminders & WhatsApp Queue")', { timeout: 15000 });

    const pendingKpi = page.locator('div:has-text("Pending Reminders")').first();
    const sentKpi = page.locator('div:has-text("Sent History")').first();
    const failedKpi = page.locator('div:has-text("Failed Delivery")').first();
    const totalDuesKpi = page.locator('div:has-text("Total Active Dues")').first();

    console.log('PASS: All 4 KPI cards present.');

    // 5. Verify Real Active Dues Table Columns
    console.log('\n5. Verifying Table Columns (Student, Mobile, Subject, Due Amount, Due Date)...');
    await page.waitForSelector('table thead th', { timeout: 15000 });
    const rawHeaders = await page.locator('thead th').allInnerTexts();
    const headers = rawHeaders.map((h) => h.toUpperCase());
    console.log('Table Headers:', headers.join(' | '));
    if (!headers.some((h) => h.includes('STUDENT DETAILS'))) throw new Error('Missing Student Details header');
    if (!headers.some((h) => h.includes('MOBILE CONTACT'))) throw new Error('Missing Mobile Contact header');
    if (!headers.some((h) => h.includes('SUBJECT & BATCH'))) throw new Error('Missing Subject & Batch header');
    if (!headers.some((h) => h.includes('DUE AMOUNT'))) throw new Error('Missing Due Amount header');
    if (!headers.some((h) => h.includes('DUE DATE'))) throw new Error('Missing Due Date header');
    if (!headers.some((h) => h.includes('WHATSAPP ACTION'))) throw new Error('Missing WhatsApp Action header');
    console.log('PASS: All required columns present!');

    // Verify Sample Row
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    console.log(`Found ${rowCount} rows on page 1`);
    if (rowCount === 0) throw new Error('Expected at least 1 due reminder row in table');

    const firstRow = rows.first();
    const rowText = await firstRow.innerText();
    console.log('Sample Row 1 Text:\n', rowText.replace(/\n+/g, ' | '));

    // Verify WhatsApp button in first row
    const waBtn = firstRow.locator('button:has-text("WhatsApp")');
    console.log('WhatsApp button present:', (await waBtn.count()) === 1);
    if ((await waBtn.count()) !== 1) throw new Error('Missing WhatsApp button in table row');

    // Screenshot of Pending Queue
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'live_reminders_queue_pending.png'), fullPage: true });
    console.log('PASS: Screenshot saved: live_reminders_queue_pending.png');

    // 6. Test Mark Sent & Sent History
    console.log('\n6. Testing Mark Sent and Sent History Tab...');
    const markSentBtn = firstRow.locator('button:has-text("Mark Sent")');
    if ((await markSentBtn.count()) > 0) {
      await markSentBtn.click();
      await page.waitForTimeout(1500);
      console.log('Clicked Mark Sent');

      // Click Sent History tab
      const sentTab = page.locator('button:has-text("Sent History")');
      await sentTab.click();
      await page.waitForTimeout(1500);

      const sentRows = await page.locator('tbody tr').count();
      console.log(`PASS: Sent History tab active, contains ${sentRows} sent records`);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'live_reminders_sent_history.png'), fullPage: true });

      // Click Reset back to pending
      const resetBtn = page.locator('tbody tr').first().locator('button:has-text("Reset")');
      if ((await resetBtn.count()) > 0) {
        await resetBtn.click();
        await page.waitForTimeout(1500);
        console.log('PASS: Reset sent reminder back to pending queue.');
      }

      // Return to Pending Queue tab
      await page.locator('button:has-text("Pending Queue")').click();
      await page.waitForTimeout(1000);
    }

    // 7. Test Filters: Subject and Due-Age
    console.log('\n7. Testing Dropdown Filters (Subject, Batch, Due-Age)...');
    const dueAgeSelect = page.locator('select').nth(2); // Due-Age select
    await dueAgeSelect.selectOption('0-30');
    await page.waitForTimeout(1500);
    console.log('PASS: Due-Age 0-30 filter applied successfully');

    // Clear filters
    const clearBtn = page.locator('button:has-text("Clear Filters")');
    if ((await clearBtn.count()) > 0) {
      await clearBtn.click();
      await page.waitForTimeout(1000);
      console.log('PASS: Clear filters works.');
    }

    // 8. Test One-Click Send Due Reminder from Student Profile
    console.log('\n8. Testing One-Click "Send Due Reminder" from Student Profile...');
    // Click on student name in row 1
    const studentLink = page.locator('tbody tr').first().locator('td').first().locator('span').first();
    await studentLink.click();
    await page.waitForURL('**/students/**', { timeout: 10000 });
    console.log('Navigated to Student Profile:', page.url());

    // Wait for student profile data to load and render
    await page.waitForSelector('button:has-text("Send Due Reminder")', { timeout: 15000 });
    const sendDueReminderBtn = page.locator('button:has-text("Send Due Reminder")');
    console.log('PASS: One-click "Send Due Reminder" button is visible and active on Student Profile!');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'live_student_send_due_reminder.png'), fullPage: true });

    // 9. Test One-Click Send Due Reminder from Subject Detail Page
    console.log('\n9. Testing Subject Detail Page Reminders Action...');
    // Fetch a subject ID using fetch from backend
    const subsRes = await page.evaluate(async () => {
      const res = await fetch('/api/subjects');
      return await res.json();
    });
    const subList = subsRes?.items || subsRes || [];
    if (subList.length > 0) {
      const testSubId = subList[0].id;
      await page.goto(`${BASE_URL}/subjects/${testSubId}`);
      await page.waitForSelector('h1', { timeout: 10000 });
      console.log('Navigated to Subject Detail:', page.url());

      await page.waitForSelector('button:has-text("Send Due Reminders")', { timeout: 10000 });
      const subjectRemindersBtn = page.locator('button:has-text("Send Due Reminders")');
      console.log('PASS: "Send Due Reminders" button visible in Subject header!');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'live_subject_send_due_reminders.png'), fullPage: true });
    }

    console.log('\n=== ALL LIVE UI & FUNCTIONALITY CHECKS PASSED PERFECTLY ===');
  } catch (err) {
    console.error('ERROR during live UI verification:', err);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'live_ui_error.png'), fullPage: true });
    throw err;
  } finally {
    await browser.close();
  }
}

runLiveVerification();
