/** Composición de clases (5 líneas, sin dependencias externas — plan §2.4). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
