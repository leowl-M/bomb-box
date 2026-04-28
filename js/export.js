import { FORMATS } from './constants.js'
import { S, flags } from './state.js'
import { canvas } from './canvas.js'
import { drawFrame } from './renderer.js'
import { spawnRainForExport, rainEngine } from './rain.js'

export function triggerDownload(url, filename) {
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.style.display = 'none'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

// ── WebM export ───────────────────────────────────────────────────────────────

let recorder = null, recChunks = [], recActive = false

document.getElementById('rec-btn').addEventListener('click', () => {
  if (recActive) { recorder?.stop(); return }
  const dur = parseInt(document.getElementById('duration').value) * 1000
  const mimeType = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'].find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm'
  recorder = new MediaRecorder(canvas.captureStream(S.fps), { mimeType, videoBitsPerSecond:12_000_000 })
  flags.hideTransformHandles = true
  recChunks = []
  recorder.ondataavailable = e => { if (e.data.size > 0) recChunks.push(e.data) }
  recorder.onstop = () => {
    const url = URL.createObjectURL(new Blob(recChunks, { type:mimeType }))
    triggerDownload(url, `video_${S.format}_${Date.now()}.webm`)
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    flags.hideTransformHandles = false
    recActive = false; document.getElementById('rec-btn').textContent = 'Export WEBM'
    document.getElementById('rec-status').textContent = 'Download completato'
    setTimeout(() => document.getElementById('rec-status').textContent = '', 3000)
  }
  recorder.start(); recActive = true
  document.getElementById('rec-btn').textContent = 'Stop'
  document.getElementById('rec-status').textContent = `Registrazione... ${dur/1000}s`
  setTimeout(() => { if (recorder?.state !== 'inactive') recorder.stop() }, dur)
})

// ── MP4 export ────────────────────────────────────────────────────────────────

let mp4MuxerMod = null, isCapturing = false

async function getMuxer() {
  if (mp4MuxerMod) return mp4MuxerMod
  mp4MuxerMod = await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5/build/mp4-muxer.mjs')
  return mp4MuxerMod
}

function setMP4Status(msg, progress) {
  const el = document.getElementById('mp4-status'); if (el) el.textContent = msg
  const overlay = document.getElementById('export-overlay')
  const statusMsg = document.getElementById('export-status-msg')
  const bar = document.getElementById('export-progress-bar')
  if (overlay && !overlay.hidden) {
    if (statusMsg) statusMsg.textContent = msg
    if (bar && progress !== undefined) bar.style.width = progress + '%'
  }
}

function showExportOverlay() {
  const overlay = document.getElementById('export-overlay')
  const bar = document.getElementById('export-progress-bar')
  if (overlay) { overlay.hidden = false; if (bar) bar.style.width = '0%' }
}

function hideExportOverlay() {
  const overlay = document.getElementById('export-overlay')
  if (overlay) overlay.hidden = true
}

document.getElementById('mp4-btn').addEventListener('click', async () => {
  if (isCapturing) return
  if (!window.VideoEncoder) { setMP4Status('Errore: WebCodecs non supportato'); return }
  isCapturing = true
  showExportOverlay()
  setMP4Status('Caricamento mp4-muxer...', 5)
  const btn = document.getElementById('mp4-btn'); btn.disabled = true; btn.textContent = 'In corso...'
  const dur = parseInt(document.getElementById('duration').value), fps = S.fps, total = dur * fps
  const { w, h } = FORMATS[S.format]

  try {
    const { Muxer, ArrayBufferTarget } = await getMuxer()
    const target = new ArrayBufferTarget()
    const muxer = new Muxer({
      target,
      video: {
        codec:'avc', width:w, height:h,
        colorSpace: { primaries:'bt709', transfer:'bt709', matrix:'bt709', fullRange:false }
      },
      fastStart: 'in-memory'
    })

    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        try {
          console.log('[MP4-DEBUG] chunk type:', chunk.type, '| meta:', JSON.stringify(meta, (k,v) => v instanceof ArrayBuffer ? `ArrayBuffer(${v.byteLength})` : v))
          if (meta?.decoderConfig) console.log('[MP4-DEBUG] colorSpace:', JSON.stringify(meta.decoderConfig.colorSpace))
        } catch(logErr) { console.warn('[MP4-DEBUG] log error:', logErr) }

        let safeMeta = meta
        if (meta?.decoderConfig) {
          safeMeta = { ...meta, decoderConfig: { ...meta.decoderConfig, colorSpace: meta.decoderConfig.colorSpace || { primaries:'bt709', transfer:'bt709', matrix:'bt709', fullRange:false } } }
        } else if (meta) {
          const { decoderConfig: _, ...rest } = meta; safeMeta = rest
        }

        try { muxer.addVideoChunk(chunk, safeMeta) }
        catch(muxErr) { console.error('[MP4-DEBUG] CRASH in addVideoChunk:', muxErr); throw muxErr }
      },
      error: e => { throw e }
    })

    encoder.configure({ codec:'avc1.4D002A', width:w, height:h, bitrate:8_000_000, framerate:fps })

    flags.hideTransformHandles = true
    flags.isPaused = true
    flags.lastAutoTriggerTime = -Infinity
    S.lotties.forEach(l => l.anim.pause())
    spawnRainForExport()
    if (rainEngine) {
      await Promise.all(
        Matter.Composite.allBodies(rainEngine.world)
          .filter(b => !b.isStatic && b._imgEl)
          .map(b => new Promise(r => {
            if (b._imgEl.complete && b._imgEl.naturalWidth > 0) { r(); return }
            b._imgEl.onload = r; b._imgEl.onerror = r
          }))
      )
    }

    for (let i = 0; i < total; i++) {
      S.lotties.forEach(l => {
        const f = ((i/fps) * l.anim.frameRate) % l.anim.totalFrames
        l.anim.goToAndStop(f, true)
      })
      if (S.lotties.length > 0) await new Promise(r => requestAnimationFrame(r))

      drawFrame((i/fps) * 1000)
      const frameDuration = Math.round(1_000_000 / fps)
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i/fps)*1_000_000), duration: frameDuration })
      encoder.encode(frame, { keyFrame: i % (fps*2) === 0 })
      frame.close()

      if (i % 10 === 0) {
        setMP4Status(`Rendering frame ${i+1}/${total}...`, Math.round((i/total)*90)+5)
        await new Promise(r => setTimeout(r, 5))
      }
    }

    flags.isPaused = false; S.lotties.forEach(l => l.anim.play()); flags.hideTransformHandles = false
    setMP4Status('Finalizzazione MP4...', 95)
    await encoder.flush(); muxer.finalize()

    const blob = new Blob([target.buffer], { type:'video/mp4' })
    const url = URL.createObjectURL(blob)
    triggerDownload(url, `video_${S.format}_${Date.now()}.mp4`)
    setTimeout(() => URL.revokeObjectURL(url), 10000)

    setMP4Status('Download completato!', 100)
    setTimeout(() => { setMP4Status(''); hideExportOverlay() }, 2000)
  } catch(err) {
    console.error(err)
    setMP4Status('Errore: ' + (err instanceof Error ? err.message : String(err)))
    setTimeout(hideExportOverlay, 4000)
    flags.isPaused = false; S.lotties.forEach(l => l.anim.play()); flags.hideTransformHandles = false
  }
  btn.disabled = false; btn.textContent = 'Export MP4'; isCapturing = false
})

