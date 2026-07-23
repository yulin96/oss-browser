import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readJsonFile, writeJsonFileAtomic } from '../src/main/atomic-json-file'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'oss-browser-test-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
  )
})

describe('atomic JSON files', () => {
  it('only treats a missing file as empty', async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, 'settings.json')

    await expect(readJsonFile(path)).resolves.toBeUndefined()
    await writeFile(path, '{broken', 'utf8')
    await expect(readJsonFile(path)).rejects.toThrow('配置文件内容已损坏')
  })

  it('writes complete JSON and removes the temporary file', async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, 'settings.json')

    await writeJsonFileAtomic(path, { enabled: true })

    await expect(readFile(path, 'utf8')).resolves.toContain('"enabled": true')
    await expect(readdir(directory)).resolves.toEqual(['settings.json'])
  })
})
