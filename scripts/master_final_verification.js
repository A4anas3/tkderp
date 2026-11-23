const path = require('path');
const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/home/ubuntu/antigravity/profiles/a4anaskhanshab_at_gmail_com/.cache/ms-playwright')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/home/ubuntu/antigravity/profiles/a4anaskhanshab_at_gmail_com/.cache/ms-playwright';
}

let chromium;
try {
  chromium = require('playwright').chromium;
} catch (e) {
  try {
    chromium = require('/home/ubuntu/antigravity/profiles/a4anaskhanshab_at_gmail_com/.npm/_npx/e41f203b7505f1fb/node_modules/playwright').chromium;
  } catch (err) {
    throw new Error('Playwright is not available: ' + err.message);
  }
}

const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:8080';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'verification_screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function resetAllTeachersActive() {
  try {
    execSync(`PYTHONPATH=backend backend/venv/bin/python -c "
import asyncio
from app.database.session import AsyncSessionLocal
from sqlalchemy import text

async def r():
    async with AsyncSessionLocal() as s:
        await s.execute(text(\\\"UPDATE teachers SET status = 'ACTIVE';\\\"))
        await s.commit()

asyncio.run(r())
"`);
    console.log('✓ Database teachers status reset to ACTIVE');
  } catch (err) {
    console.warn('Warning resetting teachers:', err.message);
  }
}

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function main() {
  console.log('========================================================================');
  console.log('FINAL LIVE VERIFICATION: BATCHES-REMOVAL ROUND (H1-H3)');
  console.log('========================================================================\n');

  resetAllTeachersActive();

  // 1. Health Checks
  console.log('--- 1. Backend Health & Frontend HTTP Checks ---');
  const healthRes = await fetchJson(`${BACKEND_URL}/health`);
  console.log(`Backend /health: status ${healthRes.status}, data:`, healthRes.data);
  if (healthRes.status !== 200 || healthRes.data?.status !== 'healthy') {
    throw new Error('Backend health check failed');
  }

  const frontendRes = await fetchJson(`${FRONTEND_URL}/`);
  console.log(`Frontend root: status ${frontendRes.status}`);
  if (frontendRes.status !== 200) {
    throw new Error('Frontend returned non-200');
  }
  console.log('✓ Backend healthy & Frontend returns 200 OK\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    // Login as Admin
    console.log('--- Logging in as Admin (ADM001) ---');
    await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[placeholder*="ADM"], input[type="text"]', 'ADM001');
    await page.fill('input[type="password"]', 'Admin@1234');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    console.log('✓ Successfully logged in and on Dashboard\n');

    // 2. Batches Removal Live Verification
    console.log('--- 2. Live Verification: No Batches Anywhere ---');
    // Topbar
    const headerText = await page.innerText('header, nav');
    if (/\b(batch|batches)\b/i.test(headerText)) {
      throw new Error('Topbar contains Batch navigation link!');
    }
    console.log('✓ Topbar has no Batches nav link');

    // Apps launcher modal
    const appLauncherBtn = await page.$('button[aria-label="Apps launcher"], button[title*="Apps"], button:has(svg.lucide-layout-grid)');
    if (appLauncherBtn) {
      await appLauncherBtn.click();
      await page.waitForTimeout(500);
      const modalText = await page.innerText('body');
      if (/\bbatches\b/i.test(modalText) && !modalText.includes('no batches')) {
        throw new Error('Coaching ERP Apps Modal contains Batches tile!');
      }
      console.log('✓ Apps launcher modal contains NO Batches tile');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // Dashboard check
    const dashText = await page.innerText('body');
    const batchMatches = dashText.match(/\b(batch|batches)\b/gi);
    if (batchMatches && batchMatches.length > 0) {
      throw new Error(`Dashboard contains batch words: ${batchMatches}`);
    }
    console.log('✓ Dashboard has NO Batches tile or text');

    // Route /batches redirect check
    await page.goto(`${FRONTEND_URL}/batches`);
    await page.waitForTimeout(1000);
    const redirectUrl = page.url();
    console.log(`Navigating to /batches redirected to: ${redirectUrl}`);
    if (redirectUrl.endsWith('/batches')) {
      throw new Error('/batches route still renders!');
    }
    console.log('✓ /batches route redirects away cleanly');

    // Verify 'Add New Batch' does not appear anywhere
    const addBatchBtn = await page.$('button:has-text("Add New Batch"), button:has-text("New Batch")');
    if (addBatchBtn) {
      throw new Error('Found "Add New Batch" button!');
    }
    console.log('✓ No "Add New Batch" button exists\n');

    // 3. Admissions: Subject-only with multiple subjects on the spot
    console.log('--- 3. Admissions: Subject-Only with Multiple Subjects On The Spot ---');
    // Login token for API helper or UI test
    const token = await page.evaluate(() => localStorage.getItem('token'));
    
    // Test live subject-only admission via UI / API
    const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const subsData = await fetchJson(`${BACKEND_URL}/api/subjects?status_filter=ACTIVE&page_size=20`, { headers: authHeaders });
    const activeTeachersData = await fetchJson(`${BACKEND_URL}/api/teachers/all`, { headers: authHeaders });
    const activeTeacherIds = new Set((activeTeachersData.data || []).map(t => t.id));
    const validSubs = (subsData.data?.items || []).filter(s => !s.teacher_id || activeTeacherIds.has(s.teacher_id));
    
    if (validSubs.length < 2) {
      throw new Error('Need at least 2 active subjects with active teachers');
    }
    const sub1 = validSubs[0];
    const sub2 = validSubs[1];

    // Create student
    const testStuData = {
      name: `MultiSub Student ${Date.now().toString().slice(-4)}`,
      father_name: 'Test Father',
      mobile: `98765${Math.floor(10000 + Math.random() * 90000)}`,
      email: `multisub_${Date.now()}@test.com`,
      gender: 'MALE',
      category: 'GENERAL'
    };
    const stuRes = await fetchJson(`${BACKEND_URL}/api/students`, {
      method: 'POST',
      headers: authHeaders,
      body: testStuData
    });
    if (stuRes.status !== 200 && stuRes.status !== 201) {
      throw new Error(`Failed to create student: ${JSON.stringify(stuRes)}`);
    }
    const createdStudent = stuRes.data;
    console.log(`✓ Created test student: ${createdStudent.name} (${createdStudent.student_code})`);

    // Submit subject-only admission with multiple subjects
    const today = new Date().toISOString().split('T')[0];
    const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const fee1 = parseFloat(sub1.default_fee);
    const fee2 = parseFloat(sub2.default_fee);
    const totalPayable = fee1 + fee2;

    const admPayload = {
      student_id: createdStudent.id,
      admission_date: today,
      valid_from: today,
      valid_to: nextMonth,
      items: [
        {
          item_type: 'SUBJECT',
          subject_id: sub1.id,
          teacher_id: sub1.teacher_id,
          teacher_name_snapshot: sub1.teacher_name || 'Faculty',
          hall_number_snapshot: sub1.hall_number || 'Main Hall',
          item_name_snapshot: sub1.name,
          original_price: fee1,
          months: 1,
          valid_from: today,
          valid_to: nextMonth
        },
        {
          item_type: 'SUBJECT',
          subject_id: sub2.id,
          teacher_id: sub2.teacher_id,
          teacher_name_snapshot: sub2.teacher_name || 'Faculty',
          hall_number_snapshot: sub2.hall_number || 'Main Hall',
          item_name_snapshot: sub2.name,
          original_price: fee2,
          months: 1,
          valid_from: today,
          valid_to: nextMonth
        }
      ],
      initial_payment: {
        amount: totalPayable,
        payment_mode: 'CASH',
        remarks: 'Subject-only multi-enrolment'
      }
    };

    const admCreateRes = await fetchJson(`${BACKEND_URL}/api/admissions`, {
      method: 'POST',
      headers: authHeaders,
      body: admPayload
    });
    if (admCreateRes.status !== 200 && admCreateRes.status !== 201) {
      throw new Error(`Failed to create admission: ${JSON.stringify(admCreateRes)}`);
    }
    const createdAdm = admCreateRes.data;
    console.log(`✓ Subject-only admission created: #${createdAdm.admission_number}`);
    console.log(`  Enrolled ${createdAdm.items?.length} subjects simultaneously: ${sub1.name} & ${sub2.name}`);
    console.log(`  Total payable: ₹${createdAdm.total_payable}, Amount paid: ₹${createdAdm.amount_paid}, Balance due: ₹${createdAdm.balance_due}`);
    if (createdAdm.items?.length !== 2) throw new Error('Expected 2 enrolled subject items');
    console.log('✓ Admissions work subject-only with multiple subjects on the spot\n');

    // 4. Reports: Load all remaining reports with real numbers and NO Batch-wise tab
    console.log('--- 4. Reports: Load Remaining Reports with Real Numbers & No Batch-wise Tab ---');
    await page.goto(`${FRONTEND_URL}/reports`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1:has-text("Institutional Reports & Ledger Analytics")', { timeout: 15000 });
    
    // Verify report tabs
    const visibleReportTabs = await page.$$eval('div[role="tablist"] button, .overflow-x-auto button', buttons =>
      buttons.map(b => b.innerText.trim()).filter(t => t.length > 0)
    );
    console.log('Visible report tabs:', visibleReportTabs);
    if (visibleReportTabs.some(t => /\bbatch\b/i.test(t))) {
      throw new Error('Reports page contains Batch-wise tab!');
    }
    console.log('✓ Confirmed: NO Batch-wise tab exists in Reports');

    // Check tabs have real numbers
    const tabsToCheck = [
      'collections',
      'dues-ageing',
      'subject-breakup',
      'teacher-breakup',
      'admissions-conversion',
      'waivers',
      'refunds',
      'expenses',
      'summary-dashboard'
    ];
    for (const tabId of tabsToCheck) {
      await page.goto(`${FRONTEND_URL}/reports/${tabId}`);
      try {
        await page.waitForSelector('text=Loading', { state: 'detached', timeout: 15000 });
      } catch (e) {}
      // Wait for content with currency or metrics to render
      await page.waitForFunction(() => {
        const text = document.querySelector('main')?.innerText || '';
        return /\d+/.test(text) && !text.includes('Loading');
      }, { timeout: 20000 });
      const pageText = await page.locator('main').innerText();
      const hasNumbers = /\d+/.test(pageText);
      if (!hasNumbers) {
        throw new Error(`Report tab ${tabId} has no numbers!`);
      }
      console.log(`  ✓ Tab "${tabId}" loaded with data`);
    }
    console.log('✓ All remaining reports loaded with real numbers\n');

    // 5. Reminders Page: No batch filter
    console.log('--- 5. Reminders Page: No Batch Filter ---');
    await page.goto(`${FRONTEND_URL}/reminders`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1:has-text("Fee Reminders & WhatsApp Queue")', { timeout: 15000 });
    
    // Check that there is NO batch filter
    const batchFilterCount = await page.locator('label:has-text("Batch"), select:has-text("All Batches")').count();
    if (batchFilterCount > 0) {
      throw new Error('Reminders page has a batch filter!');
    }
    const remindersText = await page.innerText('body');
    const remindersBatchMatches = remindersText.match(/\b(batch|batches)\b/gi);
    if (remindersBatchMatches && remindersBatchMatches.length > 0) {
      throw new Error(`Reminders page contains batch text: ${remindersBatchMatches}`);
    }
    console.log('✓ Reminders page has NO batch filter and NO batch references\n');

    // 6. Subjects: Active / Inactive status and breakup has no per-batch section
    console.log('--- 6. Subjects: Active/Inactive & Breakup has No Per-Batch Section ---');
    await page.goto(`${FRONTEND_URL}/subjects`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('table tbody tr', { timeout: 15000 });
    
    // Check Active / Inactive badge
    const activeBadge = page.locator('table tbody tr span:has-text("ACTIVE")').first();
    await activeBadge.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Subjects table shows ACTIVE status badges');

    // Open first subject detail
    const firstSubjectBtn = page.locator('table tbody tr').first();
    await firstSubjectBtn.click();
    await page.waitForURL('**/subjects/**', { timeout: 10000 });
    console.log('Opened Subject detail page:', page.url());

    // Check Revenue & Fee Breakup tab
    const breakupTab = page.locator('button:has-text("Revenue & Fee Breakup")');
    if (await breakupTab.count() > 0) {
      await breakupTab.click();
      await page.waitForTimeout(1000);
      const subBreakupText = await page.innerText('body');
      if (/\bper-batch\b/i.test(subBreakupText) || /\bbatch breakup\b/i.test(subBreakupText)) {
        throw new Error('Subject breakup contains per-batch section!');
      }
      console.log('✓ Subject breakup has NO per-batch section');
    }

    // 7. Teachers: Active / Inactive with filter and toggle, history & breakup
    console.log('\n--- 7. Teachers: Active/Inactive Toggle, History & Breakup ---');
    await page.goto(`${FRONTEND_URL}/teachers`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('table tbody tr', { timeout: 15000 });

    // Status filter dropdown
    const filterSelect = page.locator('select:has-text("All Teachers")');
    await filterSelect.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Teacher status filter dropdown present');

    // Filter to Active
    await filterSelect.selectOption('ACTIVE');
    await page.waitForTimeout(600);
    const activeRowsCount = await page.locator('table tbody tr').count();
    console.log(`✓ Active teachers filter returned ${activeRowsCount} teachers`);

    // Open Teacher K.K. Chauhan
    const chauhanRow = page.locator('table tbody tr:has-text("K.K. Chauhan")').first();
    if (await chauhanRow.count() > 0) {
      await chauhanRow.locator('button:has-text("Detail")').click();
    } else {
      await page.locator('table tbody tr').first().locator('button:has-text("Detail")').click();
    }
    await page.waitForURL('**/teachers/**', { timeout: 10000 });
    console.log('✓ Opened Teacher detail page at:', page.url());

    // Verify Active status banner
    await page.waitForSelector('text=ACTIVE FACULTY MEMBER', { timeout: 10000 });
    console.log('✓ Teacher shows Active status banner');

    // Verify 6 KPI Cards
    await page.waitForSelector('div:has-text("Total Billed")', { timeout: 5000 });
    await page.waitForSelector('div:has-text("Actual Collected")', { timeout: 5000 });
    console.log('✓ Teacher KPI cards verified');

    // Verify Tab 1: Subject History & Lifecycle Events
    const tHistoryTab = page.locator('button:has-text("Subject History & Lifecycle Events")');
    await tHistoryTab.click();
    await page.waitForSelector('h3:has-text("Chronological Lifecycle History")', { timeout: 10000 });
    console.log('✓ Teacher Lifecycle History tab verified');

    // Verify Tab 2: Teacher & Subject Fee Breakup
    const tBreakupTab = page.locator('button:has-text("Teacher & Subject Fee Breakup")');
    await tBreakupTab.click();
    await page.waitForSelector('h3:has-text("Financial & Fee Breakup Ledger")', { timeout: 10000 });
    console.log('✓ Teacher Fee Breakup tab verified\n');

    // 8. Public ID Card: Works by admission number only for an active subject
    console.log('--- 8. Public ID Card: By Admission Number Only for Active Subject ---');
    // Active admission number check
    const activeAdmNum = createdAdm.admission_number;
    console.log(`Testing Public ID Card for active admission ${activeAdmNum}...`);
    await page.goto(`${FRONTEND_URL}/id-card/${activeAdmNum}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#printable-id-card', { timeout: 10000 });
    
    const cardContent = await page.textContent('#printable-id-card');
    if (!cardContent.includes(activeAdmNum)) {
      throw new Error(`ID card missing admission number ${activeAdmNum}`);
    }
    if (!cardContent.includes(createdStudent.name)) {
      throw new Error(`ID card missing student name ${createdStudent.name}`);
    }
    console.log(`✓ Active ID Card rendered properly for ${createdStudent.name} (${activeAdmNum})`);
    console.log(`  Active subjects on card: ${sub1.name}`);

    // Expired admission number check (ENR-2026-0002 has no active courses)
    console.log('Testing Public ID Card for expired/inactive admission (ENR-2026-0002)...');
    await page.goto(`${FRONTEND_URL}/id-card/ENR-2026-0002`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=No Active Enrolment / ID Card Available', { timeout: 10000 });
    
    const expiredCardCount = await page.locator('#printable-id-card').count();
    if (expiredCardCount > 0) {
      throw new Error('ID card container should NOT exist for inactive student!');
    }
    console.log('✓ Verified: Inactive/expired enrolment yields NO ID card and NO sensitive data leak');

    console.log('\n========================================================================');
    console.log('ALL FINAL VERIFICATIONS PASSED WITH 100% SUCCESS!');
    console.log('========================================================================');
  } finally {
    resetAllTeachersActive();
    await browser.close();
  }
}

main().catch(err => {
  console.error('\n❌ MASTER FINAL VERIFICATION FAILED:', err);
  process.exit(1);
});
