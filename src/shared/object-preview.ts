export type ObjectPreviewKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'font'
  | 'document'
  | 'markdown'
  | 'json'
  | 'yaml'
  | 'csv'
  | 'tsv'
  | 'code'
  | 'text'
  | 'other'

export interface ObjectPreviewDefinition {
  kind: ObjectPreviewKind
  language?: string
}

const codeLanguages: Record<string, string> = {
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  vue: 'xml',
  svelte: 'xml',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hh: 'cpp',
  hpp: 'cpp',
  hxx: 'cpp',
  cs: 'csharp',
  java: 'java',
  go: 'go',
  rs: 'rust',
  py: 'python',
  php: 'php',
  rb: 'ruby',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  bat: 'dos',
  cmd: 'dos',
  ps1: 'powershell',
  sql: 'sql',
  json5: 'javascript',
  toml: 'ini',
  ini: 'ini',
  conf: 'ini',
  log: 'plaintext'
}

export function resolveObjectPreview(name: string): ObjectPreviewDefinition {
  const extension = name.toLowerCase().split('.').pop() || ''

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(extension))
    return { kind: 'image' }
  if (['mp4', 'webm', 'mov', 'm4v'].includes(extension)) return { kind: 'video' }
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(extension)) return { kind: 'audio' }
  if (extension === 'pdf') return { kind: 'pdf' }
  if (['ttf', 'otf', 'woff', 'woff2'].includes(extension)) return { kind: 'font' }
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(extension)) return { kind: 'document' }
  if (['md', 'mdx'].includes(extension)) return { kind: 'markdown' }
  if (extension === 'json') return { kind: 'json' }
  if (['yaml', 'yml'].includes(extension)) return { kind: 'yaml' }
  if (extension === 'csv') return { kind: 'csv' }
  if (extension === 'tsv') return { kind: 'tsv' }
  if (codeLanguages[extension]) return { kind: 'code', language: codeLanguages[extension] }
  if (extension === 'txt') return { kind: 'text' }
  return { kind: 'other' }
}
