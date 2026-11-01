<script setup lang="ts">
import { ref } from "vue";
import { withBase } from "vitepress";

interface Attachment {
  file: string;
  kind: string;
  thumb: string;
  full: string;
  video?: boolean;
}

const attachments: Attachment[] = [
  { file: "clearer-error-messages-on-sign-up.mp4", kind: "Video, 43 s", thumb: "/media/demo-poster.webp", full: "/media/demo.mp4", video: true },
  { file: "01-summary.png", kind: "One-page summary", thumb: "/media/slides/summary.webp", full: "/media/slides/summary.webp" },
  { file: "02-before-after.png", kind: "Before and after", thumb: "/media/slides/before-after.webp", full: "/media/slides/before-after.webp" },
  { file: "03-callouts.png", kind: "Annotated screenshot", thumb: "/media/slides/callouts.webp", full: "/media/slides/callouts.webp" },
  { file: "sign-up-flow.svg", kind: "Diagram", thumb: "/media/slides/flow.webp", full: "/media/diagram.svg" },
];

const dialog = ref<HTMLDialogElement | null>(null);
const open = ref<Attachment | null>(null);

function show(a: Attachment) {
  open.value = a;
  dialog.value?.showModal();
}
function close() {
  dialog.value?.close();
}
function onDialogClick(e: MouseEvent) {
  if (e.target === dialog.value) close();
}
function onClose() {
  open.value = null;
}
</script>

<template>
  <div class="mail">
    <div class="mail__chrome" aria-hidden="true"><span></span><span></span><span></span></div>
    <dl class="mail__head">
      <div>
        <dt>To</dt>
        <dd>[Customer name]</dd>
      </div>
      <div>
        <dt>Subject</dt>
        <dd class="mail__subject">Clearer error messages on sign-up</dd>
      </div>
    </dl>
    <div class="mail__body">
      <p>Hi [Customer name],</p>
      <p>
        We improved the sign-up form in Acme Portal. Before, any mistake showed one generic message, “Something went wrong. Please try again.”, so users had to guess what to fix.
        Now the wrong field turns red and a hint right below it explains how to fix it.
      </p>
      <p class="mail__h">What's new</p>
      <ul>
        <li>Email: “That email address doesn't look right.” with a correct example</li>
        <li>Password: “Password must be at least 8 characters.”</li>
        <li>A new “Try again” button that jumps to the first field to fix</li>
      </ul>
      <p class="mail__h">What you need to do</p>
      <p>Nothing on your side. It is live now.</p>
      <p>Best regards,<br />[Your name]</p>
    </div>
    <ul class="mail__files" aria-label="Attachments">
      <li v-for="a in attachments" :key="a.file">
        <button type="button" class="file" @click="show(a)">
          <span class="file__thumb">
            <img :src="withBase(a.thumb)" alt="" loading="lazy" decoding="async" width="320" height="180" />
            <span v-if="a.video" class="file__play" aria-hidden="true"></span>
          </span>
          <span class="file__name">{{ a.file }}</span>
          <span class="file__kind">{{ a.kind }}</span>
        </button>
      </li>
    </ul>
  </div>

  <dialog ref="dialog" class="viewer" :aria-label="open?.file" @click="onDialogClick" @close="onClose">
    <div v-if="open" class="viewer__inner">
      <video v-if="open.video" :src="withBase(open.full)" controls autoplay muted playsinline></video>
      <img v-else :src="withBase(open.full)" :alt="open.kind" />
      <div class="viewer__bar">
        <span>{{ open.file }}</span>
        <button type="button" @click="close">Close</button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.mail {
  border-radius: 18px;
  background: #fffdf9;
  box-shadow:
    0 0 0 1px rgba(31, 29, 26, 0.08),
    0 50px 90px -50px rgba(31, 29, 26, 0.5);
  overflow: hidden;
  color: #1f1d1a;
}
.mail__chrome {
  display: flex;
  gap: 7px;
  padding: 14px 18px;
  background: #f3efe8;
  border-bottom: 1px solid #e4ddd2;
}
.mail__chrome span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #d9d2c7;
}
.mail__head {
  margin: 0;
  padding: 6px 26px;
  border-bottom: 1px solid #ece6dc;
}
.mail__head div {
  display: flex;
  gap: 14px;
  padding: 10px 0;
  font-size: 15px;
}
.mail__head div + div {
  border-top: 1px solid #f1ece4;
}
.mail__head dt {
  width: 64px;
  color: #7a7369;
}
.mail__head dd {
  margin: 0;
}
.mail__subject {
  font-weight: 700;
}
.mail__body {
  padding: 22px 26px 6px;
  font-size: 16px;
  line-height: 1.65;
  max-width: 64ch;
}
.mail__body p {
  margin: 0 0 14px;
}
.mail__body ul {
  margin: 0 0 14px;
  padding-left: 20px;
}
.mail__body li {
  margin: 4px 0;
}
.mail__h {
  font-weight: 700;
  margin-bottom: 4px !important;
}

.mail__files {
  list-style: none;
  margin: 0;
  padding: 18px 26px 26px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  border-top: 1px solid #ece6dc;
  background: #faf7f2;
}
.file {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
  color: inherit;
}
.file__thumb {
  position: relative;
  display: block;
  aspect-ratio: 16 / 9;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 0 0 1px #e4ddd2;
  transition: box-shadow 0.15s;
}
.file:hover .file__thumb,
.file:focus-visible .file__thumb {
  box-shadow: 0 0 0 2px #e9744a;
}
.file__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.file__play {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 38px;
  height: 38px;
  margin: -19px 0 0 -19px;
  border-radius: 50%;
  background: rgba(31, 29, 26, 0.85);
}
.file__play::after {
  content: "";
  position: absolute;
  left: 15px;
  top: 12px;
  border-left: 12px solid #fbf9f5;
  border-top: 7px solid transparent;
  border-bottom: 7px solid transparent;
}
.file__name {
  font:
    400 12px/1.3 "JetBrains Mono",
    ui-monospace,
    monospace;
  color: #1f1d1a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file__kind {
  font-size: 13px;
  color: #7a7369;
  margin-top: -3px;
}

@media (max-width: 760px) {
  .mail__files {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.viewer {
  width: min(1180px, 94vw);
  max-width: none;
  padding: 0;
  border: 0;
  border-radius: 16px;
  background: #13110f;
  overflow: hidden;
}
.viewer::backdrop {
  background: rgba(19, 17, 15, 0.82);
  backdrop-filter: blur(4px);
}
.viewer__inner img,
.viewer__inner video {
  display: block;
  width: 100%;
  height: auto;
  background: #fbf9f5;
}
.viewer__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  font:
    400 13px/1 "JetBrains Mono",
    ui-monospace,
    monospace;
  color: #b5ada2;
}
.viewer__bar button {
  font:
    600 14px/1 "Plus Jakarta Sans Variable",
    system-ui,
    sans-serif;
  padding: 10px 16px;
  border-radius: 9px;
  border: 0;
  background: #e9744a;
  color: #1f1d1a;
  cursor: pointer;
}
</style>
