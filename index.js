/**
 * Host half of the liquid-glass bundle.
 *
 * The whole effect lives in the Client module: one stylesheet layered over the
 * theme's `--dsw-*` tokens. Nothing runs on the Host, so this half only needs to
 * exist so the bundle resolves as a plugin row.
 */

/** No Host-side resources; the Client module owns the rendering. */
export function apply() {}
