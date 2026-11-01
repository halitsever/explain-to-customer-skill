<script setup lang="ts">
import { withBase } from "vitepress";
import HeroStage from "./HeroStage.vue";
import StyleSwitcher from "./StyleSwitcher.vue";
import Inbox from "./Inbox.vue";
import CopyCommand from "./CopyCommand.vue";

const INSTALL = "npx skills add halitsever/explain-to-customer -g -a claude-code";
const INSTALL_SHORT = "npx skills add halitsever/explain-to-customer";
const REPO = "https://github.com/halitsever/explain-to-customer";

const steps = [
  { title: "Finds the change", text: "Your branch since it left main, your uncommitted work, or the last commit. A commit range, a PR or a sentence works too." },
  { title: "Asks four questions", text: "What to make, where to save it, which style, and whether to screenshot your running app. Your last answers are remembered." },
  { title: "Writes the story", text: "Claude reads the diff and the code around it, quotes your real button labels and error messages, and drafts the scenes and the message." },
  { title: "Waits for your approval", text: "You see the storyboard first. Render it, make it shorter, add detail or switch the style." },
  { title: "Renders on your machine", text: "Screenshots with numbered callouts, then the video, slides and diagrams. Nothing is uploaded." },
  { title: "Checks every frame", text: "Clipped text, contrast, missing letters, blank frames, leftover placeholders and leaked secrets get fixed before you see them." },
  { title: "Hands you a folder", text: "Video, slides, diagrams and a message ready to paste into email or WhatsApp." },
];
</script>

<template>
  <div class="L">
    <a class="skip" href="#main">Skip to content</a>

    <header class="top">
      <a class="brand" :href="withBase('/')" aria-label="explain-to-customer home">
        <img :src="withBase('/brand/logo-mark-dark.svg')" alt="" width="34" height="34" />
        <span class="wordmark">explain<i></i>to<i></i>customer</span>
      </a>
      <nav class="top__nav" aria-label="Main">
        <a :href="withBase('/guide/getting-started')">Guide</a>
        <a href="#styles">Styles</a>
        <a :href="REPO" class="top__gh">GitHub</a>
      </nav>
    </header>

    <main id="main">
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero__copy">
          <h1 id="hero-title">Your client doesn’t read diffs.</h1>
          <p class="hero__lead">
            explain-to-customer is a Claude Code skill that turns your change into a short video, a few slides, a diagram and a message they will actually read. One command,
            rendered on your machine.
          </p>
          <div class="hero__cta">
            <CopyCommand :command="INSTALL_SHORT" />
            <a class="link-arrowless" :href="withBase('/guide/getting-started')">Read the guide</a>
          </div>
        </div>
        <HeroStage />
      </section>

      <div class="sheet">
        <section id="styles" class="block" aria-labelledby="styles-title">
          <div class="block__head">
            <h2 id="styles-title">One storyboard, twenty-one looks.</h2>
            <p>
              Pick a style per client. The scenes stay the same and only the look changes. Or let it match your project: your own colours, fonts, radius and logo, read straight
              from the repo.
            </p>
          </div>
          <StyleSwitcher />
        </section>

        <section class="block inbox" aria-labelledby="inbox-title">
          <div class="inbox__text">
            <h2 id="inbox-title">What lands in your client’s inbox</h2>
            <p>Everything is written for the person paying for the work, in their language, with your product's real wording. You review it, then send it.</p>
            <dl class="outputs">
              <div>
                <dt>Video</dt>
                <dd>30 to 60 seconds with captions, 1080p, small enough to attach to an email.</dd>
              </div>
              <div>
                <dt>Slides</dt>
                <dd>Three to five images. The first one tells the whole story on its own.</dd>
              </div>
              <div>
                <dt>Diagrams</dt>
                <dd>Flows and sequences as SVG and PNG, with the editable Mermaid source.</dd>
              </div>
              <div>
                <dt>Message</dt>
                <dd>A short note that says what changed and what they need to do, often nothing.</dd>
              </div>
            </dl>
          </div>
          <Inbox />
        </section>
      </div>

      <section class="block block--dark steps" aria-labelledby="steps-title">
        <div class="steps__head">
          <h2 id="steps-title">How a run goes</h2>
          <p>Type <code>/explain-to-customer</code> in Claude Code. The skill runs these steps and stops once, to show you the storyboard.</p>
        </div>
        <ol class="steps__list">
          <li v-for="(s, n) in steps" :key="s.title">
            <span class="steps__num" aria-hidden="true">{{ n + 1 }}</span>
            <div>
              <h3>{{ s.title }}</h3>
              <p>{{ s.text }}</p>
            </div>
          </li>
        </ol>
      </section>

      <section class="block block--dark guard" aria-labelledby="guard-title">
        <h2 id="guard-title">Honest by default</h2>
        <div class="guard__cols">
          <div>
            <h3>Stays off the screen</h3>
            <ul>
              <li>Secrets, API keys and tokens</li>
              <li>Internal URLs, hostnames and stack traces</li>
              <li>Real customer data and other clients’ names</li>
              <li>Features, numbers or dates nobody built</li>
            </ul>
          </div>
          <div>
            <h3>Checked before you see it</h3>
            <ul>
              <li>Text that clips or runs off the frame</li>
              <li>Contrast below WCAG AA</li>
              <li>Fonts that failed to load and missing accents</li>
              <li>Blank frames and leftover placeholders</li>
            </ul>
          </div>
        </div>
      </section>

      <section class="block block--dark install" aria-labelledby="install-title">
        <h2 id="install-title">Install it once</h2>
        <p>
          Then type <code>/explain-to-customer</code> in any project. The first run asks before it downloads the rendering tools, about 250 MB, into a cache folder outside your
          project.
        </p>
        <CopyCommand :command="INSTALL" />
        <p class="install__req">Needs Claude Code, Node.js 22 or newer and FFmpeg. Works on macOS, Windows, Linux and WSL.</p>
        <p class="install__more">
          <a :href="withBase('/guide/getting-started')">Installation guide</a>
          <a :href="withBase('/guide/usage')">Every argument</a>
          <a :href="withBase('/guide/styles')">All 21 styles</a>
        </p>
      </section>
    </main>

    <footer class="foot">
      <a class="brand brand--small" :href="withBase('/')">
        <img :src="withBase('/brand/logo-mark-dark.svg')" alt="" width="24" height="24" />
        <span class="wordmark">explain<i></i>to<i></i>customer</span>
      </a>
      <nav aria-label="Footer">
        <a :href="withBase('/guide/getting-started')">Guide</a>
        <a :href="REPO">GitHub</a>
        <a href="https://www.skills.sh/halitsever/explain-to-customer/explain-to-customer">skills.sh</a>
        <a :href="`${REPO}/blob/main/LICENSE`">MIT License</a>
      </nav>
    </footer>
  </div>
