import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import * as yaml from 'js-yaml';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';

// Candidate data comes from config/profile.yml (the single source of truth),
// never from values typed into this script.
function withScheme(u) {
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

export function loadCandidate(root = getCareerOpsRoot()) {
  const profilePath = path.join(root, 'config', 'profile.yml');
  if (!fs.existsSync(profilePath)) {
    throw new Error(`config/profile.yml not found at ${profilePath} — run onboarding first.`);
  }
  const c = (yaml.load(fs.readFileSync(profilePath, 'utf8')) || {}).candidate || {};
  if (!c.full_name || !c.email) throw new Error('config/profile.yml needs candidate.full_name and candidate.email');
  const parts = String(c.full_name).trim().split(/\s+/);
  return {
    name: c.full_name,
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
    email: c.email,
    phone: c.phone || '',
    location: c.location || '',
    linkedin: withScheme(c.linkedin),
    github: withScheme(c.github),
    website: withScheme(c.portfolio_url || c.github),
  };
}

// The CV to attach: an explicit path wins, otherwise the newest PDF in output/.
export function findCvPdf(explicit, root = getCareerOpsRoot()) {
  if (explicit) {
    const abs = path.resolve(explicit);
    if (!fs.existsSync(abs)) throw new Error(`CV not found: ${explicit}`);
    return abs;
  }
  const outDir = path.join(root, 'output');
  if (!fs.existsSync(outDir)) return null;
  const pdfs = fs.readdirSync(outDir, { recursive: true })
    .filter((f) => String(f).toLowerCase().endsWith('.pdf'))
    .map((f) => path.join(outDir, String(f)))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return pdfs[0] || null;
}

export async function fillPage(page, url, { candidate = loadCandidate(), cvPath = findCvPdf() } = {}) {
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
  // Exact full-name fields only: a loose *name* match also hits company_name / last_name.
  const nameSelectors = ['input[name="name"]', 'input[id="name"]', 'input[name="full_name"]', 'input[autocomplete="name"]', 'input[aria-label="Full name" i]'];
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

  // Free-text questions ("Why us?", cover letter, ...) need answers written for
  // this job, so they are listed for the human instead of filled with one bio.
  const openQuestions = [];
  const textareas = page.locator('textarea');
  const taCount = await textareas.count();
  for (let i = 0; i < taCount; i++) {
    const ta = textareas.nth(i);
    if (!(await ta.isVisible()) || (await ta.inputValue()).trim()) continue;
    const label = await ta.evaluate((el) => {
      const byFor = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      const text = (byFor && byFor.textContent) || el.getAttribute('aria-label') || el.placeholder || el.name || '';
      return text.replace(/\s+/g, ' ').trim();
    });
    openQuestions.push(label || `Text field #${i + 1}`);
  }

  if (cvPath) {
    const fileInputs = page.locator('input[type="file"]');
    const fileCount = await fileInputs.count();
    for (let i = 0; i < fileCount; i++) {
      try {
        await fileInputs.nth(i).setInputFiles(cvPath);
        fieldsFilled++;
        console.log(`✓ Attached CV (${path.basename(cvPath)})`);
        break;
      } catch (e) {
        // file input might be hidden or styled
      }
    }
  } else {
    console.log('⚠️ No CV PDF found in output/ — attach it yourself, or pass --cv <file.pdf>.');
  }

  if (openQuestions.length) {
    console.log('\n✍️  Answer these yourself before submitting:');
    openQuestions.forEach((q) => console.log(`   • ${q}`));
  }

  console.log(`\n🎉 Successfully filled ${fieldsFilled} candidate form fields for ${title}`);
  return { success: true, fieldsFilled, title, atsType, openQuestions };
}

export async function processApplication(url, isHeadless = true, keepOpen = false, fillOptions = {}) {
  console.log(`\n==================================================`);
  console.log(`[Auto-Apply] Processing URL: ${url}`);
  console.log(`==================================================`);

  const browser = await chromium.launch({ headless: isHeadless });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    const res = await fillPage(page, url, fillOptions);
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

// Script CLI runner: node auto-apply-browser.mjs <job-url> [--cv output/cv.pdf]
if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2);
  const target = args.find((arg) => arg.startsWith('http'));
  const cvIdx = args.indexOf('--cv');
  if (!target) {
    console.error('Usage: node auto-apply-browser.mjs <job-url> [--cv <file.pdf>]');
    process.exit(1);
  }
  const fillOptions = { candidate: loadCandidate(), cvPath: findCvPdf(cvIdx !== -1 ? args[cvIdx + 1] : undefined) };
  // Always visible: the point is to leave the filled form open for you to submit.
  processApplication(target, false, true, fillOptions);
}
