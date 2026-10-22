import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fillPage } from './auto-apply-browser.mjs';

const pipelinePath = path.resolve('data/pipeline.md');
const trackerPath = path.resolve('data/applications.md');
const historyPath = path.resolve('data/auto-apply-history.tsv');

function getNextTrackerNumber(trackerContent) {
  const matches = [...trackerContent.matchAll(/\|\s*(\d+)\s*\|/g)];
  if (!matches.length) return 1;
  const numbers = matches.map(m => parseInt(m[1], 10)).filter(n => !isNaN(n));
  return Math.max(...numbers) + 1;
}

function askUser(rl, promptText) {
  return new Promise(resolve => {
    rl.question(promptText, answer => {
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function runPipeline() {
  if (!fs.existsSync(pipelinePath)) {
    console.error('❌ data/pipeline.md not found.');
    process.exit(1);
  }

  // Parse command line arguments
  const args = process.argv.slice(2);
  const filterArg = args.find(a => a.startsWith('--filter='))?.replace('--filter=', '').toLowerCase();
  const limitArg = args.find(a => a.startsWith('--limit='))?.replace('--limit=', '');
  const limit = limitArg ? parseInt(limitArg, 10) : Infinity;

  const pipelineContent = fs.readFileSync(pipelinePath, 'utf8');
  const lines = pipelineContent.split('\n');

  const pendingJobs = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^-\s*\[\s*\]\s*(https?:\/\/\S+)(.*)$/);
    if (match) {
      const url = match[1].trim();
      const meta = match[2] || '';
      const parts = meta.split('|').map(s => s.trim()).filter(Boolean);
      const company = parts[0] || 'Unknown';
      const role = parts[1] || 'Unknown Role';
      const location = parts[2] || 'Remote';

      // Check filter if provided
      if (filterArg) {
        const fullText = `${company} ${role} ${location} ${url}`.toLowerCase();
        if (!fullText.includes(filterArg)) continue;
      }

      pendingJobs.push({
        lineIndex: i,
        rawLine: line,
        url,
        company,
        role,
        location
      });
    }
  }

  if (pendingJobs.length === 0) {
    console.log('\n✅ No pending jobs found in pipeline' + (filterArg ? ` matching filter "${filterArg}".` : '.'));
    return;
  }

  const selectedJobs = pendingJobs.slice(0, limit);

  console.log(`\n======================================================================`);
  console.log(`🚀 CAREER-OPS INTERACTIVE PIPELINE APPLICANT`);
  console.log(`======================================================================`);
  console.log(`• Total pending jobs found: ${pendingJobs.length}`);
  console.log(`• Queue for this session:   ${selectedJobs.length}`);
  if (filterArg) console.log(`• Filter active:           "${filterArg}"`);
  console.log(`\nHow it works:`);
  console.log(`1. A Chrome browser window opens on your screen.`);
  console.log(`2. The AI auto-navigates and pre-fills the form with your details & CV.`);
  console.log(`3. You review in Chrome and click "Submit Application".`);
  console.log(`4. Press [Enter] here to save & open the next company (or 's' to skip, 'q' to quit).\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  let appliedCount = 0;
  let skippedCount = 0;

  for (let idx = 0; idx < selectedJobs.length; idx++) {
    const job = selectedJobs[idx];
    console.log(`\n──────────────────────────────────────────────────────────────────────`);
    console.log(`[Job ${idx + 1}/${selectedJobs.length}] ${job.company} — ${job.role}`);
    console.log(`Location: ${job.location}`);
    console.log(`URL:      ${job.url}`);
    console.log(`──────────────────────────────────────────────────────────────────────`);

    let fillResult = null;
    try {
      fillResult = await fillPage(page, job.url);
      await page.bringToFront().catch(() => {});
    } catch (e) {
      console.error(`⚠️ Could not auto-fill this form: ${e.message}`);
    }

    console.log(`\n👁️ Form is pre-filled in your open Chrome window.`);
    console.log(`👉 Review all fields, fill any company-specific questions, and click "Submit Application".`);
    console.log(`\nActions:`);
    console.log(`  [Enter] = Submitted! Save & load next company`);
    console.log(`  [s]     = Skip this job`);
    console.log(`  [q]     = Quit session & save progress\n`);

    const answer = await askUser(rl, 'Your choice (Enter / s / q): ');

    if (answer === 'q') {
      console.log('\n🛑 Quitting session. Your previous submissions were saved.');
      break;
    }

    if (answer === 's') {
      console.log(`⏭️ Skipped ${job.company}.`);
      skippedCount++;
      continue;
    }

    // Default or Enter -> Mark as applied
    appliedCount++;
    const today = new Date().toISOString().split('T')[0];

    // 1. Mark checkbox in data/pipeline.md
    try {
      const currentPipeline = fs.readFileSync(pipelinePath, 'utf8');
      const updatedPipeline = currentPipeline.replace(job.rawLine, job.rawLine.replace('- [ ]', '- [x]'));
      fs.writeFileSync(pipelinePath, updatedPipeline, 'utf8');
      console.log(`✓ Marked as applied (- [x]) in data/pipeline.md`);
    } catch (e) {
      console.error(`Warning updating pipeline.md: ${e.message}`);
    }

    // 2. Append to data/auto-apply-history.tsv
    try {
      const dateIso = new Date().toISOString();
      const fieldsCount = fillResult ? fillResult.fieldsFilled : 0;
      const ats = fillResult ? fillResult.atsType : 'generic';
      fs.appendFileSync(historyPath, `${job.url}\tSUCCESS\t${fieldsCount}\t${ats}\t${dateIso}\n`, 'utf8');
    } catch (e) {}

    // 3. Append row to data/applications.md tracker
    try {
      if (fs.existsSync(trackerPath)) {
        const trackerContent = fs.readFileSync(trackerPath, 'utf8');
        const nextNum = getNextTrackerNumber(trackerContent);
        const trackerRow = `| ${nextNum} | ${today} | ${job.company} | ${job.role} | 4.8/5 | Applied | ✅ | - | Applied via pipeline runner; ${job.location} |\n`;
        fs.appendFileSync(trackerPath, trackerRow, 'utf8');
        console.log(`✓ Tracked as Application #${nextNum} in data/applications.md`);
      }
    } catch (e) {
      console.error(`Warning updating applications.md: ${e.message}`);
    }

    console.log(`🎉 [${appliedCount} applied] Successfully submitted for ${job.company}!`);
  }

  rl.close();
  await browser.close().catch(() => {});

  console.log(`\n======================================================================`);
  console.log(`🏁 Pipeline Session Summary:`);
  console.log(`• Applied: ${appliedCount}`);
  console.log(`• Skipped: ${skippedCount}`);
  console.log(`• Remaining pending in pipeline: ${pendingJobs.length - appliedCount}`);
  console.log(`======================================================================\n`);
}

runPipeline().catch(err => {
  console.error('Fatal error in pipeline runner:', err);
  process.exit(1);
});
