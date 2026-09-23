import { Pencil, Trash2, XIcon } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { WowIcon } from '@/components/wow-icon'
import { EmptyState } from '@/features/empty-state'
import { changeAndFocus } from '@/features/refocus'
import { cn } from '@/lib/utils'
import { SPEC_META } from '@/sim'
import { announce } from './announce'
import { loadedDescription } from './load-notice'
import {
  deleteFromStorage,
  formatDay,
  formatSavedAt,
  MAX_NAME_LENGTH,
  refreshSavedSetups,
  renameInStorage,
  SAVED_SETUPS_KEY,
  saveToStorage,
  uniqueName,
  useSavedSetups,
  type ReadReport,
  type SavedSetup,
  type StorageProblem,
} from './saved-setups'
import { useSetup } from './setup-store'
import { ExportSection, ImportSection } from './setups-transfer'
import type { useSheetFocus } from './sheet-focus'
import { CLASS_TEXT, useSpecMeta } from './specs'

type SheetFocus = ReturnType<typeof useSheetFocus>

/**
 * Setups (docs/ux.md#setups, decision D21): save the current setup under a name, and load, rename
 * or delete a saved one; then export and import (src/app/setups-transfer.tsx). Opened from the
 * header's overflow menu; titleRef and contentProps come from the header's useSheetFocus, which
 * hands focus back to the menu's button when it closes.
 */
export function SetupsSheet({
  open,
  onOpenChange,
  titleRef,
  contentProps,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  titleRef: SheetFocus['titleRef']
  contentProps: SheetFocus['contentProps']
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/*
       * Full width on a phone, so a row's name has room (the stock side sheet is three quarters
       * wide, and its data-side classes outrank a plain w-full). Focus in it scrolls clear of the
       * toasts, which sit over the sheet (src/index.css).
       */}
      <SheetContent
        className="scroll-pb-toast overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        showCloseButton={false}
        {...contentProps}
        // Escape in a rename field cancels the rename and leaves the sheet open.
        onEscapeKeyDown={(event) => {
          if (event.target instanceof Element && event.target.closest('[data-rename]')) event.preventDefault()
        }}
      >
        <SheetHeader className="pr-14">
          <SheetTitle ref={titleRef} tabIndex={-1} className="outline-none">
            Setups
          </SheetTitle>
          <SheetDescription>Named copies of your setups, for any spec, kept in this browser.</SheetDescription>
        </SheetHeader>
        <SheetClose asChild>
          <Button variant="ghost" size="icon" className="absolute top-2 right-2 size-11">
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        </SheetClose>
        {/* Mounted afresh each time the sheet opens, which reads the saves again. */}
        <SetupsBody onLoaded={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  )
}

const STORAGE_PROBLEMS: Record<StorageProblem, string> = {
  blocked: 'Your browser is blocking storage for this site. Allow site data for it, then try again.',
  full: 'Your browser’s storage for this site is full. Delete a saved setup you don’t need, then try again.',
  newer: 'A newer version of the app saved your setups in another tab. Reload this page, then try again.',
  corrupt: 'Your saved setups couldn’t be read. Try again.',
}

/** Why storage refused a change, as a notice: "Couldn’t save the setup", and why. */
function sayStorageProblem(problem: StorageProblem, title: string) {
  toast.error(title, { id: 'saved-setups-storage', description: STORAGE_PROBLEMS[problem] })
}

/** What reading the saves found that's worth a notice: a problem the sheet doesn't show itself. */
function sayReadReport({ skipped, problem }: ReadReport) {
  if (problem === 'corrupt') {
    toast.error('Your saved setups couldn’t be read', { id: 'saved-setups-storage', description: 'Saving a setup starts a new list.' })
  } else if (skipped > 0) {
    toast.error(skipped === 1 ? 'One saved setup couldn’t be read' : `${skipped} saved setups couldn’t be read`, {
      id: 'saved-setups-storage',
      description: skipped === 1 ? 'It’s been left out.' : 'They’ve been left out.',
    })
  }
}

/** A row's button, which focus moves to after a rename or a delete. */
const rowButton = (id: string, action: 'rename' | 'delete') =>
  document.querySelector<HTMLElement>(`[data-setup-id="${CSS.escape(id)}"] [data-action="${action}"]`)

