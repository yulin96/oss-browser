import { describe, expect, it } from 'vitest'
import {
  archiveUnreleasedReleaseNotes,
  extractVersionReleaseNotes
} from '../src/shared/release-notes.mjs'

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

  it('archives the unreleased section under the target version', () => {
    const result = archiveUnreleasedReleaseNotes(changelog, '0.7.0')

    expect(result).toContain('## 未发布\n\n## v0.7.0\n\n- 尚未发布')
    expect(extractVersionReleaseNotes(result, '0.7.0')).toBe('- 尚未发布')
    expect(extractVersionReleaseNotes(result, '0.6.0')).toBe('- 新版本')
  })

  it('allows an empty unreleased section', () => {
    const result = archiveUnreleasedReleaseNotes(
      '# 更新日志\n\n## 未发布\n\n## v0.6.0\n\n- 新版本\n',
      '0.7.0'
    )

    expect(result).toContain('## 未发布\n\n## v0.7.0\n\n## v0.6.0')
    expect(extractVersionReleaseNotes(result, '0.7.0')).toBe('')
  })
})
