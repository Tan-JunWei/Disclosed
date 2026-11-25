import { formatDate, getDate } from "./Date"
import { QuartzComponentConstructor, QuartzComponentProps } from "./types"
import readingTime from "reading-time"
import { classNames } from "../util/lang"
import { i18n } from "../i18n"
import { JSX } from "preact"
import style from "./styles/contentMeta.scss"

interface ContentMetaOptions {
  /**
   * Whether to display reading time
   */
  showReadingTime: boolean
  showComma: boolean
}

const defaultOptions: ContentMetaOptions = {
  showReadingTime: true,
  showComma: true,
}

export default ((opts?: Partial<ContentMetaOptions>) => {
  const options: ContentMetaOptions = { ...defaultOptions, ...opts }

  function ContentMetadata({ cfg, fileData, displayClass }: QuartzComponentProps) {
    const text = fileData.text

    if (text) {
      const segments: JSX.Element[] = []

      if (fileData.dates) {
        const formattedDate = (
          <div key="date">Last updated on {formatDate(getDate(cfg, fileData)!, cfg.locale)}</div>
        )
        segments.push(formattedDate)
      }

      if (options.showReadingTime) {
        const { minutes, words: _words } = readingTime(text)

        const wordAndTime = (
          <div key="wordAndTime">
            <span>{_words} words, </span>
            <span>
              {i18n(cfg.locale).components.contentMeta.readingTime({
                minutes: Math.ceil(minutes),
              })}
            </span>
          </div>
        )

        segments.push(wordAndTime)
      }

      return <div className={classNames(displayClass, "content-meta")}>{segments}</div>
    } else {
      return null
    }
  }

  ContentMetadata.css = style

  return ContentMetadata
}) satisfies QuartzComponentConstructor
