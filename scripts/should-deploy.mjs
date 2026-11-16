// Decides whether this run publishes to Netlify. A production deploy costs
// Netlify credits, and the signals only change when a week or a month
// completes, so we publish only then (about five times a month) instead of
// every day. The data build, tests and forward-test record still run daily.
//
//   node scripts/should-deploy.mjs          -> prints deploy=true|false (+ reason) and appends it to $GITHUB_OUTPUT
//   node scripts/should-deploy.mjs --mark   -> records what was just published in data/last-deploy.json
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('public/data/manifest.json', 'utf8'));
const markerPath = 'data/last-deploy.json';
const marker = existsSync(markerPath) ? JSON.parse(readFileSync(markerPath, 'utf8')) : {};

if (process.argv.includes('--mark')) {
  writeFileSync(markerPath, `${JSON.stringify({ midBar: manifest.midBar, longBar: manifest.longBar, asOf: manifest.asOf, deployedAt: new Date().toISOString() }, null, 2)}\n`);
  console.log(`marked ${manifest.midBar} / ${manifest.longBar}`);
} else {
  const forced = process.env.FORCE_DEPLOY === 'true';
  const newWeek = manifest.midBar !== marker.midBar, newMonth = manifest.longBar !== marker.longBar;
  const deploy = forced || newWeek || newMonth;
  const reason = forced ? 'forced' : newWeek ? `new completed week ${manifest.midBar}` : newMonth ? `new completed month ${manifest.longBar}` : `no new completed week or month since ${marker.midBar} / ${marker.longBar}`;
  console.log(`deploy=${deploy} (${reason})`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${deploy}\n`);
}
