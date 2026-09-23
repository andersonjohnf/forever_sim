import { Copy, Download, FolderOpen } from 'lucide-react'
import { type ChangeEvent, type FormEvent, type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { copyText } from './clipboard'
import { loadedDescription } from './load-notice'
import { importToStorage, isShown, readStoredSetups, type StorageProblem } from './saved-setups'
import { readSetupCode } from './setup-code'
import { useSetup } from './setup-store'
import {
  buildSetupsFile,
  importNotice,
  MAX_SETUPS_FILE_BYTES,
  parseSetupsFile,
  serializeSetupsFile,
  setupsFileName,
  type SetupsFileProblem,
} from './setups-file'
import { packSetup } from './share'

// Export and Import, in the Setups sheet under the saved list (docs/ux.md#setups, decision D21).

/** A section of the sheet after the list: a rule above it sets it apart from saving and loading. */
function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 border-t pt-6">
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="font-medium">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}

/** Saves text as a file, through a link with `download`: the page never leaves. */
function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  // Some browsers start the download after the click returns, so the URL stays valid a while.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`)

/** Copy setup code (the current setup) and Download all setups (a file of them all). */
export function ExportSection() {
  const copyCode = () => {
    // One notice at a time: copying again replaces the last one's.
    copyText(packSetup(useSetup.getState().config)).then(
      () => toast.success('Setup code copied', { id: 'setup-code', description: 'Import it in any browser to get this exact setup.' }),
      () =>
        toast.error('Couldn’t copy the setup code', {
          id: 'setup-code',
          description: 'Your browser blocked the clipboard. Allow clipboard access for this site, then try again.',
        }),
    )
  }

  const download = () => {
    const now = new Date()
    // Every save, shown or not, as stored (entries that couldn't be read too); the current setup as it is now.
    const { setups, unreadable, problem } = readStoredSetups()
    const name = setupsFileName(now)
    downloadText(name, serializeSetupsFile(buildSetupsFile(useSetup.getState().config, setups, now, unreadable)), 'application/json')
    // Said, since the browser may show nothing of it, and to say what it holds.
    const saves = setups.length + unreadable.length
    const holds = problem
      ? 'the current setup only: your saved setups couldn’t be read.'
      : saves === 0
        ? 'the current setup.'
        : `the current setup and ${count(saves, 'saved setup', 'saved setups')}.`
    toast.success('Setups downloaded', { id: 'setups-exported', description: `${name} holds ${holds}` })
  }

  return (
    <Section title="Export" description="Copy a code for the current setup, or download a file with every saved setup and the current one.">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="h-11" onClick={copyCode}>
          <Copy /> Copy setup code
        </Button>
        <Button variant="outline" className="h-11" onClick={download}>
          <Download /> Download all setups
        </Button>
      </div>
    </Section>
  )
}

/**
 * Why a code or a file can't be used, under its control, which it describes. It's scrolled into
 * view: at the foot of the sheet it can land below what's showing.
 */
function Reason({ id, children }: { id: string; children: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => {
    // In braces: newer browsers' scrollIntoView returns a promise, which React would take for a cleanup.
    ref.current?.scrollIntoView({ block: 'nearest' })
  }, [children])
  return (
    // Scrolled in with the sheet's bottom padding under it, so it doesn't sit on the window's edge.
    <p ref={ref} id={id} role="alert" className="scroll-mb-8 text-sm break-words text-destructive">
      {children}
    </p>
  )
}

const FILE_PROBLEMS: Record<SetupsFileProblem | 'unreadable' | 'noneRead', string> = {
  notOurs: 'That isn’t a Forever Sim setups file. Choose one that Download all setups saved.',
  newer: 'That file is from a newer version of Forever Sim. Reload this page to update it, then try again.',
  damaged: 'That setups file is damaged, so nothing was imported.',
  tooLarge: 'That file is too large to be a setups file.',
  empty: 'That file has no setups in it.',
  unreadable: 'That file couldn’t be read. Try again.',
  noneRead: 'None of the setups in that file could be read, so nothing was imported.',
}

