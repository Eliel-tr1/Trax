import SftpClient from 'ssh2-sftp-client'
import fs from 'fs'
import path from 'path'
import 'dotenv/config'

// Deploys dist/ to a PARALLEL backup URL (trax-crm-backup/) - same server,
// same Supabase, but never touches the live trax-crm/ directory.
const REMOTE_DIR = '/home/vitrue-ai/htdocs/ai.vitrue.co.il/trax-crm-backup'
const BASE = '/trax-crm-backup/'

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
RewriteBase ${BASE}
RewriteRule ^index\\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . ${BASE}index.html [L]

# index.html must NEVER be cached: it's the pointer to the hashed bundles.
# Assets ARE cached (their names change with content) — that's the whole
# cache-busting scheme, and it only works if the HTML always arrives fresh.
<IfModule mod_headers.c>
  <FilesMatch "index\.html$">
    Header set Cache-Control "no-store, must-revalidate"
  </FilesMatch>
</IfModule>

Header set X-Content-Type-Options "nosniff"
Header set X-Frame-Options "SAMEORIGIN"
`
  await sftp.put(Buffer.from(htaccess), REMOTE_DIR + '/.htaccess')
  console.log('Backup deploy complete.')
  await sftp.end()
}

deploy().catch(err => { console.error('Deploy failed:', err.message); sftp.end(); process.exit(1) })