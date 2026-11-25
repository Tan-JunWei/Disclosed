// Hovering a prop on the footer rule plays its trick. The animations live in footer.scss
// (`.prop.is-active`), and this only toggles the class for `data-ms`. A trick always plays through,
// so moving away does not cut it short, and hovering again while it plays does nothing. A tap on a
// touch screen also fires pointerenter, so phones still get the tricks.
function setupFooterScene() {
  const scene = document.querySelector<HTMLElement>(".footer-scene")
  if (!scene) return

  const timers = new Set<number>()

  for (const prop of scene.querySelectorAll<HTMLElement>(".prop")) {
    const onEnter = () => {
      if (prop.classList.contains("is-active")) return
      prop.classList.add("is-active")
      const id = window.setTimeout(
        () => {
          timers.delete(id)
          prop.classList.remove("is-active")
        },
        Number(prop.dataset.ms) || 1500,
      )
      timers.add(id)
    }
    prop.addEventListener("pointerenter", onEnter)
    window.addCleanup(() => prop.removeEventListener("pointerenter", onEnter))
  }
  window.addCleanup(() => timers.forEach((id) => window.clearTimeout(id)))
}

document.addEventListener("nav", setupFooterScene)
