import { brotliCompressSync, constants, gzipSync } from "node:zlib";

/**
 * Compression settings shared by every delivery measurement.
 *
 * The values are pinned so raw/gzip/Brotli totals stay comparable between runs, machines and
 * commits. `gzip.level` is Node's default gzip level, which keeps historical gzip budgets valid.
 * `brotli.quality` is the maximum text quality and `brotli.lgwin` is Node's default window, which
 * is what a CDN using static Brotli precompression emits.
 */
export const deliveryCompressionSettings = {
  brotli: { lgwin: 22, quality: 11 },
  gzip: { level: constants.Z_DEFAULT_COMPRESSION },
} as const;

export type DeliveryCompressionSettings = typeof deliveryCompressionSettings;

/** Compresses with the pinned gzip settings used by every delivery and dist size report. */
export function gzipEstimateBytes(content: Buffer | string): number {
  return gzipSync(content, { level: deliveryCompressionSettings.gzip.level }).byteLength;
}

/** Compresses with the pinned Brotli settings used by every delivery size report. */
export function brotliEstimateBytes(content: Buffer | string): number {
  return brotliCompressSync(content, {
    params: {
      [constants.BROTLI_PARAM_LGWIN]: deliveryCompressionSettings.brotli.lgwin,
      [constants.BROTLI_PARAM_QUALITY]: deliveryCompressionSettings.brotli.quality,
    },
  }).byteLength;
}
