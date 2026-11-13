/** Synthetic browser-only host. Install with Playwright page.addInitScript(installExplorationBridge). */
export function installExplorationBridge() {
  const activationId = 'mjt275-synthetic'
  const context = {
    sessionId: 'synthetic-session',
    characterGeneration: 1,
    clockGeneration: 0,
    zoneEpoch: 1,
    catalogRevision: 1,
    territoryId: 732,
    clock: {
      now: 1700000000000,
      base: 'packet-unix',
      generation: 0,
      source: 'replay',
      paused: true,
    },
  }
  const latest = new Map()
  const streams = new Map()
  const commands = []
  let sequence = 0
  let port
  const image = (body, width = 2048) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" viewBox="0 0 ${width} ${width}">${body}</svg>`)}`
  const mapImage = image(
    '<defs><pattern id="grid" width="128" height="128" patternUnits="userSpaceOnUse"><rect width="128" height="128" fill="#363b38"/><path d="M128 0H0V128" fill="none" stroke="#73806e" stroke-width="2"/></pattern></defs><rect width="2048" height="2048" fill="url(#grid)"/><text x="1024" y="200" text-anchor="middle" fill="#c4d2bc" font-size="50">Synthetic map · MJT-275</text>',
  )
  const icon = image(
    '<path d="M16 1L31 16L16 31L1 16Z" fill="#d3b66b" stroke="#fff"/>',
    32,
  )
  const send = (kind, fields = {}) =>
    port?.postMessage({ protocol: 1, activationId, kind, ...fields })
  const drain = (stream) => {
    if (stream.busy || !stream.pending.length) return
    stream.busy = true
    const { items, done } = stream.pending.shift()
    stream.done = done
    send('batch', {
      subscriptionId: stream.id,
      batchId: ++stream.batch,
      firstSeq: ++stream.seq,
      lastSeq: stream.seq,
      initial: false,
      complete: true,
      items,
    })
  }
  const publish = (channel, items) =>
    Promise.all(
      [...streams.values()]
        .filter((stream) => stream.channel === channel)
        .map(
          (stream) =>
            new Promise((done) => {
              stream.pending.push({ items, done })
              drain(stream)
            }),
        ),
    )
  const catalog = {
    fishing: { fish: {}, tackle: {}, places: {}, placefish: {} },
    maps: { 1: { name: 'Synthetic field' } },
    treasures: { 100: [{ map: 1, x: 20, y: 20 }] },
    worlds: {},
    submarineMap: {},
    submarineParts: {},
    submarineRanks: {},
  }
  const command = (value) => {
    commands.push(value)
    switch (value.action) {
      case 'data.catalog':
        return catalog
      case 'config.get':
        return null
      case 'map.regions':
        return [
          {
            placeNameRegion: 'Synthetic',
            maps: [{ rowId: 1, placeName: 'Synthetic field' }],
          },
        ]
      case 'map.get':
        return {
          rowId: 1,
          id: 'synthetic/00',
          sizeFactor: 100,
          offsetX: 0,
          offsetY: 0,
          marker: 1,
          placeName: 'Synthetic field',
        }
      case 'map.key':
        return 1
      case 'map.image':
        return mapImage
      case 'map.markers':
        return []
      case 'map.icon':
        return icon
      case 'http':
        return { body: new Uint8Array(), status: 404, headers: {} }
      default:
        return null
    }
  }
  const originalPostMessage = window.postMessage.bind(window)
  window.postMessage = (message, ...args) => {
    if (message?.type !== 'mojito:view-connect')
      return originalPostMessage(message, ...args)
    const channel = new MessageChannel()
    port = channel.port1
    port.onmessage = ({ data }) => {
      if (data.kind === 'request') {
        const value =
          data.method === 'view.snapshot'
            ? {
                language: 'chs',
                version: 'synthetic',
                sequence,
                events: [...latest.values()],
                session: { clock: context.clock },
              }
            : command(data.params.payload)
        send('response', { id: data.id, ok: true, value })
      } else if (data.kind === 'subscribe') {
        const stream = {
          id: `stream-${data.id}`,
          channel: data.params.channel,
          batch: 0,
          seq: 0,
          busy: false,
          pending: [],
        }
        streams.set(stream.id, stream)
        send('subscribed', { id: data.id, subscriptionId: stream.id })
      } else if (data.kind === 'unsubscribe')
        streams.delete(data.subscriptionId)
      else if (data.kind === 'ack') {
        const stream = streams.get(data.subscriptionId)
        if (stream) {
          stream.busy = false
          stream.done?.()
          drain(stream)
        }
      }
    }
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        origin: 'mojito-plugin://runtime',
        data: { type: 'mojito:view-port' },
        ports: [channel.port2],
      }),
    )
    const values = Object.fromEntries(
      [
        'transport.messageBytes',
        'transport.maxDepth',
        'transport.collectionItems',
        'queue.pluginItems',
        'queue.pluginBytes',
        'batch.items',
        'batch.bytes',
        'batch.waitMs',
        'game.watchMinMs',
        'game.watchMaxMs',
        'game.watchDefaultMs',
        'memory.watchMinMs',
        'memory.watchMaxMs',
        'memory.watchDefaultMs',
        'storage.fileBytes',
        'storage.pluginBytes',
        'clock.replayBackwardResetMs',
      ].map((key) => [key, 10000000]),
    )
    queueMicrotask(() =>
      send('hello', {
        apiVersion: '2.0.0',
        identity: {
          activationId,
          id: 'matcha',
          version: 'synthetic',
          environment: 'development',
          mode: 'worker',
        },
        viewIdentity: {
          viewId: 'synthetic-view',
          definitionId: 'matcha',
          kind: 'overlay',
          instanceId: null,
        },
        limits: { schemaVersion: 1, revision: 'synthetic', values },
        capabilities: {},
        clock: context.clock,
      }),
    )
  }
  window.__mjt275 = {
    context,
    commands,
    async emit(type, content) {
      const event = {
        sequence: ++sequence,
        type,
        content,
        timestamp: context.clock.now,
      }
      if (type === 'Reset') latest.clear()
      else latest.set(type, event)
      await publish('matcha.events', [event])
    },
    async disconnect() {
      for (const stream of streams.values())
        if (stream.channel === 'matcha.events')
          send('subscriptionClosed', {
            subscriptionId: stream.id,
            reason: 'synthetic-disconnect',
          })
    },
    get subscribed() {
      return [...streams.values()].some(
        (stream) => stream.channel === 'matcha.events',
      )
    },
  }
}

