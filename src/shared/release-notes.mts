const VERSION_HEADING = /^## v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*$/gm

export function extractVersionReleaseNotes(
  changelog: string,
  requestedVersion: string
): string | undefined {
  const version = requestedVersion.replace(/^v/, '')
  const headings = [...changelog.matchAll(VERSION_HEADING)]
  const headingIndex = headings.findIndex((heading) => heading[1] === version)
  if (headingIndex === -1) return undefined

  const heading = headings[headingIndex]
  const nextHeading = headings[headingIndex + 1]
  const contentStart = (heading.index ?? 0) + heading[0].length
  return changelog.slice(contentStart, nextHeading?.index).trim()
}
