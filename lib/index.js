// DSH Enter Customizer — Host half (DSH 0.2.0-rc.2).
//
// Compatibility note (0.1.x -> 0.2.0-rc.2):
// The settings layer no longer exposes a `settingsNamespace()` / `register()`
// seam. @deepseek-ai/dsh-settings now projects EVERY active plugin's OWN
// `Config` schema into a settings form, keyed by the profile entry id (see
// `SettingsForms.describe()`: `ns: entry.options.id`, `schema: entry.fiber.runtime.schema`).
// So the durable section is declared here as this plugin's Config and nothing
// else is required — importing `settingsNamespace` from @deepseek-ai/dsh-settings
// (as 0.1.x did) now yields `undefined` and throws at `register()` time.
//
// The entry id in cordis.patch.yml MUST equal NAMESPACE, because the client
// half reads the section through `ctx.configForms.get(<entry id>)`.

import z from "@deepseek-ai/schemastery";

/** Plugin name; also the default profile entry id source. */
export const name = "dsh-enter-customizer";

/** Settings namespace owned by this plugin (== profile entry id). */
export const NAMESPACE = "dsh-enter-customizer";

/** Accepted behavior values for one input shortcut. */
export const BEHAVIORS = ["send", "queue", "newline", "none"];

/**
 * Durable shortcut configuration section.
 *
 * Kept field-for-field identical to 0.1.x so a settings document written by the
 * old version still validates and keeps its meaning.
 */
export const Config = z.object({
  /** Master switch: when false, every shortcut falls back to system defaults. */
  enabled: z.boolean().default(true),
  enter: z.union([...BEHAVIORS]).default("send"),
  ctrlEnter: z.union([...BEHAVIORS]).default("queue"),
  shiftEnter: z.union([...BEHAVIORS]).default("newline"),
  altEnter: z.union([...BEHAVIORS]).default("send"),
  sendButton: z.union(["send", "queue", "none"]).default("send"),
});

/**
 * Host half. The durable section lives entirely in `Config`, so there is no
 * registration work left; the body only asserts the parsed section once for an
 * actionable startup log line.
 * @param ctx - Host context.
 * @param config - Parsed durable section.
 */
export function apply(ctx, config) {
  ctx.logger?.debug?.("dsh-enter-customizer: section ready %j", config);
}
