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
    source: `(${installExplorationBridge.toString()})()`,
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
  const mapQueries = await evaluate(
    '__mjt275.commands.filter(x=>x.action==="map.get").length',
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
  const checks = [
    'Mojito bridge and negative height',
    'incremental player marker',
    'drag preserved during sampling',
    'map resource retained',
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
          `(()=>{const host=[...document.querySelectorAll('.exploration-map div')].find(el=>el.shadowRoot),r=host.getBoundingClientRect(),p=host.shadowRoot.querySelector('.leaflet-marker-icon').getBoundingClientRect();return {left:p.x-r.x,top:p.y-r.y,width:r.width,height:r.height,markerWidth:p.width,markerHeight:p.height}})()`,
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
