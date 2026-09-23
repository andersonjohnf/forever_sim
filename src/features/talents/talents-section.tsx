import { ClipboardCopy, ClipboardPaste, Minus, Plus, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useSetup } from '@/app/setup-store'
import { useSpecMeta } from '@/app/specs'
import { undoToast } from '@/app/undo-toast'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { SectionHeader } from '@/features/section'
import { useIsDesktop, useMediaQuery } from '@/hooks/use-media-query'
import { CHOICE_HINT, CHOICE_ITEM } from '@/lib/choice'
import { cn } from '@/lib/utils'
import { TALENT_DATA, talentPresets } from '@/sim'
import { canAdd, canRemove, lockReason, readBuildCode, totalPoints, withRank } from './logic'

export function TalentsSection() {
  const meta = useSpecMeta()
  const code = useSetup((s) => s.config.talents)
  const update = useSetup((s) => s.update)
  const replace = useSetup((s) => s.replace)
  const data = TALENT_DATA[meta.classId]
  const ranks = useMemo(() => safeDecode(data, code), [data, code])
  const perTree = pointsPerTree(data, ranks)
  const spent = totalPoints(ranks)
  const presets = talentPresets(meta.classId)
  const isDesktop = useIsDesktop()
  const finePointer = useMediaQuery('(hover: hover) and (pointer: fine)')
  const [treeIndex, setTreeIndex] = useState(() => perTree.indexOf(Math.max(...perTree)))
  const [importOpen, setImportOpen] = useState(false)

  const setRanks = (next: TalentRanksById) => update((c) => ({ ...c, talents: encodeTalentCode(data, next) }))
  const withUndo = (message: string, change: () => void) => {
    const previous = useSetup.getState().config
    change()
    undoToast(message, () => replace(previous))
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
            if (preset) withUndo(`${preset.name} build loaded`, () => update((c) => ({ ...c, talents: preset.code })))
          }}
        >
          {/* The trigger's size attribute sets its height, so the 44 px target overrides that (docs/ux.md "Accessibility"). */}
          <SelectTrigger className="col-span-3 w-full data-[size=default]:h-11 sm:w-auto sm:min-w-48" aria-label="Talent build presets">
            <SelectValue placeholder="Custom build" />
          </SelectTrigger>
          <SelectContent>
            {presets.map((p) => (
              <SelectItem key={p.code} value={p.code} className="min-h-11">
                {p.name}
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
              toast.success('Build code copied', { description: code })
            } catch {
              toast.error("Couldn't copy the build code")
            }
          }}
        >
          <ClipboardCopy /> Copy<span className="hidden sm:inline"> code</span>
        </Button>
        <Button variant="outline" className="h-11" onClick={() => setImportOpen(true)}>
          <ClipboardPaste /> Paste<span className="hidden sm:inline"> code</span>
        </Button>
        <Button
          variant="ghost"
          className="h-11"
          disabled={spent === 0}
          onClick={() => withUndo('All talent points removed', () => setRanks({}))}
        >
          <RotateCcw /> Clear
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {finePointer
          ? 'Click a talent to add a point, right-click to remove one. On a focused talent, Enter adds a point and Backspace removes one.'
          : 'Tap a talent to see what it does and add or remove points.'}
      </p>

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
            className="w-full"
          >
            {data.trees.map((tree, i) => (
              <ToggleGroupItem key={tree.id} value={String(i)} className={cn('h-11 flex-1 gap-1.5 px-2', CHOICE_ITEM)}>
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
        onImport={(next) => withUndo('Build imported', () => update((c) => ({ ...c, talents: next })))}
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
  const add = () => addable && setRanks(withRank(ranks, talent.id, rank + 1))
  const remove = () => removable && setRanks(withRank(ranks, talent.id, rank - 1))
  const label = `${talent.name}, ${rank} of ${talent.maxRank}`

  const cell = (
    <button
      type="button"
      aria-label={label}
      aria-keyshortcuts="Backspace"
      onClick={finePointer ? add : undefined}
      onContextMenu={(e) => {
        e.preventDefault()
        remove()
      }}
      // Keyboard removal (docs/ux.md "Talents"): Backspace, or Delete and − as aliases.
      onKeyDown={(e) => {
        if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '-') {
          e.preventDefault()
          remove()
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
      <span
        className={cn(
          'absolute -right-1.5 -bottom-1.5 rounded-md border bg-background px-1 text-[0.7rem] leading-4 font-semibold tabular-nums',
          rank === talent.maxRank ? 'text-notice' : rank > 0 ? 'text-positive' : 'text-muted-foreground',
          locked && 'opacity-60',
        )}
      >
        {rank}/{talent.maxRank}
      </span>
    </button>
  )

  const details = <TalentDetails data={data} talent={talent} ranks={ranks} />

  if (finePointer) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{cell}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-72">
          <div className="flex flex-col gap-2">
            {details}
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
      <PopoverContent className="w-72">
        {details}
        <div className="mt-3 flex gap-2">
          <Button variant="outline" className="h-11 flex-1" disabled={!removable} onClick={remove} aria-label="Remove a point">
            <Minus />
          </Button>
          <Button className="h-11 flex-1" disabled={!addable} onClick={add} aria-label="Add a point">
            <Plus />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TalentDetails({ data, talent, ranks }: { data: TalentData; talent: Talent; ranks: TalentRanksById }) {
  const rank = ranks[talent.id] ?? 0
  const current = rank > 0 ? talent.ranks.forever[rank - 1] : null
  const next = rank < talent.maxRank ? talent.ranks.forever[rank] : null
  const reason = lockReason(data, ranks, talent)
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
      {reason && <p className="font-medium text-notice">{reason}</p>}
    </div>
  )
}

function ImportDialog({
  open,
  onOpenChange,
  data,
  example,
  onImport,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: TalentData
  /** A code for this class, shown as the example. */
  example: string
  onImport: (code: string) => void
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const apply = () => {
    const result = readBuildCode(data, text, example)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onImport(result.code)
    setText('')
    setError(null)
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* No stock 28 px close button: Cancel (44 px) and Escape close it. */}
      <DialogContent showCloseButton={false}>
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
