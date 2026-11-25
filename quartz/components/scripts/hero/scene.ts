import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  Float32BufferAttribute,
  Group,
  HalfFloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LineSegments,
  MaxEquation,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  Sphere,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three"
import { createWireForms, matchCloud } from "./geometry"
import { createGuidePaths, GUIDE_STEPS } from "./guides"
import {
  ambientVertex,
  ambientFragment,
  biometricFragment,
  fxFragment,
  auraBlurFragment,
  radarVertex,
  radarFragment,
  guideVertex,
  guideFragment,
  guideParticleVertex,
  guideParticleFragment,
  blurFragment,
  compositeFragment,
  edgeFragment,
  edgeVertex,
  fullscreenVertex,
  nodeFragment,
  nodeVertex,
  particleFragment,
  particleVertex,
} from "./shaders"

const HOLD_SECONDS = 3.2
/** The network form plays out three attacks, so it holds longer than the others. */
const NETWORK_HOLD_SECONDS = 5.6
const MORPH_SECONDS = 2.6
/** Global animation speed: scales holds, morphs and every time-driven effect together. */
const SPEED = 1.2
const holdSeconds = (index: number) => (index === 6 ? NETWORK_HOLD_SECONDS : HOLD_SECONDS)

/** A home-only scene. Particle trajectories are evaluated entirely in the vertex shader. */
export function mountHero(root: HTMLElement): () => void {
  // The router can reuse the canvas after its previous WebGL context was disposed.
  const previous = root.querySelector<HTMLCanvasElement>(".lab-canvas")!
  const canvas = previous.cloneNode(false) as HTMLCanvasElement
  previous.replaceWith(canvas)
  const stage = root.querySelector<HTMLElement>(".lab-visual")!
  const preference = matchMedia("(prefers-reduced-motion: reduce)")
  const mobile = matchMedia("(max-width: 600px)")
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    powerPreference: "high-performance",
  })
  renderer.setClearColor(0x000000, 0)
  renderer.info.autoReset = false
  const gl = renderer.getContext()
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info")
  const software = debugInfo
    ? /swiftshader|llvmpipe|software/i.test(
        String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)),
      )
    : false
  const count = mobile.matches || software ? 2800 : 3600

  const forms = createWireForms(count)
  const scene = new Scene()
  const camera = new PerspectiveCamera(36, 1, 0.1, 30)
  camera.position.z = 5.7
  const object = new Group()
  object.rotation.set(0.12, -0.25, 0)
  scene.add(object)
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<ShaderMaterial>()
  const ownGeometry = <T extends BufferGeometry>(value: T) => {
    geometries.add(value)
    return value
  }
  const ownMaterial = <T extends ShaderMaterial>(value: T) => {
    materials.add(value)
    return value
  }
  const common = {
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uPhase: { value: 0 },
    uTransition: { value: 0 },
    uSourceForm: { value: 0 },
    uTargetForm: { value: 0 },
    uPixelRatio: { value: 1 },
    uNodePixelRatio: { value: 1 },
    uResolution: { value: new Vector2(1, 1) },
    uLineResolution: { value: new Vector2(1, 1) },
    uDensity: { value: 1 },
    uSwirl: { value: 1 },
    uFlowSeed: { value: 0 },
    // pointer over the stage in clip space, z = how strongly it pushes (0 when away or touch)
    uPointer: { value: new Vector3() },
    uCrowd: { value: Math.pow(2800 / count, 0.8) },
    uBlue: { value: new Color("#9bc7ed") },
    uLavender: { value: new Color("#bdb0ed") },
  }
  const shaderOptions = {
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    toneMapped: false,
  }
  const lineGeometries = forms.map((form) => {
    // Screen-space capsules keep outlines substantial on every WebGL implementation.
    const geometry = ownGeometry(new InstancedBufferGeometry())
    const quad = new PlaneGeometry(1, 1)
    geometry.setIndex(quad.getIndex()!.clone())
    geometry.setAttribute("position", quad.getAttribute("position").clone())
    geometry.setAttribute("uv", quad.getAttribute("uv").clone())
    quad.dispose()
    geometry.setAttribute(
      "aStart",
      new InstancedBufferAttribute(new Float32Array(form.edges.flatMap(([a]) => a)), 3),
    )
    geometry.setAttribute(
      "aEnd",
      new InstancedBufferAttribute(new Float32Array(form.edges.flatMap(([, b]) => b)), 3),
    )
    geometry.setAttribute(
      "aEdge",
      new InstancedBufferAttribute(
        Float32Array.from(form.edges, (_, i) => i),
        1,
      ),
    )
    geometry.setAttribute(
      "aWeight",
      new InstancedBufferAttribute(
        Float32Array.from(form.edges, (edge) => edge.weight ?? 1),
        1,
      ),
    )
    for (const [attribute, property, fallback] of [
      ["aChannel", "channel", 0],
      ["aFlow", "flow", 0],
      ["aSpan", "span", 1],
    ] as const) {
      geometry.setAttribute(
        attribute,
        new InstancedBufferAttribute(
          Float32Array.from(form.edges, (edge) => edge[property] ?? fallback),
          1,
        ),
      )
    }
    geometry.instanceCount = form.edges.length
    geometry.boundingSphere = new Sphere(new Vector3(), 2.3)
    return geometry
  })
  const nodeGeometries = forms.map((form) => {
    const geometry = ownGeometry(new BufferGeometry())
    geometry.setAttribute("position", new BufferAttribute(form.vertices, 3))
    return geometry
  })
  const lineMaterial = (role: number) =>
    ownMaterial(
      new ShaderMaterial({
        ...shaderOptions,
        // Strokes are emission on a black target, so taking the per-channel maximum composites them
        // without seams at segment joints (alpha blending let one segment's dim rim cut notches into
        // the bright core of the next).
        blending: CustomBlending,
        blendEquation: MaxEquation,
        blendEquationAlpha: MaxEquation,
        premultipliedAlpha: true,
        uniforms: { ...common, uRole: { value: role }, uForm: { value: 0 }, uPhase: { value: 0 } },
        vertexShader: edgeVertex,
        fragmentShader: edgeFragment,
      }),
    )
  const nodeMaterial = (role: number) =>
    ownMaterial(
      new ShaderMaterial({
        ...shaderOptions,
        uniforms: { ...common, uRole: { value: role }, uForm: { value: 0 }, uPhase: { value: 0 } },
        vertexShader: nodeVertex,
        fragmentShader: nodeFragment,
      }),
    )
  const outgoing = new Mesh(lineGeometries[0], lineMaterial(0))
  const incoming = new Mesh(lineGeometries[0], lineMaterial(1))
  const outgoingNodes = new Points(nodeGeometries[0], nodeMaterial(0))
  const incomingNodes = new Points(nodeGeometries[0], nodeMaterial(1))
  incoming.visible = incomingNodes.visible = false
  object.add(outgoing, incoming, outgoingNodes, incomingNodes)

  const radarUniforms = { ...common, uRadarSource: { value: 0 }, uRadarTarget: { value: 0 } }
  const radar = new Mesh(
    ownGeometry(new PlaneGeometry(2, 2)),
    ownMaterial(
      new ShaderMaterial({
        ...shaderOptions,
        uniforms: radarUniforms,
        vertexShader: radarVertex,
        fragmentShader: radarFragment,
      }),
    ),
  )
  radar.position.z = 0.16
  radar.visible = false
  object.add(radar)

  const biometric = new Mesh(
    ownGeometry(new PlaneGeometry(2.2, 2.2)),
    ownMaterial(
      new ShaderMaterial({
        ...shaderOptions,
        uniforms: common,
        vertexShader: radarVertex,
        fragmentShader: biometricFragment,
      }),
    ),
  )
  biometric.position.z = 0.22
  biometric.visible = false
  object.add(biometric)

  // Gradient effects (infection wave, eye glow) share one plane behind the wires.
  const fx = new Mesh(
    ownGeometry(new PlaneGeometry(3.2, 3.2)),
    ownMaterial(
      new ShaderMaterial({
        ...shaderOptions,
        uniforms: common,
        vertexShader: radarVertex,
        fragmentShader: fxFragment,
      }),
    ),
  )
  fx.position.z = 0.2
  fx.visible = false
  object.add(fx)

  const particleGeometry = ownGeometry(new InstancedBufferGeometry())
  const quad = new PlaneGeometry(1, 1)
  particleGeometry.setIndex(quad.getIndex()!.clone())
  particleGeometry.setAttribute("position", quad.getAttribute("position").clone())
  particleGeometry.setAttribute("uv", quad.getAttribute("uv").clone())
  quad.dispose()
  const sources = new InstancedBufferAttribute(new Float32Array(count * 3), 3)
  const destinations = new InstancedBufferAttribute(new Float32Array(count * 3), 3)
  const seeds = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    seeds[i * 2] = ((Math.imul(i + 173, 1597334677) >>> 0) % 65536) / 65536
    seeds[i * 2 + 1] = ((Math.imul(i + 71, 3812015801) >>> 0) % 65536) / 65536
  }
  particleGeometry.setAttribute("aSource", sources)
  particleGeometry.setAttribute("aTarget", destinations)
  particleGeometry.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 2))
  particleGeometry.instanceCount = count
  particleGeometry.boundingSphere = new Sphere(new Vector3(), 2.2)
  const particleMaterial = (glow: boolean) =>
    ownMaterial(
      new ShaderMaterial({
        ...shaderOptions,
        uniforms: { ...common, uGlow: { value: glow ? 1 : 0 } },
        vertexShader: particleVertex,
        fragmentShader: particleFragment,
      }),
    )
  const particles = new Mesh(particleGeometry, particleMaterial(false))
  // Sharp particles are composited after bloom, so glowing wireframes never blur their cores.
  const particleScene = new Scene()
  const particleGroup = new Group()
  particleGroup.add(particles)
  particleScene.add(particleGroup)
  // A wide, faint copy goes through the bloom so the stream glows while its cores stay crisp.
  const particleGlow = new Mesh(particleGeometry, particleMaterial(true))
  particleGlow.frustumCulled = particles.frustumCulled = false
  object.add(particleGlow)

  function upload(attribute: InstancedBufferAttribute, cloud: Float32Array) {
    ;(attribute.array as Float32Array).set(cloud)
    attribute.needsUpdate = true
  }
  let currentCloud = forms[0].cloud.slice()
  let targetCloud = currentCloud
  upload(sources, currentCloud)
  upload(destinations, currentCloud)

  const guidePaths = forms.map((_, index) => createGuidePaths(index))
  const guideUniforms = {
    ...common,
    uGuideStyleFrom: { value: guidePaths[0].style },
    uGuideStyleTo: { value: guidePaths[0].style },
  }
  const guideGeometry = ownGeometry(new BufferGeometry())
  const guideNodeGeometry = ownGeometry(new BufferGeometry())
  const guideParticleGeometry = ownGeometry(new BufferGeometry())
  function updateGuideAttribute(
    geometry: BufferGeometry,
    name: string,
    values: Float32Array,
    size: number,
  ) {
    const existing = geometry.getAttribute(name) as BufferAttribute | undefined
    if (existing) {
      existing.copyArray(values)
      existing.needsUpdate = true
    } else geometry.setAttribute(name, new BufferAttribute(values.slice(), size))
  }
  function setGuides(sourceIndex: number, targetIndex: number) {
    common.uSourceForm.value = sourceIndex
    common.uTargetForm.value = targetIndex
    outgoing.material.uniforms.uForm.value = outgoingNodes.material.uniforms.uForm.value =
      sourceIndex
    incoming.material.uniforms.uForm.value = incomingNodes.material.uniforms.uForm.value =
      targetIndex
    biometric.visible = sourceIndex === 7 || targetIndex === 7
    fx.visible = sourceIndex === 8 || sourceIndex === 9
    radarUniforms.uRadarSource.value = sourceIndex === 5 ? 1 : 0
    radarUniforms.uRadarTarget.value = targetIndex === 5 ? 1 : 0
    radar.visible = sourceIndex === 5 || targetIndex === 5
    const source = guidePaths[sourceIndex],
      target = guidePaths[targetIndex]
    updateGuideAttribute(guideGeometry, "position", source.positions, 3)
    updateGuideAttribute(guideGeometry, "aTarget", target.positions, 3)
    updateGuideAttribute(guideGeometry, "aAlong", source.along, 1)
    updateGuideAttribute(guideGeometry, "aLane", source.lanes, 1)
    const endpoints = (points: Float32Array) =>
      new Float32Array(
        Array.from({ length: 4 }, (_, lane) =>
          Array.from(
            points.slice(((lane + 1) * GUIDE_STEPS * 2 - 1) * 3, (lane + 1) * GUIDE_STEPS * 2 * 3),
          ),
        ).flat(),
      )
    updateGuideAttribute(guideNodeGeometry, "position", endpoints(source.positions), 3)
    updateGuideAttribute(guideNodeGeometry, "aTarget", endpoints(target.positions), 3)
    updateGuideAttribute(guideNodeGeometry, "aAlong", new Float32Array([1, 1, 1, 1]), 1)
    updateGuideAttribute(guideNodeGeometry, "aLane", new Float32Array([0, 1, 2, 3]), 1)
    // One point per sample, rather than duplicate endpoints from the line segments.
    const samples = Array.from({ length: 4 }, (_, lane) =>
      Array.from(
        { length: GUIDE_STEPS + 1 },
        (_, step) => lane * GUIDE_STEPS * 2 + Math.min(step * 2, GUIDE_STEPS * 2 - 1),
      ),
    ).flat()
    const samplePositions = (positions: Float32Array) =>
      new Float32Array(samples.flatMap((i) => Array.from(positions.slice(i * 3, i * 3 + 3))))
    updateGuideAttribute(guideParticleGeometry, "position", samplePositions(source.positions), 3)
    updateGuideAttribute(guideParticleGeometry, "aTarget", samplePositions(target.positions), 3)
    updateGuideAttribute(
      guideParticleGeometry,
      "aAlong",
      Float32Array.from(samples, (i) => source.along[i]),
      1,
    )
    updateGuideAttribute(
      guideParticleGeometry,
      "aLane",
      Float32Array.from(samples, (i) => source.lanes[i]),
      1,
    )
    guideUniforms.uGuideStyleFrom.value = source.style
    guideUniforms.uGuideStyleTo.value = target.style
  }
  setGuides(0, 0)
  const guideMaterial = (nodes: boolean, role: number) =>
    ownMaterial(
      new ShaderMaterial({
        ...shaderOptions,
        uniforms: {
          ...guideUniforms,
          uGuideNodes: { value: nodes ? 1 : 0 },
          uGuideRole: { value: role },
        },
        vertexShader: guideVertex,
        fragmentShader: guideFragment,
      }),
    )
  for (const role of [0, 1]) {
    const guides = new LineSegments(guideGeometry, guideMaterial(false, role))
    const nodes = new Points(guideNodeGeometry, guideMaterial(true, role))
    guides.frustumCulled = nodes.frustumCulled = false
    scene.add(guides, nodes)
  }
  const guideParticles = new Points(
    guideParticleGeometry,
    ownMaterial(
      new ShaderMaterial({
        ...shaderOptions,
        uniforms: common,
        vertexShader: guideParticleVertex,
        fragmentShader: guideParticleFragment,
      }),
    ),
  )
  guideParticles.frustumCulled = false
  // Keep telemetry fragments as sharp as the object particles, outside the bloom pass.
  particleScene.add(guideParticles)
  const ambientGeometry = ownGeometry(new BufferGeometry())
  const ambientPositions = [],
    ambientSeeds = []
  const DUST = 96
  for (let i = 0; i < DUST; i++) {
    const a = i * 2.39996323,
      r = 1.05 + (((i * 13) % 29) / 29) * 1.6
    ambientPositions.push(Math.cos(a) * r * 1.2, Math.sin(a) * r, -0.3 - (i % 4) * 0.35)
    ambientSeeds.push(((i * 37) % DUST) / DUST)
  }
  ambientGeometry.setAttribute("position", new Float32BufferAttribute(ambientPositions, 3))
  ambientGeometry.setAttribute("aSeed", new Float32BufferAttribute(ambientSeeds, 1))
  scene.add(
    new Points(
      ambientGeometry,
      ownMaterial(
        new ShaderMaterial({
          ...shaderOptions,
          uniforms: common,
          vertexShader: ambientVertex,
          fragmentShader: ambientFragment,
        }),
      ),
    ),
  )

  // Two half-resolution blur passes provide local bloom without a full-screen mip chain.
  const hdr = renderer.extensions.has("EXT_color_buffer_float")
  const sceneTarget = new WebGLRenderTarget(1, 1, {
    type: hdr ? HalfFloatType : UnsignedByteType,
    depthBuffer: false,
  })
  sceneTarget.samples = Math.min(4, renderer.capabilities.maxSamples)
  const blurA = new WebGLRenderTarget(1, 1, {
    type: hdr ? HalfFloatType : UnsignedByteType,
    depthBuffer: false,
  })
  const blurB = blurA.clone()
  // The sharp particles get their own layer, so the composite can re-read them as ink in light theme.
  const particleTarget = blurA.clone()
  const auraA = blurA.clone()
  const auraB = blurA.clone()
  const postScene = new Scene(),
    postCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const postGeometry = ownGeometry(new BufferGeometry())
  postGeometry.setAttribute(
    "position",
    new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
  )
  const blurUniforms = {
    tSource: { value: sceneTarget.texture },
    uDirection: { value: new Vector2() },
    uExtract: { value: 1 },
  }
  const blurMaterial = ownMaterial(
    new ShaderMaterial({
      uniforms: blurUniforms,
      vertexShader: fullscreenVertex,
      fragmentShader: blurFragment,
      depthTest: false,
      depthWrite: false,
    }),
  )
  const auraUniforms = { tSource: { value: blurB.texture }, uDirection: { value: new Vector2() } }
  const auraMaterial = ownMaterial(
    new ShaderMaterial({
      uniforms: auraUniforms,
      vertexShader: fullscreenVertex,
      fragmentShader: auraBlurFragment,
      depthTest: false,
      depthWrite: false,
    }),
  )
  const isLight = () => document.documentElement.getAttribute("saved-theme") !== "dark"
  const theme = { uniform: { value: isLight() ? 1 : 0 }, target: isLight() ? 1 : 0 }
  const finalMaterial = ownMaterial(
    new ShaderMaterial({
      uniforms: {
        tScene: { value: sceneTarget.texture },
        tBloom: { value: blurB.texture },
        tAura: { value: auraB.texture },
        tParticles: { value: particleTarget.texture },
        uTime: common.uTime,
        uLight: theme.uniform,
      },
      vertexShader: fullscreenVertex,
      fragmentShader: compositeFragment,
      depthTest: false,
      depthWrite: false,
    }),
  )
  const postTriangle = new Mesh(postGeometry, blurMaterial)
  postTriangle.frustumCulled = false
  postScene.add(postTriangle)

  let frame = 0,
    disposed = false,
    contextLost = false,
    visible = true
  // Pointer offset from the viewport centre in [-1, 1], eased so the object turns gently towards it.
  const pointer = { tx: 0, ty: 0, x: 0, y: 0 }
  // The same pointer relative to the stage, which pushes particles in flight aside.
  const local = { tx: 0, ty: 0, x: 0, y: 0, active: 0, strength: 0 }
  const POINTER_YAW = 0.12
  const POINTER_PITCH = 0.08
  let orbit = 0
  let time = 0,
    lastTime = 0,
    cycleStart = 0,
    transitionStart = -1
  let currentIndex = 0,
    targetIndex = 0
  let quality = software ? 0 : mobile.matches ? 1 : 2,
    width = 1,
    height = 1,
    pixelRatio = 1
  let averageFrame = 16.7,
    performanceSamples = 0,
    lastQualityChange = 0,
    // Below the lowest quality the device still cannot animate smoothly (CPU-only WebGL takes over
    // 100ms a frame), so the scene settles on its current shape and stays still, keeping the page
    // responsive. The last frame stays on screen and resize() redraws it.
    pauseWhenSettled = false,
    paused = false
  let preparing = false,
    correspondenceSerial = 0,
    jobId = 0
  let prepared: { index: number; cloud: Float32Array } | null = null
  let worker: Worker | undefined
  const jobs = new Map<number, { resolve: (cloud: Float32Array) => void; reject: () => void }>()
  try {
    worker = new Worker(new URL("./hero-correspondence.js", import.meta.url), { type: "module" })
    worker.onmessage = (event: MessageEvent<{ id: number; result: ArrayBuffer }>) => {
      jobs.get(event.data.id)?.resolve(new Float32Array(event.data.result))
      jobs.delete(event.data.id)
    }
    worker.onerror = (event) => {
      event.preventDefault()
      worker?.terminate()
      worker = undefined
      jobs.forEach((job) => job.reject())
      jobs.clear()
    }
  } catch {
    /* Spatial matching still works if module workers are unavailable. */
  }

  function correspond(source: Float32Array, target: Float32Array): Promise<Float32Array> {
    if (!worker) return Promise.resolve(matchCloud(source, target))
    const sourceCopy = source.slice(),
      targetCopy = target.slice(),
      id = ++jobId
    return new Promise<Float32Array>((resolve, reject) => {
      jobs.set(id, { resolve, reject })
      try {
        worker!.postMessage({ id, source: sourceCopy.buffer, target: targetCopy.buffer }, [
          sourceCopy.buffer,
          targetCopy.buffer,
        ])
      } catch {
        jobs.delete(id)
        reject()
      }
    }).catch(() => (disposed ? new Float32Array() : matchCloud(source, target)))
  }

  function resize() {
    if (disposed || contextLost) return
    const bounds = stage.getBoundingClientRect()
    width = Math.max(1, bounds.width)
    height = Math.max(1, bounds.height)
    pixelRatio = Math.min(devicePixelRatio || 1, 2)
    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(width, height, false)
    const samples = Math.min(quality === 2 ? 4 : 2, renderer.capabilities.maxSamples)
    if (sceneTarget.samples !== samples) {
      sceneTarget.samples = samples
      sceneTarget.dispose()
    }
    const w = Math.max(1, Math.round(width * pixelRatio)),
      h = Math.max(1, Math.round(height * pixelRatio))
    // The wire pass is cheap, and upscaling it is what blurs the outlines, so only the CPU-bound
    // lowest tier renders below native resolution.
    const renderScale = Math.max(1 / pixelRatio, quality > 0 ? 1 : 0.8)
    sceneTarget.setSize(
      Math.max(1, Math.round(w * renderScale)),
      Math.max(1, Math.round(h * renderScale)),
    )
    blurA.setSize(
      Math.max(1, Math.round(sceneTarget.width / 2)),
      Math.max(1, Math.round(sceneTarget.height / 2)),
    )
    blurB.setSize(blurA.width, blurA.height)
    auraA.setSize(
      Math.max(1, Math.round(sceneTarget.width / 4)),
      Math.max(1, Math.round(sceneTarget.height / 4)),
    )
    auraB.setSize(auraA.width, auraA.height)
    particleTarget.setSize(w, h)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    common.uResolution.value.set(w, h)
    common.uLineResolution.value.set(sceneTarget.width, sceneTarget.height)
    common.uPixelRatio.value = pixelRatio
    common.uNodePixelRatio.value = pixelRatio * renderScale
    common.uDensity.value = quality === 2 ? 1 : quality === 1 ? 0.9 : 0.82
    particleGlow.visible = quality > 0
    render()
  }

  function render() {
    if (disposed || contextLost) return
    renderer.info.reset()
    renderer.setRenderTarget(sceneTarget)
    renderer.render(scene, camera)
    postTriangle.material = blurMaterial
    blurUniforms.tSource.value = sceneTarget.texture
    blurUniforms.uExtract.value = 1
    blurUniforms.uDirection.value.set(1.0 / blurA.width, 0)
    renderer.setRenderTarget(blurA)
    renderer.render(postScene, postCamera)
    blurUniforms.tSource.value = blurA.texture
    blurUniforms.uExtract.value = 0
    blurUniforms.uDirection.value.set(0, 1.0 / blurB.height)
    renderer.setRenderTarget(blurB)
    renderer.render(postScene, postCamera)
    // A separate broad halo preserves the sharp bloom core and the native-resolution particles.
    postTriangle.material = auraMaterial
    auraUniforms.tSource.value = blurB.texture
    auraUniforms.uDirection.value.set(1 / auraA.width, 0)
    renderer.setRenderTarget(auraA)
    renderer.render(postScene, postCamera)
    auraUniforms.tSource.value = auraA.texture
    auraUniforms.uDirection.value.set(0, 1 / auraB.height)
    renderer.setRenderTarget(auraB)
    renderer.render(postScene, postCamera)
    particleGroup.rotation.copy(object.rotation)
    renderer.setRenderTarget(particleTarget)
    renderer.render(particleScene, camera)
    postTriangle.material = finalMaterial
    renderer.setRenderTarget(null)
    renderer.render(postScene, postCamera)
  }

  function prepareNext() {
    if (disposed || contextLost || preparing || prepared || preference.matches) return
    const index = (currentIndex + 1) % forms.length
    const serial = ++correspondenceSerial
    preparing = true
    void correspond(currentCloud, forms[index].cloud).then((cloud) => {
      if (disposed || serial !== correspondenceSerial) return
      preparing = false
      prepared = { index, cloud }
    })
  }

  function beginMorph() {
    if (!prepared) return
    targetIndex = prepared.index
    targetCloud = prepared.cloud
    prepared = null
    upload(destinations, targetCloud)
    setGuides(currentIndex, targetIndex)
    incoming.geometry = lineGeometries[targetIndex]
    incomingNodes.geometry = nodeGeometries[targetIndex]
    incoming.visible = incomingNodes.visible = true
    common.uProgress.value = 0
    common.uTransition.value = 1
    common.uSwirl.value = targetIndex % 2 === 0 ? 1 : -1
    common.uFlowSeed.value = targetIndex * 1.37
    // Preparation happens during the hold, so transitions keep a fixed cadence.
    transitionStart = cycleStart + holdSeconds(currentIndex)
    root.dataset.sceneState = "morphing"
  }

  function settle() {
    cycleStart += holdSeconds(currentIndex) + MORPH_SECONDS
    currentIndex = targetIndex
    currentCloud = targetCloud
    upload(sources, currentCloud)
    setGuides(currentIndex, currentIndex)
    outgoing.geometry = lineGeometries[currentIndex]
    outgoingNodes.geometry = nodeGeometries[currentIndex]
    incoming.visible = incomingNodes.visible = false
    common.uProgress.value = common.uTransition.value = 0
    transitionStart = -1
    if (time - cycleStart > holdSeconds(currentIndex) + MORPH_SECONDS) cycleStart = time
    root.dataset.sceneObject = forms[currentIndex].name
    root.dataset.sceneState = "holding"
    prepareNext()
  }

  function animate(now: number) {
    frame = 0
    if (!canRun()) return
    const rawDelta = lastTime ? now - lastTime : 16.7
    lastTime = now
    time += (rawDelta / 1000) * SPEED
    common.uTime.value = time
    const ease = 1 - Math.exp(-(rawDelta / 1000) * 2.5)
    pointer.x += (pointer.tx - pointer.x) * ease
    pointer.y += (pointer.ty - pointer.y) * ease
    const follow = 1 - Math.exp(-(rawDelta / 1000) * 9)
    local.x += (local.tx - local.x) * follow
    local.y += (local.ty - local.y) * follow
    local.strength += (local.active - local.strength) * (1 - Math.exp(-(rawDelta / 1000) * 4))
    common.uPointer.value.set(local.x, local.y, local.strength)
    const fade = theme.target - theme.uniform.value
    theme.uniform.value =
      Math.abs(fade) < 0.002
        ? theme.target
        : theme.uniform.value + fade * (1 - Math.exp(-(rawDelta / 1000) * 7))
    object.rotation.set(
      0.1 + Math.sin(time * 0.27) * 0.045 + pointer.y * POINTER_PITCH,
      -0.2 + Math.sin(time * 0.21) * 0.13 + pointer.x * POINTER_YAW,
      Math.sin(time * 0.16) * 0.015,
    )
    if (transitionStart < 0 && time - cycleStart >= holdSeconds(currentIndex)) beginMorph()
    if (transitionStart >= 0) {
      common.uProgress.value = Math.min(1, (time - transitionStart) / MORPH_SECONDS)
      if (common.uProgress.value >= 1) settle()
    }
    // Compute the phase after settling so a new form starts at zero.
    const phase = Math.min(1, Math.max(0, (time - cycleStart) / holdSeconds(currentIndex)))
    common.uPhase.value = phase
    outgoing.material.uniforms.uPhase.value = outgoingNodes.material.uniforms.uPhase.value = phase
    // The shield is turned a little before the key arrives, so the extra turn is small. It eases further
    // round for the key, back part of the way as the lock opens, and holds that angle through the morph
    // out. Easing the angle (never setting it) means nothing snaps.
    const smooth = (a: number, b: number) => {
      const t = Math.min(1, Math.max(0, (phase - a) / (b - a)))
      return t * t * (3 - 2 * t)
    }
    let orbitTarget = 0
    if (currentIndex === 0) {
      orbitTarget = -0.12 - 0.18 * smooth(0.04, 0.24) + 0.16 * smooth(0.6, 0.92)
    } else if (targetIndex === 0 && transitionStart >= 0) {
      orbitTarget = -0.12
    }
    orbit +=
      (orbitTarget - orbit) * (1 - Math.exp(-(rawDelta / 1000) * (currentIndex === 0 ? 8 : 1.3)))
    object.rotation.y += orbit
    object.rotation.x -= orbit * 0.111
    render()
    if (rawDelta < 5000) {
      averageFrame += (Math.min(rawDelta, 250) - averageFrame) * 0.04
      performanceSamples++
      if (performanceSamples > 12 && now - lastQualityChange > 3500) {
        const lower = averageFrame > 22 && quality > 0
        const higher =
          averageFrame < 17.2 &&
          quality < (software ? 0 : mobile.matches ? 1 : 2) &&
          now - lastQualityChange > 8000
        if (lower || higher) {
          quality += lower ? -1 : 1
          lastQualityChange = now
          performanceSamples = 0
          resize()
        } else if (quality === 0 && averageFrame > 50) {
          pauseWhenSettled = true
        }
      }
    }
    if (pauseWhenSettled && transitionStart < 0) {
      paused = true
      root.dataset.scenePaused = "true"
      return
    }
    if (!frame) frame = requestAnimationFrame(animate)
  }
  function canRun() {
    return (
      !disposed && !contextLost && !paused && visible && !document.hidden && !preference.matches
    )
  }
  function start() {
    if (!frame && canRun()) {
      lastTime = 0
      frame = requestAnimationFrame(animate)
    }
  }
  function stop() {
    cancelAnimationFrame(frame)
    frame = 0
    lastTime = 0
  }
  function pointerMoved(event: PointerEvent) {
    if (event.pointerType === "touch") return
    pointer.tx = Math.max(-1, Math.min(1, (event.clientX / window.innerWidth) * 2 - 1))
    pointer.ty = Math.max(-1, Math.min(1, (event.clientY / window.innerHeight) * 2 - 1))
    const bounds = stage.getBoundingClientRect()
    const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
    const y = 1 - ((event.clientY - bounds.top) / bounds.height) * 2
    const inside = Math.abs(x) <= 1.1 && Math.abs(y) <= 1.1
    if (inside && !local.active) {
      local.x = x
      local.y = y
    }
    local.tx = x
    local.ty = y
    local.active = inside ? 1 : 0
  }
  function pointerLeft() {
    pointer.tx = pointer.ty = 0
    local.active = 0
  }
  function visibilityChanged() {
    stop()
    start()
  }
  function preferenceChanged() {
    stop()
    if (preference.matches) {
      correspondenceSerial++
      preparing = false
      prepared = null
      if (transitionStart >= 0) settle()
      object.rotation.set(0.1, -0.2, 0)
    } else {
      cycleStart = time
      prepareNext()
    }
    render()
    start()
  }
  function themeChanged() {
    theme.target = isLight() ? 1 : 0
    if (!frame) {
      theme.uniform.value = theme.target
      render()
    }
  }
  function lost(event: Event) {
    event.preventDefault()
    if (disposed) return
    contextLost = true
    stop()
    root.dataset.sceneReady = "false"
  }
  function restored() {
    if (disposed) return
    contextLost = false
    resize()
    root.dataset.sceneReady = "true"
    prepareNext()
    start()
  }
  const intersection = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting
      if (visible) start()
      else stop()
    },
    { threshold: 0 },
  )
  const resizer = new ResizeObserver(resize)
  intersection.observe(stage)
  resizer.observe(stage)
  preference.addEventListener("change", preferenceChanged)
  document.addEventListener("themechange", themeChanged)
  window.addEventListener("pointermove", pointerMoved, { passive: true })
  document.documentElement.addEventListener("pointerleave", pointerLeft)
  document.addEventListener("visibilitychange", visibilityChanged)
  canvas.addEventListener("webglcontextlost", lost)
  canvas.addEventListener("webglcontextrestored", restored)
  resize()
  root.dataset.sceneReady = "true"
  root.dataset.sceneObject = forms[0].name
  root.dataset.sceneState = "holding"
  prepareNext()
  start()

  return () => {
    if (disposed) return
    disposed = true
    correspondenceSerial++
    worker?.terminate()
    jobs.forEach((job) => job.resolve(new Float32Array()))
    jobs.clear()
    stop()
    intersection.disconnect()
    resizer.disconnect()
    preference.removeEventListener("change", preferenceChanged)
    document.removeEventListener("themechange", themeChanged)
    window.removeEventListener("pointermove", pointerMoved)
    document.documentElement.removeEventListener("pointerleave", pointerLeft)
    document.removeEventListener("visibilitychange", visibilityChanged)
    canvas.removeEventListener("webglcontextlost", lost)
    canvas.removeEventListener("webglcontextrestored", restored)
    canvas.replaceWith(canvas.cloneNode(false))
    geometries.forEach((geometry) => geometry.dispose())
    materials.forEach((material) => material.dispose())
    sceneTarget.dispose()
    blurA.dispose()
    blurB.dispose()
    auraA.dispose()
    auraB.dispose()
    particleTarget.dispose()
    renderer.renderLists.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    scene.clear()
    particleScene.clear()
    postScene.clear()
  }
}
