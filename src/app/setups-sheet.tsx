import { Pencil, Trash2, XIcon } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
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
import { noticeDuration, replacedDescription } from './load-notice'
import {
  deleteFromStorage,
  findByName,
  formatDay,
  formatSavedAt,
  MAX_NAME_UNITS,
  nameProblem,
  refreshSavedSetups,
  renameInStorage,
  SAVED_SETUPS_KEY,
  saveToStorage,
  storageMessage,
  uniqueName,
  useSavedSetups,
  type ReadReport,
  type SavedSetup,
  type StorageAction,
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
        // Escape in a rename field cancels the rename, and in a delete's question keeps the save;
        // either way the sheet stays open.
        onEscapeKeyDown={(event) => {
          if (event.target instanceof Element && event.target.closest('[data-rename], [data-confirm]')) event.preventDefault()
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

/** Why storage refused a change, as a notice: "Couldn’t save the setup", and why. */
function sayStorageProblem(problem: StorageProblem, title: string, action: StorageAction) {
  const hasSaves = useSavedSetups.getState().setups.length > 0
  toast.error(title, { id: 'saved-setups-storage', description: storageMessage(problem, action, hasSaves) })
}

/**
 * What reading the saves found that's worth a notice: saves that couldn't be read. Storage that
 * can't be read at all shows in the list instead, as blocked and newer storage do.
 */
function sayReadReport({ unreadable }: ReadReport) {
  if (unreadable === 0) return
  toast.error(unreadable === 1 ? 'One saved setup couldn’t be read' : `${unreadable} saved setups couldn’t be read`, {
    id: 'saved-setups-storage',
    description: unreadable === 1 ? 'It’s kept as it is, but can’t be shown.' : 'They’re kept as they are, but can’t be shown.',
  })
}

/** A row's button, which focus moves to after a rename or a delete, or into a delete's question. */
const rowButton = (id: string, action: 'rename' | 'delete' | 'keep') =>
  document.querySelector<HTMLElement>(`[data-setup-id="${CSS.escape(id)}"] [data-action="${action}"]`)

/** A row asking whether to delete its save, or renaming it. One row at a time. */
type Pending = { id: string; action: 'rename' | 'delete' } | null

function SetupsBody({ onLoaded }: { onLoaded: () => void }) {
  const meta = useSpecMeta()
  const setups = useSavedSetups((s) => s.setups)
  const problem = useSavedSetups((s) => s.problem)
  // The name field shows a fresh default ("Fury Warrior · 23 Sep") until you type in it.
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  // The saves a file's import added, marked "New" and listed first until the sheet closes.
  const [added, setAdded] = useState<ReadonlySet<string>>(() => new Set())
  const nameRef = useRef<HTMLInputElement>(null)
  const listHeadingRef = useRef<HTMLHeadingElement>(null)
  const nameId = useId()
  const errorId = useId()
  const clashId = useId()
  const listHeadingId = useId()
  const newLineId = useId()
  // A file's setups come first until the sheet closes, whatever their dates, so they're in view
  // under the list's heading, where focus goes after the import.
  const ordered = added.size === 0 ? setups : [...setups.filter((s) => added.has(s.id)), ...setups.filter((s) => !added.has(s.id))]
  const newCount = setups.filter((s) => added.has(s.id)).length
  const suggested = uniqueName(`${meta.name} ${meta.className} · ${formatDay(new Date())}`, setups)
  const name = draft ?? suggested
  // The save this name would save over, if one has it (case and extra spaces don't count, as for
  // Rename), so the field can say which before it does.
  const clash = nameProblem(name) ? undefined : findByName(setups, name)

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
      } else sayStorageProblem(result.problem, 'Couldn’t save the setup', 'save')
      return
    }
    // The field starts again on a fresh default, selected when focus is still in it (after Enter),
    // so typing replaces it rather than adding to it.
    flushSync(() => {
      setDraft(null)
      setError(null)
    })
    if (document.activeElement === nameRef.current) nameRef.current?.select()
    // One at a time: saving again replaces the last one's notice.
    toast(`${result.updated ? 'Replaced' : 'Saved'} “${result.setup.name}”`, { id: 'setup-saved' })
  }

  const load = (setup: SavedSetup) => {
    const switched = setup.config.spec !== useSetup.getState().config.spec
    useSetup.getState().replace(setup.config)
    const title = `Loaded “${setup.name}”`
    const description = replacedDescription(setup.config.spec, switched, setup.warnings)
    toast(title, { id: 'setup-loaded', description, duration: noticeDuration(title, description) })
    // Closing hands focus back to the menu's button.
    onLoaded()
  }

  /** Renames a save; returns why the name can't be used, if it can't. */
  const rename = (setup: SavedSetup, next: string): string | null => {
    const result = renameInStorage(setup.id, next)
    if (!result.ok) {
      if ('error' in result) return result.error
      sayStorageProblem(result.problem, 'Couldn’t rename the setup', 'rename')
      return null
    }
    // No visible notice: the name changes in front of you. Focus goes back to its Rename button.
    changeAndFocus(
      () => setPending(null),
      () => rowButton(setup.id, 'rename'),
    )
    announce(`Renamed to ${result.setup.name}.`)
    return null
  }

  /** Back to the row as it was, with focus on the button that started it: Rename, or Delete. */
  const cancel = (setup: SavedSetup, action: 'rename' | 'delete') =>
    changeAndFocus(
      () => setPending(null),
      () => rowButton(setup.id, action),
    )

  /** Delete asks first, in the row, with focus on Keep: a second press can't delete by accident. */
  const askDelete = (setup: SavedSetup) =>
    changeAndFocus(
      () => setPending({ id: setup.id, action: 'delete' }),
      () => rowButton(setup.id, 'keep'),
    )

  const remove = (setup: SavedSetup) => {
    // Focus moves to the next row's Delete, or the one before if this was the last, or the list's
    // heading once the list is empty, so it never falls to the page (and a phone's keyboard stays
    // down, as it wouldn't in the name field).
    const index = ordered.findIndex((s) => s.id === setup.id)
    const neighbour = ordered[index + 1] ?? ordered[index - 1]
    let result: ReturnType<typeof deleteFromStorage> | undefined
    changeAndFocus(
      () => {
        result = deleteFromStorage(setup.id)
        setPending(null)
      },
      () => (result?.ok ? (neighbour && rowButton(neighbour.id, 'delete')) || listHeadingRef.current : rowButton(setup.id, 'delete')),
    )
    if (!result?.ok) {
      if (result && 'problem' in result) sayStorageProblem(result.problem, 'Couldn’t delete the setup', 'delete')
      return
    }
    toast(`Deleted “${setup.name}”`, { id: 'setup-deleted' })
  }

  return (
    <div className="flex flex-col gap-6 px-4 pb-8">
      <form className="flex flex-col" onSubmit={save} noValidate>
        <Label htmlFor={nameId} className="mb-2">
          Save the current setup as
        </Label>
        <div className="flex gap-2">
          <Input
            ref={nameRef}
            id={nameId}
            value={name}
            maxLength={MAX_NAME_UNITS}
            autoComplete="off"
            onChange={(event) => {
              setDraft(event.target.value)
              setError(null)
            }}
            // The default is selected, so typing replaces it.
            onFocus={(event) => draft === null && event.currentTarget.select()}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : clash ? clashId : undefined}
            className="h-11 min-w-0 flex-1"
          />
          {/*
           * As wide as "Replace" whichever it says, so the field doesn't narrow as a typed name
           * comes to match a save: the hidden word sizes it, and isn't part of its name.
           */}
          <Button type="submit" className="h-11 px-4">
            <span className="grid justify-items-center">
              <span className="invisible col-start-1 row-start-1" aria-hidden>
                Replace
              </span>
              <span className="col-start-1 row-start-1">{clash ? 'Replace' : 'Save'}</span>
            </span>
          </Button>
        </div>
        {error && (
          <p id={errorId} role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {/* Which save this name saves over, said as it comes up (a live region, so it's there first). */}
        <div id={clashId} role="status">
          {clash && !error && <ClashLine setup={clash} />}
        </div>
      </form>

      <section aria-labelledby={listHeadingId} className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          {/*
           * A file's import, or deleting the last save, brings focus here, to the list (tabIndex -1:
           * not a tab stop).
           */}
          <h3
            ref={listHeadingRef}
            id={listHeadingId}
            tabIndex={-1}
            aria-describedby={newCount > 0 ? newLineId : undefined}
            className="scroll-mt-4 font-medium outline-none"
          >
            Saved setups
          </h3>
          {setups.length > 0 && <p className="text-sm text-muted-foreground">Loading one switches to its spec and replaces your setup for that spec.</p>}
          {/* Why the list isn't newest first for now; read with the heading, which focus comes to. */}
          {newCount > 0 && (
            <p id={newLineId} className="text-sm text-muted-foreground">
              {newCount === 1 ? 'The setup you just imported comes first, marked New.' : `The ${newCount} setups you just imported come first, marked New.`}
            </p>
          )}
        </div>
        {problem === 'blocked' ? (
          <EmptyState title="Saved setups aren’t available">
            Your browser is blocking storage for this site. Allow site data for it to save setups.
          </EmptyState>
        ) : problem === 'newer' ? (
          <EmptyState title="Reload to see your saved setups">A newer version of the app saved them in another tab.</EmptyState>
        ) : problem === 'corrupt' ? (
          <EmptyState title="Your saved setups couldn’t be read">
            What this browser holds for them isn’t in a form the app can read. Saving a setup, or adding setups from a file, replaces it with a
            new list.
          </EmptyState>
        ) : setups.length === 0 ? (
          <EmptyState title="No saved setups yet">
            Save the current setup to keep a copy you can load again later. Each save keeps its spec, so loading one switches to it.
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y">
            {ordered.map((setup) => (
              <SetupRow
                key={setup.id}
                setup={setup}
                mode={pending?.id === setup.id ? pending.action : null}
                isNew={added.has(setup.id)}
                onLoad={() => load(setup)}
                onRename={() => setPending({ id: setup.id, action: 'rename' })}
                onRenamed={(next) => rename(setup, next)}
                onCancelRename={() => cancel(setup, 'rename')}
                onDelete={() => askDelete(setup)}
                onConfirmDelete={() => remove(setup)}
                onKeep={() => cancel(setup, 'delete')}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Then, set apart under a rule each: Export and Import. A code's import closes the sheet as Load does. */}
      <ExportSection />
      <ImportSection
        onImported={onLoaded}
        onFileImported={(ids) =>
          // Rendered first, so the heading takes focus with its line about the new rows.
          changeAndFocus(
            () => setAdded((before) => new Set([...before, ...ids])),
            () => listHeadingRef.current,
          )
        }
        sayStorageProblem={(problem) => sayStorageProblem(problem, 'Couldn’t import the setups', 'import')}
      />
    </div>
  )
}

/** Which save a name saves over: "Saves over “Raid night” · Arms Warrior · 22 Sep, 20:15". */
function ClashLine({ setup }: { setup: SavedSetup }) {
  const meta = SPEC_META[setup.config.spec]
  return (
    <p className="mt-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
      Saves over “{setup.name}” ·{' '}
      <span className={cn('font-medium', CLASS_TEXT[meta.classId])}>
        {meta.name} {meta.className}
      </span>{' '}
      · <time dateTime={setup.savedAt}>{formatSavedAt(setup.savedAt)}</time>
    </p>
  )
}

/** A held Enter repeats: it mustn't delete the next row too, which takes focus after a delete. */
const ignoreRepeat = (event: KeyboardEvent) => {
  if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault()
}

function SetupRow({
  setup,
  mode,
  isNew,
  onLoad,
  onRename,
  onRenamed,
  onCancelRename,
  onDelete,
  onConfirmDelete,
  onKeep,
}: {
  setup: SavedSetup
  /** Renaming the save, asking whether to delete it, or neither. */
  mode: 'rename' | 'delete' | null
  /** A file's import just added it. */
  isNew: boolean
  onLoad: () => void
  onRename: () => void
  onRenamed: (name: string) => string | null
  onCancelRename: () => void
  onDelete: () => void
  onConfirmDelete: () => void
  onKeep: () => void
}) {
  const meta = SPEC_META[setup.config.spec]
  const questionId = useId()
  const details = (
    <p className="text-xs text-muted-foreground">
      {isNew && (
        <Badge variant="secondary" className="mr-1.5">
          New
        </Badge>
      )}
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
      {/* On a phone, level with the name, or with the rename field (44 px, so 8 px down). */}
      <WowIcon icon={meta.icon} size="sm" className={cn('max-sm:self-start', mode === 'rename' && 'max-sm:mt-2')} />
      {mode === 'rename' ? (
        <RenameForm setup={setup} onRenamed={onRenamed} onCancel={onCancelRename}>
          {details}
        </RenameForm>
      ) : mode === 'delete' ? (
        <>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p id={questionId} className="line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]">
              Delete “{setup.name}”?
            </p>
            {details}
          </div>
          {/*
           * Delete, then Keep: Keep takes focus, and sits where the row's Delete was on wider
           * screens, so a second press or a double click keeps the save. Escape keeps it too.
           */}
          <div
            role="group"
            aria-labelledby={questionId}
            data-confirm
            className="col-start-2 flex items-center gap-1 sm:col-start-3"
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              event.preventDefault()
              onKeep()
            }}
          >
            <Button variant="destructive" className="h-11 px-3" data-action="confirm-delete" onKeyDown={ignoreRepeat} onClick={onConfirmDelete}>
              <Trash2 /> Delete
            </Button>
            <Button variant="outline" className="h-11 px-3" data-action="keep" onKeyDown={ignoreRepeat} onClick={onKeep}>
              Keep
            </Button>
          </div>
        </>
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

/**
 * Renames a save in its row. Enter renames it, Escape or Cancel leaves it as it was. Below 640 px
 * the field takes the row's width, with Rename and Cancel under it.
 */
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
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          // Focus goes straight in, with the name selected so typing replaces it.
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          value={value}
          maxLength={MAX_NAME_UNITS}
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
          className="h-11 w-full min-w-0 sm:flex-1"
        />
        <div className="flex gap-2">
          <Button type="submit" className="h-11">
            Rename
          </Button>
          <Button type="button" variant="ghost" className="h-11 px-2" onClick={onCancel}>
            Cancel
          </Button>
        </div>
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
