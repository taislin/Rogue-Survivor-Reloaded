/*
 * Escape-to-close and focus handling for the screenshot lightbox.
 *
 * The lightbox itself is CSS: `:target` on the overlay opens it, and the backdrop
 * is a link so clicking away closes it. That part works with scripting off, which
 * is the point -- a docs page that shows the game's screenshots should show them
 * on a page with JS blocked.
 *
 * This file only does the three things CSS cannot:
 *
 *   1. Escape closes. With :target alone there is no way out except clicking the
 *      backdrop, and Escape is what everyone tries first. A lightbox you cannot
 *      leave with the keyboard is a lightbox that traps people.
 *   2. `#` is intercepted. The close link is a real `href="#"` so it works
 *      without this file, and a bare `#` would otherwise scroll the page to the
 *      top on every close.
 *   3. Focus moves into the dialog and comes back. Otherwise a keyboard user who
 *      opens a screenshot is still tabbing around the page *behind* the overlay,
 *      which is invisible to them -- the dialog is fixed and opaque, and the
 *      focused element is somewhere they cannot see. On close, focus returns to
 *      the thumbnail they came from.
 *
 * No framework, no build step, matching `manual.js` next to it.
 */
(function () {
  "use strict";

  function openOverlay() {
    return document.querySelector(".lightbox:target");
  }

  function close() {
    var overlay = openOverlay();
    if (!overlay) return false;
    // `:target` is driven by the fragment, so removing the fragment is the close.
    // `location.hash = ""` leaves a bare "#" in the URL and a history entry, so
    // replace instead of assign: the lightbox should not cost a back-press to
    // undo, or a player who opens three screenshots has to press Back three
    // times to get out.
    history.pushState(null, "", location.pathname + location.search);
    return true;
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" && e.key !== "Esc") return;
    var overlay = openOverlay();
    if (!overlay) return;
    e.preventDefault();
    var trigger = document.querySelector('a[href="#' + overlay.id + '"]');
    close();
    if (trigger) trigger.focus();
  });

  // Stop the `href="#"` close link from jumping the page to the top.
  document.addEventListener("click", function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    var closer = el.closest(".lightbox__close, .lightbox__backdrop");
    if (!closer) return;
    e.preventDefault();
    var trigger = closer.closest(".lightbox") &&
      document.querySelector('a[href="#' + closer.closest(".lightbox").id + '"]');
    close();
    if (trigger) trigger.focus();
  });

  // Move focus into the dialog when it opens, so Tab stays inside it.
  document.addEventListener("focusin", function (e) {
    var overlay = openOverlay();
    if (!overlay) return;
    if (overlay.contains(e.target)) return;
    var first = overlay.querySelector(".lightbox__close");
    if (first) first.focus();
  });
})();
