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

  runtimeConfig: {
    blobZipUrl: '',
    digestAuth: {
      username: process.env.DIGEST_AUTH_USERNAME,
      password: process.env.DIGEST_AUTH_PASSWORD,
      realm: process.env.DIGEST_AUTH_REALM || 'Messenger JSON Viewer',
      nonceSecret: process.env.DIGEST_AUTH_SECRET
    }
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
