// A small, local guard; complements provider secret scanning, not a full audit.
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean)
const failures = []
for (const file of new Set(files)) {
  if (file === 'package-lock.json' || /\.(png|jpg|woff2?)$/.test(file)) continue
  const text = await readFile(file, 'utf8')
  const privateKey = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)
  const secretKey = /sb_secret_[A-Za-z0-9_-]{20,}/.test(text)
  const privilegedJwt = (
    text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || []
  ).some((value) => {
    try {
      return JSON.parse(Buffer.from(value.split('.')[1], 'base64url')).role === 'service_role'
    } catch {
      return false
    }
  })
  if (privateKey || secretKey || privilegedJwt) failures.push(file)
}
if (failures.length) {
  console.error(
    'Potential server credentials found; inspect these files privately:',
    failures.join(', '),
  )
  process.exitCode = 1
} else
  console.log(
    'No recognized private-key or service-role credential patterns in tracked/unignored files.',
  )
