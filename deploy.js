import SftpClient from 'ssh2-sftp-client'
import fs from 'fs'
import path from 'path'
import 'dotenv/config'

// Deploys dist/ to the Vitrue AI server over SFTP + writes a SPA .htaccess.
// ⚠️ RETIRED 2026-09-02: TRAX moved to Cloudflare Pages (see docs/runbooks/deploy.md).
//    The remote folders trax-crm/ and trax-crm-backup/ were deleted. Do not run
//    unless deliberately re-enabling the Vitrue path.
// Adapted from bina-crm/deploy.js.
const REMOTE_DIR = process.env.SFTP_REMOTE_DIR || '/home/vitrue-ai/htdocs/ai.vitrue.co.il/trax-crm'

const sftp = new SftpClient()

async function deploy() {
  console.log('Connecting to SFTP…')
  await sftp.connect({
    host: process.env.SFTP_HOST || '46.225.19.194',
    port: parseInt(process.env.SFTP_PORT || '22'),
    username: process.env.SFTP_USER || 'vitrue-ai',
    password: process.env.SFTP_PASS,
  })

  try { await sftp.stat(REMOTE_DIR) } catch { await sftp.mkdir(REMOTE_DIR, true) }

  console.log('Uploading dist/ →', REMOTE_DIR)
  /* Upload to a temp name and rename into place.

     A plain uploadDir writes each asset in the open, so a request that lands
     mid-upload sees a partial file - and Cloudflare happily caches that partial
     body for the whole cache lifetime. That is exactly how a site can end up
     serving a bundle truncated mid-file: valid URL, 200 OK, unparseable JS,
     blank page. Rename is atomic within a filesystem, so a file is either the
     old one or the complete new one, never half of either. */
  const uploadAtomic = async (localDir, remoteDir) => {
    try { await sftp.stat(remoteDir) } catch { await sftp.mkdir(remoteDir, true) }
    for (const entry of fs.readdirSync(localDir, { withFileTypes: true })) {
      const local = path.join(localDir, entry.name)
      const remote = `${remoteDir}/${entry.name}`
      if (entry.isDirectory()) { await uploadAtomic(local, remote); continue }
      const tmp = `${remote}.uploading`
      await sftp.put(local, tmp)
      try { await sftp.delete(remote) } catch { /* first deploy of this file */ }
      await sftp.rename(tmp, remote)
    }
  }
  await uploadAtomic(path.resolve('./dist'), REMOTE_DIR)

  const htaccess = `RewriteEngine On
RewriteBase /trax-crm/
RewriteRule ^index\\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /trax-crm/index.html [L]

Header set X-Content-Type-Options "nosniff"
Header set X-Frame-Options "SAMEORIGIN"
`
  await sftp.put(Buffer.from(htaccess), REMOTE_DIR + '/.htaccess')
  console.log('Deploy complete.')
  await sftp.end()
}

deploy().catch(err => { console.error('Deploy failed:', err.message); sftp.end(); process.exit(1) })
