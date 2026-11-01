<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
import { useData } from "vitepress";
import Landing from "./components/Landing.vue";

const { frontmatter } = useData();
</script>

<template>
  <Landing v-if="frontmatter.landing" />
  <DefaultTheme.Layout v-else />
</template>
