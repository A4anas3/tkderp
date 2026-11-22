import { chromium } from '/home/ubuntu/antigravity/profiles/a4anaskhanshab_at_gmail_com/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:8080';
const SCREENSHOT_DIR = path.resolve('verification_screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function verify() {
  console.log('====================================================');
  console.log(' THAKURDWARA ERP - APP-WIDE TEXT & CONTRAST VERIFICATION');
  console.log('====================================================');

  // 1. Backend health
  console.log('\n[1/4] Checking backend health...');
  const healthRes = await fetch(`${API_URL}/health`);
  const healthJson = await healthRes.json();
  console.log('Backend response:', JSON.stringify(healthJson));
  if (healthRes.status !== 200 || healthJson.status !== 'healthy') {
    throw new Error('Backend health check failed');
  }
  console.log('✓ Backend health OK');

  // 2. Launch browser at mobile phone width (iPhone: 390x844)
  console.log('\n[2/4] Launching headless Chromium at phone width (390x844)...');
  const browser = await chromium.launch({
    executablePath: '/home/ubuntu/antigravity/profiles/a4anaskhanshab_at_gmail_com/.cache/ms-playwright/chromium-1255/chrome-linux-arm64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  // 3. Login
  console.log('\n[3/4] Authenticating as Admin (ADM001)...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="text"], input[placeholder*="ADM"]', 'ADM001');
  await page.fill('input[type="password"]', 'Admin@1234');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  console.log('✓ Login successful, redirected to dashboard');

  // 4. Test all main pages
  console.log('\n[4/4] Sweeping all main pages at phone width...');
  const pagesToTest = [
    { name: 'Dashboard', url: '/dashboard', screenshot: '01_dashboard.png' },
    { name: 'Students', url: '/students', screenshot: '02_students.png' },
    { name: 'Subjects', url: '/subjects', screenshot: '03_subjects.png' },
    { name: 'Admissions', url: '/admissions', screenshot: '04_admissions.png' },
    { name: 'Payments', url: '/payments', screenshot: '05_payments.png' },
    { name: 'Batches', url: '/batches', screenshot: '06_batches.png' },
    { name: 'Teachers / Faculty', url: '/teachers', screenshot: '07_teachers.png' },
    { name: 'Enquiries', url: '/enquiries', screenshot: '08_enquiries.png' },
    { name: 'Expenses', url: '/expenses', screenshot: '09_expenses.png' },
    { name: 'Reports - Subject Revenue', url: '/reports/subject-revenue', screenshot: '10_subject_revenue.png' },
    { name: 'Reports - Cash Flow', url: '/reports/cash-flow', screenshot: '11_cash_flow.png' },
    { name: 'Green Card', url: '/green-card', screenshot: '12_green_card.png' },
    { name: 'Audit Logs', url: '/audit-logs', screenshot: '13_audit_logs.png' }
  ];

  let totalFailures = 0;

  for (const item of pagesToTest) {
    console.log(`\n--- Testing ${item.name} (${item.url}) ---`);
    await page.goto(`${BASE_URL}${item.url}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const shotPath = path.join(SCREENSHOT_DIR, item.screenshot);
    await page.screenshot({ path: shotPath, fullPage: false });

    // Check for any white-on-white text or invisible buttons
    const scanResult = await page.evaluate(() => {
      function getEffectiveBg(el) {
        let cur = el;
        while (cur && cur !== document.documentElement) {
          const s = window.getComputedStyle(cur);
          const bg = s.backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
            return bg;
          }
          cur = cur.parentElement;
        }
        return 'rgb(255, 255, 255)';
      }

      function parseRgb(str) {
        const m = str.match(/\d+/g);
        if (!m || m.length < 3) return null;
        return { r: parseInt(m[0]), g: parseInt(m[1]), b: parseInt(m[2]) };
      }

      function isLight(rgb) {
        if (!rgb) return true;
        return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) > 180;
      }

      const badElements = [];
      const all = document.querySelectorAll('*');

      for (const el of all) {
        let directText = '';
        for (const child of el.childNodes) {
          if (child.nodeType === Node.TEXT_NODE && child.textContent.trim().length > 0) {
            directText += ' ' + child.textContent.trim();
          }
        }
        directText = directText.trim();
        if (!directText) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const s = window.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) continue;

        const textColor = parseRgb(s.color);
        const bgColor = parseRgb(getEffectiveBg(el));

        if (textColor && bgColor) {
          const textIsLight = isLight(textColor);
          const bgIsLight = isLight(bgColor);
          if (textIsLight && bgIsLight) {
            badElements.push({
              tag: el.tagName,
              text: directText.substring(0, 40),
              color: s.color,
              bgColor: getEffectiveBg(el),
              class: el.className
            });
          }
        }
      }

      // Check buttons
      const buttons = Array.from(document.querySelectorAll('button')).map(b => {
        const s = window.getComputedStyle(b);
        return {
          text: b.innerText.trim().replace(/\n/g, ' '),
          color: s.color,
          bgColor: s.backgroundColor,
          visible: s.display !== 'none' && s.visibility !== 'hidden' && b.offsetWidth > 0
        };
      }).filter(b => b.visible && b.text.length > 0);

      const invisibleButtons = buttons.filter(b => {
        const isWhiteText = b.color === 'rgb(255, 255, 255)';
        const isLightBg = b.bgColor === 'rgb(255, 255, 255)' || b.bgColor === 'rgba(0, 0, 0, 0)' || b.bgColor.includes('248, 250, 252');
        return isWhiteText && isLightBg;
      });

      return {
        badElements,
        invisibleButtons,
        buttonCount: buttons.length,
        sampleButtons: buttons.slice(0, 4)
      };
    });

    if (scanResult.invisibleButtons.length > 0) {
      console.error(`❌ INVISIBLE BUTTONS FOUND on ${item.name}:`, scanResult.invisibleButtons);
      totalFailures++;
    } else {
      console.log(`✓ All ${scanResult.buttonCount} buttons have solid contrasting background.`);
    }

    if (scanResult.badElements.length > 0) {
      console.error(`❌ White-on-light text elements found on ${item.name}:`, scanResult.badElements);
      totalFailures++;
    } else {
      console.log(`✓ 0 white-on-white text issues detected.`);
    }

    // Specific check for Faculty & Teachers 'Add Teacher' button
    if (item.url === '/teachers') {
      console.log('\n--- EXPLICIT VERIFICATION: Faculty "Add Teacher" Button ---');
      const addTeacherBtn = await page.$('button:has-text("Add Teacher")');
      if (!addTeacherBtn) {
        throw new Error('Faculty "Add Teacher" button not found on page!');
      }

      const btnInfo = await page.evaluate(el => {
        const s = window.getComputedStyle(el);
        return {
          text: el.innerText.trim(),
          color: s.color,
          backgroundColor: s.backgroundColor,
          display: s.display,
          visibility: s.visibility,
          width: el.offsetWidth,
          height: el.offsetHeight,
          className: el.className
        };
      }, addTeacherBtn);

      console.log('Button details:');
      console.log('  Label:           ', btnInfo.text);
      console.log('  Color:           ', btnInfo.color);
      console.log('  BackgroundColor: ', btnInfo.backgroundColor);
      console.log('  Dimensions:      ', `${btnInfo.width}px x ${btnInfo.height}px`);
      console.log('  Classes:         ', btnInfo.className);

      // Verify colors: white text (#ffffff) on aubergine odoo-600 (#714b67 = rgb(113, 75, 103))
      if (btnInfo.color !== 'rgb(255, 255, 255)') {
        throw new Error(`Expected text color rgb(255, 255, 255), got ${btnInfo.color}`);
      }
      if (btnInfo.backgroundColor !== 'rgb(113, 75, 103)') {
        throw new Error(`Expected background rgb(113, 75, 103), got ${btnInfo.backgroundColor}`);
      }
      console.log('✓ Faculty "Add Teacher" button is EXPLICITLY CONFIRMED VISIBLE with strong contrast (white on aubergine rgb(113, 75, 103))!');
    }
  }

  await browser.close();

  if (totalFailures > 0) {
    throw new Error(`Verification failed with ${totalFailures} page issues.`);
  }

  console.log('\n====================================================');
  console.log(' ✓ ALL MAIN PAGES VERIFIED: 0 INVISIBLE/WHITE TEXT');
  console.log('====================================================\n');
}

verify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
