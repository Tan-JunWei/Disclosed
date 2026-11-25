const colorSchemeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
let savedTheme: string | null = null
try {
  savedTheme = localStorage.getItem("theme")
} catch {}
let hasThemePreference = savedTheme === "light" || savedTheme === "dark"
document.documentElement.setAttribute(
  "saved-theme",
  hasThemePreference ? savedTheme! : colorSchemeMediaQuery.matches ? "dark" : "light",
)

document.addEventListener("nav", () => {
  const toggle = document.querySelector<HTMLButtonElement>("#darkmode-toggle")
  if (!toggle) return

  function syncToggle() {
    const dark = document.documentElement.getAttribute("saved-theme") === "dark"
    toggle!.setAttribute("aria-checked", String(dark))
    toggle!.title = (dark ? toggle!.dataset.lightLabel : toggle!.dataset.darkLabel) ?? ""
  }

  function setTheme(theme: "light" | "dark", persist: boolean) {
    document.documentElement.setAttribute("saved-theme", theme)
    if (persist) {
      hasThemePreference = true
      try {
        localStorage.setItem("theme", theme)
      } catch {}
    }
    syncToggle()
    document.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }))
  }

  function switchTheme() {
    setTheme(
      document.documentElement.getAttribute("saved-theme") === "dark" ? "light" : "dark",
      true,
    )
  }
  function systemThemeChange(event: MediaQueryListEvent) {
    if (!hasThemePreference) setTheme(event.matches ? "dark" : "light", false)
  }
  function storedThemeChange(event: StorageEvent) {
    if (event.key !== "theme") return
    hasThemePreference = event.newValue === "dark" || event.newValue === "light"
    setTheme(
      hasThemePreference
        ? (event.newValue as "light" | "dark")
        : colorSchemeMediaQuery.matches
          ? "dark"
          : "light",
      false,
    )
  }

  syncToggle()
  toggle.addEventListener("click", switchTheme)
  colorSchemeMediaQuery.addEventListener("change", systemThemeChange)
  window.addEventListener("storage", storedThemeChange)
  window.addCleanup(() => {
    toggle.removeEventListener("click", switchTheme)
    colorSchemeMediaQuery.removeEventListener("change", systemThemeChange)
    window.removeEventListener("storage", storedThemeChange)
  })
})