export function explorationSamples(context) {
  return {
    navigation: {
      context,
      status: 'ready',
      reason: null,
      target: {
        itemId: 100,
        spotIndex: 0,
        levelId: 1,
        territoryId: 732,
        mapId: 1,
        placeName: 'Synthetic field',
        x: 20,
        y: 20,
        z: -0.25,
        zStatus: 'known',
      },
      player: {
        x: 19,
        y: 19,
        observedAt: context.clock.now,
        headingDegrees: 90,
      },
      guidance: {
        distanceM: 72,
        heightDifferenceM: -25,
        bearingDegrees: 135,
        relativeDegrees: 45,
        near: false,
      },
    },
    hunts: {
      context,
      status: 'ready',
      reason: null,
      mapId: 1,
      entries: [
        {
          actorId: 1,
          bNpcBase: 1,
          bNpcName: 1,
          name: 'Observed synthetic hunt',
          rank: 'A',
          state: 'observed',
          position: { mapId: 1, x: 18, y: 19 },
          lastObservedAt: context.clock.now,
          hpPercent: 75,
          distanceM: 50,
          heightDifferenceM: 12,
        },
        {
          actorId: 2,
          bNpcBase: 2,
          bNpcName: 2,
          name: 'Historical synthetic hunt',
          rank: 'S',
          state: 'last-seen',
          position: { mapId: 1, x: 22, y: 21 },
          lastObservedAt: context.clock.now - 5000,
          hpPercent: null,
          distanceM: null,
          heightDifferenceM: null,
        },
      ],
    },
    eureka: {
      context,
      status: 'ready',
      reason: null,
      mapId: 1,
      entries: [
        {
          fateId: 1,
          name: 'Synthetic NM',
          position: { mapId: 1, x: 21, y: 18 },
          activity: 'ended',
          progress: 100,
          activityEndsAt: context.clock.now - 1000,
          cooldown: {
            basis: 'first-observed',
            referenceAt: context.clock.now - 1000000,
            durationMs: 7200000,
            readyAt: context.clock.now + 6200000,
          },
          conditions: {
            weatherId: 1,
            weatherName: 'Synthetic weather',
            nightOnly: true,
            status: 'waiting',
            environmentWindow: {
              opensAt: context.clock.now + 60000,
              closesAt: context.clock.now + 120000,
            },
            estimatedWindow: {
              opensAt: context.clock.now + 6500000,
              closesAt: context.clock.now + 7000000,
            },
            otherConditionsUnknown: true,
          },
        },
      ],
    },
  }
}
