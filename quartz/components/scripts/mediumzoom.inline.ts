document.addEventListener("nav", () => {
  const listeners = new AbortController()
  const { signal } = listeners
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
  let closeZoom: (() => void) | undefined
  let removeZoom: (() => void) | undefined

  document.addEventListener(
    "click",
    (event) => {
      if (closeZoom || event.defaultPrevented || !(event.target instanceof HTMLImageElement)) return
      const source = event.target
      if (!source.closest("article") || !source.naturalWidth) return
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return

      document.body.classList.add("zoom-active")
      const { left, top, width, height } = source.getBoundingClientRect()
      if (!width || !height) {
        document.body.classList.remove("zoom-active")
        return
      }

      const overlay = document.createElement("div")
      overlay.className = "zoom-overlay"
      overlay.setAttribute("aria-hidden", "true")

      const backdrop = document.createElement("div")
      backdrop.className = "zoom-backdrop"
      const image = new Image()
      image.className = "zoomed-img"
      image.src = source.currentSrc || source.src
      image.alt = ""
      Object.assign(image.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
      })

      overlay.append(backdrop, image)
      document.body.append(overlay)
      source.classList.add("zoom-source")

      const x = (window.innerWidth - width) / 2 - left
      const y = (window.innerHeight - height) / 2 - top
      const scale = Math.min((window.innerWidth * 0.8) / width, (window.innerHeight * 0.8) / height)
      const timing: KeyframeAnimationOptions = {
        duration: reducedMotion.matches ? 0 : 380,
        easing: "cubic-bezier(0.33, 0, 0.2, 1)",
        fill: "both",
      }
      const animations = [
        backdrop.animate([{ opacity: 0 }, { opacity: 1 }], timing),
        image.animate(
          [
            { transform: "translate(0, 0) scale(1)" },
            { transform: `translate(${x}px, ${y}px) scale(${scale})` },
          ],
          timing,
        ),
      ]

      const remove = () => {
        animations.forEach((animation) => animation.cancel())
        overlay.remove()
        source.classList.remove("zoom-source")
        document.body.classList.remove("zoom-active")
        closeZoom = undefined
        removeZoom = undefined
      }

      let closing = false
      const close = () => {
        if (closing) return
        closing = true
        if (reducedMotion.matches) {
          remove()
          return
        }
        animations.forEach((animation) => animation.reverse())
        void Promise.all(animations.map((animation) => animation.finished)).then(remove, () => {})
      }

      closeZoom = close
      removeZoom = remove
      overlay.addEventListener("click", close)
    },
    { signal },
  )

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") closeZoom?.()
    },
    { signal },
  )
  window.addEventListener("scroll", () => closeZoom?.(), { signal, passive: true })
  window.addEventListener("resize", () => removeZoom?.(), { signal })
  window.addCleanup(() => {
    listeners.abort()
    removeZoom?.()
  })
})