function SetupsBody({ onLoaded }: { onLoaded: () => void }) {
  const meta = useSpecMeta()
  const setups = useSavedSetups((s) => s.setups)
  const problem = useSavedSetups((s) => s.problem)
  // The name field shows a fresh default ("Fury Warrior · 23 Sep") until you type in it.
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const listHeadingRef = useRef<HTMLHeadingElement>(null)
  const nameId = useId()
  const errorId = useId()
  const listHeadingId = useId()
  const suggested = uniqueName(`${meta.name} ${meta.className} · ${formatDay(new Date())}`, setups)
  const name = draft ?? suggested

  // Before the first paint, so the list never flashes empty.
  useLayoutEffect(() => {
    sayReadReport(refreshSavedSetups())
    // Another tab saving, renaming or deleting shows here too.
    const onStorage = (event: StorageEvent) => {
      if (event.key === SAVED_SETUPS_KEY || event.key === null) refreshSavedSetups()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const save = (event: FormEvent) => {
    event.preventDefault()
    const result = saveToStorage(name, useSetup.getState().config)
    if (!result.ok) {
      if ('error' in result) {
        setError(result.error)
        nameRef.current?.focus()
      } else sayStorageProblem(result.problem, 'Couldn’t save the setup')
      return
    }
    setDraft(null)
    setError(null)
    // One at a time: saving again replaces the last one's notice.
    toast(`${result.updated ? 'Updated' : 'Saved'} “${result.setup.name}”`, { id: 'setup-saved' })
  }

  const load = (setup: SavedSetup) => {
    const switched = setup.config.spec !== useSetup.getState().config.spec
    useSetup.getState().replace(setup.config)
    toast(`Loaded “${setup.name}”`, { id: 'setup-loaded', description: loadedDescription(switched ? setup.config.spec : null, setup.warnings) })
    // Closing hands focus back to the menu's button.
    onLoaded()
  }

  /** Renames a save; returns why the name can't be used, if it can't. */
  const rename = (setup: SavedSetup, next: string): string | null => {
    const result = renameInStorage(setup.id, next)
    if (!result.ok) {
      if ('error' in result) return result.error
      sayStorageProblem(result.problem, 'Couldn’t rename the setup')
      return null
    }
    // No visible notice: the name changes in front of you. Focus goes back to its Rename button.
    changeAndFocus(
      () => setRenaming(null),
      () => rowButton(setup.id, 'rename'),
    )
    announce(`Renamed to ${result.setup.name}.`)
    return null
  }

  const cancelRename = (setup: SavedSetup) =>
    changeAndFocus(
      () => setRenaming(null),
      () => rowButton(setup.id, 'rename'),
    )

  const remove = (setup: SavedSetup) => {
    // Focus moves to the next row's Delete, or the one before if this was the last, or the name
    // field once the list is empty, so it never falls to the page.
    const index = setups.findIndex((s) => s.id === setup.id)
    const neighbour = setups[index + 1] ?? setups[index - 1]
    let result: ReturnType<typeof deleteFromStorage> | undefined
    changeAndFocus(
      () => {
        result = deleteFromStorage(setup.id)
      },
      () => (neighbour && rowButton(neighbour.id, 'delete')) || nameRef.current,
    )
    if (!result?.ok) {
      if (result && 'problem' in result) sayStorageProblem(result.problem, 'Couldn’t delete the setup')
      return
    }
    toast(`Deleted “${setup.name}”`, { id: 'setup-deleted' })
  }

  return (
    <div className="flex flex-col gap-6 px-4 pb-8">
      <form className="flex flex-col gap-2" onSubmit={save} noValidate>
        <Label htmlFor={nameId}>Save the current setup as</Label>
        <div className="flex gap-2">
          <Input
            ref={nameRef}
            id={nameId}
            value={name}
            maxLength={MAX_NAME_LENGTH}
            autoComplete="off"
            onChange={(event) => {
              setDraft(event.target.value)
              setError(null)
            }}
            // The default is selected, so typing replaces it.
            onFocus={(event) => draft === null && event.currentTarget.select()}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            className="h-11 min-w-0 flex-1"
          />
          <Button type="submit" className="h-11 px-4">
            Save
          </Button>
        </div>
        {error && (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>

      <section aria-labelledby={listHeadingId} className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          {/* A file's import brings focus here, to the list it added to (tabIndex -1: not a tab stop). */}
          <h3 ref={listHeadingRef} id={listHeadingId} tabIndex={-1} className="scroll-mt-4 font-medium outline-none">
            Saved setups
          </h3>
          {setups.length > 0 && <p className="text-sm text-muted-foreground">Loading one replaces your current setup for its spec.</p>}
        </div>
        {problem === 'blocked' ? (
          <EmptyState title="Saved setups aren’t available">
            Your browser is blocking storage for this site. Allow site data for it to save setups.
          </EmptyState>
        ) : problem === 'newer' ? (
          <EmptyState title="Reload to see your saved setups">A newer version of the app saved them in another tab.</EmptyState>
        ) : setups.length === 0 ? (
          <EmptyState title="No saved setups yet">
            Save the current setup to keep a copy you can load again later. Each save keeps its spec, so loading one switches to it.
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y">
            {setups.map((setup) => (
              <SetupRow
                key={setup.id}
                setup={setup}
                renaming={renaming === setup.id}
                onLoad={() => load(setup)}
                onRename={() => setRenaming(setup.id)}
                onRenamed={(next) => rename(setup, next)}
                onCancelRename={() => cancelRename(setup)}
                onDelete={() => remove(setup)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Then, set apart under a rule each: Export and Import. A code's import closes the sheet as Load does. */}
      <ExportSection />
      <ImportSection
        onImported={onLoaded}
        onFileImported={() => listHeadingRef.current?.focus()}
        sayStorageProblem={sayStorageProblem}
      />
    </div>
  )
}

/** A held Enter repeats: it mustn't delete the next row too, which takes focus after a delete. */
const ignoreRepeat = (event: KeyboardEvent) => {
  if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault()
}

function SetupRow({
  setup,
  renaming,
  onLoad,
  onRename,
  onRenamed,
  onCancelRename,
  onDelete,
}: {
  setup: SavedSetup
  renaming: boolean
  onLoad: () => void
  onRename: () => void
  onRenamed: (name: string) => string | null
  onCancelRename: () => void
  onDelete: () => void
}) {
  const meta = SPEC_META[setup.config.spec]
  const details = (
    <p className="text-xs text-muted-foreground">
      <span className={cn('font-medium', CLASS_TEXT[meta.classId])}>
        {meta.name} {meta.className}
      </span>{' '}
      · <time dateTime={setup.savedAt}>{formatSavedAt(setup.savedAt)}</time>
    </p>
  )
  // On a phone the actions sit under the name, with their words; on wider screens they sit on the
  // right, and Rename and Delete are icons. Each name starts with its visible text (WCAG 2.5.3).
  return (
    <li
      data-setup-id={setup.id}
      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
    >
      <WowIcon icon={meta.icon} size="sm" className={cn(!renaming && 'max-sm:self-start')} />
      {renaming ? (
        <RenameForm setup={setup} onRenamed={onRenamed} onCancel={onCancelRename}>
          {details}
        </RenameForm>
      ) : (
        <>
          <div className="flex min-w-0 flex-col gap-0.5">
            {/* A long name wraps to two lines, then ends in an ellipsis. */}
            <p className="line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]">{setup.name}</p>
            {details}
          </div>
          <div className="col-start-2 flex items-center gap-1 sm:col-start-3">
            <Button variant="outline" className="h-11" aria-label={`Load ${setup.name}`} data-action="load" onClick={onLoad}>
              Load
            </Button>
            <Button variant="ghost" className="h-11 px-3 sm:w-11 sm:px-0" aria-label={`Rename ${setup.name}`} data-action="rename" onClick={onRename}>
              <Pencil />
              <span className="sm:hidden">Rename</span>
            </Button>
            <Button
              variant="ghost"
              className="h-11 px-3 sm:w-11 sm:px-0"
              aria-label={`Delete ${setup.name}`}
              data-action="delete"
              onKeyDown={ignoreRepeat}
              onClick={onDelete}
            >
              <Trash2 />
              <span className="sm:hidden">Delete</span>
            </Button>
          </div>
        </>
      )}
    </li>
  )
}

/** Renames a save in its row. Enter renames it, Escape or Cancel leaves it as it was. */
function RenameForm({
  setup,
  onRenamed,
  onCancel,
  children,
}: {
  setup: SavedSetup
  onRenamed: (name: string) => string | null
  onCancel: () => void
  children: ReactNode
}) {
  const [value, setValue] = useState(setup.name)
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()
  return (
    <form
      data-rename
      className="flex min-w-0 flex-col gap-1 sm:col-span-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        setError(onRenamed(value))
      }}
    >
      <div className="flex gap-2">
        <Input
          // Focus goes straight in, with the name selected so typing replaces it.
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          value={value}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="off"
          aria-label={`New name for ${setup.name}`}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setValue(event.target.value)
            setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            onCancel()
          }}
          className="h-11 min-w-0 flex-1"
        />
        <Button type="submit" className="h-11">
          Rename
        </Button>
        <Button type="button" variant="ghost" className="h-11 px-2" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        children
      )}
    </form>
  )
}
