<script setup lang="ts">
import type { Message } from '../../../types'

const route = useRoute()
const router = useRouter()
const id = route.params.id as string
const threadId = route.params.threadId as string

const { expiresAt, fetchMessages, mediaUrl, deleteCurrentSession, sessionId } = useSession()

const messages = ref<Message[]>([])
const threadName = ref('')
const participants = ref<string[]>([])
const loading = ref(true)
const loadingMore = ref(false)
const error = ref<string | null>(null)
const currentPage = ref(1)
const totalPages = ref(1)
const totalMessages = ref(0)

const chatContainer = ref<HTMLElement | null>(null)

// Determine "own" sender: the first participant not in the thread name (heuristic)
// We'll treat the last participant as "self" as a simple heuristic
const selfName = computed(() => participants.value.at(-1) ?? '')

onMounted(() => {
  loadMessages(1)
})

async function loadMessages(page: number) {
  if (page === 1) loading.value = true
  else loadingMore.value = true

  error.value = null
  try {
    const result = await fetchMessages(threadId, page)
    if (page === 1) {
      messages.value = result.messages
    } else {
      // Prepend older messages
      messages.value = [...result.messages, ...messages.value]
    }
    threadName.value = result.threadName
    participants.value = result.participants
    totalPages.value = result.totalPages
    totalMessages.value = result.totalMessages
    currentPage.value = page

    if (page === 1) {
      await nextTick()
      scrollToBottom()
    }
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string, status?: number }, status?: number }
    if (e?.data?.status === 410 || e?.status === 410) {
      error.value = 'Session expired. Please re-upload your export.'
    } else {
      error.value = 'Failed to load messages.'
    }
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function scrollToBottom() {
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
}

async function loadOlderMessages() {
  if (currentPage.value < totalPages.value && !loadingMore.value) {
    await loadMessages(currentPage.value + 1)
  }
}

async function handleReupload() {
  await deleteCurrentSession()
  router.push('/')
}

// Group messages by date for date separators
interface MessageGroup {
  date: string
  messages: Message[]
}

const groupedMessages = computed<MessageGroup[]>(() => {
  const groups: MessageGroup[] = []
  let lastDate = ''
  for (const msg of messages.value) {
    const date = new Date(msg.timestamp).toLocaleDateString([], {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    })
    if (date !== lastDate) {
      groups.push({ date, messages: [] })
      lastDate = date
    }
    groups.at(-1)!.messages.push(msg)
  }
  return groups
})

useSeoMeta({ title: computed(() => threadName.value || 'Chat') })
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-4rem)]">
    <!-- Header -->
    <div class="border-b border-default px-4 py-3 flex items-center gap-3 shrink-0">
      <UButton
        icon="i-lucide-arrow-left"
        variant="ghost"
        color="neutral"
        size="sm"
        :to="`/sessions/${id}`"
      />
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-highlighted truncate">
          {{ threadName || 'Loading…' }}
        </p>
        <p class="text-xs text-muted truncate">
          {{ participants.join(', ') }}
        </p>
      </div>
      <p class="text-xs text-muted shrink-0">
        {{ totalMessages.toLocaleString() }} messages
      </p>
      <UButton
        icon="i-lucide-file-down"
        variant="ghost"
        color="neutral"
        size="sm"
        :href="`/api/sessions/${sessionId}/threads/${threadId}/pdf`"
        target="_blank"
        title="Export as PDF"
      />
    </div>

    <!-- Session banner -->
    <div
      v-if="expiresAt"
      class="px-4 pt-2 shrink-0"
    >
      <SessionBanner
        :expires-at="expiresAt"
        @reupload="handleReupload"
      />
    </div>

    <!-- Error -->
    <UAlert
      v-if="error"
      class="m-4"
      color="error"
      variant="subtle"
      :title="error"
      icon="i-lucide-alert-circle"
    />

    <!-- Messages area -->
    <div
      ref="chatContainer"
      class="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3"
    >
      <!-- Load more -->
      <div
        v-if="currentPage < totalPages"
        class="text-center"
      >
        <UButton
          size="xs"
          color="neutral"
          variant="subtle"
          :loading="loadingMore"
          @click="loadOlderMessages"
        >
          Load older messages
        </UButton>
      </div>

      <template v-if="loading">
        <div
          v-for="i in 8"
          :key="i"
          class="flex gap-2"
          :class="i % 3 === 0 ? 'justify-end' : ''"
        >
          <USkeleton
            class="h-12 rounded-2xl"
            :class="i % 3 === 0 ? 'w-48' : 'w-64'"
          />
        </div>
      </template>

      <template v-else>
        <template
          v-for="group in groupedMessages"
          :key="group.date"
        >
          <!-- Date separator -->
          <div class="flex items-center gap-3 my-2">
            <USeparator class="flex-1" />
            <span class="text-xs text-muted whitespace-nowrap">{{ group.date }}</span>
            <USeparator class="flex-1" />
          </div>

          <!-- Messages in this date group -->
          <MessageBubble
            v-for="msg in group.messages"
            :key="msg.id"
            :message="msg"
            :is-own="msg.senderName === selfName"
            :media-url="mediaUrl"
          />
        </template>
      </template>
    </div>
  </div>
</template>
