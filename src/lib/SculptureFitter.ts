export const EnlargeMode = {
  Factor: 0,
  TargetLongest: 1,
  TargetHeight: 2,
  NonUniformXyz: 3,
} as const;

export type EnlargeMode = typeof EnlargeMode[keyof typeof EnlargeMode];

export interface FitResult {
  fits: boolean;
  clearance: [number, number, number];
  minClearance: number;
  maxScaleToFit: number;
}

export class SculptureFitter {
  /**
   * Per-axis enlargement factors for the given mode.
   * `size` is the current bounding size [x, y, z] (all > 0).
   * For uniform modes, the three returned factors are equal.
   */
  static enlargeFactors(
    size: [number, number, number],
    mode: EnlargeMode,
    value: number,
    targetXyz?: [number, number, number]
  ): [number, number, number] {
    const [sx, sy, sz] = size;
    switch (mode) {
      case EnlargeMode.Factor:
        return [value, value, value];
      case EnlargeMode.TargetLongest: {
        const longest = Math.max(sx, sy, sz);
        const f = longest > 0 ? value / longest : 1.0;
        return [f, f, f];
      }
      case EnlargeMode.TargetHeight: {
        const f = sz > 0 ? value / sz : 1.0;
        return [f, f, f];
      }
      case EnlargeMode.NonUniformXyz: {
        if (!targetXyz || targetXyz.length !== 3) {
          throw new Error("NonUniformXyz needs targetXyz length 3");
        }
        return [
          sx > 0 ? targetXyz[0] / sx : 1.0,
          sy > 0 ? targetXyz[1] / sy : 1.0,
          sz > 0 ? targetXyz[2] / sz : 1.0,
        ];
      }
      default:
        throw new Error("Invalid mode");
    }
  }

  /**
   * Does a sculpture of the given oriented extents fit inside a block of the
   * given oriented extents?
   * clearance is reported per sorted axis. `margin` is subtracted from each block extent.
   */
  static fitsInBlock(
    sculptExtents: [number, number, number],
    blockExtents: [number, number, number],
    margin: number = 0.0
  ): FitResult {
    const s = this.sortDesc([...sculptExtents] as [number, number, number]);
    const b = this.sortDesc([...blockExtents] as [number, number, number]);

    const clearance: [number, number, number] = [0, 0, 0];
    let minClear = Number.POSITIVE_INFINITY;
    let minScale = Number.POSITIVE_INFINITY;

    for (let i = 0; i < 3; i++) {
      const avail = b[i] - 2.0 * margin; // margin on both sides
      clearance[i] = avail - s[i];
      if (clearance[i] < minClear) minClear = clearance[i];
      const scale = s[i] > 1e-12 ? avail / s[i] : Number.POSITIVE_INFINITY;
      if (scale < minScale) minScale = scale;
    }

    return {
      fits: minClear >= 0.0,
      clearance,
      minClearance: minClear,
      maxScaleToFit: minScale,
    };
  }

  private static sortDesc(v: [number, number, number]): [number, number, number] {
    const res = [...v] as [number, number, number];
    res.sort((a, b) => b - a);
    return res;
  }
}
