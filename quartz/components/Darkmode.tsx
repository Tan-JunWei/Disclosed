// @ts-ignore
import darkmodeScript from "./scripts/darkmode.inline"
import styles from "./styles/darkmode.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { i18n } from "../i18n"
import { classNames } from "../util/lang"

const Darkmode: QuartzComponent = ({ displayClass, cfg }: QuartzComponentProps) => {
  const labels = i18n(cfg.locale).components.themeToggle
  return (
    <div class={classNames(displayClass, "darkmode")}>
      <button
        type="button"
        id="darkmode-toggle"
        class="theme-switch"
        role="switch"
        aria-checked="false"
        aria-label={labels.darkMode}
        data-light-label={labels.lightMode}
        data-dark-label={labels.darkMode}
        title={labels.darkMode}
      >
        <span class="theme-track" aria-hidden="true">
          <span class="theme-ribbons" />
          <span class="theme-switch-thumb">
            <svg class="theme-sun" viewBox="0 0 28 28" fill="currentColor">
              <circle cx="14" cy="14" r="9" fill="#ffd16b" stroke="#ffedaa" stroke-width="1" />
              <path
                d="M14 1v2m0 22v2M1 14h2m22 0h2M4.8 4.8l1.4 1.4m15.6 15.6 1.4 1.4m-18.4 0 1.4-1.4M21.8 6.2l1.4-1.4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
            </svg>
            <svg class="theme-moon" viewBox="0 0 28 28" fill="currentColor">
              <path d="M24 17A10.5 10.5 0 0 1 11 4a10.5 10.5 0 1 0 13 13Z" />
            </svg>
          </span>
        </span>
      </button>
    </div>
  )
}

Darkmode.beforeDOMLoaded = darkmodeScript
Darkmode.css = styles

export default (() => Darkmode) satisfies QuartzComponentConstructor
