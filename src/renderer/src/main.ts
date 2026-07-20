import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import FloatingUploadApp from './FloatingUploadApp.vue'

const isFloatingUploadWindow =
  new URLSearchParams(window.location.search).get('window') === 'floating-upload'
if (isFloatingUploadWindow) document.documentElement.classList.add('floating-window')

createApp(isFloatingUploadWindow ? FloatingUploadApp : App).mount('#app')
