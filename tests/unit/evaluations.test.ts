import { describe, expect, it } from 'vitest';
import { detectAnomalies, type SeriesPoint } from '@/lib/services/evaluations';

const series = (values: number[]): SeriesPoint[] =>
  values.map((value, i) => ({ period: `2026-0${i + 1}`, value, sampleSize: 100 }));

describe('detectAnomalies', () => {
  it('returns nothing for fewer than 4 points', () => {
    expect(detectAnomalies(series([1, 2, 3])).anomalies).toHaveLength(0);
  });

  it('flags a spike beyond 2 sigma', () => {
    const result = detectAnomalies(series([10, 10, 10, 10, 100]));
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0].direction).toBe('spike');
    expect(result.anomalies[0].period).toBe('2026-05');
  });

  it('flags a drop beyond 2 sigma', () => {
    const result = detectAnomalies(series([50, 50, 50, 50, 1]));
    expect(result.anomalies[0].direction).toBe('drop');
  });

  it('does not flag a stable series', () => {
    expect(detectAnomalies(series([5, 5, 5, 5, 5, 5])).anomalies).toHaveLength(0);
  });

  it('excludes the point itself from its own baseline', () => {
    // With only 5 points a single extreme value moves the mean; a leave-one-out
    // baseline is what makes the z-score meaningful.
    const result = detectAnomalies(series([10, 10, 11, 10, 200]));
    expect(result.anomalies.some((a) => a.period === '2026-05')).toBe(true);
  });

  it('tolerates a zero-variance series without dividing by zero', () => {
    expect(() => detectAnomalies(series([3, 3, 3, 3]))).not.toThrow();
    expect(detectAnomalies(series([3, 3, 3, 3])).anomalies).toHaveLength(0);
  });
});

