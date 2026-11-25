document.addEventListener("nav", () => {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (connection?.saveData || !("IntersectionObserver" in window)) return

  const images = document.querySelectorAll<HTMLImageElement>("main img[loading='lazy']")
  if (!images.length) return

  // Start nearby screenshots ahead of the browser's usual threshold on fast connections.
  const observer = new IntersectionObserver(
    (entries) => {
      for (const { isIntersecting, target } of entries) {
        if (!isIntersecting) continue
        target.setAttribute("loading", "eager")
        observer.unobserve(target)
      }
    },
    { rootMargin: "2400px 0px" },
  )
  images.forEach((image) => observer.observe(image))
  window.addCleanup(() => observer.disconnect())
})
