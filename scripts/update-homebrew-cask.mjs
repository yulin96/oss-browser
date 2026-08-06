import { readFile, writeFile } from 'node:fs/promises'

const repository = 'yulin96/oss-browser'
const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
  headers: {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'oss-browser-release-script'
  }
})

if (!response.ok) {
  throw new Error(`GitHub release request failed: ${response.status} ${response.statusText}`)
}

const release = await response.json()
const version = release.tag_name?.match(/^v(\d+\.\d+\.\d+)$/)?.[1]
if (!version) throw new Error(`Unsupported release tag: ${release.tag_name}`)

const digests = new Map()
for (const arch of ['arm64', 'x64']) {
  const name = `oss-browser-${version}-${arch}.dmg`
  const asset = release.assets?.find((candidate) => candidate.name === name)
  const digest = asset?.digest?.match(/^sha256:([a-f\d]{64})$/i)?.[1]
  if (!digest) throw new Error(`Missing SHA256 digest for release asset: ${name}`)
  digests.set(arch, digest.toLowerCase())
}

const armDigest = digests.get('arm64')
const intelDigest = digests.get('x64')
const caskPath = new URL('../Casks/oss-browser.rb', import.meta.url)
let cask = await readFile(caskPath, 'utf8')

cask = cask
  .replace(/^[ ]{2}version ".*"$/m, `  version "${version}"`)
  .replace(
    /^[ ]{2}sha256 arm:\s+"[a-f\d]+",\r?\n\s+intel: "[a-f\d]+"$/im,
    `  sha256 arm:   "${armDigest}",\n         intel: "${intelDigest}"`
  )

await writeFile(caskPath, cask)
console.log(`Updated Homebrew Cask to ${version}`)
