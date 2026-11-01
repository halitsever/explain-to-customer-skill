<script setup lang="ts">
import { computed, ref } from "vue";
import { withBase } from "vitepress";
import { data as styles } from "../styles.data";

const FAMILIES = ["Modern SaaS", "Clean & friendly", "Bold & creative", "Extended"];
const selectedId = ref("shadcn");
const selected = computed(() => styles.find((s) => s.id === selectedId.value) ?? styles[0]);
const groups = computed(() => FAMILIES.map((family) => ({ family, items: styles.filter((s) => s.family === family) })));
const src = (id: string) => withBase(`/media/styles/${id}.webp`);

const warmed = new Set<string>();
function warm(id: string) {
  if (warmed.has(id) || typeof window === "undefined") return;
  warmed.add(id);
  const img = new Image();
  img.src = src(id);
}
</script>

<template>
  <div class="switch">
    <div class="switch__picker">
      <div v-for="g in groups" :key="g.family" class="fam" role="group" :aria-label="g.family">
        <h3 class="fam__name">{{ g.family }}</h3>
        <div class="fam__chips">
          <button
            v-for="s in g.items"
            :key="s.id"
            type="button"
            class="chip"
            :aria-pressed="s.id === selectedId"
            @click="selectedId = s.id"
            @pointerenter="warm(s.id)"
            @focus="warm(s.id)"
          >
            <span class="chip__sw" aria-hidden="true">
              <i v-for="(c, n) in s.swatch" :key="n" :style="{ background: c }"></i>
            </span>
            {{ s.name }}
          </button>
        </div>
      </div>
    </div>

    <div class="switch__view">
      <div class="shot">
        <Transition name="xfade">
          <img :key="selected.id" :src="src(selected.id)" :alt="`The same summary card rendered in the ${selected.name} style`" width="1280" height="720" decoding="async" />
        </Transition>
      </div>
      <div class="meta">
        <div class="meta__head">
          <h3>{{ selected.name }}</h3>
          <code>style={{ selected.id }}</code>
        </div>
        <p>{{ selected.description }}</p>
        <p class="meta__best">Best for {{ selected.bestFor.charAt(0).toLowerCase() + selected.bestFor.slice(1) }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.switch {
  display: grid;
  grid-template-columns: minmax(250px, 340px) minmax(0, 1fr);
  gap: 56px;
  align-items: start;
}

.fam + .fam {
  margin-top: 26px;
}
.fam__name {
  margin: 0 0 10px;
  font:
    700 14px/1.2 "Plus Jakarta Sans Variable",
    system-ui,
    sans-serif;
  color: #5e5850;
}
.fam__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 8px 13px 8px 9px;
  border-radius: 999px;
  border: 1px solid #ddd5c9;
  background: #fffdf9;
  color: #1f1d1a;
  font:
    600 14px/1 "Plus Jakarta Sans Variable",
    system-ui,
    sans-serif;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.chip:hover {
  border-color: #b5ada2;
}
.chip[aria-pressed="true"] {
  background: #1f1d1a;
  border-color: #1f1d1a;
  color: #fbf9f5;
}
.chip__sw {
  display: inline-flex;
  gap: 2px;
}
.chip__sw i {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  box-shadow: inset 0 0 0 1px rgba(31, 29, 26, 0.18);
}

.shot {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 18px;
  overflow: hidden;
  background: #efeae2;
  box-shadow:
    0 0 0 1px rgba(31, 29, 26, 0.08),
    0 40px 70px -40px rgba(31, 29, 26, 0.45);
}
.shot img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.xfade-enter-active,
.xfade-leave-active {
  transition: opacity 0.35s ease;
}
.xfade-enter-from,
.xfade-leave-to {
  opacity: 0;
}

.meta {
  margin-top: 22px;
  max-width: 62ch;
}
.meta__head {
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex-wrap: wrap;
}
.meta h3 {
  margin: 0;
  font:
    800 26px/1.15 "Plus Jakarta Sans Variable",
    system-ui,
    sans-serif;
  letter-spacing: -0.03em;
  color: #1f1d1a;
}
.meta code {
  font:
    400 14px/1 "JetBrains Mono",
    ui-monospace,
    monospace;
  color: #a8462a;
}
.meta p {
  margin: 10px 0 0;
  font-size: 17px;
  line-height: 1.6;
  color: #3d3832;
}
.meta .meta__best {
  color: #5e5850;
}

@media (max-width: 960px) {
  .switch {
    grid-template-columns: minmax(0, 1fr);
    gap: 28px;
  }
  .switch__view {
    order: -1;
  }
  .fam__chips {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: none;
  }
  .chip {
    flex: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .xfade-enter-active,
  .xfade-leave-active {
    transition: none;
  }
}
</style>
