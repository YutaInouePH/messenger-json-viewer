<script setup lang="ts">
const props = defineProps<{
  expiresAt: number
}>()

const emit = defineEmits<{
  reupload: []
}>()

const remaining = ref('')
const isExpired = ref(false)

function update() {
  const diff = props.expiresAt - Date.now()
  if (diff <= 0) {
    isExpired.value = true
    remaining.value = 'Expired'
    return
  }
  const totalSec = Math.floor(diff / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  remaining.value = `${m}m ${String(s).padStart(2, '0')}s`
}

let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  update()
  timer = setInterval(update, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

watch(() => props.expiresAt, () => {
  isExpired.value = false
  update()
})
</script>

<template>
  <div
    class="flex items-center justify-between gap-3 px-4 py-2 rounded-lg text-sm"
    :class="isExpired ? 'bg-error/10 text-error' : 'bg-warning/10 text-warning'"
  >
    <div class="flex items-center gap-2">
      <UIcon
        :name="isExpired ? 'i-lucide-alert-triangle' : 'i-lucide-clock'"
        class="w-4 h-4 shrink-0"
      />
      <span v-if="isExpired">
        Your session has expired. Please re-upload your export.
      </span>
      <span v-else>
        Data auto-deletes in <strong>{{ remaining }}</strong> — re-upload to reset.
      </span>
    </div>
    <UButton
      v-if="isExpired"
      size="xs"
      color="neutral"
      variant="subtle"
      icon="i-lucide-upload"
      @click="emit('reupload')"
    >
      Re-upload
    </UButton>
  </div>
</template>
