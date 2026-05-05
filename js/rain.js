import { FORMATS } from './constants.js'
import { S } from './state.js'

export let rainEngine = null
export let rainImgUrls = []
export let rainEffect = 'normal'
export let rainModChaos = false
export let rainModExplosive = false
export let rainIsLooping = false
export let rainTimeTick = 0
export const rainSelectedLottieIdxs = new Set()
export const rainSelectedPresets = new Set()
export let rainPresetCache = {}
export let rainSpeed = 1.0
export let rainTextCollision = false

export function setRainSpeed(v) { rainSpeed = v }
export function setRainEffect(v) { rainEffect = v }
export function setRainModChaos(v) { rainModChaos = v }
export function setRainModExplosive(v) { rainModExplosive = v }
export function setRainIsLooping(v) { rainIsLooping = v }
export function setRainTextCollision(v) { rainTextCollision = v }
export function setRainImgUrls(urls) { rainImgUrls = urls }

export function getRainState() {
  const active = rainEngine
    ? Matter.Composite.allBodies(rainEngine.world).filter(b => !b.isStatic).length > 0
    : false
  return {
    effect: rainEffect,
    speed: rainSpeed,
    modChaos: rainModChaos,
    modExplosive: rainModExplosive,
    isLooping: rainIsLooping,
    textCollision: rainTextCollision,
    imgUrls: getRainUrls(),  // bake full URL set (uploaded + lottie frames + presets)
    active,
    amount: parseInt(document.getElementById('rain-amount')?.value || '20'),
    size: parseInt(document.getElementById('rain-size')?.value || '60'),
  }
}

export function setRainState(state) {
  if (!state) return
  setRainEffect(state.effect || 'normal')
  setRainSpeed(state.speed ?? 1.0)
  setRainModChaos(!!state.modChaos)
  setRainModExplosive(!!state.modExplosive)
  setRainIsLooping(!!state.isLooping)
  setRainTextCollision(!!state.textCollision)
  rainImgUrls = state.imgUrls ? [...state.imgUrls] : []
  setRainGravity()
  clearRain()

  // Sync DOM controls to restored state
  const effectEl = document.getElementById('rain-effect')
  if (effectEl) effectEl.value = rainEffect
  const speedEl = document.getElementById('rain-speed')
  if (speedEl) { speedEl.value = rainSpeed; const sv = document.getElementById('rain-speed-v'); if (sv) sv.textContent = rainSpeed.toFixed(1) }
  const chaosEl = document.getElementById('rain-chaos')
  if (chaosEl) chaosEl.textContent = rainModChaos ? 'ON' : 'OFF'
  const expEl = document.getElementById('rain-explosive')
  if (expEl) expEl.textContent = rainModExplosive ? 'ON' : 'OFF'
  const loopEl = document.getElementById('rain-loop')
  if (loopEl) loopEl.textContent = rainIsLooping ? 'ON' : 'OFF'
  const tcEl = document.getElementById('rain-text-collision')
  if (tcEl) tcEl.textContent = rainTextCollision ? 'ON' : 'OFF'

  if (state.active && rainImgUrls.length > 0) {
    const amountEl = document.getElementById('rain-amount')
    const sizeEl   = document.getElementById('rain-size')
    if (amountEl && state.amount) amountEl.value = state.amount
    if (sizeEl   && state.size)   sizeEl.value   = state.size
    spawnRainForExport()
  }
  rebuildRainStickerList()
}

