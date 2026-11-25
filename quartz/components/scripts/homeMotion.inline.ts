function setupHomeMotion() {
  const home = document.querySelector<HTMLElement>(".home-page")
  if (!home) return

  const preference = window.matchMedia("(prefers-reduced-motion: reduce)")
  if (preference.matches || !("IntersectionObserver" in window)) return

  const animations = new Set<Animation>()
  const counters = new Map<HTMLElement, string>()
  const frames = new Set<number>()

  function countUp(card: HTMLElement) {
    const number = card.querySelector<HTMLElement>(".hd-kpi-num")
    if (!number) return
    const original = number.textContent ?? ""
    const total = Number(original)
    if (!Number.isFinite(total) || total <= 0) return

    counters.set(number, original)
    // Preserve the full statistic for assistive technology while the visual value changes.
    number.setAttribute("aria-label", original)
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - start) / 750, 1)
      number.textContent = String(Math.round(total * (1 - Math.pow(1 - progress, 3))))
      if (progress < 1) schedule(tick)
      else number.textContent = original
    }
    schedule(tick)
  }

  function schedule(callback: FrameRequestCallback) {
    const id = requestAnimationFrame((now) => {
      frames.delete(id)
      callback(now)
    })
    frames.add(id)
  }

  const targets = home.querySelectorAll<HTMLElement>(
    ".hd-kpi, .hd-panel, .lab-archive-heading, .lab-route",
  )
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting)
      visible.forEach((entry, index) => {
        const target = entry.target as HTMLElement
        observer.unobserve(target)
        // Keep chart coordinates stable for scrubbing and tooltips.
        const chart = target.classList.contains("hd-panel")
        const animation = target.animate(
          chart
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [
                { opacity: 0, transform: "translateY(8px)" },
                { opacity: 1, transform: "none" },
              ],
          {
            duration: 520,
            delay: Math.min(index, 3) * 65,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            fill: "backwards",
          },
        )
        animations.add(animation)
        animation.finished.then(
          () => animations.delete(animation),
          () => animations.delete(animation),
        )
        countUp(target)
      })
    },
    { threshold: 0.08 },
  )
  targets.forEach((target) => observer.observe(target))

  function finishMotion() {
    observer.disconnect()
    animations.forEach((animation) => animation.cancel())
    animations.clear()
    frames.forEach((id) => cancelAnimationFrame(id))
    frames.clear()
    counters.forEach((text, element) => {
      element.textContent = text
      element.removeAttribute("aria-label")
    })
    counters.clear()
  }

  function onPreferenceChange() {
    if (preference.matches) finishMotion()
  }

  function onFocus() {
    // Keyboard navigation should never land on a fading or moving element.
    finishMotion()
  }

  preference.addEventListener("change", onPreferenceChange)
  home.addEventListener("focusin", onFocus)
  window.addCleanup(() => {
    finishMotion()
    preference.removeEventListener("change", onPreferenceChange)
    home.removeEventListener("focusin", onFocus)
  })
}

document.addEventListener("nav", setupHomeMotion)
