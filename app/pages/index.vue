<script setup lang="ts">
useSeoMeta({
  title: 'Messenger JSON Viewer',
  description: 'View your Facebook Messenger export locally. All data is temporary and auto-deleted after 1 hour.'
})

const { setSession, sessionId, expiresAt, restoreSession } = useSession()
const router = useRouter()

const isBlobMode = ref(false)
const isPreloading = ref(false)
const preloadError = ref<string | null>(null)

onMounted(async () => {
  restoreSession()
  if (sessionId.value && expiresAt.value && Date.now() < expiresAt.value) {
    router.push(`/sessions/${sessionId.value}`)
    return
  }

  // Check if a blob zip is configured server-side
  isPreloading.value = true
  try {
    const preload = await $fetch<{
      configured: boolean
      sessionId?: string
      expiresAt?: number
      threadCount?: number
    }>('/api/preload')

    if (preload.configured && preload.sessionId) {
      isBlobMode.value = true
      isPreloading.value = false
      setSession({
        sessionId: preload.sessionId,
        expiresAt: preload.expiresAt!,
        threadCount: preload.threadCount!
      })
      await router.push(`/sessions/${preload.sessionId}`)
    } else {
      isPreloading.value = false
    }
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }, message?: string }
    const msg = e?.data?.statusMessage ?? e?.message ?? 'Failed to load blob session'
    preloadError.value = msg
    isPreloading.value = false
  }
})

async function onUploaded(sid: string, exp: number, threadCount: number) {
  setSession({ sessionId: sid, expiresAt: exp, threadCount })
  await router.push(`/sessions/${sid}`)
}
</script>

<template>
  <div class="min-h-[70vh] flex flex-col items-center justify-center gap-10 py-16 px-4">
    <!-- Blob preload loading state -->
    <template v-if="isBlobMode || isPreloading">
      <div class="flex flex-col items-center gap-4">
        <UIcon
          name="i-lucide-loader-circle"
          class="w-14 h-14 text-primary animate-spin"
        />
        <p class="text-muted text-base">
          Loading your messages from storage…
        </p>
      </div>
    </template>

    <!-- Normal upload mode -->
    <template v-else>
      <div class="text-center max-w-xl">
        <UIcon
          name="i-lucide-message-circle"
          class="w-14 h-14 text-primary mx-auto mb-4"
        />
        <h1 class="text-3xl font-bold text-highlighted mb-2">
          Messenger JSON Viewer
        </h1>
        <p class="text-muted text-base leading-relaxed">
          Upload your Facebook Messenger export (.zip) to browse your conversations.
          Your data stays on <strong>this server only</strong> and is automatically deleted after <strong>1 hour</strong>.
        </p>
      </div>

      <UAlert
        v-if="preloadError"
        class="max-w-xl w-full"
        color="error"
        variant="subtle"
        :title="preloadError"
        icon="i-lucide-alert-circle"
      />

      <UploadZone @uploaded="onUploaded" />

      <p class="text-xs text-muted max-w-md text-center leading-relaxed">
        🔒 <strong>Privacy:</strong> Your data never leaves this server and is never stored permanently.
        No account required. All files are deleted automatically after 1 hour.
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl w-full">
        <div class="text-center">
          <UIcon
            name="i-lucide-upload"
            class="w-8 h-8 text-primary mx-auto mb-2"
          />
          <p class="font-semibold text-sm text-highlighted">
            1. Upload
          </p>
          <p class="text-xs text-muted mt-1">
            Drop your Facebook export zip file
          </p>
        </div>
        <div class="text-center">
          <UIcon
            name="i-lucide-list"
            class="w-8 h-8 text-primary mx-auto mb-2"
          />
          <p class="font-semibold text-sm text-highlighted">
            2. Browse Threads
          </p>
          <p class="text-xs text-muted mt-1">
            Search and filter your conversations
          </p>
        </div>
        <div class="text-center">
          <UIcon
            name="i-lucide-message-square"
            class="w-8 h-8 text-primary mx-auto mb-2"
          />
          <p class="font-semibold text-sm text-highlighted">
            3. Read Chats
          </p>
          <p class="text-xs text-muted mt-1">
            View messages with media and reactions
          </p>
        </div>
      </div>
    </template>
  </div>
</template>
