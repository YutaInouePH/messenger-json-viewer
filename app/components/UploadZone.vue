<script setup lang="ts">
const emit = defineEmits<{
  uploaded: [sessionId: string, expiresAt: number, threadCount: number]
}>()

const isDragOver = ref(false)
const isUploading = ref(false)
const error = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

function onDragOver(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = true
}

function onDragLeave() {
  isDragOver.value = false
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) uploadFile(file)
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) uploadFile(file)
}

async function uploadFile(file: File) {
  error.value = null
  if (!file.name.toLowerCase().endsWith('.zip')) {
    error.value = 'Please upload a .zip file exported from Facebook Messenger.'
    return
  }

  isUploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    const result = await $fetch<{ sessionId: string, expiresAt: number, threadCount: number }>('/api/upload', {
      method: 'POST',
      body: form
    })
    emit('uploaded', result.sessionId, result.expiresAt, result.threadCount)
  } catch (err: unknown) {
    const e2 = err as { data?: { statusMessage?: string }, message?: string }
    error.value = e2?.data?.statusMessage ?? e2?.message ?? 'Upload failed. Please try again.'
  } finally {
    isUploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}
</script>

<template>
  <div class="w-full max-w-xl mx-auto">
    <div
      class="relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors"
      :class="isDragOver
        ? 'border-primary bg-primary/5'
        : 'border-default hover:border-primary/50 hover:bg-default'"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
      @click="fileInput?.click()"
    >
      <input
        ref="fileInput"
        type="file"
        accept=".zip"
        class="hidden"
        @change="onFileChange"
      >

      <div
        v-if="isUploading"
        class="flex flex-col items-center gap-4"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="w-12 h-12 text-primary animate-spin"
        />
        <p class="text-muted text-sm">
          Uploading and processing your export…
        </p>
      </div>

      <div
        v-else
        class="flex flex-col items-center gap-4"
      >
        <UIcon
          name="i-lucide-upload-cloud"
          class="w-12 h-12 text-muted"
        />
        <div>
          <p class="font-semibold text-highlighted">
            Drop your Facebook export .zip here
          </p>
          <p class="text-sm text-muted mt-1">
            or click to browse files
          </p>
        </div>
        <UBadge
          variant="subtle"
          color="neutral"
          size="sm"
        >
          Up to 500 MB
        </UBadge>
      </div>
    </div>

    <UAlert
      v-if="error"
      class="mt-4"
      color="error"
      variant="subtle"
      :title="error"
      icon="i-lucide-alert-circle"
    />
  </div>
</template>
