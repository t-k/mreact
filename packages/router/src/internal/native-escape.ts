import { escapeHtmlBatch as escapeHtmlBatchInternal } from "../native-escape.js";

/**
 * Escapes a batch of values as HTML text using the native helper when available.
 */
export const escapeHtmlBatch = escapeHtmlBatchInternal;
