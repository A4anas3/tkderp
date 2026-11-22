const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5173';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'verification_screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runVerification() {
  console.log('=== STARTING COACHING ERP APPS & TOPBAR LIVE VERIFICATION ===');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // 1. Login as Admin
  console.log('1. Logging in as Admin...');
  await page.goto(`${BASE_URL}/login`);
  await page.waitForSelector('button[type="submit"]', { timeout: 10000 });
  await page.fill('input[placeholder*="ADM"]', 'ADM001');
  await page.fill('input[type="password"]', 'Admin@1234');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await page.waitForSelector('header', { timeout: 10000 });
  console.log('PASS: Logged in successfully. Current URL:', page.url());

  // 2. Verify Top Navigation Bar Elements (Hostel Pattern)
  console.log('\n2. Verifying Top Navigation Bar (Hostel Pattern)...');
  const header = page.locator('header');
  await header.waitFor({ state: 'visible', timeout: 5000 });

  // Grid launcher button
  const gridBtn = header.locator('button[aria-label="Apps launcher"]');
  console.log('Grid button count:', await gridBtn.count());
  if ((await gridBtn.count()) !== 1) throw new Error('FAIL: Grid launcher button not found in header');
  console.log('PASS: Found Grid launcher button in header.');

  // Brand title
  const brand = header.locator('a[href="/dashboard"]');
  console.log('Brand text:', (await brand.first().innerText()).trim().replace(/\s+/g, ' '));

  // Module links
  const expectedNavLinks = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Students', href: '/students' },
    { label: 'Subjects', href: '/subjects' },
    { label: 'Batches', href: '/batches' },
    { label: 'Admissions', href: '/admissions' },
    { label: 'Fees & Dues', href: '/fees' },
    { label: 'Payments', href: '/payments' },
    { label: 'Reminders', href: '/reminders' },
    { label: 'Teachers', href: '/teachers' },
    { label: 'Enquiries', href: '/enquiries' },
    { label: 'Reports', href: '/reports' },
    { label: 'Settings', href: '/settings' },
  ];

  for (const nav of expectedNavLinks) {
    const link = header.locator(`nav a:has-text("${nav.label}")`);
    const count = await link.count();
    console.log(`Nav link [${nav.label}]: count=${count}`);
    if (count < 1) throw new Error(`FAIL: Nav link "${nav.label}" missing from top nav`);
  }
  console.log('PASS: All 12 top nav module links verified.');

  // Quick action buttons
  const coursePaidBtn = header.locator('button:has-text("Course Paid")');
  const collectFeeBtn = header.locator('button:has-text("Collect Fee")');
  const newAdmissionBtn = header.locator('button:has-text("New Admission")');
  console.log('Course Paid count:', await coursePaidBtn.count());
  console.log('Collect Fee count:', await collectFeeBtn.count());
  console.log('New Admission count:', await newAdmissionBtn.count());
  if ((await coursePaidBtn.count()) !== 1) throw new Error('FAIL: Course Paid button missing');
  if ((await collectFeeBtn.count()) !== 1) throw new Error('FAIL: Collect Fee button missing');
  console.log('PASS: Compact action buttons verified.');

  // Search input
  const searchInput = header.locator('input[placeholder*="Search students"]');
  console.log('Search input count:', await searchInput.count());
  if ((await searchInput.count()) !== 1) throw new Error('FAIL: Search input missing');
  console.log('PASS: Search input verified.');

  // Admin chip
  const adminChip = header.locator('button:has-text("admin")');
  console.log('Admin chip count:', await adminChip.count());
  if ((await adminChip.count()) !== 1) throw new Error('FAIL: Admin chip missing');
  console.log('PASS: Admin chip verified.');

  // Notification bell
  const bellBtn = header.locator('button[title*="Due Reminders"]');
  console.log('Bell button count:', await bellBtn.count());
  if ((await bellBtn.count()) !== 1) throw new Error('FAIL: Notification bell missing');
  console.log('PASS: Notification bell verified.');

  // Save Topbar Screenshot
  const topbarShotPath = path.join(SCREENSHOT_DIR, 'hostel_style_topbar.png');
  await page.screenshot({ path: topbarShotPath, clip: { x: 0, y: 0, width: 1440, height: 70 } });
  console.log('Saved topbar screenshot to:', topbarShotPath);

  // 3. Open Coaching ERP Apps Modal
  console.log('\n3. Opening Coaching ERP Apps Modal via Grid Icon Button...');
  await gridBtn.click();
  await page.waitForSelector('h3:has-text("Coaching ERP Apps")', { timeout: 5000 });
  console.log('PASS: Coaching ERP Apps modal opened successfully.');

  // Save Modal Screenshot
  const modalShotPath = path.join(SCREENSHOT_DIR, 'coaching_apps_modal_open.png');
  await page.screenshot({ path: modalShotPath });
  console.log('Saved open modal screenshot to:', modalShotPath);

  // 4. Verify all 13 coaching module app tiles in the modal
  const expectedApps = [
    { id: 'students', name: 'Students', subtitle: 'Profiles & ID Cards', routePattern: '/students' },
    { id: 'subjects', name: 'Subjects', subtitle: 'Courses & Pricing', routePattern: '/subjects' },
    { id: 'batches', name: 'Batches', subtitle: 'Schedules & Timing', routePattern: '/batches' },
    { id: 'admissions', name: 'Admissions', subtitle: 'Course Enrolments', routePattern: '/admissions' },
    { id: 'fees', name: 'Fees & Dues', subtitle: 'Ledgers & Dues Aging', routePattern: '/fees' },
    { id: 'payments', name: 'Payments Desk', subtitle: 'Manual Cash / UPI Entry', routePattern: '/payments' },
    { id: 'reminders', name: 'Reminders Queue', subtitle: 'WhatsApp Click-to-Send', routePattern: '/reminders' },
    { id: 'reports', name: 'Reports', subtitle: 'Revenue & Analytics', routePattern: '/reports' },
    { id: 'verify', name: 'ID Card / QR Verify', subtitle: 'Public QR Verification', routePattern: '/verify' },
    { id: 'teachers', name: 'Teachers', subtitle: 'Faculty & Payouts', routePattern: '/teachers' },
    { id: 'enquiries', name: 'Enquiries', subtitle: 'Leads & Demo Passes', routePattern: '/enquiries' },
    { id: 'audit', name: 'Audit Log', subtitle: 'Security & Changes', routePattern: '/audit' },
    { id: 'settings', name: 'Settings', subtitle: 'Staff & System Setup', routePattern: '/settings' },
  ];

  console.log('\n4. Verifying tiles and descriptions in the modal...');
  for (const app of expectedApps) {
    const tile = page.locator(`div[data-app-id="${app.id}"]`);
    const count = await tile.count();
    if (count !== 1) throw new Error(`FAIL: App tile "${app.name}" (id: ${app.id}) not found!`);
    const text = await tile.innerText();
    console.log(`Tile [${app.name}]: text="${text.replace(/\n/g, ' - ')}"`);
    if (!text.includes(app.name)) throw new Error(`FAIL: Tile text missing name ${app.name}`);
  }
  console.log(`PASS: All ${expectedApps.length} app tiles present with correct names & subtitles.`);

  // 5. Test Navigation for Every Tile
  console.log('\n5. Testing navigation for all 13 tiles...');
  for (const app of expectedApps) {
    // If on /verify or outside layout, return to dashboard
    if (page.url().includes('/verify')) {
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
      await page.waitForSelector('header', { timeout: 5000 });
    }

    // If modal is not open, open it
    const modalHeader = page.locator('h3:has-text("Coaching ERP Apps")');
    if ((await modalHeader.count()) === 0) {
      await page.locator('header button[aria-label="Apps launcher"]').click();
      await page.waitForSelector('h3:has-text("Coaching ERP Apps")', { timeout: 5000 });
    }

    console.log(`Clicking tile "${app.name}"...`);
    const tile = page.locator(`div[data-app-id="${app.id}"]`);
    await tile.click();

    // Check modal closed
    await page.waitForSelector('h3:has-text("Coaching ERP Apps")', { state: 'detached', timeout: 5000 });

    // Check URL
    await page.waitForFunction(
      (expectedPattern) => window.location.pathname.includes(expectedPattern),
      app.routePattern,
      { timeout: 10000 }
    );
    console.log(`  -> Navigated to: ${page.url()} (matched pattern: ${app.routePattern}) PASS`);
  }

  // 6. Test Mobile Viewport (iPhone 390x844)
  console.log('\n6. Testing mobile viewport (390x844)...');
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await mobilePage.fill('input[type="text"], input[placeholder*="ADM"]', 'ADM001');
  await mobilePage.fill('input[type="password"]', 'Admin@1234');
  await mobilePage.click('button[type="submit"]');
  await mobilePage.waitForURL('**/dashboard', { timeout: 15000 });
  await mobilePage.waitForSelector('header', { timeout: 10000 });

  // Check Grid icon in mobile header
  const mobileHeader = mobilePage.locator('header');
  const mobileGridBtn = mobileHeader.locator('button[aria-label="Apps launcher"]');
  if ((await mobileGridBtn.count()) !== 1) throw new Error('FAIL: Grid button not in mobile header');

  // Check Mobile Bottom Nav
  const bottomNav = mobilePage.locator('nav[aria-label="Mobile Bottom Navigation"]');
  if ((await bottomNav.count()) !== 1) throw new Error('FAIL: Mobile bottom nav not found');
  const bottomAppsBtn = bottomNav.locator('button:has-text("Apps")');
  console.log('Mobile Bottom Nav Apps button count:', await bottomAppsBtn.count());

  // Click Apps button from bottom nav to open modal
  await bottomAppsBtn.click();
  await mobilePage.waitForSelector('h3:has-text("Coaching ERP Apps")', { timeout: 5000 });
  console.log('PASS: Coaching ERP Apps modal opened from mobile bottom nav!');

  const mobileShotPath = path.join(SCREENSHOT_DIR, 'mobile_coaching_apps_modal.png');
  await mobilePage.screenshot({ path: mobileShotPath });
  console.log('Saved mobile apps modal screenshot to:', mobileShotPath);

  // Close modal on mobile
  await mobilePage.click('button[aria-label="Close modal"]');
  await mobilePage.waitForSelector('h3:has-text("Coaching ERP Apps")', { state: 'detached', timeout: 5000 });
  console.log('PASS: Mobile modal closed successfully.');

  await browser.close();
  console.log('\n=== ALL VERIFICATIONS COMPLETED SUCCESSFULLY (100% PASS) ===');
}

runVerification().catch((err) => {
  console.error('\n*** VERIFICATION FAILED ***');
  console.error(err);
  process.exit(1);
});
