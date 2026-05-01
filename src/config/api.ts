/**
 * Centralized configuration for the translation API backend
 */

export const BASE_API_URL =
  "http://localhost:5001/api/v2/languages/";

export const API_URL = BASE_API_URL + "?frontend=u4u";

/**
 * Fixed prompt sent as the `prompt` form field to the translation API.
 * Edit this string; leave empty to omit the parameter.
 */
export const TRANSLATION_PROMPT = "Translate the following text from {src} to {tgt}: {sentence}";

