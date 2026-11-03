import { afterEach, describe, expect, it, vi } from 'vitest'
import { translate } from '../../../shared/i18n'
import { locale } from '../i18n'
import { describeError } from './errorMessage'

vi.mock('../i18n', () => {
  const locale = { value: 'zh-CN' as import('../../../shared/types').AppLocale }
  return { locale, t: (source: string) => translate(locale.value, source) }
})

afterEach(() => {
  locale.value = 'zh-CN'
})

describe('error presentation', () => {
  it('shows recovery for a known error and retains the original IPC error', () => {
    const message =
      "Error invoking remote method 'objects:list': Error: AccessDenied: request denied"
    expect(describeError(message)).toEqual({
      summary: '当前凭证无权执行此操作，请检查权限或切换账号。',
      details: message
    })
  })

  it('does not invent a cause for an unknown SDK failure', () => {
    expect(describeError('UnexpectedServiceResponse: request-123')).toEqual({
      summary: '操作未完成，请查看错误详情。',
      details: 'UnexpectedServiceResponse: request-123'
    })
  })

  it('localizes network recovery and recognizes a message already translated by the caller', () => {
    locale.value = 'en-US'
    expect(describeError('ECONNRESET').summary).toBe(
      'Could not connect to the server. Check your network and try again.'
    )
    const message = translate('en-US', '文本预览最大支持 5 MB，请下载后查看。')
    expect(describeError(message)).toEqual({ summary: message, details: undefined })
  })
})
