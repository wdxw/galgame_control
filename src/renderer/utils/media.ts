export function toLocalFileUrl(filePath: string | null | undefined): string {
  if (!filePath) return ''

  const normalized = filePath.replace(/\\/g, '/')
  return `local-file:///${encodeURI(normalized)}`
}
