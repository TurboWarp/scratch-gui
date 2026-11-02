/**
 * What a host may hand the Plus extension host, and nothing else.
 *
 * The GUI cannot build these itself. A persistent extension cache has to be filed under the
 * project being opened and has to know which digests the catalog vouches for, and neither is
 * something this fork knows: the distributing host owns the catalog and decides where a project's
 * bytes are kept. So this is a socket, not an implementation — the stub below is what the GUI uses
 * on its own, and a host replaces this module to fill it.
 *
 * Replacing a module rather than reading a global is deliberate. A global would have to be set
 * before the GUI mounts, which makes the wiring depend on load order; an alias is resolved when
 * the bundle is built, so either the host supplied it or it did not.
 * @returns {object} Options merged under whatever the caller passes, so a caller always wins.
 */
export const plusHostExtras = () => ({});
