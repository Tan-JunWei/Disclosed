function setupHeroCursor() {
  const hero = document.querySelector<HTMLElement>(".lab-hero")
  if (!hero) return
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)")
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)")
  if (!finePointer.matches || reduceMotion.matches) return

  const cursor = document.createElement("div")
  cursor.className = "lab-cursor"
  cursor.setAttribute("aria-hidden", "true")
  const ring = document.createElement("span")
  ring.className = "lab-cursor-ring"
  const dot = document.createElement("span")
  dot.className = "lab-cursor-dot"
  cursor.append(ring, dot)
  hero.append(cursor)
  hero.classList.add("has-cursor")

  let targetX = 0,
    targetY = 0,
    ringX = 0,
    ringY = 0,
    frame = 0,
    last = 0

  function render(now: number) {
    frame = 0
    const ease = 1 - Math.exp(-((last ? now - last : 16.7) / 1000) * 14)
    last = now
    ringX += (targetX - ringX) * ease
    ringY += (targetY - ringY) * ease
    ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`
    dot.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`
    hero!.style.setProperty("--cx", `${ringX}px`)
    hero!.style.setProperty("--cy", `${ringY}px`)
    if (Math.abs(targetX - ringX) > 0.1 || Math.abs(targetY - ringY) > 0.1) {
      frame = requestAnimationFrame(render)
    } else {
      last = 0
    }
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(render)
  }

  function onMove(event: PointerEvent) {
    if (event.pointerType !== "mouse") return
    const rect = hero!.getBoundingClientRect()
    targetX = event.clientX - rect.left
    targetY = event.clientY - rect.top
    if (!hero!.classList.contains("cursor-active")) {
      ringX = targetX
      ringY = targetY
      hero!.classList.add("cursor-active")
    }
    const interactive = (event.target as Element | null)?.closest("a, button")
    hero!.classList.toggle("cursor-link", Boolean(interactive))
    schedule()
  }
  const onLeave = () => hero.classList.remove("cursor-active", "cursor-link", "cursor-down")
  const onDown = () => hero.classList.add("cursor-down")
  const onUp = () => hero.classList.remove("cursor-down")

  hero.addEventListener("pointermove", onMove)
  hero.addEventListener("pointerleave", onLeave)
  hero.addEventListener("pointerdown", onDown)
  window.addEventListener("pointerup", onUp)
  window.addCleanup(() => {
    cancelAnimationFrame(frame)
    hero.removeEventListener("pointermove", onMove)
    hero.removeEventListener("pointerleave", onLeave)
    hero.removeEventListener("pointerdown", onDown)
    window.removeEventListener("pointerup", onUp)
    hero.classList.remove("has-cursor", "cursor-active", "cursor-link", "cursor-down")
    cursor.remove()
  })
}

document.addEventListener("nav", setupHeroCursor)
