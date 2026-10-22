import fs from 'fs';
import path from 'path';
import { processApplication } from './auto-apply-browser.mjs';

const trackerPath = path.resolve('data/applications.md');
const historyPath = path.resolve('data/auto-apply-history.tsv');

if (!fs.existsSync(trackerPath)) {
  console.error('data/applications.md not found');
  process.exit(1);
}

// Read completed URLs history
const completedUrls = new Set();
if (fs.existsSync(historyPath)) {
  const historyContent = fs.readFileSync(historyPath, 'utf8');
  historyContent.split('\n').forEach(line => {
    const parts = line.split('\t');
    if (parts[0]) completedUrls.add(parts[0].trim());
  });
}

const trackerContent = fs.readFileSync(trackerPath, 'utf8');
const lines = trackerContent.split('\n');

const targetUrls = [];

for (const line of lines) {
  const reportMatch = line.match(/\[Report\]\(reports\/([^)]+)\.md\)/);
  if (reportMatch) {
    const reportFile = path.join('reports', `${reportMatch[1]}.md`);
    if (fs.existsSync(reportFile)) {
      const repContent = fs.readFileSync(reportFile, 'utf8');
      const urlMatch = repContent.match(/\*\*URL:\*\*\s*(https?:\/\/\S+)/);
      if (urlMatch) {
        const url = urlMatch[1].trim();
        if (!completedUrls.has(url)) {
          targetUrls.push({
            num: reportMatch[1],
            url: url
          });
        }
      }
    }
  }
}

const batchLimit = parseInt(process.argv[2], 10) || 2500;
const concurrency = parseInt(process.argv[3], 10) || 6; // 6 parallel workers

const selected = targetUrls.slice(0, batchLimit);

console.log(`\n🚀 Starting Accelerated Batch Form Filling:`);
console.log(`- Total Items: ${selected.length}`);
console.log(`- Parallel Browser Workers: ${concurrency}`);
console.log(`- Already Completed: ${completedUrls.size}\n`);

let processedCount = 0;
let filledCount = 0;
let errorCount = 0;

async function worker(queue, workerId) {
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;

    processedCount++;
    const currentIdx = processedCount;
    console.log(`[Worker ${workerId}] [${currentIdx}/${selected.length}] Auto-filling Report #${item.num}...`);

    try {
      const res = await processApplication(item.url, true);
      const dateStr = new Date().toISOString();
      
      if (res && res.success) {
        filledCount++;
        fs.appendFileSync(historyPath, `${item.url}\tSUCCESS\t${res.fieldsFilled}\t${res.atsType}\t${dateStr}\n`, 'utf8');
      } else {
        errorCount++;
        fs.appendFileSync(historyPath, `${item.url}\tFAILED\t0\t${res ? res.error : 'unknown'}\t${dateStr}\n`, 'utf8');
      }
    } catch (err) {
      errorCount++;
      const dateStr = new Date().toISOString();
      fs.appendFileSync(historyPath, `${item.url}\tFAILED\t0\t${err.message}\t${dateStr}\n`, 'utf8');
    }
  }
}

const queue = [...selected];
const workers = [];

for (let w = 1; w <= concurrency; w++) {
  workers.push(worker(queue, w));
}

await Promise.all(workers);

console.log(`\n==================================================`);
console.log(`🎉 Concurrent Form Filling Batch Completed!`);
console.log(`Total Processed: ${selected.length}`);
console.log(`Successfully Auto-filled: ${filledCount}`);
console.log(`Errors/Skipped: ${errorCount}`);
console.log(`Logged results to: ${historyPath}`);
console.log(`==================================================`);
