<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), { label: 'DJANGO VS. FASTAPI' })
</script>

<template>
  <footer class="deck-footer" aria-hidden="true">
    <span>{{ label }}</span>
    <span class="deck-footer__number">{{ $slidev.nav.currentPage }}</span>
  </footer>
</template>
