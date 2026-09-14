import { describe, it, expect } from 'vitest';
import { CostMeter, calculateCostFromDuration } from './cost-meter';

describe('CostMeter', () => {
  it('should initialize with zero cost', () => {
    const meter = new CostMeter({ softCapUSD: 2, hardCapUSD: 5 });
    expect(meter.getTotalCostUSD()).toBe(0);
  });

  it('should add cost correctly', () => {
    const meter = new CostMeter({ softCapUSD: 2, hardCapUSD: 5 });
    meter.addCostUSD(0.5);
    expect(meter.getTotalCostUSD()).toBe(0.5);
    
    meter.addCostUSD(0.3);
    expect(meter.getTotalCostUSD()).toBe(0.8);
  });

  it('should not add negative costs', () => {
    const meter = new CostMeter({ softCapUSD: 2, hardCapUSD: 5 });
    meter.addCostUSD(0.5);
    meter.addCostUSD(-0.2);
    expect(meter.getTotalCostUSD()).toBe(0.5);
  });

  it('should warn when approaching soft cap', () => {
    const meter = new CostMeter({ softCapUSD: 2, hardCapUSD: 5 });
    expect(meter.shouldWarn()).toBe(false);
    
    meter.addCostUSD(2);
    expect(meter.shouldWarn()).toBe(true);
    
    meter.addCostUSD(0.5);
    expect(meter.shouldWarn()).toBe(true);
  });

  it('should not warn after hard cap', () => {
    const meter = new CostMeter({ softCapUSD: 2, hardCapUSD: 5 });
    meter.addCostUSD(5);
    expect(meter.shouldWarn()).toBe(false);
  });

  it('should auto-stop at hard cap', () => {
    const meter = new CostMeter({ softCapUSD: 2, hardCapUSD: 5 });
    expect(meter.shouldAutoStop()).toBe(false);
    
    meter.addCostUSD(5);
    expect(meter.shouldAutoStop()).toBe(true);
    
    meter.addCostUSD(0.1);
    expect(meter.shouldAutoStop()).toBe(true);
  });

  it('should calculate remaining caps correctly', () => {
    const meter = new CostMeter({ softCapUSD: 2, hardCapUSD: 5 });
    meter.addCostUSD(1);
    
    expect(meter.getRemainingSoftCap()).toBe(1);
    expect(meter.getRemainingHardCap()).toBe(4);
  });

  it('should not return negative remaining caps', () => {
    const meter = new CostMeter({ softCapUSD: 2, hardCapUSD: 5 });
    meter.addCostUSD(6);
    
    expect(meter.getRemainingSoftCap()).toBe(0);
    expect(meter.getRemainingHardCap()).toBe(0);
  });

  it('should reset cost to zero', () => {
    const meter = new CostMeter({ softCapUSD: 2, hardCapUSD: 5 });
    meter.addCostUSD(3);
    meter.reset();
    
    expect(meter.getTotalCostUSD()).toBe(0);
    expect(meter.shouldWarn()).toBe(false);
    expect(meter.shouldAutoStop()).toBe(false);
  });

  it('should calculate progress correctly', () => {
    const meter = new CostMeter({ softCapUSD: 2, hardCapUSD: 5 });
    meter.addCostUSD(1);
    
    const progress = meter.getProgress();
    expect(progress.current).toBe(1);
    expect(progress.soft).toBe(2);
    expect(progress.hard).toBe(5);
    expect(progress.percentToSoft).toBe(50);
    expect(progress.percentToHard).toBe(20);
  });

  it('should cap percentage at 100', () => {
    const meter = new CostMeter({ softCapUSD: 2, hardCapUSD: 5 });
    meter.addCostUSD(10);
    
    const progress = meter.getProgress();
    expect(progress.percentToSoft).toBe(100);
    expect(progress.percentToHard).toBe(100);
  });
});

describe('calculateCostFromDuration', () => {
  it('should calculate cost for input only', () => {
    const cost = calculateCostFromDuration(60, 0); // 1 minute input
    expect(cost).toBeCloseTo(0.06, 4);
  });

  it('should calculate cost for output only', () => {
    const cost = calculateCostFromDuration(0, 60); // 1 minute output
    expect(cost).toBeCloseTo(0.24, 4);
  });

  it('should calculate cost for both input and output', () => {
    const cost = calculateCostFromDuration(30, 30); // 30 seconds each
    expect(cost).toBeCloseTo(0.15, 4); // 0.03 + 0.12
  });

  it('should return zero for zero duration', () => {
    const cost = calculateCostFromDuration(0, 0);
    expect(cost).toBe(0);
  });
});
