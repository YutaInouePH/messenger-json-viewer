// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  // NUXT_BLOB_ZIP_URL: Vercel Blob URL of a pre-uploaded messenger export zip.
  // When set, the upload page is skipped and the zip is loaded automatically.
  runtimeConfig: {
    blobZipUrl: ''
  },

  compatibilityDate: '2025-01-15',

  nitro: {
    // Allow large file uploads (500 MB)
    routeRules: {
      '/api/upload': { bodySize: '500mb' }
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
