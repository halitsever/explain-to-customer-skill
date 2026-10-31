/* Builds one paused GSAP timeline from baked scenes. Motion settings come from tokens.css; no randomness, no clocks. */
(function () {
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  var DUR = (parseFloat(cssVar("--motion-duration")) || 600) / 1000;
  var STAGGER = parseFloat(cssVar("--motion-stagger")) || 0.15;
  var ENTRANCE = cssVar("--motion-entrance") || "fade-up";
  var EASE = "power3.out";
  var raw = cssVar("--motion-ease");
  var m = raw.match(/cubic-bezier\(([^)]+)\)/);
  if (raw === "linear") EASE = "none";
  else if (m && window.CustomEase) {
    gsap.registerPlugin(CustomEase);
    var p = m[1].split(",").map(function (x) {
      return parseFloat(x);
    });
    EASE = CustomEase.create("etcEase", "M0,0 C" + p[0] + "," + p[1] + " " + p[2] + "," + p[3] + " 1,1");
  }

  function isText(el) {
    return el.matches(".h-title,.h-scene,.lead,.text,.text-sm,.eyebrow");
  }

  function entrance(tl, el, t) {
    var kind = ENTRANCE;
    if (kind === "typewriter" && isText(el)) {
      var n = Math.max(6, Math.min(48, el.textContent.trim().length));
      tl.fromTo(el, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: Math.min(1.6, n * 0.035), ease: "steps(" + n + ")" }, t);
      return;
    }
    if (kind === "typewriter") kind = "fade";
    if (kind === "draw") {
      var strokes = el.querySelectorAll(":scope > .rough-layer .rough-stroke");
      Array.prototype.forEach.call(strokes, function (s) {
        var len = parseFloat(s.getAttribute("data-len")) || 2000;
        tl.fromTo(s, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: DUR, ease: "power1.inOut" }, t);
      });
      tl.fromTo(el, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: DUR * 0.7, ease: EASE }, t + (strokes.length ? DUR * 0.25 : 0));
      return;
    }
    var from = { opacity: 0 };
    var to = { opacity: 1, duration: DUR, ease: EASE };
    if (kind === "fade-up") {
      from.y = 36;
      to.y = 0;
    }
    if (kind === "fade") {
      from.y = 12;
      to.y = 0;
    }
    if (kind === "slide") {
      from.x = -64;
      to.x = 0;
    }
    if (kind === "pop") {
      from.scale = 0.86;
      to.scale = 1;
      from.transformOrigin = to.transformOrigin = "50% 60%";
    }
    if (kind === "blur-in") {
      from.filter = "blur(14px)";
      from.y = 14;
      to.filter = "blur(0px)";
      to.y = 0;
    }
    if (kind === "wipe") {
      from = { clipPath: "inset(0 100% 0 0)", opacity: 1 };
      to = { clipPath: "inset(0 0% 0 0)", duration: DUR, ease: EASE };
    }
    tl.fromTo(el, from, to, t);
  }

  window.ETC = {
    build: function (spec) {
      var tl = gsap.timeline({ paused: true });
      spec.scenes.forEach(function (s, i) {
        var clip = document.getElementById(s.id);
        if (!clip) return;
        var scene = clip.querySelector(".scene");
        var items = clip.querySelectorAll("[data-anim]");
        var t0 = s.start + (i === 0 ? 0.1 : 0.2);
        var gap = Math.min(STAGGER, Math.max(0.06, (s.duration * 0.45) / Math.max(1, items.length)));
        // The opening headline is visible on frame 0: players and mail clients use that frame as the thumbnail.
        var hero = i === 0 ? clip.querySelector(".h-title") : null;
        if (hero) tl.fromTo(hero, { scale: 1.03, transformOrigin: "0% 50%" }, { scale: 1, duration: DUR * 1.6, ease: EASE }, s.start);
        var k = 0;
        Array.prototype.forEach.call(items, function (el) {
          if (el !== hero) entrance(tl, el, t0 + k++ * gap);
        });
        clip.querySelectorAll("[data-kenburns]").forEach(function (img) {
          tl.fromTo(img, { scale: 1 }, { scale: 1.035, duration: s.duration, ease: "none", transformOrigin: "50% 30%" }, s.start);
        });
        var last = i === spec.scenes.length - 1;
        if (scene && !last && s.transition !== "cut") {
          tl.to(scene, { opacity: 0, duration: 0.35, ease: "power1.in" }, s.start + s.duration - 0.4);
        }
      });
      tl.set({}, {}, spec.total);
      window.__timelines = window.__timelines || {};
      window.__timelines.main = tl;

      var clips = spec.scenes.map(function (s) {
        return { el: document.getElementById(s.id), start: s.start, end: s.start + s.duration };
      });
      window.__etc = {
        duration: spec.total,
        /** Used by the Playwright fallback engine; HyperFrames handles clip visibility itself. */
        seek: function (t) {
          clips.forEach(function (c, i) {
            var on = t >= c.start && (t < c.end || (i === clips.length - 1 && t <= c.end));
            if (c.el) c.el.style.visibility = on ? "visible" : "hidden";
          });
          tl.seek(t, false);
        },
      };
      return tl;
    },
  };
})();