export function initRain() {
  if (rainEngine) return
  rainEngine = Matter.Engine.create()
  setRainGravity()
  const { w, h } = FORMATS[S.format]
  const wOpt = { isStatic: true, collisionFilter: { mask: 0x0000 } }
  const ground    = Matter.Bodies.rectangle(w/2,   h+100, w*3, 200, wOpt)
  const ceiling   = Matter.Bodies.rectangle(w/2,  -100,   w*3, 200, wOpt)
  const leftWall  = Matter.Bodies.rectangle(-100,  h/2,   200, h*3, wOpt)
  const rightWall = Matter.Bodies.rectangle(w+100, h/2,   200, h*3, wOpt)
  rainEngine._walls = { ground, ceiling, leftWall, rightWall }
  Matter.Composite.add(rainEngine.world, [ground, ceiling, leftWall, rightWall])

  Matter.Events.on(rainEngine, 'beforeUpdate', () => {
    rainTimeTick += 0.05
    const { w: cw, h: ch } = FORMATS[S.format]
    const bodies = Matter.Composite.allBodies(rainEngine.world).filter(b => !b.isStatic)
    bodies.forEach(body => {
      if (rainEffect === 'leaves') {
        Matter.Body.applyForce(body, body.position, { x: Math.sin(rainTimeTick + body.id) * 0.002 * body.mass, y: 0 })
      } else if (rainEffect === 'vortex') {
        const dx = cw/2 - body.position.x, dy = ch/2 - body.position.y
        Matter.Body.applyForce(body, body.position, { x: (-dy*0.00003 + dx*0.000005)*body.mass, y: (dx*0.00003 + dy*0.000005)*body.mass })
      } else if (rainEffect === 'magnetic') {
        const dx = cw/2 - body.position.x, dy = ch/2 - body.position.y
        Matter.Body.applyForce(body, body.position, { x: dx*0.00003*body.mass, y: dy*0.00003*body.mass })
      } else if (rainEffect === 'popcorn') {
        if (body.position.y > ch-250 && Math.abs(body.velocity.y) < 2 && Math.random() < 0.02) {
          Matter.Body.setVelocity(body, { x: (Math.random()-0.5)*15, y: -15-Math.random()*20 })
          Matter.Body.setAngularVelocity(body, (Math.random()-0.5)*0.6)
        }
      }
      if (rainIsLooping) {
        if (body.position.y > ch+300 || body.position.y < -600 || body.position.x < -300 || body.position.x > cw+300) {
          let nx = cw/2+(Math.random()-0.5)*800, ny = -200-Math.random()*200, vx = (Math.random()-0.5)*4, vy = 0
          if (rainEffect==='explosion'||rainEffect==='popcorn') { ny=ch+100; vy=-20-Math.random()*15 }
          else if (rainEffect==='windRight') { nx=-100; ny=Math.random()*ch; vx=10 }
          else if (rainEffect==='windLeft')  { nx=cw+100; ny=Math.random()*ch; vx=-10 }
          Matter.Body.setPosition(body, { x:nx, y:ny })
          Matter.Body.setVelocity(body, { x:vx, y:vy })
        }
      }
    })
  })

  Matter.Events.on(rainEngine, 'collisionStart', event => {
    if (!rainModExplosive) return
    event.pairs.forEach(({ bodyA, bodyB }) => {
      if (bodyA.isStatic || bodyB.isStatic) return
      const rvx = bodyA.velocity.x - bodyB.velocity.x, rvy = bodyA.velocity.y - bodyB.velocity.y
      if (rvx*rvx + rvy*rvy > 150) {
        const f = 0.05
        Matter.Body.applyForce(bodyA, bodyA.position, { x: rvx*f, y: rvy*f })
        Matter.Body.applyForce(bodyB, bodyB.position, { x: -rvx*f, y: -rvy*f })
      }
    })
  })
}

export function updateRainWalls() {
  if (!rainEngine?._walls) return
  const { w, h } = FORMATS[S.format]
  const { ground, ceiling, leftWall, rightWall } = rainEngine._walls
  Matter.Body.setPosition(ground,    { x: w/2,   y: h+100 })
  Matter.Body.setPosition(ceiling,   { x: w/2,   y: -100 })
  Matter.Body.setPosition(leftWall,  { x: -100,  y: h/2 })
  Matter.Body.setPosition(rightWall, { x: w+100, y: h/2 })
}

