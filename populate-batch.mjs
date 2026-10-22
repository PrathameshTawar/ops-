import fs from 'fs';
import path from 'path';

const pipelinePath = path.resolve('data/pipeline.md');
const batchInputPath = path.resolve('batch/batch-input.tsv');

if (!fs.existsSync(pipelinePath)) {
  console.error('data/pipeline.md not found');
  process.exit(1);
}

const content = fs.readFileSync(pipelinePath, 'utf8');
const lines = content.split('\n');

const pendingLines = [];
let isPendingSection = false;

for (const line of lines) {
  if (line.startsWith('## Pending')) {
    isPendingSection = true;
    continue;
  }
  if (line.startsWith('## ') && isPendingSection) {
    break;
  }
  if (isPendingSection && line.trim().startsWith('- [ ]')) {
    pendingLines.push(line.trim());
  }
}

// Format of line: - [ ] https://... | Company | Title | Location | posted: ...
const items = [];
let idCounter = 1;

for (const line of pendingLines) {
  const match = line.match(/- \[ \] (\S+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)(?:\s*\|\s*([^|]+))?/);
  if (match) {
    const [, url, company, title, location] = match;
    items.push({
      id: idCounter++,
      url: url.trim(),
      company: company.trim(),
      title: title.trim(),
      location: (location || '').trim(),
    });
  }
}

console.log(`Total pending items parsed from pipeline: ${items.length}`);

// Filter strictly for target profile roles: Internship, AI, ML, Software, RAG, Agent, Research, Developer, Engineering
const targetKeywords = [
  'intern', 'internship', 'co-op', 'coop', 'trainee', 'fellow', 'graduate', 'student', 'research',
  'ai', 'ml', 'machine learning', 'software', 'engineer', 'developer', 'python', 'rag', 'agent',
  'full-stack', 'fullstack', 'backend', 'frontend', 'data science', 'deep learning', 'nlp', 'llm'
];

const filteredInternships = items.filter(item => {
  const t = item.title.toLowerCase();
  return targetKeywords.some(k => t.includes(k));
});

console.log(`Filtered target AI/ML Internship items: ${filteredInternships.length}`);

// Ensure batch directory exists
if (!fs.existsSync('batch')) {
  fs.mkdirSync('batch', { recursive: true });
}

// Write to batch/batch-input.tsv (tsv format: id \t url \t source \t notes)
const tsvLines = ['id\turl\tsource\tnotes'];
filteredInternships.forEach((item, index) => {
  tsvLines.push(`${index + 1}\t${item.url}\t${item.company}\t${item.title} | ${item.location}`);
});

fs.writeFileSync(batchInputPath, tsvLines.join('\n'), 'utf8');

console.log(`Successfully updated ${batchInputPath} with ${filteredInternships.length} internship opportunities!`);
