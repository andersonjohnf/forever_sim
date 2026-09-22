// The event queue (docs/architecture.md#engine-design-m1, decision D15).
//
// A binary min-heap over preallocated typed arrays: no allocation per event. Events are ordered
// by integer-millisecond time, then by insertion sequence, folded into one float key
// (time × 2^22 + seq), so ties are deterministic. Cancelled events aren't removed: each carries
// the generation of the timer it belongs to, and the engine skips events whose generation is
// stale (lazy deletion).

const SEQ_BITS = 4194304 // 2^22 events per fight before the key would collide

export class EventQueue {
  private keys: Float64Array
  private kinds: Int32Array
  private datas: Int32Array
  private gens: Int32Array
  private size = 0
  private seq = 0

  /** The last popped event. */
  time = 0
  kind = 0
  data = 0
  gen = 0

  constructor(capacity = 1024) {
    this.keys = new Float64Array(capacity)
    this.kinds = new Int32Array(capacity)
    this.datas = new Int32Array(capacity)
    this.gens = new Int32Array(capacity)
  }

  get length(): number {
    return this.size
  }

  clear(): void {
    this.size = 0
    this.seq = 0
  }

  push(time: number, kind: number, data: number, gen: number): void {
    if (this.size === this.keys.length) this.grow()
    if (this.seq >= SEQ_BITS) throw new Error('Event queue: too many events in one fight')
    const key = time * SEQ_BITS + this.seq++
    // Sift up.
    let i = this.size++
    const keys = this.keys
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (keys[parent] <= key) break
      keys[i] = keys[parent]
      this.kinds[i] = this.kinds[parent]
      this.datas[i] = this.datas[parent]
      this.gens[i] = this.gens[parent]
      i = parent
    }
    keys[i] = key
    this.kinds[i] = kind
    this.datas[i] = data
    this.gens[i] = gen
  }

  /** Time of the next event, or Infinity when empty. */
  peekTime(): number {
    return this.size === 0 ? Infinity : Math.floor(this.keys[0] / SEQ_BITS)
  }

  /** Removes the next event into `time`/`kind`/`data`/`gen`. Returns false when empty. */
  pop(): boolean {
    if (this.size === 0) return false
    const keys = this.keys
    this.time = Math.floor(keys[0] / SEQ_BITS)
    this.kind = this.kinds[0]
    this.data = this.datas[0]
    this.gen = this.gens[0]
    const last = --this.size
    if (last === 0) return true
    const key = keys[last]
    const kind = this.kinds[last]
    const data = this.datas[last]
    const gen = this.gens[last]
    // Sift down.
    let i = 0
    const half = last >> 1
    while (i < half) {
      let child = 2 * i + 1
      const right = child + 1
      if (right < last && keys[right] < keys[child]) child = right
      if (keys[child] >= key) break
      keys[i] = keys[child]
      this.kinds[i] = this.kinds[child]
      this.datas[i] = this.datas[child]
      this.gens[i] = this.gens[child]
      i = child
    }
    keys[i] = key
    this.kinds[i] = kind
    this.datas[i] = data
    this.gens[i] = gen
    return true
  }

  private grow(): void {
    const n = this.keys.length * 2
    const keys = new Float64Array(n)
    keys.set(this.keys)
    const kinds = new Int32Array(n)
    kinds.set(this.kinds)
    const datas = new Int32Array(n)
    datas.set(this.datas)
    const gens = new Int32Array(n)
    gens.set(this.gens)
    this.keys = keys
    this.kinds = kinds
    this.datas = datas
    this.gens = gens
  }
}
