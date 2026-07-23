import { randomUUID } from 'node:crypto'
import { open, readFile, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

export async function readJsonFile(path: string): Promise<unknown | undefined> {
  let content: string
  try {
    content = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw new Error(`读取配置文件失败：${basename(path)}`, { cause: error })
  }

  try {
    return JSON.parse(content) as unknown
  } catch (error) {
    throw new Error(`配置文件内容已损坏：${basename(path)}`, { cause: error })
  }
}

export async function writeJsonFileAtomic(path: string, value: unknown): Promise<void> {
  const temporaryPath = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`)
  try {
    const file = await open(temporaryPath, 'wx', 0o600)
    try {
      await file.writeFile(JSON.stringify(value, null, 2), 'utf8')
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporaryPath, path)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw new Error(`写入配置文件失败：${basename(path)}`, { cause: error })
  }
}
