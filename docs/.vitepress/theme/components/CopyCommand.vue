<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{ command: string; tone?: "dark" | "paper" }>();
const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

async function copy() {
  try {
    await navigator.clipboard.writeText(props.command);
  } catch {
    // Older browsers without the async clipboard API: select the text so the user can copy it by hand.
    const range = document.createRange();
    const el = document.getElementById(`cmd-${props.command.length}`);
    if (el) {
      range.selectNodeContents(el);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    }
    return;
  }
  copied.value = true;
  clearTimeout(timer);
  timer = setTimeout(() => (copied.value = false), 2000);
}
</script>

<template>
  <div class="cmd" :class="tone === 'paper' ? 'cmd--paper' : 'cmd--dark'">
    <code :id="`cmd-${command.length}`" class="cmd__text"><span class="cmd__prompt" aria-hidden="true">$</span>{{ command }}</code>
    <button type="button" class="cmd__btn" @click="copy">{{ copied ? "Copied" : "Copy" }}</button>
    <span class="sr-only" aria-live="polite">{{ copied ? "Command copied to clipboard" : "" }}</span>
  </div>
</template>

<style scoped>
.cmd {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 100%;
  padding: 8px 8px 8px 18px;
  border-radius: 14px;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 15px;
}
.cmd--dark {
  background: #13110f;
  color: #f3efe8;
  box-shadow: inset 0 0 0 1px #3a352f;
}
.cmd--paper {
  background: #fffdf9;
  color: #1f1d1a;
  box-shadow: inset 0 0 0 1px #ddd5c9;
}
.cmd__text {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  white-space: nowrap;
  scrollbar-width: none;
  padding: 6px 0;
}
.cmd__text::-webkit-scrollbar {
  display: none;
}
.cmd__prompt {
  color: #e9744a;
  margin-right: 12px;
  user-select: none;
}
.cmd__btn {
  flex: none;
  font:
    600 14px/1 "Plus Jakarta Sans Variable",
    system-ui,
    sans-serif;
  padding: 11px 16px;
  border-radius: 9px;
  border: 0;
  cursor: pointer;
  background: #e9744a;
  color: #1f1d1a;
  transition: background 0.15s;
}
.cmd__btn:hover {
  background: #f08a63;
}
.cmd--paper .cmd__btn {
  background: #1f1d1a;
  color: #fbf9f5;
}
.cmd--paper .cmd__btn:hover {
  background: #3a352f;
}
@media (max-width: 560px) {
  .cmd__text {
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.5;
  }
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