</template>

<style scoped>
.L {
  --ink: #1f1d1a;
  --ink-deep: #13110f;
  --paper: #fbf9f5;
  --ember: #e9744a;
  --ember-text: #a8462a;
  --stone: #b5ada2;
  --stone-deep: #5e5850;
  --sans: "Plus Jakarta Sans Variable", ui-sans-serif, system-ui, sans-serif;
  --mono: "JetBrains Mono", ui-monospace, monospace;
  --gutter: clamp(20px, 5vw, 72px);

  position: relative;
  min-height: 100vh;
  background: var(--ink);
  color: #f3efe8;
  font-family: var(--sans);
  overflow-x: clip;
}
.L::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.07;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

.skip {
  position: absolute;
  left: 12px;
  top: -60px;
  z-index: 10;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--ember);
  color: var(--ink);
  font-weight: 700;
}
.skip:focus {
  top: 12px;
}

.top {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 22px var(--gutter);
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: inherit;
  text-decoration: none;
}
.wordmark {
  font: 800 19px/1 var(--sans);
  letter-spacing: -0.04em;
  white-space: nowrap;
}
.wordmark i {
  display: inline-block;
  width: 0.2em;
  height: 0.2em;
  margin: 0 0.06em;
  background: var(--ember);
  vertical-align: 0.24em;
}
.top__nav {
  display: flex;
  gap: 28px;
  font-size: 15px;
  font-weight: 600;
}
.top__nav a,
.foot a {
  color: #d9d2c7;
  text-decoration: none;
}
.top__nav a:hover,
.foot a:hover {
  color: #fff;
}

.hero {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  gap: 48px 64px;
  align-items: center;
  padding: clamp(32px, 5vw, 64px) var(--gutter) 0;
  max-width: 1440px;
  margin: 0 auto;
}
.hero h1 {
  margin: 0;
  max-width: 9.5ch;
  font: 800 clamp(48px, 6vw, 96px) / 0.95 var(--sans);
  letter-spacing: -0.05em;
  color: #fbf9f5;
  text-wrap: balance;
}
.hero__lead {
  margin: 28px 0 0;
  max-width: 50ch;
  font-size: clamp(17px, 1.4vw, 20px);
  line-height: 1.6;
  color: var(--stone);
}
.hero__cta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px 28px;
  margin-top: 36px;
}
.hero__cta > :first-child {
  width: 100%;
  font-size: 14px;
}
.link-arrowless {
  color: #fbf9f5;
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: var(--ember);
  text-decoration-thickness: 2px;
  text-underline-offset: 5px;
}

