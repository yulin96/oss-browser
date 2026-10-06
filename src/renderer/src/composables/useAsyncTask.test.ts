import { describe, expect, it } from 'vitest'
import { useAsyncTask } from './useAsyncTask'

describe('account task reset', () => {
  it('ignores an old result without decrementing the new account pending count', async () => {
    let finishOld!: (value: string) => void
    let finishNew!: (value: string) => void
    const task = useAsyncTask()
    const old = task.run(
      () =>
        new Promise<string>((resolve) => {
          finishOld = resolve
        })
    )
    task.reset()
    const current = task.run(
      () =>
        new Promise<string>((resolve) => {
          finishNew = resolve
        })
    )
    finishOld('old-account')
    expect(await old).toBeUndefined()
    expect(task.pending.value).toBe(true)
    finishNew('new-account')
    expect(await current).toBe('new-account')
    expect(task.pending.value).toBe(false)
  })

  it('does not show an old account error after reset', async () => {
    let rejectOld!: (error: Error) => void
    const task = useAsyncTask()
    const old = task.run(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectOld = reject
        })
    )
    task.reset()
    rejectOld(new Error('old account denied'))
    expect(await old).toBeUndefined()
    expect(task.error.value).toBe('')
    expect(task.pending.value).toBe(false)
  })
})
