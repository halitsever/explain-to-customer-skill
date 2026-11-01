<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { withBase } from "vitepress";

const video = ref<HTMLVideoElement | null>(null);
const rendered = ref(false);
const reduced = ref(false);
const playing = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
let observer: IntersectionObserver | undefined;

// The terminal finishes typing at about 3 s; the render "completes" right after.
const RENDER_DONE_MS = 3200;

async function play() {
  const v = video.value;
  if (!v) return;
  try {
    await v.play();
    playing.value = true;
  } catch {
    playing.value = false;
  }
}

function toggle() {
  const v = video.value;
  if (!v) return;
  if (v.paused) play();
  else {
    v.pause();
    playing.value = false;
  }
}

onMounted(() => {
  reduced.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced.value) {
    rendered.value = true;
    return;
  }
  timer = setTimeout(() => {
    rendered.value = true;
    play();
  }, RENDER_DONE_MS);
  // Pause the loop while the hero is off screen.
  observer = new IntersectionObserver(([entry]) => {
    const v = video.value;
    if (!v || !rendered.value) return;
    if (entry.isIntersecting && playing.value) v.play().catch(() => {});
    else if (!entry.isIntersecting) v.pause();
  });
  if (video.value) observer.observe(video.value);
});

onBeforeUnmount(() => {
  clearTimeout(timer);
  observer?.disconnect();
});
</script>

<template>
  <div class="stage" :class="{ 'is-rendered': rendered, 'is-reduced': reduced }">
    <div class="term">
      <div class="term__bar" aria-hidden="true">
        <span></span><span></span><span></span>
        <em>~/acme-portal on feature/clearer-sign-up-errors</em>
      </div>
      <pre class="term__body"><span class="ln" style="--i: 0"><b class="p">$</b> git diff --stat main</span>
<span class="ln" style="--i: 1"> app.js      | 31 <b class="add">++++++++++++++++</b><b class="del">-----</b></span>
<span class="ln" style="--i: 2"> messages.js |  5 <b class="add">+++++</b></span>
<span class="ln add" style="--i: 3">+  emailInvalid: "That email address doesn't look right…",</span>
<span class="ln add" style="--i: 4">+  passwordShort: "Password must be at least 8 characters.",</span>
<span class="ln add" style="--i: 5">+  retry: "Try again",</span>
<span class="ln" style="--i: 6"><b class="p">&gt;</b> /explain-to-customer all</span>
<span class="ln" style="--i: 7">  rendering <i class="bar"><i></i></i></span>
<span class="ln ok" style="--i: 8">  video 43.5 s, 4 slides, 1 diagram, message.md</span>
<span class="ln ok" style="--i: 9">  QA passed on every frame</span></pre>
    </div>

    <figure class="player">
      <div class="player__frame">
        <video
          ref="video"
          :src="withBase('/media/demo.mp4')"
          :poster="withBase('/media/demo-poster.webp')"
          muted
          loop
          playsinline
          preload="metadata"
          aria-label="A 43-second explainer video the skill rendered for a sign-up form change"
          @click="toggle"
        ></video>
        <span class="player__wait" aria-hidden="true">Rendering for your client</span>
        <button v-if="rendered && !playing" type="button" class="player__play" @click="play">Play the demo</button>
      </div>
      <figcaption>clearer-error-messages-on-sign-up.mp4, rendered from that diff</figcaption>
    </figure>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}
.term {
  width: 86%;
}

.term {
  position: relative;
  z-index: 1;
  border-radius: 16px;
  background: #13110f;
  box-shadow:
    inset 0 0 0 1px #34302b,
    0 30px 60px -30px rgba(0, 0, 0, 0.7);
  overflow: hidden;
}
.term__bar {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 12px 16px;
  border-bottom: 1px solid #2a2723;
}
.term__bar span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #3a352f;
}
.term__bar em {
  margin-left: 10px;
  font:
    400 12px/1 "JetBrains Mono",
    ui-monospace,
    monospace;
  font-style: normal;
  color: #8c857b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.term__body {
  margin: 0;
  padding: 16px 18px 48px;
  font:
    400 13.5px/1.75 "JetBrains Mono",
    ui-monospace,
    monospace;
  color: #d9d2c7;
  white-space: pre;
  overflow-x: auto;
}
.term__body b {
  font-weight: 400;
}
.p {
  color: #e9744a;
}
.add {
  color: #7fd18b;
}
.del {
  color: #f07e74;
}
.ok {
  color: #f3efe8;
}
.ok::before {
  content: "✓";
  color: #7fd18b;
  margin-right: 8px;
}

.ln {
  display: inline-block;
  opacity: 0;
  transform: translateY(4px);
  animation: line-in 0.35s ease-out forwards;
  animation-delay: calc(0.35s + var(--i) * 0.26s);
}
@keyframes line-in {
  to {
    opacity: 1;
    transform: none;
  }
}

.bar {
  display: inline-block;
  vertical-align: middle;
  width: 150px;
  height: 6px;
  margin-left: 6px;
  border-radius: 3px;
  background: #2a2723;
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  width: 0;
  background: #e9744a;
  animation: fill 0.6s ease-in-out forwards;
  animation-delay: calc(0.35s + 7 * 0.26s);
}
@keyframes fill {
  to {
    width: 100%;
  }
}

.player {
  position: relative;
  z-index: 2;
  width: 84%;
  margin: -28px 0 0 16%;
}
.player::before {
  content: "";
  position: absolute;
  inset: 10% -6% -12% 8%;
  z-index: -1;
  background: radial-gradient(closest-side, rgba(233, 116, 74, 0.38), transparent);
  filter: blur(30px);
  opacity: 0;
  transition: opacity 1.2s ease;
}
.is-rendered .player::before {
  opacity: 1;
}
.player__frame {
  position: relative;
  border-radius: 18px;
  overflow: hidden;
  background: #fbf9f5;
  box-shadow:
    0 0 0 1px rgba(251, 249, 245, 0.08),
    0 40px 80px -30px rgba(0, 0, 0, 0.8);
  aspect-ratio: 16 / 9;
}
.player__frame video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: pointer;
  filter: grayscale(1) brightness(0.32);
  transform: scale(0.985);
  transition:
    filter 0.9s ease,
    transform 0.9s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.is-rendered .player__frame video {
  filter: none;
  transform: none;
}
.player__wait {
  position: absolute;
  inset: auto 0 0 0;
  padding: 16px 20px;
  font:
    600 15px/1.2 "Plus Jakarta Sans Variable",
    system-ui,
    sans-serif;
  color: #f3efe8;
  transition: opacity 0.4s;
}
.is-rendered .player__wait {
  opacity: 0;
}
.player__play {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  padding: 14px 22px;
  border: 0;
  border-radius: 999px;
  background: #1f1d1a;
  color: #fbf9f5;
  font:
    700 15px/1 "Plus Jakarta Sans Variable",
    system-ui,
    sans-serif;
  cursor: pointer;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}
.player figcaption {
  margin-top: 14px;
  font:
    400 13px/1.4 "JetBrains Mono",
    ui-monospace,
    monospace;
  color: #8c857b;
}

.is-reduced .ln,
.is-reduced .bar i {
  animation: none;
  opacity: 1;
  transform: none;
  width: 100%;
}

@media (max-width: 960px) {
  .term {
    width: 100%;
  }
  .player {
    width: 94%;
    margin: -40px 0 0 6%;
  }
  .term__body {
    font-size: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .player__frame video,
  .player::before {
    transition: none;
  }
}
</style>
