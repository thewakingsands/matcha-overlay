import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { explorationSamples, installExplorationBridge } from './bridge.mjs'

const output =
  process.env.MATCHA_BROWSER_OUTPUT || '/tmp/matcha-exploration-browser'
await mkdir(`${output}/temp`, { recursive: true })
const chrome = spawn(process.env.CHROME_PATH || 'google-chrome', [
  '--headless',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-background-networking',
  '--no-first-run',
  '--remote-debugging-port=0',
  `--user-data-dir=${output}/temp/frontend-chrome`,
])
let log = ''
const endpoint = await new Promise((resolve, reject) => {
  chrome.stderr.on('data', (chunk) => {
    log += chunk
    const m = log.match(/DevTools listening on (ws:\/\/[^\s]+)/)
    if (m) resolve(m[1])
  })
  chrome.on('error', reject)
  chrome.on('exit', (code) => reject(Error(`Chrome exited ${code}`)))
})
const ws = new WebSocket(endpoint)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})
let id = 0
const pending = new Map()
const errors = []
ws.addEventListener('message', (e) => {
  const r = JSON.parse(e.data)
  if (r.method === 'Runtime.consoleAPICalled' && r.params.type === 'error')
    console.log('BROWSER', JSON.stringify(r.params.args))
  if (r.method === 'Runtime.exceptionThrown')
    errors.push(
      r.params.exceptionDetails.exception?.description ||
        r.params.exceptionDetails.text,
    )
  const p = pending.get(r.id)
  if (p) {
    pending.delete(r.id)
    r.error ? p.reject(Error(JSON.stringify(r.error))) : p.resolve(r.result)
  }
})
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const n = ++id
    pending.set(n, { resolve, reject })
    ws.send(JSON.stringify({ id: n, method, params, sessionId }))
  })
