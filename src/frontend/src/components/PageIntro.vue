<script setup lang="ts">
defineProps<{ eyebrow?: string; title: string; description: string }>();
</script>

<template>
  <section class="page-intro">
    <div v-if="eyebrow" class="intro-eyebrow">{{ eyebrow }}</div>
    <h1>{{ title }}</h1>
    <p>{{ description }}</p>
  </section>
</template>

<style scoped>
.page-intro { margin-bottom: 26px; }
.intro-eyebrow { color: var(--accent); margin-bottom: 5px; }
h1 { margin: 0 0 8px; font: 700 clamp(29px,3.2vw,47px)/1.18 var(--title-font); letter-spacing: -.035em; }
p { margin: 0; color: var(--muted); font-size: 13px; }
</style>