// ── PNG Sequence export ───────────────────────────────────────────────────────

let seqZipMod = null, isExportingSequence = false

async function getZipLib() {
  if (seqZipMod) return seqZipMod.default || seqZipMod
  seqZipMod = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')
  return seqZipMod.default || seqZipMod
}

function setSeqStatus(msg) { document.getElementById('seq-status').textContent = msg }

function canvasToPngBlob() {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encode failed')), 'image/png')
  })
}

document.getElementById('seq-btn').addEventListener('click', async () => {
  if (isExportingSequence) return
  isExportingSequence = true
  const btn = document.getElementById('seq-btn'); btn.disabled = true; btn.textContent = 'In corso...'
  const dur = parseInt(document.getElementById('duration').value), fps = S.fps, total = dur * fps
  try {
    setSeqStatus('Caricamento zip...')
    const JSZip = await getZipLib()
    const zip = new JSZip()
    flags.isPaused = true; flags.hideTransformHandles = true; flags.lastAutoTriggerTime = -Infinity
    S.lotties.forEach(l => l.anim.pause())
    for (let i = 0; i < total; i++) {
      S.lotties.forEach(l => { const f = ((i/fps)*l.anim.frameRate)%l.anim.totalFrames; l.anim.goToAndStop(f,true) })
      drawFrame((i/fps)*1000)
      const blob = await canvasToPngBlob()
      zip.file(`frame_${String(i+1).padStart(5,'0')}.png`, blob)
      if (i%10 === 0) { setSeqStatus(`Render frame ${i+1}/${total}...`); await new Promise(r => setTimeout(r, 0)) }
    }
    flags.isPaused = false; flags.hideTransformHandles = false; S.lotties.forEach(l => l.anim.play())
    setSeqStatus('Compressione zip...')
    const zipBlob = await zip.generateAsync({ type:'blob', compression:'DEFLATE', compressionOptions:{ level:6 } })
    const url = URL.createObjectURL(zipBlob)
    triggerDownload(url, `frames_${S.format}_${Date.now()}.zip`)
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    setSeqStatus('Download sequenza completato'); setTimeout(() => setSeqStatus(''), 4000)
  } catch(err) {
    console.error(err)
    setSeqStatus('Errore: ' + (err.message || err))
    flags.isPaused = false; flags.hideTransformHandles = false; S.lotties.forEach(l => l.anim.play())
  }
  btn.disabled = false; btn.textContent = 'Export PNG Sequence'; isExportingSequence = false
})

// Mobile shortcut
document.getElementById('mobile-mp4-btn')?.addEventListener('click', () => {
  document.getElementById('mp4-btn')?.click()
})
