import { describe, expect, it } from 'vitest'
import { resolveObjectPreview } from '../src/shared/object-preview'

describe('object preview resolver', () => {
  it.each([
    ['report.pdf', 'pdf'],
    ['font.woff2', 'font'],
    ['README.md', 'markdown'],
    ['data.json', 'json'],
    ['config.yaml', 'yaml'],
    ['records.csv', 'csv'],
    ['records.tsv', 'tsv'],
    ['component.vue', 'code'],
    ['script.ts', 'code'],
    ['notes.txt', 'text'],
    ['archive.zip', 'other']
  ])('classifies %s as %s', (name, kind) => {
    expect(resolveObjectPreview(name).kind).toBe(kind)
  })

  it('returns the syntax highlighting language for code files', () => {
    expect(resolveObjectPreview('component.tsx')).toEqual({
      kind: 'code',
      language: 'typescript'
    })
    expect(resolveObjectPreview('native.cpp')).toEqual({ kind: 'code', language: 'cpp' })
    expect(resolveObjectPreview('Program.cs')).toEqual({ kind: 'code', language: 'csharp' })
  })
})