/**
 * Import: a code or a share link, which becomes the current setup (then the sheet closes), or a
 * setups file, whose setups join the saved list (and the sheet stays open on it). Nothing prompts.
 */
export function ImportSection({
  onImported,
  onFileImported,
  sayStorageProblem,
}: {
  /** A code's setup is now the current one: the sheet closes, which hands focus back to the menu. */
  onImported: () => void
  /**
   * A file's setups are in the list: focus goes up to it, so the list is in view. It grew, which
   * would push Open a file… out of sight, focus and all.
   */
  onFileImported: () => void
  sayStorageProblem: (problem: StorageProblem, title: string) => void
}) {
  const [text, setText] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // A second Enter while a code is being read doesn't import it twice.
  const reading = useRef(false)
  const codeId = useId()
  const codeErrorId = useId()
  const fileErrorId = useId()

  const importCode = async (event: FormEvent) => {
    event.preventDefault()
    if (reading.current) return
    reading.current = true
    const result = await readSetupCode(text).finally(() => (reading.current = false))
    if (!result.ok) {
      setCodeError(result.error)
      codeRef.current?.focus()
      return
    }
    const switched = result.config.spec !== useSetup.getState().config.spec
    useSetup.getState().replace(result.config)
    toast('Imported a setup', { id: 'setup-imported', description: loadedDescription(switched ? result.config.spec : null, result.warnings) })
    onImported()
  }

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    // Cleared, so choosing the same file again imports it again.
    input.value = ''
    if (!file) return
    setFileError(null)
    if (file.size > MAX_SETUPS_FILE_BYTES) return setFileError(FILE_PROBLEMS.tooLarge)
    let content: string
    try {
      content = await file.text()
    } catch {
      return setFileError(FILE_PROBLEMS.unreadable)
    }
    let skipped: number
    let result: ReturnType<typeof importToStorage>
    try {
      const parsed = parseSetupsFile(content)
      if (!parsed.ok) return setFileError(FILE_PROBLEMS[parsed.problem])
      skipped = parsed.skipped
      result = importToStorage(parsed.setups, parsed.current)
    } catch {
      // Anything else that goes wrong reading it means the file isn't as the app wrote it.
      return setFileError(FILE_PROBLEMS.damaged)
    }
    if (!result.ok) {
      if ('problem' in result) sayStorageProblem(result.problem, 'Couldn’t import the setups')
      return
    }
    const shown = result.added.filter(isShown).length
    const notice = importNotice({ shown, hidden: result.added.length - shown, duplicates: result.duplicates, skipped })
    if (!notice) return setFileError(FILE_PROBLEMS.noneRead)
    // The sheet stays open, on the list that shows them.
    toast(notice.title, { id: 'setups-imported', description: notice.description })
    onFileImported()
  }

  return (
    <Section
      title="Import"
      description="A code or a share link replaces your current setup for its spec. A file from Download all setups adds its setups to your saved ones."
    >
      <form className="flex flex-col gap-2" onSubmit={importCode} noValidate>
        <Label htmlFor={codeId}>Setup code or share link</Label>
        <div className="flex gap-2">
          <Input
            ref={codeRef}
            id={codeId}
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setCodeError(null)
            }}
            // A code is typed exactly: no capitals, corrections or suggestions from a phone's keyboard.
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={!!codeError}
            aria-describedby={codeError ? codeErrorId : undefined}
            className="h-11 min-w-0 flex-1 font-mono"
          />
          <Button type="submit" className="h-11 px-4">
            Import
          </Button>
        </div>
        {codeError && <Reason id={codeErrorId}>{codeError}</Reason>}
      </form>
      <div className="flex flex-col items-start gap-2">
        <Button variant="outline" className="h-11" onClick={() => fileRef.current?.click()} aria-describedby={fileError ? fileErrorId : undefined}>
          <FolderOpen /> Open a file…
        </Button>
        {/* The button opens it; it takes no focus of its own. */}
        <input ref={fileRef} type="file" accept=".json,application/json" hidden aria-label="Setups file" onChange={importFile} />
        {fileError && <Reason id={fileErrorId}>{fileError}</Reason>}
      </div>
    </Section>
  )
}
