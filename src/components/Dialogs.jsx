import { useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

/* Branded replacements for window.confirm / alert / prompt.

   Chrome's native dialogs break the visual language entirely (OS chrome, English
   buttons, no RTL) and, worse, they block the JS thread and can be suppressed by
   the browser after repeated use. These render inside the app instead.

   The API is promise-based specifically so call sites barely change:
     if (!confirm('...')) return        ->  if (!await confirmDialog('...')) return
     alert('done')                      ->  await alertDialog('done')
     const n = prompt('name?')          ->  const n = await promptDialog('name?')

   A single <DialogHost /> is mounted in the app shell and listens for requests. */

const EVT = 'app-dialog'
let seq = 0

const ask = (payload) =>
  new Promise(resolve => {
    window.dispatchEvent(new CustomEvent(EVT, { detail: { ...payload, id: ++seq, resolve } }))
  })

export const confirmDialog = (message, opts = {}) =>
  ask({ kind: 'confirm', message, title: opts.title ?? 'לאישור', confirmText: opts.confirmText ?? 'אישור', cancelText: opts.cancelText ?? 'ביטול', danger: opts.danger })

export const alertDialog = (message, opts = {}) =>
  ask({ kind: 'alert', message, title: opts.title ?? 'הודעה', confirmText: opts.confirmText ?? 'סגירה', danger: opts.danger })

export const promptDialog = (message, opts = {}) =>
  ask({ kind: 'prompt', message, title: opts.title ?? message, defaultValue: opts.defaultValue ?? '', placeholder: opts.placeholder, inputType: opts.inputType ?? 'text', confirmText: opts.confirmText ?? 'אישור', cancelText: opts.cancelText ?? 'ביטול' })

export default function DialogHost() {
  const [req, setReq] = useState(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    const onAsk = (e) => { setReq(e.detail); setValue(e.detail.defaultValue || '') }
    window.addEventListener(EVT, onAsk)
    return () => window.removeEventListener(EVT, onAsk)
  }, [])

  if (!req) return null

  const settle = (result) => { req.resolve(result); setReq(null); setValue('') }
  const onOpenChange = (open) => { if (!open) settle(req.kind === 'prompt' ? null : false) }

  const submit = (e) => {
    e?.preventDefault()
    if (req.kind === 'prompt') settle(value.trim() ? value : null)
    else settle(true)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader className="text-start">
          <DialogTitle>{req.title}</DialogTitle>
          {req.kind !== 'prompt' && <DialogDescription className="whitespace-pre-wrap">{req.message}</DialogDescription>}
        </DialogHeader>

        {req.kind === 'prompt' && (
          <form onSubmit={submit} className="space-y-2">
            {/* The message is already the dialog heading; a visible label here
                printed it a second time. Kept for screen readers only. */}
            <Label htmlFor="dlg-input" className="sr-only">{req.message}</Label>
            <Input id="dlg-input" autoFocus type={req.inputType} value={value}
              placeholder={req.placeholder} onChange={e => setValue(e.target.value)} />
          </form>
        )}

        <DialogFooter className="gap-2 sm:justify-start">
          <Button variant={req.danger ? 'destructive' : 'default'} onClick={submit}
            disabled={req.kind === 'prompt' && !value.trim()}>
            {req.confirmText}
          </Button>
          {req.kind !== 'alert' && (
            <Button variant="outline" onClick={() => settle(req.kind === 'prompt' ? null : false)}>
              {req.cancelText}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
