import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// Candidate profile data
export const candidate = {
  name: "Prathamesh Taware",
  firstName: "Prathamesh",
  lastName: "Taware",
  email: "tawareprathamesh1010@gmail.com",
  phone: "+91 8208199820",
  location: "Pune, Maharashtra, India",
  linkedin: "https://linkedin.com/in/prathamesh-taware",
  github: "https://github.com/PrathameshTawar",
  website: "https://github.com/PrathameshTawar",
  bio: "AI Engineer & Systems Developer specializing in multi-agent orchestration (LangGraph, FastAPI), high-precision RAG (Qdrant, Pinecone), and LLM memory protocols (GML patent filed)."
};

export async function fillPage(page, url) {
  let attempts = 0;
  let pageLoaded = false;

  while (attempts < 2 && !pageLoaded) {
    attempts++;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(1500);
      pageLoaded = true;
    } catch (e) {
      if (attempts >= 2) throw e;
      console.log(`[Retry ${attempts}] Retrying navigation for ${url}...`);
      await page.waitForTimeout(2000);
    }
  }

  const title = await page.title();
  console.log(`[Page Title]: ${title}`);

  // Click 'Apply' button if form is collapsed or on a secondary view
  const applyButtons = [
    'button:has-text("Apply")', 
    'a:has-text("Apply")', 
    '[data-testid="apply-button"]', 
    '#apply_button',
    'a[href*="#app"]'
  ];

  for (const btnSel of applyButtons) {
    const btn = page.locator(btnSel).first();
    if (await btn.count() > 0 && await btn.isVisible()) {
      try {
        await btn.click();
        console.log(`✓ Clicked Apply button (${btnSel})`);
        await page.waitForTimeout(1500);
        break;
      } catch (e) {
        // ignore click block
      }
    }
  }

  // Scroll to form fields
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await page.waitForTimeout(1000);

  // Detect ATS platform
  const href = url.toLowerCase();
  let atsType = 'generic';
  if (href.includes('ashbyhq.com')) atsType = 'ashby';
  else if (href.includes('greenhouse.io') || href.includes('greenhouse')) atsType = 'greenhouse';
  else if (href.includes('lever.co')) atsType = 'lever';
  else if (href.includes('workday') || href.includes('myworkdayjobs')) atsType = 'workday';

  console.log(`[ATS Vendor Detected]: ${atsType.toUpperCase()}`);

  let fieldsFilled = 0;

  // Fill Name
  const nameSelectors = ['input[name="name"]', 'input[id*="name"]', 'input[autocomplete="name"]', 'input[aria-label*="Name"]'];
  for (const sel of nameSelectors) {
    const el = page.locator(sel).first();
    if (await el.count() > 0 && await el.isVisible()) {
      await el.fill(candidate.name);
      fieldsFilled++;
      console.log(`✓ Filled Name (${sel})`);
      break;
    }
  }

  // Fill First / Last Name if split
  const fnSel = page.locator('input[name*="first"], input[id*="first"]').first();
  if (await fnSel.count() > 0 && await fnSel.isVisible()) {
    await fnSel.fill(candidate.firstName);
    fieldsFilled++;
    console.log('✓ Filled First Name');
  }
  const lnSel = page.locator('input[name*="last"], input[id*="last"]').first();
  if (await lnSel.count() > 0 && await lnSel.isVisible()) {
    await lnSel.fill(candidate.lastName);
    fieldsFilled++;
    console.log('✓ Filled Last Name');
  }

  // Fill Email
  const emailSelectors = ['input[type="email"]', 'input[name="email"]', 'input[id*="email"]', 'input[autocomplete="email"]'];
  for (const sel of emailSelectors) {
    const el = page.locator(sel).first();
    if (await el.count() > 0 && await el.isVisible()) {
      await el.fill(candidate.email);
      fieldsFilled++;
      console.log(`✓ Filled Email (${sel})`);
      break;
    }
  }

  // Fill Phone
  const phoneSelectors = ['input[type="tel"]', 'input[name*="phone"]', 'input[id*="phone"]', 'input[autocomplete="tel"]'];
  for (const sel of phoneSelectors) {
    const el = page.locator(sel).first();
    if (await el.count() > 0 && await el.isVisible()) {
      await el.fill(candidate.phone);
      fieldsFilled++;
      console.log(`✓ Filled Phone (${sel})`);
      break;
    }
  }

  // Fill Location / Address
  const locSelectors = ['input[name*="location"]', 'input[id*="location"]', 'input[name*="address"]', 'input[placeholder*="Location"]'];
  for (const sel of locSelectors) {
    const el = page.locator(sel).first();
    if (await el.count() > 0 && await el.isVisible()) {
      await el.fill(candidate.location);
      fieldsFilled++;
      console.log(`✓ Filled Location (${sel})`);
      break;
    }
  }

  // Fill LinkedIn
  const liSelectors = ['input[name*="linkedin"]', 'input[id*="linkedin"]', 'input[aria-label*="LinkedIn"]', 'input[placeholder*="LinkedIn"]'];
  for (const sel of liSelectors) {
    const el = page.locator(sel).first();
    if (await el.count() > 0 && await el.isVisible()) {
      await el.fill(candidate.linkedin);
      fieldsFilled++;
      console.log(`✓ Filled LinkedIn (${sel})`);
      break;
    }
  }

  // Fill GitHub / Website
  const ghSelectors = ['input[name*="github"]', 'input[id*="github"]', 'input[name*="website"]', 'input[name*="portfolio"]', 'input[placeholder*="Website"]'];
  for (const sel of ghSelectors) {
    const el = page.locator(sel).first();
    if (await el.count() > 0 && await el.isVisible()) {
      await el.fill(candidate.github);
      fieldsFilled++;
      console.log(`✓ Filled GitHub / Website (${sel})`);
      break;
    }
  }

  // Fill Textarea / Cover Letter / Additional Info
  const textareas = page.locator('textarea');
  const taCount = await textareas.count();
  for (let i = 0; i < taCount; i++) {
    const ta = textareas.nth(i);
    if (await ta.isVisible()) {
      await ta.fill(candidate.bio);
      fieldsFilled++;
      console.log(`✓ Filled Free-Text / Cover Letter field #${i + 1}`);
    }
  }

  // Attach CV / Resume PDF if present
  const cvCandidates = [
    path.resolve('cv.pdf'),
    path.resolve('output/Prathamesh_Taware_Resume.pdf'),
    'C:\\Users\\HP\\Downloads\\Prathamesh_Taware_Resume_Final_OnePage.pdf'
  ];
  const cvPath = cvCandidates.find(p => fs.existsSync(p));
  if (cvPath) {
    const fileInputs = page.locator('input[type="file"]');
    const fileCount = await fileInputs.count();
    for (let i = 0; i < fileCount; i++) {
      const fi = fileInputs.nth(i);
      try {
        await fi.setInputFiles(cvPath);
        fieldsFilled++;
        console.log(`✓ Attached Resume PDF (${path.basename(cvPath)})`);
        break;
      } catch (e) {
        // file input might be hidden or styled
      }
    }
  }

  console.log(`\n🎉 Successfully filled ${fieldsFilled} candidate form fields for ${title}`);
  return { success: true, fieldsFilled, title, atsType };
}

export async function processApplication(url, isHeadless = true, keepOpen = false) {
  console.log(`\n==================================================`);
  console.log(`[Auto-Apply] Processing URL: ${url}`);
  console.log(`==================================================`);

  const browser = await chromium.launch({ headless: isHeadless });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    const res = await fillPage(page, url);
    return res;
  } catch (err) {
    console.error(`❌ Application auto-fill error on ${url}:`, err.message);
    return { success: false, error: err.message };
  } finally {
    if (!keepOpen) {
      await browser.close();
    } else {
      console.log('\n👁️ Browser window is open on your screen with all fields filled.');
      console.log('👉 Review your answers on the page and click "Submit Application" when ready.');
      console.log('(Close the browser window or press Ctrl+C in terminal when finished)');
      await new Promise(resolve => {
        page.on('close', resolve);
        browser.on('disconnected', resolve);
      });
    }
  }
}

// Script CLI runner
if (process.argv[1] && process.argv[1].endsWith('auto-apply-browser.mjs')) {
  const isHeadless = process.argv.includes('--headless');
  const target = process.argv.find(arg => arg.startsWith('http')) || 'https://job-boards.greenhouse.io/anthropic/jobs/5183051008';
  processApplication(target, isHeadless, !isHeadless);
}
