<script setup lang="ts">
import type { Message, MediaAsset } from '../types'

defineProps<{
  message: Message
  isOwn: boolean
  mediaUrl: (uri: string) => string
}>()

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function isImage(asset: MediaAsset) {
  return asset.mimeType.startsWith('image/')
}

function isVideo(asset: MediaAsset) {
  return asset.mimeType.startsWith('video/')
}

function isAudio(asset: MediaAsset) {
  return asset.mimeType.startsWith('audio/')
}
</script>

<template>
  <div
    class="flex gap-2 max-w-[80%]"
    :class="isOwn ? 'ml-auto flex-row-reverse' : 'mr-auto'"
  >
    <div
      class="flex flex-col gap-1"
      :class="isOwn ? 'items-end' : 'items-start'"
    >
      <!-- Sender name -->
      <span
        v-if="!isOwn"
        class="text-xs text-muted px-1"
      >{{ message.senderName }}</span>

      <!-- Bubble -->
      <div
        class="rounded-2xl px-3 py-2 max-w-sm break-words"
        :class="[
          message.isUnsent ? 'italic opacity-50 border border-dashed border-default' : '',
          isOwn
            ? 'bg-primary text-white rounded-tr-sm'
            : 'bg-elevated text-default rounded-tl-sm'
        ]"
      >
        <!-- Unsent notice -->
        <p
          v-if="message.isUnsent"
          class="text-xs text-muted mb-1"
        >
          [Message unsent]
        </p>

        <!-- Text content -->
        <p
          v-if="message.text"
          class="text-sm whitespace-pre-wrap"
        >
          {{ message.text }}
        </p>

        <!-- Share link -->
        <p
          v-if="message.type === 'Share' && !message.text"
          class="text-sm italic text-muted"
        >
          [Shared a link]
        </p>

        <!-- Call -->
        <p
          v-if="message.type === 'Call'"
          class="text-sm italic text-muted flex items-center gap-1"
        >
          <UIcon
            name="i-lucide-phone"
            class="w-3 h-3"
          /> Call
        </p>

        <!-- Media -->
        <div
          v-if="message.media.length"
          class="mt-2 flex flex-col gap-2"
        >
          <template
            v-for="asset in message.media"
            :key="asset.uri"
          >
            <!-- Image -->
            <a
              v-if="isImage(asset)"
              :href="mediaUrl(asset.uri)"
              target="_blank"
            >
              <img
                :src="mediaUrl(asset.uri)"
                class="rounded-lg max-h-64 object-cover"
                loading="lazy"
                @error="($event.target as HTMLImageElement).style.display='none'"
              >
            </a>
            <!-- Video -->
            <video
              v-else-if="isVideo(asset)"
              :src="mediaUrl(asset.uri)"
              controls
              class="rounded-lg max-h-64"
            />
            <!-- Audio -->
            <audio
              v-else-if="isAudio(asset)"
              :src="mediaUrl(asset.uri)"
              controls
              class="w-full"
            />
            <!-- Other file -->
            <a
              v-else
              :href="mediaUrl(asset.uri)"
              target="_blank"
              class="flex items-center gap-2 text-xs underline"
            >
              <UIcon
                name="i-lucide-file"
                class="w-4 h-4"
              />
              {{ asset.uri.split('/').pop() }}
            </a>
          </template>
        </div>
      </div>

      <!-- Reactions -->
      <div
        v-if="message.reactions.length"
        class="flex gap-1 flex-wrap px-1"
      >
        <span
          v-for="(r, i) in message.reactions"
          :key="i"
          class="text-sm"
          :title="r.actor"
        >{{ r.reaction }}</span>
      </div>

      <!-- Timestamp -->
      <span class="text-xs text-muted px-1">{{ formatTime(message.timestamp) }}</span>
    </div>
  </div>
</template>