.sheet {
  position: relative;
  z-index: 2;
  margin-top: clamp(80px, 12vw, 160px);
  background: var(--paper);
  color: var(--ink);
  border-radius: 40px;
  box-shadow: 0 -30px 80px -40px rgba(0, 0, 0, 0.6);
}

.block {
  max-width: 1400px;
  margin: 0 auto;
  padding: clamp(64px, 9vw, 120px) var(--gutter);
}
.block h2 {
  margin: 0;
  font: 800 clamp(34px, 4.6vw, 64px) / 1.02 var(--sans);
  letter-spacing: -0.045em;
  text-wrap: balance;
}
.block__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px 64px;
  align-items: end;
  margin-bottom: 56px;
}
.block__head p,
.inbox__text > p {
  margin: 0;
  max-width: 56ch;
  font-size: 18px;
  line-height: 1.6;
  color: #3d3832;
}

.inbox {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 64px;
  align-items: start;
  padding-top: 0;
}
.inbox__text h2 {
  margin-bottom: 22px;
}
.outputs {
  margin: 34px 0 0;
}
.outputs div {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 16px;
  padding: 16px 0;
  border-top: 1px solid #e4ddd2;
}
.outputs dt {
  font-weight: 800;
}
.outputs dd {
  margin: 0;
  line-height: 1.55;
  color: #3d3832;
}

.block--dark {
  position: relative;
  z-index: 1;
  color: #f3efe8;
}
.block--dark p {
  color: var(--stone);
}
.block--dark code,
.block__head code {
  font: 400 0.92em var(--mono);
  color: #f4a585;
}

.steps {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 64px;
}
.steps__head {
  position: sticky;
  top: 40px;
  align-self: start;
}
.steps__head p {
  margin: 22px 0 0;
  max-width: 44ch;
  font-size: 18px;
  line-height: 1.6;
}
.steps__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.steps__list li {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 8px;
  padding: 26px 0;
  border-top: 1px solid #34302b;
}
.steps__num {
  font: 800 30px/1 var(--sans);
  color: var(--ember);
  letter-spacing: -0.04em;
}
.steps__list h3 {
  margin: 0;
  font: 800 22px/1.25 var(--sans);
  letter-spacing: -0.02em;
}
.steps__list p {
  margin: 8px 0 0;
  max-width: 60ch;
  font-size: 17px;
  line-height: 1.6;
}

.guard {
  padding-top: 0;
}
.guard__cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px 64px;
  margin-top: 40px;
}
.guard h3 {
  margin: 0 0 14px;
  font: 700 18px/1.3 var(--sans);
  color: #fbf9f5;
}
.guard ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.guard li {
  padding: 14px 0 14px 28px;
  border-top: 1px solid #34302b;
  font-size: 17px;
  color: #d9d2c7;
  position: relative;
}
.guard li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 22px;
  width: 9px;
  height: 9px;
  background: var(--ember);
}

.install {
  padding-top: 0;
}
.install > * {
  max-width: 820px;
}
.install > p {
  margin: 20px 0 28px;
  max-width: 62ch;
  font-size: 18px;
  line-height: 1.6;
}
.install .install__req {
  margin-top: 20px;
  font-size: 15px;
}
.install__more {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 28px;
}
.install__more a {
  color: #fbf9f5;
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: var(--ember);
  text-decoration-thickness: 2px;
  text-underline-offset: 5px;
}

.foot {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 36px var(--gutter) 48px;
  border-top: 1px solid #34302b;
}
.brand--small .wordmark {
  font-size: 16px;
}
.foot nav {
  display: flex;
  flex-wrap: wrap;
  gap: 22px;
  font-size: 15px;
}

a:focus-visible,
button:focus-visible {
  outline: 2px solid var(--ember);
  outline-offset: 3px;
  border-radius: 6px;
}

@media (max-width: 960px) {
  .top__nav {
    gap: 18px;
  }
  .top__gh {
    display: none;
  }
  .hero,
  .block__head,
  .inbox,
  .steps,
  .guard__cols {
    grid-template-columns: minmax(0, 1fr);
  }
  .steps__head {
    position: static;
  }
  .sheet {
    border-radius: 28px;
  }
}

@media (max-width: 560px) {
  .wordmark {
    font-size: 16px;
  }
  .top__nav a[href="#styles"] {
    display: none;
  }
}
</style>
