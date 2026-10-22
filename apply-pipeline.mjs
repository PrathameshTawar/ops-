/**
 * apply-pipeline.mjs — one-click-submit applying for the jobs in data/pipeline.md.
 *
 * Opens each pending job in a visible Chrome window, fills your details from
 * config/profile.yml and attaches your CV, then waits: you answer any
 * free-text questions, click Submit yourself, and press Enter for the next job.
 * Submitted jobs are ticked in data/pipeline.md and added to the tracker.
 *
 * Usage:
 *   npm run apply                                   # all pending jobs
 *   npm run apply -- --limit=10 --filter=pune       # first 10 matching "pune"
 *   npm run apply -- --cv output/cv-prathamesh.pdf  # pick the CV to attach
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { spawnSync } from 'child_process';
import { fillPage, loadCandidate, findCvPdf } from './auto-apply-browser.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { reserveReportNumbers, releaseReportNumbers } from './reserve-report-num.mjs';

const pipelinePath = path.resolve('data/pipeline.md');
const additionsDir = path.resolve('batch/tracker-additions');
const historyPath = path.resolve('data/auto-apply-history.tsv');

// Record a submitted application through the canonical tracker path: one TSV
// in batch/tracker-additions/ merged by merge-tracker.mjs (dedup, locking,
// sorting). There is no evaluation behind these rows, so the score is the N/A
// sentinel rather than an invented number.
export async function recordApplied(job, today, cvAttached) {
  const reserved = await reserveReportNumbers(1);
  const num = reserved[0];
  try {
    const slug = job.company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'company';
    const clean = (v) => String(v).replace(/[\t\r\n]+/g, ' ').trim();
    const row = [num, today, clean(job.company), clean(job.role), 'Applied', 'N/A', cvAttached ? '✅' : '❌', '-', clean(`Applied via pipeline runner; ${job.location}`), job.url].join('\t');
    fs.mkdirSync(additionsDir, { recursive: true });
    fs.writeFileSync(path.join(additionsDir, `${String(num).padStart(3, '0')}-${slug}.tsv`), row + '\n', 'utf8');
    const merge = spawnSync(process.execPath, ['merge-tracker.mjs'], { stdio: 'inherit' });
    if (merge.status !== 0) throw new Error('merge-tracker.mjs failed');
    return num;
  } finally {
    await releaseReportNumbers(reserved).catch(() => {});
  }
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
  const cvIdx = args.indexOf('--cv');
  const fillOptions = { candidate: loadCandidate(), cvPath: findCvPdf(cvIdx !== -1 ? args[cvIdx + 1] : undefined) };
  console.log(fillOptions.cvPath ? `📎 CV to attach: ${path.relative(process.cwd(), fillOptions.cvPath)}` : '⚠️ No CV PDF in output/ — forms will be filled without one (or pass --cv <file.pdf>).');

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
      fillResult = await fillPage(page, job.url, fillOptions);
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

    // 3. Record it in the tracker (data/applications.md)
    try {
      const num = await recordApplied(job, today, Boolean(fillOptions.cvPath));
      console.log(`✓ Tracked as Application #${num} in data/applications.md`);
    } catch (e) {
      console.error(`Warning updating applications.md: ${e.message}`);
    }

    console.log(`🎉 [${appliedCount} applied] Recorded as submitted for ${job.company}.`);
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

if (isMainModule(import.meta.url)) {
  runPipeline().catch(err => {
    console.error('Fatal error in pipeline runner:', err);
    process.exit(1);
  });
}