export function setRainGravity() {
  if (!rainEngine) return
  const e = rainEffect
  if      (e==='windRight')              { rainEngine.gravity.x= 1.5; rainEngine.gravity.y=0.8 }
  else if (e==='windLeft')               { rainEngine.gravity.x=-1.5; rainEngine.gravity.y=0.8 }
  else if (e==='heavy')                  { rainEngine.gravity.x=0;    rainEngine.gravity.y=3.5 }
  else if (e==='space')                  { rainEngine.gravity.x=0;    rainEngine.gravity.y=0.1 }
  else if (e==='vortex'||e==='magnetic') { rainEngine.gravity.x=0;    rainEngine.gravity.y=0   }
  else if (e==='leaves')                 { rainEngine.gravity.x=0;    rainEngine.gravity.y=0.6 }
  else                                   { rainEngine.gravity.x=0;    rainEngine.gravity.y=1.5 }
}

export function spawnRain() {
  const urls = getRainUrls(); if (!urls.length) return
  initRain()
  const { w, h } = FORMATS[S.format]
  let amount = parseInt(document.getElementById('rain-amount').value)
  const baseSize = parseInt(document.getElementById('rain-size').value)
  if (rainEffect==='fluid') amount = Math.max(amount, 50)

  const btn = document.getElementById('rain-spawn-btn')
  btn.disabled = true; btn.style.opacity = '0.5'

  const spawnDelay = { explosion:20, popcorn:30, cannons:100, fluid:10 }[rainEffect] ?? 150
  let spawned = 0
  const interval = setInterval(() => {
    if (spawned >= amount) { clearInterval(interval); btn.disabled=false; btn.style.opacity='1'; return }

    const imgUrl = urls[spawned % urls.length]
    let radius = rainEffect==='fluid' ? 15 : baseSize + Math.random()*(baseSize/3)
    if (rainModChaos && Math.random()<0.1 && rainEffect!=='fluid') radius *= 3.5

    let sx = w/2+(Math.random()-0.5)*800, sy = -200-Math.random()*200
    let vx = (Math.random()-0.5)*4, vy = 0
    const p = { restitution:0.5, friction:0.5, density:0.04, frictionAir:0.01,
                collisionFilter:{ category:0x0002, mask:0xFFFF } }

    if (rainEffect==='bouncy')   { p.restitution=1.1; p.frictionAir=0.001 }
    if (rainEffect==='heavy')    { p.density=0.5; p.restitution=0.1 }
    if (rainEffect==='space')    { p.frictionAir=0.08; p.restitution=0.9 }
    if (rainEffect==='leaves')   { p.frictionAir=0.05 }
    if (rainEffect==='fluid')    { p.restitution=0.1; p.friction=0.001; p.density=0.1 }
    if (rainEffect==='windRight'){ sx=-100;    sy=Math.random()*h; vx=15 }
    if (rainEffect==='windLeft') { sx=w+100;   sy=Math.random()*h; vx=-15 }
    if (rainEffect==='explosion'){ sy=h+100;   vy=-30-Math.random()*15; vx=(Math.random()-0.5)*25 }
    if (rainEffect==='popcorn')  { sx=150+Math.random()*(w-300); sy=h-50; vy=-35-Math.random()*20; vx=(Math.random()-0.5)*15; p.restitution=0.8 }
    if (rainEffect==='cannons')  { sy=200+Math.random()*(h-400); if(spawned%2===0){sx=-50;vx=25+Math.random()*10;vy=-5}else{sx=w+50;vx=-25-Math.random()*10;vy=-5} }

    const body = Matter.Bodies.circle(sx, sy, radius, p)
    body._hw = radius; body._hh = radius
    const imgEl = new Image(); imgEl.src = imgUrl; body._imgEl = imgEl
    Matter.Body.setVelocity(body, { x:vx, y:vy })
    Matter.Body.setAngularVelocity(body, (Math.random()-0.5)*0.4)
    Matter.Composite.add(rainEngine.world, body)
    spawned++
  }, spawnDelay)
}

export function clearRain() {
  if (!rainEngine) return
  Matter.Composite.allBodies(rainEngine.world).filter(b => !b.isStatic)
    .forEach(b => Matter.Composite.remove(rainEngine.world, b))
  if (rainEngine._textBodyMap) {
    rainEngine._textBodyMap.forEach(e => Matter.Composite.remove(rainEngine.world, e.body))
    rainEngine._textBodyMap.clear()
  }
}

