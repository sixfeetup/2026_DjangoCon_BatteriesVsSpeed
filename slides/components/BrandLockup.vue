<script setup lang="ts">
withDefaults(defineProps<{ size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })
</script>

<template>
  <div class="brand-lockup" :class="`brand-lockup--${size}`" aria-label="Presented by Six Feet Up and REVSYS">
    <img src="/brands/sixfeetup-transparent_black_notagline.png" alt="Six Feet Up">
    <span class="brand-lockup__divider" aria-hidden="true" />
    <img src="/brands/revsys.svg" alt="REVSYS">
  </div>
</template>
