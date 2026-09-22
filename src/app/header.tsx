import { ChevronDown, Info, Link2, MoreHorizontal, Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { WowIcon } from '@/components/wow-icon'
import { CLASS_COLOR, SPEC_META, type ClassId } from '@/sim'
import { AboutSheet } from './about-sheet'
import { useSetup } from './setup-store'
import { shareUrl } from './share'
import { useSpecMeta, visibleSpecs } from './specs'

export function Header() {
  const [aboutOpen, setAboutOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        <span className="mr-1 hidden font-semibold tracking-tight sm:inline">Forever Sim</span>
        <SpecSwitcher />
        <div className="ml-auto flex items-center gap-1">
          <ShareButton />
          <MoreMenu onAbout={() => setAboutOpen(true)} />
        </div>
      </div>
      <AboutSheet open={aboutOpen} onOpenChange={setAboutOpen} />
    </header>
  )
}

function SpecSwitcher() {
  const meta = useSpecMeta()
  const setSpec = useSetup((s) => s.setSpec)
  const byClass = new Map<ClassId, ReturnType<typeof visibleSpecs>>()
  for (const spec of visibleSpecs()) byClass.set(spec.classId, [...(byClass.get(spec.classId) ?? []), spec])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-11 gap-2 px-2" aria-label={`Spec: ${meta.name} ${meta.className}. Change spec`}>
          <WowIcon icon={meta.icon} size="sm" />
          <span className="flex flex-col items-start leading-tight">
            <span className="text-sm font-semibold">{meta.name}</span>
            <span className="text-xs font-medium" style={{ color: CLASS_COLOR[meta.classId] }}>
              {meta.className}
            </span>
          </span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {[...byClass.entries()].map(([classId, classSpecs], index) => (
          <DropdownMenuGroup key={classId}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel style={{ color: CLASS_COLOR[classId] }}>{SPEC_META[classSpecs[0].id].className}</DropdownMenuLabel>
            {classSpecs.map((spec) => (
              <DropdownMenuItem key={spec.id} onSelect={() => setSpec(spec.id)} className="min-h-10 gap-3">
                <WowIcon icon={spec.icon} size="xs" />
                <span className="flex-1">{spec.name}</span>
                <span className="text-xs text-muted-foreground">{spec.role === 'tank' ? 'Tank' : 'DPS'}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ShareButton() {
  const config = useSetup((s) => s.config)
  const share = async () => {
    try {
      const url = await shareUrl(config)
      await navigator.clipboard.writeText(url)
      toast.success('Link copied', { description: 'Anyone with the link gets this exact setup.' })
    } catch {
      toast.error("Couldn't copy the link", { description: 'Your browser blocked clipboard access.' })
    }
  }
  return (
    <Button variant="ghost" className="h-11 gap-2 px-3" onClick={share}>
      <Link2 />
      <span className="hidden sm:inline">Share</span>
      <span className="sr-only sm:hidden">Share setup</span>
    </Button>
  )
}

function MoreMenu({ onAbout }: { onAbout: () => void }) {
  const reset = useSetup((s) => s.reset)
  const replace = useSetup((s) => s.replace)
  const meta = useSpecMeta()
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11" aria-label="More">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={onAbout} className="min-h-10">
          <Info /> About &amp; data
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="min-h-10">
            <Sun className="dark:hidden" />
            <Moon className="hidden dark:block" /> Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="system" className="min-h-10">
                <Monitor /> System
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="light" className="min-h-10">
                <Sun /> Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark" className="min-h-10">
                <Moon /> Dark
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-10"
          onSelect={() => {
            const previous = useSetup.getState().config
            reset()
            toast(`${meta.name} ${meta.className} reset to defaults`, {
              action: { label: 'Undo', onClick: () => replace(previous) },
            })
          }}
        >
          <RotateCcw /> Reset {meta.name} to defaults
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
