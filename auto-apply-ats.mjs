import fs from 'fs';
import path from 'path';

// Candidate profile details
const candidate = {
  first_name: "Prathamesh",
  last_name: "Taware",
  full_name: "Prathamesh Taware",
  email: "tawareprathamesh1010@gmail.com",
  phone: "+91 8208199820",
  location: "Pune, Maharashtra, India",
  linkedin: "https://linkedin.com/in/prathamesh-taware",
  github: "https://github.com/PrathameshTawar",
  website: "https://github.com/PrathameshTawar"
};

/**
 * Submit to Greenhouse Job Posting
 */
export async function submitGreenhouse(boardToken, jobId) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${jobId}/applications`;
  
  const payload = {
    first_name: candidate.first_name,
    last_name: candidate.last_name,
    email: candidate.email,
    phone: candidate.phone,
    location: candidate.location,
    linkedin_profile_url: candidate.linkedin,
    website_url: candidate.github
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.text();
    console.log(`[Greenhouse ${boardToken}/${jobId}] Status: ${response.status}`, result);
    return { status: response.status, body: result };
  } catch (err) {
    console.error(`[Greenhouse ${boardToken}/${jobId}] Error:`, err.message);
    return { error: err.message };
  }
}

/**
 * Fetch & Parse Ashby Job Details
 */
export async function getAshbyJob(orgSlug, jobId) {
  try {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${orgSlug}`;
    const res = await fetch(url);
    const data = await res.json();
    const job = (data.jobs || []).find(j => j.id === jobId);
    return job;
  } catch (err) {
    console.error(`[Ashby ${orgSlug}/${jobId}] Error:`, err.message);
    return null;
  }
}

if (process.argv[1] && process.argv[1].endsWith('auto-apply-ats.mjs')) {
  console.log('Automated ATS Direct Form Submission Helper initialized.');
  console.log('Candidate:', candidate.full_name, candidate.email);
}
