/* Scene bake step, run once in Playwright before stills and video: wait for fonts, shrink overflowing text, draw rough outlines. */
(function () {
  var GLYPHS = "AaİıĞğŞşÇçÖöÜü";

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function firstFamily(stack) {
    var m = stack.match(/^\s*"?([^",]+)"?/);
    return m ? m[1].trim() : null;
  }

  /** Load every unicode-range slice the test glyphs need, then check; check() alone fails for slices no text used yet. */
  function fontReport() {
    var roles = [
      ["heading", "--font-heading", cssVar("--heading-weight") || "700"],
      ["body", "--font-body", cssVar("--body-weight") || "400"],
    ];
    return Promise.all(
      roles.map(function (f) {
        var fam = firstFamily(cssVar(f[1]));
        if (!fam) return null;
        var spec = f[2] + ' 48px "' + fam + '"';
        return document.fonts.load(spec, GLYPHS).then(function (faces) {
          return { role: f[0], family: fam, weight: f[2], loaded: faces.length > 0 && document.fonts.check(spec, GLYPHS) };
        });
      }),
    ).then(function (list) {
      return list.filter(Boolean);
    });
  }

  /** Shrink text in 4% steps until the scene fits its safe area and each .fit block respects data-max-lines. */
  function fit(scene) {
    var issues = [];
    var items = Array.prototype.slice.call(scene.querySelectorAll("[data-fit]"));
    // Start from the stylesheet size every bake, so a theme switch never compounds earlier shrinking.
    items.forEach(function (el) {
      el.style.fontSize = "";
      el.style.fontSize = parseFloat(getComputedStyle(el).fontSize) + "px";
    });
    function overflowing(el) {
      var cs = getComputedStyle(el);
      var lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      var max = parseInt(el.getAttribute("data-max-lines") || "0", 10);
      if (max && el.scrollHeight > lh * max + lh * 0.35) return true;
      return el.scrollWidth > el.clientWidth + 2;
    }
    function sceneOverflow() {
      var r = scene.getBoundingClientRect();
      var limit = r.top + r.height - 54;
      var worst = 0;
      scene.querySelectorAll(".h-title,.h-scene,.lead,.text,.text-sm,.card,.step,.benefit,li,img").forEach(function (n) {
        var b = n.getBoundingClientRect();
        if (b.bottom > limit) worst = Math.max(worst, b.bottom - limit);
        if (b.right > r.right - 96 + 1) worst = Math.max(worst, b.right - (r.right - 96));
      });
      return worst;
    }
    for (var round = 0; round < 14; round++) {
      var changed = false;
      items.forEach(function (el) {
        var min = parseFloat(el.getAttribute("data-min")) || 36;
        if (overflowing(el)) {
          var size = parseFloat(el.style.fontSize);
          if (size * 0.96 >= min) {
            el.style.fontSize = (size * 0.96).toFixed(1) + "px";
            changed = true;
          }
        }
      });
      if (sceneOverflow() > 0) {
        items.forEach(function (el) {
          var min = parseFloat(el.getAttribute("data-min")) || 36;
          var size = parseFloat(el.style.fontSize);
          if (size * 0.96 >= min) {
            el.style.fontSize = (size * 0.96).toFixed(1) + "px";
            changed = true;
          }
        });
      }
      if (!changed) break;
    }
    // Siblings in one list share the smallest size so a single long item does not look out of place.
    scene.querySelectorAll(".points, .steps, .benefits, .callouts, .actions, .ba, .mini-ba").forEach(function (group) {
      var texts = Array.prototype.slice.call(group.querySelectorAll("[data-fit]"));
      if (texts.length < 2) return;
      var min = Math.min.apply(
        null,
        texts.map(function (t) {
          return parseFloat(t.style.fontSize);
        }),
      );
      texts.forEach(function (t) {
        t.style.fontSize = min + "px";
      });
    });
    items.forEach(function (el) {
      if (overflowing(el)) issues.push({ kind: "text-overflow", text: el.textContent.trim().slice(0, 80), fontSize: el.style.fontSize });
    });
    var rest = sceneOverflow();
    if (rest > 0) issues.push({ kind: "safe-area", px: Math.round(rest) });
    return issues;
  }

  function seedFor(i) {
    return 1000 + i * 37;
  }

  /** Hand-drawn outlines for cards, badges and pills. Fixed seeds keep every render identical. */
  function rough(scene) {
    scene.querySelectorAll(".rough-layer").forEach(function (n) {
      n.remove();
    });
    scene.querySelectorAll("[data-rough-fill]").forEach(function (n) {
      n.style.background = "";
      n.removeAttribute("data-rough-fill");
    });
    if (cssVar("--rough") !== "1" || !window.rough) return;
    var ink = cssVar("--fg") || "#1e1e1e";
    var targets = scene.querySelectorAll(".card, .badge, .step .num");
    Array.prototype.forEach.call(targets, function (el, i) {
      var fill = getComputedStyle(el).backgroundColor;
      el.setAttribute("data-rough-fill", fill);
      el.style.background = "transparent";
      var w = el.offsetWidth + 16,
        h = el.offsetHeight + 16;
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "rough-layer");
      svg.setAttribute("viewBox", "0 0 " + w + " " + h);
      svg.setAttribute("aria-hidden", "true");
      var rc = window.rough.svg(svg);
      var round = el.classList.contains("badge") || el.classList.contains("num");
      var opts = { seed: seedFor(i), roughness: 1.3, bowing: 1.2, stroke: ink, strokeWidth: 2.6, fill: fill, fillStyle: "solid", disableMultiStroke: false };
      var node = round ? rc.ellipse(w / 2, h / 2, w - 18, h - 18, opts) : rc.rectangle(8, 8, w - 16, h - 16, opts);
      node.querySelectorAll("path").forEach(function (p) {
        if (p.getAttribute("stroke") && p.getAttribute("stroke") !== "none" && p.getAttribute("fill") === "none") {
          p.setAttribute("class", "rough-stroke");
          var len = Math.ceil(p.getTotalLength ? p.getTotalLength() : 2000);
          p.setAttribute("data-len", String(len));
        }
      });
      svg.appendChild(node);
      el.insertBefore(svg, el.firstChild);
    });
  }

  window.__etcBake = function () {
    return document.fonts.ready
      .then(function () {
        var imgs = Array.prototype.slice.call(document.images);
        return Promise.all(
          imgs.map(function (im) {
            return im.complete
              ? null
              : new Promise(function (r) {
                  im.onload = im.onerror = r;
                });
          }),
        );
      })
      .then(function () {
        var scene = document.querySelector(".scene");
        var issues = scene ? fit(scene) : [];
        if (scene) rough(scene);
        var broken = Array.prototype.filter
          .call(document.images, function (im) {
            return !im.naturalWidth;
          })
          .map(function (im) {
            return im.getAttribute("src");
          });
        if (broken.length) issues.push({ kind: "missing-image", src: broken });
        return fontReport().then(function (fonts) {
          return { fonts: fonts, issues: issues };
        });
      });
  };
})();