export function syncRainTextBodies(cw, ch) {
  if (!rainEngine) return
  if (!rainEngine._textBodyMap) rainEngine._textBodyMap = new Map()
  const map = rainEngine._textBodyMap
  const ids = new Set(S.texts.map(t => t.id))
  for (const [id, e] of map) {
    if (!ids.has(id)) { Matter.Composite.remove(rainEngine.world, e.body); map.delete(id) }
  }
  for (const t of S.texts) {
    const bw = Math.max((t._bboxW || 80) * t.textScale, 20)
    const bh = Math.max((t._bboxH || 40) * t.textScale, 20)
    const px = t.textXPct/100*cw, py = t.textYPct/100*ch
    const angle = t.textRotation * Math.PI/180
    const e = map.get(t.id)
    const changed = !e || Math.abs(e.bw-bw)>2 || Math.abs(e.bh-bh)>2 ||
                    Math.abs(e.px-px)>1 || Math.abs(e.py-py)>1 || Math.abs(e.angle-angle)>0.01
    if (changed) {
      if (e) Matter.Composite.remove(rainEngine.world, e.body)
      const body = Matter.Bodies.rectangle(px, py, bw, bh, {
        isStatic:true, angle, restitution:0.4, friction:0.3, label:'textBody'
      })
      Matter.Composite.add(rainEngine.world, body)
      map.set(t.id, { body, bw, bh, px, py, angle })
    }
  }
}

export function addRainPreviewThumb(url) {
  const preview = document.getElementById('rain-preview')
  preview.style.display = 'flex'
  document.getElementById('rain-clear-images-btn').style.display = ''
  const img = document.createElement('img')
  img.src = url
  img.style.cssText = 'width:32px;height:32px;object-fit:cover;border-radius:4px;border:1px solid #333;'
  preview.appendChild(img)
}

export function getRainUrls() {
  const urls = [...rainImgUrls]
  rainSelectedLottieIdxs.forEach(i => {
    const l = S.lotties[i]; if (!l) return
    const lc = l.container.querySelector('canvas')
    if (lc && lc.width > 0) urls.push(lc.toDataURL())
  })
  Object.values(rainPresetCache).forEach(url => urls.push(url))
  return urls
}


export function rebuildRainStickerList() {
  const list = document.getElementById('rain-sticker-list')
  const section = document.getElementById('rain-sticker-section')
  if (!list || !section) return
  list.innerHTML = ''
  if (S.lotties.length === 0) { section.style.display = 'none'; return }
  section.style.display = ''
  S.lotties.forEach((l, i) => {
    const sel = rainSelectedLottieIdxs.has(i)
    const item = document.createElement('div')
    item.style.cssText = `display:flex;align-items:center;gap:8px;padding:5px 8px;background:${sel?'rgba(74,96,255,0.1)':'rgba(255,255,255,0.03)'};border:1px solid ${sel?'rgba(74,96,255,0.6)':'#2a2a2a'};border-radius:5px;cursor:pointer;`
    item.innerHTML = `<div style="width:11px;height:11px;border-radius:50%;border:2px solid ${sel?'#4A60FF':'#555'};background:${sel?'#4A60FF':'transparent'};flex-shrink:0;"></div><span style="font-size:11px;color:${sel?'#aac4ff':'#888'};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${l.label}</span>`
    item.addEventListener('click', () => {
      if (rainSelectedLottieIdxs.has(i)) rainSelectedLottieIdxs.delete(i)
      else rainSelectedLottieIdxs.add(i)
      rebuildRainStickerList()
    })
    list.appendChild(item)
  })
}

