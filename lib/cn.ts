/** Minimal className joiner — filters falsy values. No dependency on clsx/tailwind-merge. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
