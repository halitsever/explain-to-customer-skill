import DefaultTheme from "vitepress/theme";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "./custom.css";
import Layout from "./Layout.vue";

export default {
  extends: DefaultTheme,
  Layout,
};
