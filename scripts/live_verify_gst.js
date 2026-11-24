const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '/home/ubuntu/antigravity/profiles/a4anaskhanshab_at_gmail_com/.cache/ms-playwright';

async function runLiveVerification() {
  console.log('--- STARTING LIVE VERIFICATION OF GST FEATURE ---');
  const screenshotDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  try {
    // 1. Login
    console.log('1. Navigating to login page...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=THAKURDWARA COACHING', { timeout: 10000 });

    console.log('   Clicking "Sign In to ERP"...');
    await page.click('button:has-text("Sign In to ERP")');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
    console.log('   Logged in successfully as ADM001.');

    // 2. Navigate to Institute Settings & Save GST Details
    console.log('2. Navigating to /settings to save institute GST details...');
    await page.goto('http://localhost:5173/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Institute & GST Settings', { timeout: 10000 });

    const savedGstin = '09AAACT9876F1Z2';
    const savedRate = '18.00';

    const gstinInput = page.locator('input[placeholder="e.g. 09AAACT1234F1Z5"]');
    const rateInput = page.locator('input[placeholder="18.00"]');
    await gstinInput.fill(savedGstin);
    await rateInput.fill(savedRate);

    const saveButton = page.locator('button:has-text("Save Institute & GST Details")');
    await saveButton.click();
    await page.waitForSelector('text=Institute GST & Profile details saved successfully!', { timeout: 5000 });
    console.log(`   Saved Institute GSTIN: ${savedGstin} and GST Rate: ${savedRate}%`);
    await page.screenshot({ path: path.join(screenshotDir, '01_settings_saved.png') });

    // Fetch token from localStorage
    const token = await page.evaluate(() => localStorage.getItem('token'));
    
    // Fetch a student and subject for creating new slips
    const refData = await page.evaluate(async (tok) => {
      const headers = { 'Authorization': `Bearer ${tok}`, 'Content-Type': 'application/json' };
      const stuRes = await fetch('/api/students?page=1&page_size=5', { headers }).then(r => r.json());
      const subRes = await fetch('/api/subjects/all', { headers }).then(r => r.json());
      const subjectsList = Array.isArray(subRes) ? subRes : (subRes.items || []);
      return {
        student: stuRes.items[0],
        subject: subjectsList[0]
      };
    }, token);

    const student = refData.student;
    const subject = refData.subject;
    const subjectFee = parseFloat(subject.default_fee) || 1000;
    console.log(`   Reference Student: ${student.name} (${student.id}), Subject: ${subject.name} (Fee: ₹${subjectFee})`);

    // Helper to clean formatted currency
    const cleanNum = (str) => parseFloat(str.replace(/[^0-9.]/g, ''));

    // 3. Create a slip with GST ENABLED
    console.log('\n3. Creating a new admission slip with GST ENABLED...');
    const gstAdmission = await page.evaluate(async ({ tok, stuId, subId, subName, fee, gstin, rate }) => {
      const today = new Date().toISOString().split('T')[0];
      const payload = {
        student_id: stuId,
        admission_date: today,
        valid_from: today,
        valid_to: today,
        items: [{
          item_type: 'SUBJECT',
          subject_id: subId,
          item_name_snapshot: subName,
          original_price: fee,
          discount_type: 'NONE',
          discount_value: 0,
          months: 1,
        }],
        overall_discount_type: 'NONE',
        overall_discount_value: 0,
        gst_enabled: true,
        gst_rate: parseFloat(rate),
        gst_number: gstin,
        notes: 'Created via GST automated verification (GST ON)',
        initial_payment: {
          amount: fee,
          payment_mode: 'CASH',
          notes: 'Full payment at admission'
        }
      };
      const res = await fetch('/api/admissions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tok}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      return await res.json();
    }, {
      tok: token,
      stuId: student.id,
      subId: subject.id,
      subName: subject.name,
      fee: subjectFee,
      gstin: savedGstin,
      rate: savedRate
    });

    console.log(`   Created Admission with GST ON: ${gstAdmission.admission_number || gstAdmission.id}`);

    // Navigate to Admissions page and view this slip
    await page.goto('http://localhost:5173/admissions', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Course Purchases & Invoices', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Open slip for this newly created admission
    const gstSlipBtn = page.locator(`tr:has-text("${gstAdmission.admission_number || gstAdmission.id}") button:has-text("Slip")`).first();
    await gstSlipBtn.click();
    console.log('   Opened slip modal for admission created with GST ON.');

    await page.waitForSelector('text=Course Enrollment Slip', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Verify slip with GST ON:
    console.log('   Verifying slip contents for GST ON:');
    let bodyText = await page.innerText('body');
    const hasGstinOn = bodyText.includes('GSTIN / Tax ID') && bodyText.includes(savedGstin);
    console.log(`   - GSTIN shown at top: ${hasGstinOn ? 'YES (Correct)' : 'NO (Error!)'}`);
    if (!hasGstinOn) throw new Error(`GSTIN ${savedGstin} must appear at top of the slip when GST is ON`);

    const hasGstRowOn = bodyText.includes('GST (18%)') || bodyText.includes('GST (18.00%)') || bodyText.includes('GST (18.0%)');
    console.log(`   - GST line in charges table: ${hasGstRowOn ? 'YES (Correct)' : 'NO (Error!)'}`);
    if (!hasGstRowOn) throw new Error('GST charges line must appear in table when GST is ON');

    const totalRowOn = page.locator('tr:has-text("Total Net Course Fee") td').last();
    const totalTextOn = await totalRowOn.innerText();
    const actualTotalWithGst = cleanNum(totalTextOn);
    const expectedGstAmount = Math.round(subjectFee * 0.18 * 100) / 100;
    const expectedTotalWithGst = subjectFee + expectedGstAmount;
    console.log(`   - Base charges: ₹${subjectFee}, Expected 18% GST: ₹${expectedGstAmount}, Expected Total: ₹${expectedTotalWithGst}`);
    console.log(`   - Actual Total on Slip: ₹${actualTotalWithGst}`);

    if (Math.abs(actualTotalWithGst - expectedTotalWithGst) > 0.05) {
      throw new Error(`Total mismatch with GST! Expected ₹${expectedTotalWithGst}, got ₹${actualTotalWithGst}`);
    }
    console.log('   - Calculation verified: GST amount accurately added on top of fee charges.');
    await page.screenshot({ path: path.join(screenshotDir, '02_created_slip_gst_on.png') });

    // Close modal
    await page.click('button:has-text("Close")');
    await page.waitForTimeout(500);

    // 4. Create a slip with GST DISABLED (OFF)
    console.log('\n4. Creating a new admission slip with GST DISABLED (OFF)...');
    const nonGstAdmission = await page.evaluate(async ({ tok, stuId, subId, subName, fee }) => {
      const today = new Date().toISOString().split('T')[0];
      const payload = {
        student_id: stuId,
        admission_date: today,
        valid_from: today,
        valid_to: today,
        items: [{
          item_type: 'SUBJECT',
          subject_id: subId,
          item_name_snapshot: subName,
          original_price: fee,
          discount_type: 'NONE',
          discount_value: 0,
          months: 1,
        }],
        overall_discount_type: 'NONE',
        overall_discount_value: 0,
        gst_enabled: false,
        gst_rate: 0,
        notes: 'Created via GST automated verification (GST OFF)',
        initial_payment: {
          amount: fee,
          payment_mode: 'CASH',
          notes: 'Full payment at admission'
        }
      };
      const res = await fetch('/api/admissions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tok}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      return await res.json();
    }, {
      tok: token,
      stuId: student.id,
      subId: subject.id,
      subName: subject.name,
      fee: subjectFee
    });

    console.log(`   Created Admission with GST OFF: ${nonGstAdmission.admission_number || nonGstAdmission.id}`);

    // Reload admissions page and open the new non-GST slip
    await page.goto('http://localhost:5173/admissions', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Course Purchases & Invoices', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const nonGstSlipBtn = page.locator(`tr:has-text("${nonGstAdmission.admission_number || nonGstAdmission.id}") button:has-text("Slip")`).first();
    await nonGstSlipBtn.click();
    console.log('   Opened slip modal for admission created with GST OFF.');

    await page.waitForSelector('text=Course Enrollment Slip', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Verify slip with GST OFF:
    console.log('   Verifying slip contents for GST OFF:');
    bodyText = await page.innerText('body');
    const hasGstinOff = bodyText.includes('GSTIN / Tax ID');
    console.log(`   - GSTIN shown at top: ${hasGstinOff ? 'YES (Error!)' : 'NO (Correct)'}`);
    if (hasGstinOff) throw new Error('GSTIN must NOT appear on slip when GST is OFF');

    const hasGstRowOff = bodyText.includes('GST (18%)') || bodyText.includes('GST (18.00%)') || bodyText.includes('GST (0%)');
    console.log(`   - GST line in charges table: ${hasGstRowOff ? 'YES (Error!)' : 'NO (Correct)'}`);
    if (hasGstRowOff) throw new Error('GST charges line must NOT appear when GST is OFF');

    const totalRowOff = page.locator('tr:has-text("Total Net Course Fee") td').last();
    const totalTextOff = await totalRowOff.innerText();
    const actualTotalWithoutGst = cleanNum(totalTextOff);
    console.log(`   - Base charges: ₹${subjectFee}, Expected Total: ₹${subjectFee}`);
    console.log(`   - Actual Total on Slip: ₹${actualTotalWithoutGst}`);

    if (Math.abs(actualTotalWithoutGst - subjectFee) > 0.01) {
      throw new Error(`Total mismatch! Expected base ₹${subjectFee}, got ₹${actualTotalWithoutGst}`);
    }
    console.log('   - Slip unchanged: exactly matches standard fee structure with no GST shown.');
    await page.screenshot({ path: path.join(screenshotDir, '03_created_slip_gst_off.png') });

    // 5. Test Interactive Toggle on this Slip
    console.log('\n5. Testing interactive GST toggle on the fee slip...');
    const gstBtn = page.locator('button:has-text("GST:")');
    let btnText = await gstBtn.innerText();
    console.log(`   Current button state: "${btnText}"`);

    // Click toggle to turn GST ON
    console.log('   Toggling GST ON...');
    await gstBtn.click();
    await page.waitForTimeout(600);
    btnText = await gstBtn.innerText();
    console.log(`   Button state after toggle: "${btnText}"`);
    if (!btnText.includes('ON')) throw new Error('GST button failed to toggle ON');

    bodyText = await page.innerText('body');
    if (!bodyText.includes('GSTIN / Tax ID') || !bodyText.includes(savedGstin)) {
      throw new Error('GSTIN did not appear after toggling GST ON');
    }
    console.log('   - GSTIN now visible at top of slip.');

    const toggledTotalRow = page.locator('tr:has-text("Total Net Course Fee") td').last();
    const toggledTotal = cleanNum(await toggledTotalRow.innerText());
    console.log(`   - Total updated to include GST: ₹${toggledTotal} (Expected: ₹${expectedTotalWithGst})`);
    if (Math.abs(toggledTotal - expectedTotalWithGst) > 0.05) {
      throw new Error(`Toggled total mismatch! Expected ₹${expectedTotalWithGst}, got ₹${toggledTotal}`);
    }

    // Click toggle to turn GST back OFF
    console.log('   Toggling GST back OFF...');
    await gstBtn.click();
    await page.waitForTimeout(600);
    btnText = await gstBtn.innerText();
    console.log(`   Button state after toggling OFF: "${btnText}"`);

    bodyText = await page.innerText('body');
    if (bodyText.includes('GSTIN / Tax ID')) {
      throw new Error('GSTIN remained visible after toggling GST OFF');
    }
    const revertedTotal = cleanNum(await page.locator('tr:has-text("Total Net Course Fee") td').last().innerText());
    console.log(`   - Total reverted back to: ₹${revertedTotal} (Expected: ₹${subjectFee})`);
    if (Math.abs(revertedTotal - subjectFee) > 0.01) {
      throw new Error('Total did not revert back to base amount');
    }
    await page.screenshot({ path: path.join(screenshotDir, '04_interactive_toggle_reverted.png') });

    console.log('\n========================================================================');
    console.log('SUCCESS: ALL LIVE VERIFICATION CRITERIA VALIDATED WITH 100% PASS RATE!');
    console.log('========================================================================');
  } catch (err) {
    console.error('\nLIVE VERIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runLiveVerification();