export function spawnRainForExport() {
  const urls = getRainUrls(); if (!urls.length) return
  initRain(); clearRain()
  const { w, h } = FORMATS[S.format]
  let amount = parseInt(document.getElementById('rain-amount').value)
  const baseSize = parseInt(document.getElementById('rain-size').value)
  if (rainEffect==='fluid') amount = Math.max(amount, 50)
  const spread = Math.max(h * 1.5, 1500)

  for (let spawned = 0; spawned < amount; spawned++) {
    const imgUrl = urls[spawned % urls.length]
    let radius = rainEffect==='fluid' ? 15 : baseSize + Math.random()*(baseSize/3)
    if (rainModChaos && Math.random()<0.1 && rainEffect!=='fluid') radius *= 3.5

    let sx = w/2+(Math.random()-0.5)*800
    let sy = -(h * 0.4 + (spawned/amount)*spread + Math.random()*200)
    let vx = (Math.random()-0.5)*4, vy = 0
    const p = { restitution:0.5, friction:0.5, density:0.04, frictionAir:0.01,
                collisionFilter:{ category:0x0002, mask:0xFFFF } }

    if (rainEffect==='bouncy')   { p.restitution=1.1; p.frictionAir=0.001 }
    if (rainEffect==='heavy')    { p.density=0.5; p.restitution=0.1 }
    if (rainEffect==='space')    { p.frictionAir=0.08; p.restitution=0.9 }
    if (rainEffect==='leaves')   { p.frictionAir=0.05 }
    if (rainEffect==='fluid')    { p.restitution=0.1; p.friction=0.001; p.density=0.1 }
    if (rainEffect==='windRight'){ sx=-100-(spawned/amount)*spread; sy=Math.random()*h; vx=15 }
    if (rainEffect==='windLeft') { sx=w+100+(spawned/amount)*spread; sy=Math.random()*h; vx=-15 }
    if (rainEffect==='explosion'){ sy=h+80+(spawned/amount)*spread; vy=-30-Math.random()*15; vx=(Math.random()-0.5)*25 }
    if (rainEffect==='popcorn')  { sx=150+Math.random()*(w-300); sy=h+80+(spawned/amount)*spread; vy=-35-Math.random()*20; vx=(Math.random()-0.5)*15; p.restitution=0.8 }
    if (rainEffect==='cannons')  { sy=200+Math.random()*(h-400); if(spawned%2===0){sx=-50-(spawned/amount)*spread;vx=25+Math.random()*10;vy=-5}else{sx=w+50+(spawned/amount)*spread;vx=-25-Math.random()*10;vy=-5} }

    const body = Matter.Bodies.circle(sx, sy, radius, p)
    body._hw = radius; body._hh = radius
    const imgEl = new Image(); imgEl.src = imgUrl; body._imgEl = imgEl
    Matter.Body.setVelocity(body, { x:vx, y:vy })
    Matter.Body.setAngularVelocity(body, (Math.random()-0.5)*0.4)
    Matter.Composite.add(rainEngine.world, body)
  }
}

async function captureLottiePresetFrame(filename) {
  const data = await (await fetch(`Lottie/${filename}`)).json()
  const animW = data.w || 400, animH = data.h || 400
  const container = document.createElement('div')
  container.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${animW}px;height:${animH}px;overflow:hidden;`
  document.body.appendChild(container)
  return new Promise((resolve, reject) => {
    const anim = lottie.loadAnimation({ container, renderer:'canvas', loop:false, autoplay:false, animationData:data })
    anim.addEventListener('DOMLoaded', () => {
      anim.goToAndStop(Math.floor((anim.totalFrames || 10) * 0.1), true)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const lc = container.querySelector('canvas')
        if (lc && lc.width > 0) resolve(lc.toDataURL())
        else reject(new Error('canvas not ready'))
        anim.destroy(); container.remove()
      }))
    })
    anim.addEventListener('error', () => { container.remove(); reject(new Error('load error')) })
  })
}

export function buildRainPresetList(files) {
  const list = document.getElementById('rain-preset-list')
  const section = document.getElementById('rain-preset-section')
  if (!list || !files.length) return
  section.style.display = ''
  files.forEach(filename => {
    const label = filename.replace(/\.json$/i, '')
    const item = document.createElement('div')
    item.dataset.filename = filename
    item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 8px;background:rgba(255,255,255,0.03);border:1px solid #2a2a2a;border-radius:5px;cursor:pointer;'
    item.innerHTML = `<div class="rp-dot" style="width:11px;height:11px;border-radius:50%;border:2px solid #555;background:transparent;flex-shrink:0;"></div><span class="rp-lbl" style="font-size:11px;color:#888;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label}</span><span class="rp-status" style="font-size:9px;color:#555;flex-shrink:0;"></span>`
    item.addEventListener('click', () => toggleRainPreset(filename, item))
    list.appendChild(item)
  })
}

