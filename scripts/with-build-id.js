// npm run build wrapper: stamps BUILD_ID (vite define injects it into the
// bundle) and writes the same value to dist/build-id.txt for the deploy
// script to upload. buildVersion.js compares bundle vs served file and
// auto-reloads on mismatch — users never clear cache manually.
import { execSync } from 'child_process'
import { writeFileSync } from 'fs'

const buildId = `deploy-${Date.now()}`
writeFileSync('dist/build-id.txt', buildId)
console.log('Build ID:', buildId)
execSync('vite build', { stdio: 'inherit', env: { ...process.env, BUILD_ID: buildId } })
writeFileSync('dist/build-id.txt', buildId) // vite build wipes dist; rewrite