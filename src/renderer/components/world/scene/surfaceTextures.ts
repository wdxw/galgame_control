import * as THREE from 'three'
import { randomFor, seedFor } from '../../../../shared/worldSeed'

export type SurfaceStyle = 'grass' | 'pavers' | 'leaf' | 'bark' | 'tiles' | 'wood' | 'water' | 'sand' | 'plaster' | 'stone' | 'soil' | 'snow'

// Small, seamless, hand drawn patterns. These tint the material colour rather
// than replacing it, so every work keeps its own palette.
export function createSurfaceTexture(style: SurfaceStyle): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const random = randomFor(seedFor('island-surface:' + style))
  ctx.fillStyle = '#fafaf6'
  ctx.fillRect(0, 0, 256, 256)

  if (style === 'grass') {
    for (let i = 0; i < 95; i++) {
      const x = random() * 256, y = random() * 256, radius = 6 + random() * 22
      // Wrap every brush mark so the lawn has no seams at repeat boundaries.
      for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) {
        const brush = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius)
        brush.addColorStop(0, 'rgba(54,76,40,.09)'); brush.addColorStop(1, 'rgba(54,76,40,0)')
        ctx.fillStyle = brush; ctx.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2)
      }
    }
    ctx.lineWidth = 1.3
    for (let i = 0; i < 180; i++) {
      const x = random() * 256, y = random() * 256
      ctx.strokeStyle = i % 3 ? 'rgba(58,83,45,.08)' : 'rgba(255,255,255,.4)'
      ctx.beginPath(); ctx.moveTo(x - 2, y + 2); ctx.quadraticCurveTo(x + 1, y, x + 2, y - 3); ctx.stroke()
    }
  } else if (style === 'pavers' || style === 'tiles') {
    const rows = style === 'tiles' ? 7 : 6
    const columns = style === 'tiles' ? 5 : 5
    const w = 256 / columns, h = 256 / rows
    ctx.fillStyle = style === 'tiles' ? '#a1a19d' : '#aeb0a4'
    ctx.fillRect(0, 0, 256, 256)
    for (let row = -1; row <= rows; row++) for (let col = -1; col <= columns; col++) {
      const x = col * w + (row % 2) * w / 2
      const y = row * h
      const shade = 207 + Math.floor(random() * 42)
      ctx.fillStyle = `rgb(${shade},${shade},${shade - 3})`
      const inset = style === 'tiles' ? 1.8 : 3 + random() * 1.5
      ctx.beginPath(); ctx.roundRect(x + inset, y + inset, w - inset * 2, h - inset * 2, style === 'tiles' ? [3, 3, 10, 10] : 9); ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(x + 8, y + 5); ctx.lineTo(x + w - 8, y + 5); ctx.stroke()
    }
  } else if (style === 'wood' || style === 'bark') {
    for (let i = 0; i < 36; i++) {
      const x = i * 8
      ctx.strokeStyle = `rgba(70,60,40,${0.025 + random() * 0.07})`
      ctx.lineWidth = 1 + random() * 2
      ctx.beginPath(); ctx.moveTo(x, 0)
      ctx.bezierCurveTo(x + 4, 75, x - 4, 180, x, 256); ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(70,60,40,.10)'
    for (const [x, y] of [[62, 75], [186, 184]]) {
      ctx.beginPath(); ctx.ellipse(x, y, 5, 14, 0, 0, Math.PI * 2); ctx.stroke()
    }
  } else if (style === 'leaf') {
    for (let i = 0; i < 90; i++) {
      const x = random() * 256, y = random() * 256
      ctx.fillStyle = i % 3 ? 'rgba(55,75,35,.06)' : 'rgba(255,255,255,.4)'
      ctx.beginPath(); ctx.ellipse(x, y, 4, 10, random() * Math.PI, 0, Math.PI * 2); ctx.fill()
    }
  } else if (style === 'water') {
    for (let row = 0; row < 8; row++) for (let col = 0; col < 4; col++) {
      const x = col * 64 + (row % 2) * 24
      const y = row * 32 + 12
      ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1.3
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 10, y - 3, x + 22, y); ctx.stroke()
    }
  } else if (style === 'stone') {
    ctx.fillStyle = '#bfbdb3'; ctx.fillRect(0, 0, 256, 256)
    for (let row = -1; row < 7; row++) for (let col = -1; col < 6; col++) {
      const x = col * 56 + (row % 2) * 28, y = row * 42
      const shade = 208 + Math.floor(random() * 38)
      ctx.fillStyle = `rgb(${shade},${shade},${shade - 6})`
      ctx.beginPath(); ctx.roundRect(x + 2, y + 2, 52, 38, 6); ctx.fill()
    }
  } else if (style === 'soil') {
    for (let row = 0; row < 9; row++) {
      ctx.fillStyle = 'rgba(60,40,25,.14)'; ctx.fillRect(0, row * 30, 256, 9)
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, row * 30 + 12, 256, 2)
    }
  }

  if (['grass', 'sand', 'wood', 'plaster', 'stone', 'soil', 'snow'].includes(style)) {
    for (let i = 0; i < 2200; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(40,40,30,.06)' : 'rgba(255,255,255,.4)'
      const size = style === 'plaster' || style === 'stone' ? 1.8 : 1
      ctx.fillRect(random() * 256, random() * 256, size, size)
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 4
  return texture
}
