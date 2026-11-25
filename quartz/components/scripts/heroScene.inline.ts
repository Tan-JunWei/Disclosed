function setupHeroScene() {
  const root = document.querySelector<HTMLElement>(".lab-hero")
  const canvas = root?.querySelector<HTMLCanvasElement>(".lab-canvas")
  if (!root || !canvas?.dataset.moduleSrc) return
  let cancelled = false
  let loaded = false
  let dispose: (() => void) | undefined

  async function load() {
    if (loaded || cancelled) return
    loaded = true
    observer.disconnect()
    try {
      const url = new URL(canvas!.dataset.moduleSrc!, window.location.href)
      const scene = await import(/* @vite-ignore */ url.href)
      if (cancelled || !root!.isConnected) return
      dispose = scene.mountHero(root!)
    } catch (error) {
      if (!cancelled) {
        root!.dataset.sceneReady = "false"
        console.warn("Interactive scene unavailable. Showing the static wireframe.", error)
      }
    }
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void load()
    },
    { rootMargin: "160px" },
  )
  observer.observe(root)
  // The wireframe stays hidden while the scene loads and shows only if the scene fails. This timer
  // covers a load that hangs, and a late mount still takes over and hides it again.
  const stalled = window.setTimeout(() => {
    if (!root.dataset.sceneReady) root.dataset.sceneReady = "false"
  }, 8000)
  window.addCleanup(() => {
    cancelled = true
    window.clearTimeout(stalled)
    observer.disconnect()
    dispose?.()
  })
}

document.addEventListener("nav", setupHeroScene)
