import { describe, expect, it } from 'vitest'
import { extractVersionReleaseNotes } from '../src/shared/release-notes.mjs'

const changelog = `# 更新日志

## 未发布

- 尚未发布

## v0.6.0

- 新版本

## v0.5.0

- 旧版本
`

describe('release notes', () => {
  it('extracts only the requested version', () => {
    expect(extractVersionReleaseNotes(changelog, 'v0.6.0')).toBe('- 新版本')
    expect(extractVersionReleaseNotes(changelog, '0.5.0')).toBe('- 旧版本')
  })

  it('does not include the unreleased section', () => {
    expect(extractVersionReleaseNotes(changelog, '0.6.0')).not.toContain('尚未发布')
  })

  it('distinguishes an empty section from a missing version', () => {
    expect(extractVersionReleaseNotes('## v0.6.0\n\n## v0.5.0\n\n- 旧版本', '0.6.0')).toBe('')
    expect(extractVersionReleaseNotes(changelog, '0.7.0')).toBeUndefined()
  })
})