try {
  const { targetId } = await send('Target.createTarget', {
      url: 'about:blank',
    }),
    { sessionId } = await send('Target.attachToTarget', {
      targetId,
      flatten: true,
    })
  const c = (method, params) => send(method, params, sessionId)
  const evaluate = async (expression) => {
    const r = await c('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails)
      throw Error(
        r.exceptionDetails.exception?.description || r.exceptionDetails.text,
      )
    return r.result.value
  }
  const wait = async (expression) => {
    for (let n = 0; n < 80; n++) {
      if (await evaluate(expression)) return
      await new Promise((r) => setTimeout(r, 100))
    }
    throw Error(
      `Timeout: ${expression}; errors=${JSON.stringify(errors)}; body=${await evaluate('document.body.innerText')}`,
    )
  }
  await c('Runtime.enable')
  await c('Page.enable')
  await c('Emulation.setFocusEmulationEnabled', { enabled: true })
  await c('Page.addScriptToEvaluateOnNewDocument', {
    source: `(${installExplorationBridge.toString()})(${JSON.stringify(process.env.MATCHA_TEST_MAP_URL ?? null)})`,
  })
  await c('Emulation.setDeviceMetricsOverride', {
    width: 440,
    height: 400,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await c('Page.navigate', {
    url:
      process.env.MATCHA_PREVIEW_URL || 'http://127.0.0.1:5275/?source=mojito',
  })
  await wait(
    'window.__mjt275?.subscribed && !!document.querySelector(".app-title")',
  )
  await evaluate(
    `window.samples=(${explorationSamples.toString()})(__mjt275.context); (async()=>{await __mjt275.emit('NavigationState',samples.navigation);await __mjt275.emit('HuntState',samples.hunts);await __mjt275.emit('EurekaState',samples.eureka)})()`,
  )
  await wait('!!document.querySelector(".treasure-navigation")')
  await wait(
    '!![...document.querySelectorAll(".treasure-map div")].find(el=>el.shadowRoot)?.shadowRoot.querySelector(".exploration-marker-player")',
  )
  assert.match(await evaluate('document.body.innerText'), /-0.25/)
  await wait(
    `[...document.querySelectorAll('.treasure-map div')].some(el=>el.shadowRoot &&
      [...el.shadowRoot.querySelectorAll('img.leaflet-image-layer')].some(img=>img.alt==='Synthetic field' && img.naturalWidth===2048))`,
  )
  const mapQueries = await evaluate(
    '__mjt275.commands.filter(x=>x.action==="map.get").length',
  )
  const shadowExpr =
    '[...document.querySelectorAll(".treasure-map div")].find(el=>el.shadowRoot)?.shadowRoot'
  await wait(
    `${shadowExpr}.querySelector('.leaflet-marker-pane [data-data-type="1"]') !== null`,
  )
  await wait(
    `${shadowExpr}.querySelector('.leaflet-popup-pane img.leaflet-marker-icon') !== null`,
  )
  const entranceQueries = await evaluate(
    '__mjt275.commands.filter(x=>x.action==="map.key").length',
  )
  await evaluate(`{
    const shadow=${shadowExpr};
    window.treasureBeforeEntrance=shadow.querySelector('.leaflet-popup-pane img.leaflet-marker-icon');
    shadow.querySelector('.leaflet-marker-pane [data-data-type="1"]').click();
  }`)
  await new Promise((r) => setTimeout(r, 250))
  assert.equal(
    await evaluate('__mjt275.commands.filter(x=>x.action==="map.key").length'),
    entranceQueries,
    'entrance markers do not request another map',
  )
  assert.ok(
    await evaluate('window.treasureBeforeEntrance?.isConnected'),
    'entrance clicks preserve the treasure marker',
  )
  const transformExpr =
    '[...document.querySelectorAll(".treasure-map div")].find(el=>el.shadowRoot)?.shadowRoot.querySelector(".leaflet-map-pane").style.transform'
  await c('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: 220,
    y: 140,
    button: 'left',
    clickCount: 1,
  })
  await c('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: 270,
    y: 160,
    button: 'left',
    buttons: 1,
  })
  await c('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: 270,
    y: 160,
    button: 'left',
    clickCount: 1,
  })
  await new Promise((r) => setTimeout(r, 300))
  const dragged = await evaluate(transformExpr)
  await evaluate(
    `__mjt275.emit('NavigationState',{...samples.navigation,player:{...samples.navigation.player,x:19.1}})`,
  )
  await new Promise((r) => setTimeout(r, 200))
  assert.equal(
    await evaluate(transformExpr),
    dragged,
    'sampling preserves map drag',
  )
  assert.equal(
    await evaluate('__mjt275.commands.filter(x=>x.action==="map.get").length'),
    mapQueries,
    'sampling does not reload map',
  )
  const layout = `JSON.stringify(['.treasure-card','.treasure-direction','.treasure-guidance > span:last-child'].map(selector=>{
    const r=document.querySelector(selector).getBoundingClientRect();
    return [r.x,r.y,r.height]
  }))`
  const movingLayout = await evaluate(layout)
  await evaluate(
    `__mjt275.emit('NavigationState',{...samples.navigation,guidance:{...samples.navigation.guidance,near:true,relativeDegrees:null}})`,
  )
  await wait(
    `document.querySelector('.treasure-guidance').innerText.includes('已接近')`,
  )
  assert.equal(
    await evaluate(layout),
    movingLayout,
    'arrival preserves navigation layout',
  )
  assert.equal(
    await evaluate(transformExpr),
    dragged,
    'arrival preserves current map view',
  )
  await evaluate(
    `__mjt275.emit('NavigationState',{...samples.navigation,status:'unavailable',reason:'本人位置不可用',player:null,guidance:null})`,
  )
  await wait(
    `document.querySelector('.treasure-guidance').innerText.includes('本人位置不可用')`,
  )
  assert.equal(
    await evaluate(layout),
    movingLayout,
    'position expiry preserves navigation layout',
  )
  assert.equal(
    await evaluate(transformExpr),
    dragged,
    'position expiry preserves current map view',
  )
  await evaluate(`__mjt275.emit('NavigationState',samples.navigation)`)
  const checks = [
    'Mojito bridge and negative height',
    'incremental player marker',
    'drag preserved during sampling',
    'map resource retained',
    'map background decoded',
    'entrance clicks preserve the map and treasure marker',
    'arrival and position expiry preserve layout and map view',
  ]
  const menu = async (name) => {
    await evaluate('document.querySelector(".app-title").click()')
    await wait(
      '!!document.querySelector("[role=menuitem]") || !!document.querySelector("[role=menuitemcheckbox]")',
    )
    await evaluate(
      `document.querySelectorAll('[role^=menuitem]').forEach(el=>{if(el.textContent===${JSON.stringify(name)})el.click()})`,
    )
  }
  for (const mode of ['寻宝', '狩猎', '优雷卡']) {
    if (mode !== '寻宝') await menu(mode)
    await wait(
      `document.querySelector('.app-title')?.textContent===${JSON.stringify(mode)}`,
    )
    await wait(
      `[...document.querySelectorAll('.treasure-map div,.exploration-map div')].some(el=>el.shadowRoot && el.clientHeight>80 && el.shadowRoot.querySelector('.leaflet-image-layer'))`,
    )
    if (mode === '寻宝')
      assert.equal(
        await evaluate(
          `(()=>{const el=document.querySelector('.treasure-card'),r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()`,
        ),
        true,
        'treasure details are painted above map',
      )
    if (mode === '狩猎') {
      await new Promise((r) => setTimeout(r, 300))
      assert(
        await evaluate(
          `(()=>{const panel=document.querySelector('.overlay-exploration'),map=panel.querySelector('.exploration-map');return map.clientHeight>=panel.clientHeight*.6-1})()`,
        ),
        'a short hunt list leaves at least 60% of the panel for the map',
      )
      assert.equal(
        await evaluate('document.querySelector("details").open'),
        false,
      )
      await evaluate(
        'document.querySelector("details").open=true; document.querySelector(".hunt-row").focus()',
      )
      await c('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
        text: '\r',
        unmodifiedText: '\r',
      })
      await c('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
      })
      await wait(
        'document.querySelector(".hunt-row")?.getAttribute("aria-pressed")==="true"',
      )
      assert.match(await evaluate('document.body.innerText'), /最后观察/)
      checks.push('history folded and keyboard selection')
    }
    if (mode === '优雷卡') {
      assert.match(await evaluate('document.body.innerText'), /从首次观察估算/)
      assert.match(await evaluate('document.body.innerText'), /推测条件窗口/)
      assert.doesNotMatch(
        await evaluate('document.body.innerText'),
        /已刷新|必刷/,
      )
      checks.push('NM estimation and conditions wording')
    }
    for (const [width, height] of [
      [320, 400],
      [440, 400],
      [800, 600],
    ]) {
      await c('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await new Promise((r) => setTimeout(r, 200))
      assert.equal(
        await evaluate('document.documentElement.scrollWidth>innerWidth'),
        false,
        `${mode} ${width}: horizontal overflow`,
      )
      if (mode === '狩猎') {
        const bounds = await evaluate(
          `(()=>{const host=[...document.querySelectorAll('.exploration-map div')].find(el=>el.shadowRoot),r=host.getBoundingClientRect(),p=host.shadowRoot.querySelector('.exploration-marker-observed').getBoundingClientRect();return {left:p.x-r.x,top:p.y-r.y,width:r.width,height:r.height,markerWidth:p.width}})()`,
        )
        console.log('hunt bounds', width, bounds)
        assert(
          bounds.left >= 0 && bounds.left + bounds.markerWidth <= bounds.width,
          'selected hunt inside map',
        )
        assert(
          Math.abs(bounds.left + bounds.markerWidth / 2 - bounds.width / 2) <
            10,
          'selected hunt remains centered',
        )
      }
      if (mode === '优雷卡') {
        const bounds = await evaluate(
          `(()=>{const host=[...document.querySelectorAll('.exploration-map div')].find(el=>el.shadowRoot),r=host.getBoundingClientRect(),p=host.shadowRoot.querySelector('.leaflet-popup-pane img.leaflet-marker-icon').getBoundingClientRect();return {left:p.x-r.x,top:p.y-r.y,width:r.width,height:r.height,markerWidth:p.width,markerHeight:p.height}})()`,
        )
        assert(
          bounds.left >= 0 &&
            bounds.left + bounds.markerWidth <= bounds.width &&
            bounds.top >= 0 &&
            bounds.top + bounds.markerHeight <= bounds.height,
          `initial NM marker inside map: ${JSON.stringify(bounds)}`,
        )
        assert(
          Math.abs(bounds.left + bounds.markerWidth / 2 - bounds.width / 2) <
            10,
          'initial NM marker centered without selection',
        )
      }
      const shot = await c('Page.captureScreenshot', { format: 'png' })
      await writeFile(
        `${output}/frontend-${mode}-${width}.png`,
        Buffer.from(shot.data, 'base64'),
      )
    }
  }
  const eurekaShadow = `[...document.querySelectorAll('.exploration-map div')].find(el=>el.shadowRoot).shadowRoot`
  await evaluate(`__mjt275.emit('EurekaState',{
    ...samples.eureka,
    entries:Array.from({length:20},(_,i)=>({...samples.eureka.entries[0],fateId:500+i,name:'Dense NM '+i,
      position:{...samples.eureka.entries[0].position,x:20+(i%4)*0.5,y:19+Math.floor(i/4)*0.5}}))
  })`)
  await wait(
    `${eurekaShadow}.querySelectorAll('.exploration-marker-compact').length===20`,
  )
  assert.equal(
    await evaluate(
      `${eurekaShadow}.querySelectorAll('.marker-tooltip').length`,
    ),
    0,
  )
  assert(
    await evaluate(
      `(()=>{const panel=document.querySelector('.overlay-exploration'),map=panel.querySelector('.exploration-map');return map.clientHeight>=panel.clientHeight*.6-1})()`,
    ),
    'the full Eureka list leaves at least 60% of the panel for the map',
  )
  await evaluate(
    `Array.from(document.querySelectorAll('.eureka-row')).find(row=>row.textContent.includes('Dense NM 0')).click()`,
  )
  await wait(
    `${eurekaShadow}.querySelector('.marker-tooltip')?.textContent==='Dense NM 0'`,
  )
  assert.equal(
    await evaluate(
      `${eurekaShadow}.querySelectorAll('.marker-tooltip').length`,
    ),
    1,
  )
  assert.equal(
    await evaluate(
      `${eurekaShadow}.querySelectorAll('.exploration-marker-compact').length`,
    ),
    19,
  )
  checks.push(
    'dense Eureka map keeps all NM positions and labels only the selected one',
  )
  await menu('寻宝')
  await evaluate(
    `(async()=>{await __mjt275.emit('TreasureSpot',{item:100,location:0,isNew:true});await __mjt275.emit('NavigationState',{...samples.navigation,status:'waiting',reason:'目录读取中',target:null,player:null,guidance:null})})()`,
  )
  await wait(
    `!document.querySelector('.treasure-map') && document.body.innerText.includes('目录读取中')`,
  )
  checks.push('explicit unavailable target suppresses legacy treasure marker')
  await menu('优雷卡')
  await evaluate(`__mjt275.emit('Reset',null)`)
  await wait('!document.body.innerText.includes("Synthetic NM")')
  checks.push('Reset clears old NM')
  await evaluate(`__mjt275.emit('EurekaState',samples.eureka)`)
  await wait('document.body.innerText.includes("Synthetic NM")')
  await evaluate('__mjt275.disconnect()')
  await wait(
    'document.body.innerText.includes("数据源已停止") && !document.body.innerText.includes("Synthetic NM")',
  )
  checks.push(
    'disconnect clears dynamic state',
    'visible map and treasure details',
    'selected hunt centered across resize',
    'short hunt list leaves space for the map',
    'initial NM visible without selection',
  )
  assert.deepEqual(errors, [])
  const result = {
    checks,
    viewports: ['320x400', '440x400', '800x600'],
    pageErrors: errors,
    synthetic: true,
  }
  await writeFile(
    `${output}/frontend-browser-result.json`,
    `${JSON.stringify(result, null, 2)}\n`,
  )
  console.log(JSON.stringify(result, null, 2))
} finally {
  await send('Browser.close')
  ws.close()
}
