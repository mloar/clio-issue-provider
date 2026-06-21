#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

async function deployPlugin() {
  console.log('Deploying clio-issue-provider...');

  if (fs.existsSync(DIST_DIR)) {
    child_process.execSync(`zip -r ../clio-issue-provider.zip *`, {
      cwd: DIST_DIR
    });
  }

  console.log('Deploy complete!');
}

deployPlugin().catch((err) => {
  console.error('Deploy failed:', err);
  process.exit(1);
});
