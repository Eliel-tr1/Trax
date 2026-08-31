import { useState } from 'react'
import { Download, File, FileImage, FileText, FileSpreadsheet, FileVideo, FileAudio, FileArchive } from 'lucide-react'

/* Ported near-verbatim from bina-crm — renders one attachment: an inline
   preview for images, a first-class typed chip (icon + name + kind + size)
   for everything else, so a note's attachment reads as more than a bare
   "קובץ מצורף" link with no way to tell what it is before opening it. */

const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i
const KIND = [
  [/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i, FileImage, 'תמונה'],
  [/\.pdf$/i, FileText, 'PDF'],
  [/\.(xlsx?|csv|ods)$/i, FileSpreadsheet, 'גיליון'],
  [/\.(docx?|odt|rtf|txt|md)$/i, FileText, 'מסמך'],
  [/\.(mp4|mov|avi|mkv|webm)$/i, FileVideo, 'וידאו'],
  [/\.(mp3|wav|m4a|ogg|aac)$/i, FileAudio, 'אודיו'],
  [/\.(zip|rar|7z|tar|gz)$/i, FileArchive, 'ארכיון'],
]

const humanSize = (b) => {
  if (!b && b !== 0) return null
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export default function Attachment({ url, name, size, className = '' }) {
  const [broken, setBroken] = useState(false)
  if (!url) return null

  const label = name || decodeURIComponent(url.split('/').pop() || 'קובץ')
  const [, IconEl, kindLabel] = KIND.find(([re]) => re.test(label) || re.test(url)) || [null, File, 'קובץ']
  const isImage = (IMAGE.test(label) || IMAGE.test(url)) && !broken

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" title={label}
        className={`group mt-2 block w-fit overflow-hidden rounded-lg border ${className}`}
        onClick={e => e.stopPropagation()}>
        <img src={url} alt={label} onError={() => setBroken(true)}
          className="max-h-56 max-w-full object-contain" />
        <span className="text-muted-foreground bg-muted/50 flex items-center gap-1.5 px-2 py-1 text-xs">
          <FileImage className="size-3.5" />
          <span className="truncate">{label}</span>
          {size ? <span className="shrink-0">· {humanSize(size)}</span> : null}
        </span>
      </a>
    )
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" title={label} download={name || undefined}
      className={`bg-muted/40 hover:bg-muted mt-2 inline-flex max-w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${className}`}
      onClick={e => e.stopPropagation()}>
      <IconEl className="text-muted-foreground size-4 shrink-0" />
      <span className="truncate font-medium">{label}</span>
      <span className="text-muted-foreground shrink-0">
        {kindLabel}{size ? ` · ${humanSize(size)}` : ''}
      </span>
      <Download className="text-muted-foreground size-3.5 shrink-0" />
    </a>
  )
}