async function toggleRainPreset(filename, item) {
  const dot = item.querySelector('.rp-dot')
  const lbl = item.querySelector('.rp-lbl')
  const status = item.querySelector('.rp-status')
  if (rainSelectedPresets.has(filename)) {
    rainSelectedPresets.delete(filename)
    delete rainPresetCache[filename]
    item.style.background = 'rgba(255,255,255,0.03)'; item.style.borderColor = '#2a2a2a'
    dot.style.borderColor = '#555'; dot.style.background = 'transparent'
    lbl.style.color = '#888'; status.textContent = ''
  } else {
    rainSelectedPresets.add(filename)
    item.style.background = 'rgba(74,96,255,0.08)'; item.style.borderColor = 'rgba(74,96,255,0.4)'
    dot.style.borderColor = '#4A60FF'; dot.style.background = '#4A60FF'
    lbl.style.color = '#aac4ff'; status.textContent = '⋯'
    try {
      rainPresetCache[filename] = await captureLottiePresetFrame(filename)
      status.textContent = '✓'; status.style.color = '#4A60FF'
    } catch {
      rainSelectedPresets.delete(filename); delete rainPresetCache[filename]
      item.style.background = 'rgba(255,255,255,0.03)'; item.style.borderColor = '#2a2a2a'
      dot.style.borderColor = '#555'; dot.style.background = 'transparent'
      lbl.style.color = '#888'; status.textContent = '✗'; status.style.color = '#ff6b6b'
    }
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

document.getElementById('rain-images-input').addEventListener('change', e => {
  for (const file of Array.from(e.target.files)) {
    const reader = new FileReader()
    reader.onload = ev => { rainImgUrls.push(ev.target.result); addRainPreviewThumb(ev.target.result) }
    reader.readAsDataURL(file)
  }
  e.target.value = ''
})

document.getElementById('rain-clear-images-btn').addEventListener('click', () => {
  rainImgUrls = []
  const p = document.getElementById('rain-preview'); p.innerHTML=''; p.style.display='none'
  document.getElementById('rain-clear-images-btn').style.display = 'none'
})

document.getElementById('rain-effect').addEventListener('change', e => {
  rainEffect = e.target.value; setRainGravity()
})

document.getElementById('rain-amount').addEventListener('input', e => {
  document.getElementById('rain-amount-v').textContent = e.target.value
})

document.getElementById('rain-size').addEventListener('input', e => {
  document.getElementById('rain-size-v').textContent = e.target.value
})

;['rain-chaos','rain-explosive','rain-loop'].forEach(id => {
  document.getElementById(id).addEventListener('click', function() {
    const on = this.textContent === 'OFF'
    this.textContent = on ? 'ON' : 'OFF'
    this.classList.toggle('border-[#4A60FF]', on)
    this.classList.toggle('text-[#4A60FF]', on)
    if (id==='rain-chaos')     rainModChaos = on
    if (id==='rain-explosive') rainModExplosive = on
    if (id==='rain-loop')      { rainIsLooping = on; if (rainEngine) rainEngine.gravity.y = on ? 1.5 : rainEngine.gravity.y }
  })
})

document.getElementById('rain-speed').addEventListener('input', e => {
  rainSpeed = parseFloat(e.target.value)
  document.getElementById('rain-speed-v').textContent = parseFloat(e.target.value).toFixed(1)
})

document.getElementById('rain-text-collision').addEventListener('click', function() {
  rainTextCollision = !rainTextCollision
  this.textContent = rainTextCollision ? 'ON' : 'OFF'
  this.classList.toggle('border-[#4A60FF]', rainTextCollision)
  this.classList.toggle('text-[#4A60FF]', rainTextCollision)
  if (!rainTextCollision && rainEngine?._textBodyMap) {
    rainEngine._textBodyMap.forEach(e => Matter.Composite.remove(rainEngine.world, e.body))
    rainEngine._textBodyMap.clear()
  }
})

document.getElementById('rain-spawn-btn').addEventListener('click', spawnRain)
document.getElementById('rain-clear-btn').addEventListener('click', clearRain)
