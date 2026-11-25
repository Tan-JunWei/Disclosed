export function capitalize(s: string): string {
  return s.substring(0, 1).toUpperCase() + s.substring(1)
}

export function classNames(
  displayClass?: "mobile-only" | "desktop-only",
  ...classes: string[]
): string {
  if (displayClass) {
    classes.push(displayClass)
  }
  return classes.join(" ")
}

/** Wraps a component script in its own function scope, so concatenated scripts cannot collide or
 * break one another mid-statement. */
export function wrapScript(script?: string): string {
  return script ? `;(function(){${script}})();` : ""
}
