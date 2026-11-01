<script setup>
import { withBase } from 'vitepress'
import { data as styles } from '../.vitepress/theme/styles.data'
const families = ['Modern SaaS', 'Clean & friendly', 'Bold & creative', 'Extended']
</script>

# Styles

Every style below rendered the same storyboard. Pass one with `style=<id>`, or pick a family in the questions and then the exact style.

Styles are inspired by public design languages. They use open fonts only and include no logos, trademarks or product screenshots. Contrast is checked against WCAG AA before anything renders, and colours that fail are nudged until they pass.

## Match my project

`style=match` builds a style from your repo: shadcn and Tailwind CSS variables (including `@theme` and oklch values), `tailwind.config`, MUI, Chakra and Mantine themes, design-token files, `next/font` and Google Fonts, dark or light default, and a logo found in the repo. The skill tells you which values it detected and which it guessed.

You can also pass brand colours, `style=#E11D48,#0EA5E9`, or a website to match, `style=https://example.com`.

<template v-for="fam in families" :key="fam">
  <h2 :id="fam.toLowerCase().replace(/[^a-z]+/g, '-')">{{ fam }}</h2>
  <div class="style-grid">
    <figure v-for="s in styles.filter((x) => x.family === fam)" :key="s.id" class="style-card">
      <img :src="withBase(`/media/styles/${s.id}.webp`)" :alt="`Summary card in the ${s.name} style`" loading="lazy" width="1280" height="720" />
      <figcaption>
        <strong>{{ s.name }}</strong> <code>style={{ s.id }}</code>
        <span>{{ s.description }}</span>
      </figcaption>
    </figure>
  </div>
</template>

<style scoped>
.style-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 24px;
  margin: 20px 0 8px;
}
.style-card {
  margin: 0;
}
.style-card img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 12px;
  box-shadow: 0 0 0 1px var(--vp-c-divider);
}
.style-card figcaption {
  margin-top: 10px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}
.style-card strong {
  color: var(--vp-c-text-1);
}
.style-card span {
  display: block;
  margin-top: 4px;
}
</style>
