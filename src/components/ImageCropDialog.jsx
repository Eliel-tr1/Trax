import { useCallback, useState } from 'react'
import Cropper from 'react-easy-crop'
import { ZoomIn, ZoomOut, RotateCw } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from './ui/dialog'
import { Button } from './ui/button'

/* Ported from bina-crm — square crop picker for profile pictures.

   Without this the avatar just object-fit's the raw upload, so a wide or
   off-centre photo gets an arbitrary slice - a face could end up half out of
   frame. Here the user chooses exactly which square is used, and the result is
   re-encoded at a fixed size so every avatar is the same weight.

   Returns a Blob via onCropped; the caller uploads it. */

const OUTPUT_PX = 512

/* Draw the selected crop (in natural-image pixels) onto a square canvas. */
async function renderCrop(src, area, rotation = 0) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_PX
  canvas.height = OUTPUT_PX
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'

  if (rotation) {
    // Rotate around the canvas centre, then draw the crop region into it.
    const safe = Math.max(image.width, image.height) * 2
    const tmp = document.createElement('canvas')
    tmp.width = tmp.height = safe
    const tctx = tmp.getContext('2d')
    tctx.translate(safe / 2, safe / 2)
    tctx.rotate((rotation * Math.PI) / 180)
    tctx.drawImage(image, -image.width / 2, -image.height / 2)
    const dx = safe / 2 - image.width / 2
    const dy = safe / 2 - image.height / 2
    ctx.drawImage(tmp, area.x + dx, area.y + dy, area.width, area.height, 0, 0, OUTPUT_PX, OUTPUT_PX)
  } else {
    ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, OUTPUT_PX, OUTPUT_PX)
  }

  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
}

export default function ImageCropDialog({ src, open, onClose, onCropped, busy }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [area, setArea] = useState(null)

  const onCropComplete = useCallback((_, areaPixels) => setArea(areaPixels), [])

  const apply = async () => {
    if (!area) return
    const blob = await renderCrop(src, area, rotation)
    if (blob) onCropped(blob)
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader className="text-start">
          <DialogTitle>בחירת אזור התמונה</DialogTitle>
          <DialogDescription>גררו והתקרבו כדי לבחור את הריבוע שיוצג כתמונת הפרופיל.</DialogDescription>
        </DialogHeader>

        <div className="bg-muted relative h-72 w-full overflow-hidden rounded-lg">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" className="size-8"
            onClick={() => setZoom(z => Math.max(1, +(z - 0.2).toFixed(2)))} aria-label="הקטנה">
            <ZoomOut className="size-4" />
          </Button>
          <input
            type="range" min={1} max={4} step={0.01} value={zoom} aria-label="מרחק מהתמונה"
            onChange={e => setZoom(Number(e.target.value))}
            className="accent-primary h-1.5 flex-1 cursor-pointer" />
          <Button type="button" variant="outline" size="icon" className="size-8"
            onClick={() => setZoom(z => Math.min(4, +(z + 0.2).toFixed(2)))} aria-label="הגדלה">
            <ZoomIn className="size-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="size-8"
            onClick={() => setRotation(r => (r + 90) % 360)} aria-label="סיבוב">
            <RotateCw className="size-4" />
          </Button>
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button onClick={apply} disabled={busy || !area}>
            {busy ? <span className="spinner light" style={{ width: 15, height: 15 }} /> : 'שמירת התמונה'}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={busy}>ביטול</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
