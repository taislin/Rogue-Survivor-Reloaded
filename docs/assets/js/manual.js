/* Progressive enhancement for docs/manual.html - the page is fully readable
   with JavaScript disabled; this only adds a contents highlight and a filter. */

(function () {
  'use strict';

  /* --- highlight the current heading in the sidebar ------------------------ */

  var tocLinks = [].slice.call(document.querySelectorAll('.toc a[href^="#"]'));
  if (!tocLinks.length) return;

  var byId = {};
  var targets = [];

  tocLinks.forEach(function (link) {
    var id = link.getAttribute('href').slice(1);
    var el = document.getElementById(id);
    if (!el) return;
    byId[id] = link;
    targets.push(el);
  });

  if (targets.length && 'IntersectionObserver' in window) {
    var visible = Object.create(null);

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          visible[entry.target.id] = entry.isIntersecting;
        });

        // Highlight the topmost heading currently on screen, so scrolling up
        // keeps the previous entry lit instead of clearing the highlight.
        var active = null;
        for (var i = 0; i < targets.length; i++) {
          if (visible[targets[i].id]) {
            active = targets[i].id;
            break;
          }
        }
        if (!active) return;

        tocLinks.forEach(function (l) {
          l.classList.remove('is-active');
        });
        var link = byId[active];
        if (link) {
          link.classList.add('is-active');
          var box = link.parentNode.getBoundingClientRect();
          var rail = link.closest('.toc');
          if (rail && (box.top < rail.top + 8 || box.bottom > rail.bottom - 8)) {
            rail.scrollTop += box.top - rail.top - rail.clientHeight / 3;
          }
        }
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 }
    );

    targets.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* --- filter the manual by text ------------------------------------------ */

  var filter = document.getElementById('manual-filter');
  if (!filter) return;

  var sections = [].slice.call(document.querySelectorAll('.manual > section'));
  var empty = document.createElement('p');
  empty.className = 'muted small';
  empty.textContent = 'Nothing in the manual matches that.';
  empty.style.display = 'none';
  filter.parentNode.appendChild(empty);

  var apply = function () {
    var q = filter.value.trim().toLowerCase();
    var hits = 0;

    sections.forEach(function (section) {
      var match = !q || section.textContent.toLowerCase().indexOf(q) !== -1;
      section.classList.toggle('is-hidden', !match);
      if (match) hits++;
    });

    empty.style.display = q && hits === 0 ? '' : 'none';
  };

  filter.addEventListener('input', apply);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.activeElement === filter) {
      filter.value = '';
      apply();
      filter.blur();
    }
  });
})();
