const svgCopy =
  '<svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" data-view-component="true"><path fill-rule="evenodd" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"></path><path fill-rule="evenodd" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"></path></svg>'
const svgCheck =
  '<svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" data-view-component="true"><path fill-rule="evenodd" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"></path></svg>'
const svgFailed =
  '<svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" data-view-component="true"><path fill-rule="evenodd" d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"></path></svg>'

type State = "idle" | "copied" | "failed"

const STATES: Record<State, { icon: string; label: string; announce: string }> = {
  idle: { icon: svgCopy, label: "Copy source", announce: "" },
  copied: { icon: svgCheck, label: "Copied", announce: "Copied to clipboard" },
  failed: { icon: svgFailed, label: "Copy failed", announce: "Copy failed" },
}

// How long the confirmation stays before the button goes back to a copy icon
const FEEDBACK_MS = 2000

/**
 * navigator.clipboard only exists on secure pages (https or localhost), so a page opened over plain
 * http, for example through a tunnel or by IP address, would otherwise fail without a word.
 */
function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    return navigator.clipboard.writeText(text)
  }
  return new Promise((resolve, reject) => {
    const area = document.createElement("textarea")
    area.value = text
    area.setAttribute("readonly", "")
    area.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0"
    document.body.appendChild(area)
    area.select()
    try {
      document.execCommand("copy") ? resolve() : reject(new Error("copy command was refused"))
    } catch (error) {
      reject(error)
    } finally {
      area.remove()
    }
  })
}

document.addEventListener("nav", () => {
  const els = document.getElementsByTagName("pre")
  for (let i = 0; i < els.length; i++) {
    const codeBlock = els[i].getElementsByTagName("code")[0]
    if (!codeBlock) continue

    const button = document.createElement("button")
    button.className = "clipboard-button"
    button.type = "button"
    const icon = document.createElement("span")
    icon.className = "clipboard-icon"
    // a polite live region, so screen reader users hear the result as well
    const status = document.createElement("span")
    status.className = "clipboard-status"
    status.setAttribute("role", "status")
    button.append(icon, status)

    let timer: number | undefined
    const show = (state: State) => {
      const view = STATES[state]
      button.dataset.state = state
      icon.innerHTML = view.icon
      button.setAttribute("aria-label", view.label)
      status.textContent = view.announce
    }
    show("idle")

    function onClick() {
      // read at click time, so it always matches what is on the page
      const source = codeBlock.innerText.replace(/\n\n/g, "\n")
      copyText(source).then(
        () => finish("copied"),
        (error) => {
          console.error(error)
          finish("failed")
        },
      )
    }
    function finish(state: State) {
      window.clearTimeout(timer)
      show(state)
      timer = window.setTimeout(() => show("idle"), FEEDBACK_MS)
    }

    button.addEventListener("click", onClick)
    window.addCleanup(() => {
      window.clearTimeout(timer)
      button.removeEventListener("click", onClick)
    })
    els[i].prepend(button)
  }
})
