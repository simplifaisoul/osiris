export interface CostMeterConfig {
  softCapUSD: number;
  hardCapUSD: number;
}

export class CostMeter {
  private totalCostUSD: number = 0;
  private config: CostMeterConfig;

  constructor(config: CostMeterConfig) {
    this.config = config;
  }

  addCostUSD(amount: number): void {
    this.totalCostUSD += Math.max(0, amount);
  }

  getTotalCostUSD(): number {
    return this.totalCostUSD;
  }

  shouldWarn(): boolean {
    return this.totalCostUSD >= this.config.softCapUSD && this.totalCostUSD < this.config.hardCapUSD;
  }

  shouldAutoStop(): boolean {
    return this.totalCostUSD >= this.config.hardCapUSD;
  }

  getRemainingSoftCap(): number {
    return Math.max(0, this.config.softCapUSD - this.totalCostUSD);
  }

  getRemainingHardCap(): number {
    return Math.max(0, this.config.hardCapUSD - this.totalCostUSD);
  }

  reset(): void {
    this.totalCostUSD = 0;
  }

  getProgress(): { current: number; soft: number; hard: number; percentToSoft: number; percentToHard: number } {
    return {
      current: this.totalCostUSD,
      soft: this.config.softCapUSD,
      hard: this.config.hardCapUSD,
      percentToSoft: Math.min(100, (this.totalCostUSD / this.config.softCapUSD) * 100),
      percentToHard: Math.min(100, (this.totalCostUSD / this.config.hardCapUSD) * 100),
    };
  }
}

// Approximate cost calculation for OpenAI Realtime API
// Based on: $0.06 per minute for audio input, $0.24 per minute for audio output
export function calculateCostFromDuration(inputSeconds: number, outputSeconds: number): number {
  const inputCostPerSecond = 0.06 / 60; // $0.06 per minute
  const outputCostPerSecond = 0.24 / 60; // $0.24 per minute
  
  return (inputSeconds * inputCostPerSecond) + (outputSeconds * outputCostPerSecond);
}
