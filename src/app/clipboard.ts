// Copying to the clipboard (docs/ux.md#persistence-and-sharing): Share's link and Export's setup code.

/**
 * Copies text that's still being made (a setup being compressed). The write starts inside the tap
 * itself, with the text as a promise, because Safari refuses a write that follows an await.
 * Browsers without ClipboardItem write the text once it's ready. Rejects if the browser refuses.
 */
export async function copyText(text: Promise<string>) {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const blob = text.then((value) => new Blob([value], { type: 'text/plain' }))
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })])
  } else {
    await navigator.clipboard.writeText(await text)
  }
}
