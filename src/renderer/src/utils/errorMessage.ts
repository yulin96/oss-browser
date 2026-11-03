import { locale, t } from '../i18n'
import { translations } from '../../../shared/i18n'

export function describeError(message: string): { summary: string; details?: string } {
  const source = message
    .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
    .replace(/^Error:\s*/, '')
  let summary: string
  if (
    /InvalidAccessKeyId|SignatureDoesNotMatch|SecurityTokenExpired|InvalidSecurityToken/i.test(
      source
    )
  ) {
    summary = t('身份验证失败，请检查 AccessKey 和 STS Token 后重新连接。')
  } else if (/AccessDenied|Forbidden|NoPermission|Unauthorized/i.test(source)) {
    summary = t('当前凭证无权执行此操作，请检查权限或切换账号。')
  } else if (
    /ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ERR_NETWORK|Failed to fetch|NetworkError|socket hang up/i.test(
      source
    )
  ) {
    summary = t('无法连接服务器，请检查网络后重试。')
  } else if (/ENOSPC/i.test(source)) {
    summary = t('本地磁盘空间不足，请释放空间后重试。')
  } else if (/EACCES|EPERM/i.test(source)) {
    summary = t('无法访问本地文件，请检查文件权限或选择其他位置。')
  } else if (/OSS 未返回.*ETag/.test(source)) {
    summary = t('服务器未返回文件版本信息，请刷新后重试。')
  } else {
    const translated = t(source)
    summary =
      translated !== source ||
      (locale.value === 'zh-CN'
        ? /[\u4e00-\u9fff]/.test(source)
        : Object.values(translations[locale.value]).includes(source))
        ? translated
        : t('操作未完成，请查看错误详情。')
  }
  return { summary, details: summary === message ? undefined : message }
}
