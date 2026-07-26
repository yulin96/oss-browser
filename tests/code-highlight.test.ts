import { describe, expect, it } from 'vitest'
import { highlightCode } from '../src/renderer/src/utils/code-highlight'

describe('code highlighting', () => {
  it('escapes executable markup before adding highlighting spans', () => {
    const highlighted = highlightCode('<script>alert("xss")</script>', 'xml')

    expect(highlighted).not.toContain('<script>')
    expect(highlighted).toContain('&lt;')
  })
})
