<script setup lang="ts">
useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

useSeoMeta({
  title: 'Messenger JSON Viewer',
  description: 'Browse your Facebook Messenger export locally. Data is temporary and auto-deleted after 1 hour.',
  ogTitle: 'Messenger JSON Viewer',
  ogDescription: 'Browse your Facebook Messenger export locally. Data is temporary and auto-deleted after 1 hour.',
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <UApp>
    <UHeader>
      <template #left>
        <NuxtLink
          to="/"
          class="flex items-center gap-2 font-semibold text-highlighted"
        >
          <UIcon
            name="i-lucide-message-circle"
            class="w-5 h-5 text-primary"
          />
          Messenger Viewer
        </NuxtLink>
      </template>

      <template #right>
        <UColorModeButton />
        <UButton
          to="https://github.com/YutaInouePH/messenger-json-viewer"
          target="_blank"
          icon="i-simple-icons-github"
          aria-label="GitHub"
          color="neutral"
          variant="ghost"
        />
      </template>
    </UHeader>

    <UMain>
      <NuxtPage />
    </UMain>

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">
          Messenger JSON Viewer • Data is temporary and auto-deleted after 1 hour
        </p>
      </template>
    </UFooter>
  </UApp>
</template>
