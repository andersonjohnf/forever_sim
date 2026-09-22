import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface DatasetMeta {
  source: string
  scrapedAt: string
  foreverBuild: string
}

// Every scraped dataset carries a `meta` envelope (see docs/data/README.md). Importing only
// that key keeps this inventory from pulling the full datasets into the bundle.
const datasets = import.meta.glob<DatasetMeta>('./data/*/*.json', { import: 'meta', eager: true })

const CLASSES = [
  { name: 'Warrior', specs: [['Arms', 'DPS'], ['Fury', 'DPS'], ['Protection', 'TPS']] },
  { name: 'Druid', specs: [['Feral Cat', 'DPS'], ['Feral Bear', 'TPS']] },
  { name: 'Paladin', specs: [['Retribution', 'DPS'], ['Protection', 'TPS']] },
] as const

export default function App() {
  const rows = Object.entries(datasets).sort(([a], [b]) => a.localeCompare(b))

  return (
    <main className="mx-auto flex min-h-svh max-w-5xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Forever Sim</h1>
          <Badge variant="secondary">M0 · foundation</Badge>
        </div>
        <p className="text-muted-foreground">
          DPS / TPS simulator for Warriors, Druids and Paladins in WoW Forever. A stopgap for
          beta testing until wowsims supports Forever.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        {CLASSES.map((cls) => (
          <Card key={cls.name}>
            <CardHeader>
              <CardTitle>{cls.name}</CardTitle>
              <CardDescription>Planned specs</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {cls.specs.map(([spec, output]) => (
                <div key={spec} className="flex items-center justify-between text-sm">
                  <span>{spec}</span>
                  <Badge variant={output === 'TPS' ? 'outline' : 'default'}>{output}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Data snapshot</CardTitle>
          <CardDescription>Scraped once from foreverchanges.pro and bundled with the app.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No datasets yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dataset</TableHead>
                  <TableHead>Forever build</TableHead>
                  <TableHead>Scraped</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(([path, meta]) => (
                  <TableRow key={path}>
                    <TableCell className="font-mono text-xs">{path.replace('./data/', '')}</TableCell>
                    <TableCell>{meta.foreverBuild}</TableCell>
                    <TableCell>{meta.scrapedAt.slice(0, 10)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
