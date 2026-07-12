import OSS from 'ali-oss'
import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

const required = [
  'OSS_ACCESS_KEY_ID',
  'OSS_ACCESS_KEY_SECRET',
  'OSS_BUCKET',
  'OSS_REGION',
  'OSS_RELEASE_PREFIX'
]
const missing = required.filter((name) => !process.env[name])
if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`)

const client = new OSS({
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET,
  region: process.env.OSS_REGION,
  endpoint: process.env.OSS_ENDPOINT || undefined,
  secure: true
})

const root = join(process.cwd(), 'release-assets')
const entries = await readdir(root, { recursive: true, withFileTypes: true })
const files = entries
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name))
const manifests = files.filter((file) => /latest.*\.ya?ml$/.test(file))
const packages = files.filter((file) => !manifests.includes(file))
const prefix = process.env.OSS_RELEASE_PREFIX.replace(/^\/+|\/+$/g, '')

for (const file of [...packages, ...manifests]) {
  const name = relative(root, file).replaceAll('\\', '/')
  const objectName = `${prefix}/${name}`
  const isManifest = manifests.includes(file)
  await client.put(objectName, file, {
    headers: {
      'Cache-Control': isManifest ? 'public, max-age=300' : 'public, max-age=31536000, immutable'
    }
  })
  console.log(`Uploaded ${objectName}`)
}
