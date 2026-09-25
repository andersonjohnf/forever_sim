import { Check, CircleAlert, ClipboardCopy, ClipboardPaste, Minus, Plus, RotateCcw } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { announce } from '@/app/announce'
import { noticeDuration } from '@/app/load-notice'
import { useSheetFocus } from '@/app/sheet-focus'
import { useSetup } from '@/app/setup-store'
import { useSpecMeta, visibleSpecs } from '@/app/specs'
import { SelectContent } from '@/components/select-content'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { WowIcon } from '@/components/wow-icon'
import {
  decodeTalentCode,
  encodeTalentCode,
  pointsPerTree,
  type Talent,
  type TalentData,
  type TalentRanksById,
  type TalentTree,
} from '@/data/talents/types'
import { changeAndFocus } from '@/features/refocus'
import { SectionHeader } from '@/features/section'
import { useIsDesktop, useMediaQuery } from '@/hooks/use-media-query'
import { CHOICE_HINT, CHOICE_ITEM } from '@/lib/choice'
import { cn } from '@/lib/utils'
import { defaultTalents, TALENT_DATA, talentPresets } from '@/sim'
import { canAdd, canRemove, lockReason, presetSpec, readBuildCode, removeReason, totalPoints, withRank } from './logic'

export function TalentsSection() {
  const meta = useSpecMeta()
  const code = useSetup((s) => s.config.talents)
  const update = useSetup((s) => s.update)
  const data = TALENT_DATA[meta.classId]
  const ranks = useMemo(() => safeDecode(data, code), [data, code])
  const perTree = pointsPerTree(data, ranks)
  const spent = totalPoints(ranks)
  const isDefault = code === defaultTalents(meta.id)
  // Only the builds of specs the app offers (docs/ux.md principle 8): no paladin or druid builds
  // until those specs ship, and the menu grows as specs do.
  // "(default)" marks only this spec's default build; another spec's reads plainly ("Arms
  // default"), so the menu has one default (TU10).
  const presets = useMemo(() => {
    const offered = visibleSpecs().filter((s) => s.classId === meta.classId)
    return talentPresets(meta.classId).flatMap((p) => {
      const spec = presetSpec(p.name, offered)
      if (!spec) return []
      const label = spec.id === meta.id ? p.name : p.name.replace(/ \(default\)$/, ' default')
      return [{ ...p, label }]
    })
  }, [meta.classId, meta.id])
  const isDesktop = useIsDesktop()
  const finePointer = useMediaQuery('(hover: hover) and (pointer: fine)')
  const [treeIndex, setTreeIndex] = useState(() => perTree.indexOf(Math.max(...perTree)))
  const [importOpen, setImportOpen] = useState(false)
  const presetsRef = useRef<HTMLButtonElement>(null)
  const { returnRef: pasteRef, contentProps: importFocusProps } = useSheetFocus<HTMLButtonElement>()

  // No visible notice for a preset, a pasted build or Clear: the trees change in front of you.
  // Screen readers hear them, with the points in each tree (src/app/announce.ts).
  const setRanks = (next: TalentRanksById) => update((c) => ({ ...c, talents: encodeTalentCode(data, next) }))
  const setCode = (talents: string) => update((c) => ({ ...c, talents }))
  const split = (talents: string) =>
    pointsPerTree(data, safeDecode(data, talents))
      .map((points, i) => `${points} ${data.trees[i].name}`)
      .join(', ')
  const clear = () => {
    // Clear disables itself, so focus moves to the preset menu first, which now reads "Custom
    // build" (docs/ux.md#accessibility: focus never falls to the page).
    presetsRef.current?.focus()
    setRanks({})
    announce('Cleared all talent points.')
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Talents"
        description={
          <span className="tabular-nums">
            {perTree.join(' / ')} · {data.rules.maxPoints - spent} of {data.rules.maxPoints} points left
          </span>
        }
      />

      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <Select
          value={presets.find((p) => p.code === code)?.code ?? ''}
          onValueChange={(presetCode) => {
            const preset = presets.find((p) => p.code === presetCode)
            if (!preset) return
            setCode(preset.code)
            announce(`Talents set to ${preset.label}: ${split(preset.code)}.`)
          }}
        >
          {/* The trigger's size attribute sets its height, so the 44 px target overrides that (docs/ux.md "Accessibility"). */}
          <SelectTrigger ref={presetsRef} className="col-span-3 w-full data-[size=default]:h-11 sm:w-auto sm:min-w-48" aria-label="Talent build presets">
            <SelectValue placeholder="Custom build" />
          </SelectTrigger>
          <SelectContent>
            {presets.map((p) => (
              <SelectItem key={p.code} value={p.code} className="min-h-11">
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          className="h-11"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code)
              toast.success('Build code copied', { id: 'build-code', description: code })
            } catch {
              toast.error("Couldn't copy the build code", { id: 'build-code' })
            }
          }}
        >
          <ClipboardCopy /> Copy<span className="hidden sm:inline"> code</span>
        </Button>
        <Button ref={pasteRef} variant="outline" className="h-11" onClick={() => setImportOpen(true)}>
          <ClipboardPaste /> Paste<span className="hidden sm:inline"> code</span>
        </Button>
        <Button variant="ghost" className="h-11" disabled={spent === 0} onClick={clear}>
          <RotateCcw /> Clear
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {/* As Gear's line says it wears the default set (docs/ux.md "Talents"). */}
        {isDefault && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check aria-hidden className="size-4 shrink-0" />
            Using the default build.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {finePointer
            ? 'Click a talent to add a point, right-click to remove one. On a focused talent, Enter adds a point and Backspace removes one.'
            : 'Tap a talent to see what it does and add or remove points.'}
        </p>
      </div>

      {isDesktop ? (
        <div className="grid grid-cols-3 gap-4">
          {data.trees.map((tree, i) => (
            <TreeGrid key={tree.id} data={data} tree={tree} points={perTree[i]} ranks={ranks} setRanks={setRanks} finePointer={finePointer} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ToggleGroup
            type="single"
            variant="outline"
            value={String(treeIndex)}
            onValueChange={(v) => v && setTreeIndex(Number(v))}
            aria-label="Talent tree"
            className="w-full"
          >
            {data.trees.map((tree, i) => (
              // Widths follow the names, and the padding is tight, so "Feral Combat 37" fits beside
              // Balance and Restoration down to 360 px; a name still truncates on a narrower screen.
              <ToggleGroupItem key={tree.id} value={String(i)} className={cn('h-11 min-w-0 flex-auto shrink gap-1 px-1.5', CHOICE_ITEM)}>
                <span className="truncate">{tree.name}</span>
                <span className={cn('tabular-nums', CHOICE_HINT)}>{perTree[i]}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <TreeGrid
            data={data}
            tree={data.trees[treeIndex]}
            points={perTree[treeIndex]}
            ranks={ranks}
            setRanks={setRanks}
            finePointer={finePointer}
          />
        </div>
      )}

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        data={data}
        example={presets[0]?.code ?? code}
        onImport={(pasted, older) => {
          setCode(pasted)
          announce(`Pasted a talent build: ${split(pasted)}.`)
          // A code from the game's older talent trees isn't what the trees show at a glance, so it's
          // said (docs/ux.md "Talents"): read on those trees, and what it lost on today's.
          if (older) toast(older.title, { id: 'talent-paste', description: older.description, duration: noticeDuration(older.title, older.description) })
        }}
        contentProps={importFocusProps}
      />
    </div>
  )
}

function safeDecode(data: TalentData, code: string): TalentRanksById {
  try {
    return decodeTalentCode(data, code)
  } catch {
    return {}
  }
}

function TreeGrid({
  data,
  tree,
  points,
  ranks,
  setRanks,
  finePointer,
}: {
  data: TalentData
  tree: TalentTree
  points: number
  ranks: TalentRanksById
  setRanks: (ranks: TalentRanksById) => void
  finePointer: boolean
}) {
  const talents = tree.talents.filter((t) => t.inForeverTree)
  const rows = Math.max(...talents.map((t) => t.tier)) + 1
  return (
    <section aria-label={`${tree.name} tree`} className="flex flex-col gap-3 rounded-xl border p-3">
      <header className="flex items-center gap-2">
        <WowIcon icon={tree.icon} size="xs" />
        <h3 className="text-sm font-medium">{tree.name}</h3>
        <span className="ml-auto text-sm tabular-nums text-muted-foreground">{points}</span>
      </header>
      <div className="grid grid-cols-4 gap-x-2 gap-y-3" style={{ gridTemplateRows: `repeat(${rows}, auto)` }}>
        {talents.map((talent) => (
          <div key={talent.id} className="flex justify-center" style={{ gridRow: talent.tier + 1, gridColumn: talent.col + 1 }}>
            <TalentCell data={data} talent={talent} ranks={ranks} setRanks={setRanks} finePointer={finePointer} />
          </div>
        ))}
      </div>
    </section>
  )
}

function TalentCell({
  data,
  talent,
  ranks,
  setRanks,
  finePointer,
}: {
  data: TalentData
  talent: Talent
  ranks: TalentRanksById
  setRanks: (ranks: TalentRanksById) => void
  finePointer: boolean
}) {
  const rank = ranks[talent.id] ?? 0
  const addable = canAdd(data, ranks, talent)
  const removable = canRemove(data, ranks, talent)
  const locked = rank === 0 && !addable
  const removeId = useId()
  const minusRef = useRef<HTMLButtonElement>(null)
  const plusRef = useRef<HTMLButtonElement>(null)
  const add = () => addable && setRanks(withRank(ranks, talent.id, rank + 1))
  const remove = () => removable && setRanks(withRank(ranks, talent.id, rank - 1))
  // A click, right-click or key that can't change the rank says why, rather than doing nothing
  // (docs/ux.md "Talents"). One toast at a time: a new refusal replaces the last.
  const refuse = (reason: string | null) => reason && toast(reason, { id: 'talent-refused' })
  const tryAdd = () => (addable ? add() : refuse(lockReason(data, ranks, talent)))
  const tryRemove = () => (removable ? remove() : refuse(removeReason(data, ranks, talent)))
  // In the popover, a button that disables itself hands focus to the other one, so focus never
  // falls to the page (docs/ux.md#accessibility). The other one may only just have been enabled
  // (− after a first point, + after a point frees the 51st), so focus moves once the change renders.
  const popoverAdd = () => changeAndFocus(add, () => (plusRef.current?.disabled ? minusRef.current : null))
  const popoverRemove = () => changeAndFocus(remove, () => (minusRef.current?.disabled ? plusRef.current : null))
  const label = `${talent.name}, ${rank} of ${talent.maxRank}`

  const cell = (
    <button
      type="button"
      aria-label={label}
      aria-keyshortcuts="Backspace"
      onClick={finePointer ? tryAdd : undefined}
      onContextMenu={(e) => {
        e.preventDefault()
        tryRemove()
      }}
      // Keyboard removal (docs/ux.md "Talents"): Backspace, or Delete and − as aliases.
      onKeyDown={(e) => {
        if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '-') {
          e.preventDefault()
          tryRemove()
        }
      }}
      className={cn(
        'relative rounded-lg border-2 p-0.5 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        rank === talent.maxRank
          ? 'border-amber-500'
          : rank > 0
            ? 'border-emerald-500'
            : addable
              ? 'border-border hover:border-foreground/40'
              : 'border-transparent',
      )}
    >
      <WowIcon icon={talent.icon} size="lg" grayscale={locked} className="border-0" />
      {/* A locked talent's badge is dimmed by colour alone (the muted text colour, AA), never by
          opacity (docs/ux.md "Visual language"); its icon turns gray and its border goes. */}
      <span
        className={cn(
          'absolute -right-1.5 -bottom-1.5 rounded-md border bg-background px-1 text-[0.7rem] leading-4 font-semibold tabular-nums',
          rank === talent.maxRank ? 'text-notice' : rank > 0 ? 'text-positive' : 'text-muted-foreground',
        )}
      >
        {rank}/{talent.maxRank}
      </span>
    </button>
  )

  if (finePointer) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{cell}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-72">
          <div className="flex flex-col gap-2">
            <TalentDetails data={data} talent={talent} ranks={ranks} inverted />
            <p className="border-t border-current/20 pt-2 text-xs opacity-80">
              Click or Enter adds a point. Right-click or Backspace removes one.
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    )
  }
  return (
    <Popover>
      <PopoverTrigger asChild>{cell}</PopoverTrigger>
      <PopoverContent className="w-72" aria-label={talent.name}>
        <TalentDetails data={data} talent={talent} ranks={ranks} removeId={removeId} />
        <div className="mt-3 flex gap-2">
          <Button
            ref={minusRef}
            variant="outline"
            className="h-11 flex-1"
            disabled={!removable}
            onClick={popoverRemove}
            aria-label="Remove a point"
            aria-describedby={removeReason(data, ranks, talent) ? removeId : undefined}
          >
            <Minus />
          </Button>
          <Button ref={plusRef} className="h-11 flex-1" disabled={!addable} onClick={popoverAdd} aria-label="Add a point">
            <Plus />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * A talent's name, rank and texts, and why a point can't be added or removed. `inverted` is for the
 * tooltip's inverted colours, where the notice colour would fall below AA, so a reason there is
 * marked by weight and icon instead.
 */
function TalentDetails({
  data,
  talent,
  ranks,
  removeId,
  inverted = false,
}: {
  data: TalentData
  talent: Talent
  ranks: TalentRanksById
  /** The id of the remove reason, which describes the popover's "−". */
  removeId?: string
  inverted?: boolean
}) {
  const rank = ranks[talent.id] ?? 0
  const current = rank > 0 ? talent.ranks.forever[rank - 1] : null
  const next = rank < talent.maxRank ? talent.ranks.forever[rank] : null
  const reasons = [
    { id: undefined, text: lockReason(data, ranks, talent) },
    { id: removeId, text: removeReason(data, ranks, talent) },
  ].filter((r) => r.text)
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{talent.name}</span>
        <span className="tabular-nums opacity-80">
          Rank {rank}/{talent.maxRank}
        </span>
      </div>
      {/* Rank texts keep the client's paragraph breaks as "\n" (docs/data/talents.md). */}
      {current && <p className="whitespace-pre-line">{current}</p>}
      {next && (
        <p className={cn('whitespace-pre-line', current && 'opacity-80')}>
          {current ? 'Next rank: ' : ''}
          {next}
        </p>
      )}
      {reasons.map((r) => (
        <p key={r.text} id={r.id} className={cn('flex items-start gap-1.5 font-medium', !inverted && 'text-notice')}>
          <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {r.text}
        </p>
      ))}
    </div>
  )
}

function ImportDialog({
  open,
  onOpenChange,
  data,
  example,
  onImport,
  contentProps,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: TalentData
  /** A code for this class, shown as the example. */
  example: string
  /** `older`: what to say when it was a code from the game's older talent trees (readBuildCode). */
  onImport: (code: string, older?: { title: string; description: string }) => void
  /**
   * From `useSheetFocus`: the dialog opens from state, not from a Dialog.Trigger, so this hands
   * focus back to the Paste button when it closes, however it closes (docs/ux.md#accessibility).
   * Focus goes in to the code field.
   */
  contentProps: ReturnType<typeof useSheetFocus>['contentProps']
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const apply = () => {
    const result = readBuildCode(data, text, example)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onImport(result.code, result.older)
    setText('')
    setError(null)
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* No stock 28 px close button: Cancel (44 px) and Escape close it. */}
      <DialogContent showCloseButton={false} {...contentProps}>
        <DialogHeader>
          <DialogTitle>Paste a build code</DialogTitle>
          <DialogDescription>
            A talent code like <span className="font-mono break-all">{example}</span>, or a talent calculator link that ends in one.
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label="Build code or link"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          aria-invalid={!!error}
          aria-describedby={error ? 'import-error' : undefined}
          className="h-11 font-mono"
          autoFocus
        />
        {error && (
          <p id="import-error" role="alert" className="text-sm break-words text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11" onClick={apply} disabled={!text.trim()}>
            Use this build
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
