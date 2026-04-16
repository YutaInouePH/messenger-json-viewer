<script setup lang="ts">
import type { ThreadSummary } from '../../types'

const route = useRoute()
const router = useRouter()
const id = route.params.id as string

const { expiresAt, fetchThreads, deleteCurrentSession, restoreSession } = useSession()

const search = ref('')
const threads = ref<ThreadSummary[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(() => {
  restoreSession()
  loadThreads()
})

async function loadThreads() {
  loading.value = true
  error.value = null
  try {
    threads.value = await fetchThreads(search.value)
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string, status?: number }, status?: number }
    if (e?.data?.status === 410 || e?.status === 410) {
      error.value = 'Session expired. Please re-upload your export.'
    } else if (e?.data?.status === 404 || e?.status === 404) {
      error.value = 'Session not found. Please re-upload your export.'
    } else {
      error.value = 'Failed to load threads.'
    }
  } finally {
    loading.value = false
  }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(loadThreads, 300)
})

async function handleReupload() {
  await deleteCurrentSession()
  router.push('/')
}

function formatDate(ts: number) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
    <!-- Session banner -->
    <SessionBanner
      v-if="expiresAt"
      :expires-at="expiresAt"
      @reupload="handleReupload"
    />

    <!-- Header -->
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-xl font-bold text-highlighted">
        Conversations
      </h1>
      <UButton
        icon="i-lucide-trash-2"
        size="xs"
        color="neutral"
        variant="ghost"
        @click="handleReupload"
      >
        Delete & Re-upload
      </UButton>
    </div>

    <!-- Search -->
    <UInput
      v-model="search"
      placeholder="Search by name or participant…"
      icon="i-lucide-search"
      :loading="loading"
    />

    <!-- Error -->
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="error"
      icon="i-lucide-alert-circle"
    >
      <template #description>
        <UButton
          size="xs"
          color="error"
          variant="link"
          @click="handleReupload"
        >
          Re-upload
        </UButton>
      </template>
    </UAlert>

    <!-- Thread list -->
    <div
      v-if="!error"
      class="flex flex-col gap-2"
    >
      <template v-if="loading">
        <USkeleton
          v-for="i in 5"
          :key="i"
          class="h-16 rounded-xl"
        />
      </template>

      <p
        v-else-if="threads.length === 0"
        class="text-center text-muted py-8"
      >
        No conversations found.
      </p>

      <NuxtLink
        v-for="thread in threads"
        :key="thread.id"
        :to="`/sessions/${id}/threads/${thread.id}`"
        class="flex items-center gap-3 p-3 rounded-xl hover:bg-elevated transition-colors cursor-pointer border border-default"
      >
        <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <UIcon
            name="i-lucide-message-circle"
            class="w-5 h-5 text-primary"
          />
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-highlighted truncate">
            {{ thread.threadName }}
          </p>
          <p class="text-xs text-muted truncate">
            {{ thread.participants.join(', ') }}
          </p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-xs text-muted">
            {{ formatDate(thread.lastMessageAt) }}
          </p>
          <p class="text-xs text-muted">
            {{ thread.messageCount.toLocaleString() }} msgs
          </p>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
