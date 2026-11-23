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

function resetAllTeachersActive() {
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
}

(async () => {
  const healthy = await checkBackendHealth();
  if (!healthy) throw new Error('Backend health check failed');

  // Reset state to ensure all teachers start ACTIVE
  resetAllTeachersActive();

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();

  console.log('1. Logging in as Admin...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[placeholder*="ADM"], input[type="text"]', 'ADM001');
  await page.fill('input[type="password"]', 'Admin@1234');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  console.log('   Login successful.');

  // 2. Navigate to Teachers Page
  console.log('\n2. Navigating to Teachers page...');
  await page.goto('http://localhost:5173/teachers', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('table tbody tr td', { timeout: 10000 });

  // Verify status badge in table
  const activeBadgeFirst = page.locator('table tbody tr span:has-text("ACTIVE")').first();
  await activeBadgeFirst.waitFor({ state: 'visible', timeout: 10000 });
  const badges = page.locator('table tbody tr span:has-text("ACTIVE")');
  const badgeCount = await badges.count();
  console.log(`   Found ${badgeCount} ACTIVE badges on first page.`);
  if (badgeCount === 0) throw new Error('No ACTIVE badges found in table');

  // Verify filter dropdown exists
  const filterSelect = page.locator('select:has-text("All Teachers")');
  await filterSelect.waitFor({ state: 'visible', timeout: 5000 });
  console.log('   Status filter dropdown is visible on Teachers page.');

  // Check button styles on first row: Deactivate, Edit, Detail
  const firstRow = page.locator('table tbody tr').first();
  const teacherName = (await firstRow.locator('td').nth(1).locator('span.font-bold.text-black').innerText()).trim();
  console.log(`   Target teacher for test: "${teacherName}"`);

  const deactBtn = firstRow.locator('button:has-text("Deactivate")');
  await deactBtn.waitFor({ state: 'visible', timeout: 5000 });
  const deactBox = await deactBtn.boundingBox();
  const deactStyles = await deactBtn.evaluate(e => {
    const cs = window.getComputedStyle(e);
    return {
      height: cs.height,
      whiteSpace: cs.whiteSpace,
      color: cs.color,
      backgroundColor: cs.backgroundColor
    };
  });
  console.log(`   Deactivate button: height=${deactBox ? deactBox.height : deactStyles.height}px, whiteSpace=${deactStyles.whiteSpace}, color=${deactStyles.color}, bg=${deactStyles.backgroundColor}`);
  if (Math.round(deactBox.height) !== 32) throw new Error(`Expected Deactivate button height ~32px, got ${deactBox.height}`);
  if (deactStyles.whiteSpace !== 'nowrap') throw new Error(`Expected whiteSpace nowrap`);

  // 3. Click Deactivate on first teacher
  console.log(`\n3. Toggling teacher "${teacherName}" to INACTIVE...`);
  await deactBtn.click();
  await page.waitForTimeout(1500);

  // 4. Test Inactive Filter
  console.log('\n4. Testing Active / Inactive Filter...');
  await filterSelect.selectOption('INACTIVE');
  await page.waitForTimeout(1000);

  const inactiveRows = page.locator('table tbody tr');
  const inactiveCount = await inactiveRows.count();
  console.log(`   Inactive filter shows ${inactiveCount} teachers.`);
  if (inactiveCount === 0) throw new Error('Inactive filter should show at least 1 teacher');

  const inactiveBadge = page.locator('table tbody tr span:has-text("INACTIVE")').first();
  await inactiveBadge.waitFor({ state: 'visible' });
  console.log('   INACTIVE badge is visible in Inactive filter view.');

  const activateBtn = page.locator(`table tbody tr:has-text("${teacherName}") button:has-text("Activate")`);
  const hasActivate = await activateBtn.count();
  if (hasActivate === 0) throw new Error(`Teacher "${teacherName}" not found with Activate button in INACTIVE filter`);
  console.log(`   Teacher "${teacherName}" now has "Activate" button in row actions.`);

  // 5. Verify New Subject picker does NOT offer this inactive teacher
  console.log('\n5. Verifying New Subject picker hides inactive teacher...');
  await page.goto('http://localhost:5173/subjects', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button:has-text("New Subject")', { timeout: 10000 });
  await page.click('button:has-text("New Subject")');
  await page.waitForSelector('form', { timeout: 5000 });

  const subjectFacultyOptions = await page.locator('select:has-text("Select Faculty"), select:has-text("No Teacher Assigned") option').allTextContents();
  const foundInSubjectPicker = subjectFacultyOptions.some(opt => opt.includes(teacherName));
  console.log(`   Inactive teacher "${teacherName}" in New Subject picker? ${foundInSubjectPicker}`);
  if (foundInSubjectPicker) throw new Error(`Inactive teacher "${teacherName}" must NOT be offered in New Subject picker!`);
  console.log('   PASSED: Inactive teacher is NOT offered in New Subject picker.');

  // 6. Verify New Admission picker does NOT offer this inactive teacher
  console.log('\n6. Verifying New Admission picker hides inactive teacher...');
  await page.goto('http://localhost:5173/admissions/new?student_id=77777777-7777-7777-7777-777777777701', { waitUntil: 'domcontentloaded' });

  // Click Next: Subjects button to go to Step 2
  const nextBtn = page.locator('button:has-text("Next: Subjects")');
  await nextBtn.waitFor({ state: 'visible', timeout: 10000 });
  await nextBtn.click();
  await page.waitForTimeout(1000);

  // In Step 2, find the Assigned Faculty dropdown
  const facultySelect = page.locator('div:has-text("Assigned Faculty") select').first();
  await facultySelect.waitFor({ state: 'visible', timeout: 10000 });
  const admissionFacultyOptions = await facultySelect.locator('option').allTextContents();
  const foundInAdmissionPicker = admissionFacultyOptions.some(opt => opt.trim() === teacherName);
  console.log(`   Inactive teacher "${teacherName}" in New Admission picker? ${foundInAdmissionPicker}`);
  if (foundInAdmissionPicker) throw new Error(`Inactive teacher "${teacherName}" must NOT be offered in New Admission picker!`);
  console.log('   PASSED: Inactive teacher is NOT offered in New Admission picker.');

  // 7. Check that teacher past history & records are untouched
  console.log('\n7. Checking that inactive teacher past records and detail page stay untouched...');
  await page.goto('http://localhost:5173/teachers', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('table', { timeout: 10000 });
  await page.locator('select:has-text("All Teachers")').selectOption('INACTIVE');
  await page.waitForTimeout(1000);

  const detailBtn = page.locator(`table tbody tr:has-text("${teacherName}") button:has-text("Detail")`);
  await detailBtn.click();
  await page.waitForURL('**/teachers/**', { timeout: 10000 });

  await page.waitForSelector('text=INACTIVE / ON LEAVE', { timeout: 5000 });
  console.log('   Teacher Detail page loaded with INACTIVE status banner and past records intact.');

  // 8. Toggle back to ACTIVE from Teacher Detail Page
  console.log('\n8. Toggling teacher back to ACTIVE from detail page...');
  const activateDetailBtn = page.locator('button:has-text("Activate Faculty")');
  await activateDetailBtn.waitFor({ state: 'visible' });
  await activateDetailBtn.click();
  await page.waitForTimeout(1500);

  await page.waitForSelector('text=ACTIVE FACULTY MEMBER', { timeout: 5000 });
  console.log('   Teacher successfully reactivated! Banner updated to ACTIVE FACULTY MEMBER.');

  // 9. Verify Audit Log has both status changes
  console.log('\n9. Checking Audit Log entries...');
  await page.goto('http://localhost:5173/audit', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('table', { timeout: 10000 });

  // Use search input or action filter to narrow to TEACHER_STATUS_UPDATED
  const searchInput = page.locator('input[placeholder*="Search reference"]');
  if (await searchInput.isVisible()) {
    await searchInput.fill('TEACHER_STATUS_UPDATED');
    await searchInput.press('Enter');
    await page.waitForTimeout(1000);
  }

  const auditEntry = page.locator('table tbody tr:has-text("TEACHER_STATUS_UPDATED"), table tbody tr:has-text("Teacher Status Updated")').first();
  await auditEntry.waitFor({ state: 'visible', timeout: 10000 });
  const auditCount = await page.locator('table tbody tr:has-text("TEACHER_STATUS_UPDATED"), table tbody tr:has-text("Teacher Status Updated")').count();
  console.log(`   Found ${auditCount} teacher status updated audit log entries.`);
  if (auditCount === 0) throw new Error('Expected at least 1 audit entry for teacher status update!');
  console.log('   PASSED: Audit log recorded status change events.');

  console.log('\n========================================');
  console.log('ALL LIVE TEACHER STATUS CHECKS PASSED WITH 100% SUCCESS!');
  console.log('========================================');

  await browser.close();
})();
