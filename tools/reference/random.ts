/** MT19937 with CPython integer seeding/getrandbits rejection sampling.
 * The reference interpreter's RNG is a recorded interpreter setting, not a ZXR rule.
 * Constants and transformations are the published MT19937 algorithm.
 */
export class ReferenceRandom {
  private state = new Uint32Array(624);
  private index = 624;
  constructor(seed: number) { this.seed(seed); }
  snapshot(): { state: number[]; index: number } { return { state: Array.from(this.state), index: this.index }; }
  restore(snapshot: { state: number[]; index: number }): void { this.state.set(snapshot.state); this.index = snapshot.index; }
  seed(seed: number): void {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be an unsigned 32-bit integer');
    this.state[0] = 19650218;
    for (let i = 1; i < 624; i++) this.state[i] = (Math.imul(1812433253, this.state[i - 1]! ^ (this.state[i - 1]! >>> 30)) + i) >>> 0;
    let i = 1;
    for (let k = 624; k > 0; k--) {
      this.state[i] = ((this.state[i]! ^ Math.imul(this.state[i - 1]! ^ (this.state[i - 1]! >>> 30), 1664525)) + seed) >>> 0;
      if (++i >= 624) { this.state[0] = this.state[623]!; i = 1; }
    }
    for (let k = 623; k > 0; k--) {
      this.state[i] = ((this.state[i]! ^ Math.imul(this.state[i - 1]! ^ (this.state[i - 1]! >>> 30), 1566083941)) - i) >>> 0;
      if (++i >= 624) { this.state[0] = this.state[623]!; i = 1; }
    }
    this.state[0] = 0x80000000;
    this.index = 624;
  }
  private word(): number {
    if (this.index >= 624) {
      for (let i = 0; i < 624; i++) {
        const y = (this.state[i]! & 0x80000000) | (this.state[(i + 1) % 624]! & 0x7fffffff);
        this.state[i] = this.state[(i + 397) % 624]! ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0);
      }
      this.index = 0;
    }
    let y = this.state[this.index++]!;
    y ^= y >>> 11; y ^= (y << 7) & 0x9d2c5680; y ^= (y << 15) & 0xefc60000; y ^= y >>> 18;
    return y >>> 0;
  }
  draw(range: number): number {
    if (!Number.isInteger(range) || range < 1 || range > 32767) throw new Error(`Invalid random range ${range}`);
    const bits = Math.floor(Math.log2(range)) + 1;
    let value: number;
    do { value = this.word() >>> (32 - bits); } while (value >= range);
    return value + 1;
  }
}
