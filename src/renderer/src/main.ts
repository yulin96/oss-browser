import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import FloatingUploadApp from './FloatingUploadApp.vue'
import { locale, setLocale } from './i18n'

const isFloatingUploadWindow =
  new URLSearchParams(window.location.search).get('window') === 'floating-upload'
if (isFloatingUploadWindow) document.documentElement.classList.add('floating-window')
else setLocale(locale.value)

function activateButton(event: KeyboardEvent): void {
  if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
  event.preventDefault()
  const element = event.currentTarget as HTMLElement
  if (event.repeat || element.getAttribute('aria-disabled') === 'true') return
  if (event.type === (event.key === 'Enter' ? 'keydown' : 'keyup')) element.click()
}

createApp(isFloatingUploadWindow ? FloatingUploadApp : App)
  .directive('keyboard-click', {
    mounted(element: HTMLElement) {
      element.addEventListener('keydown', activateButton)
      element.addEventListener('keyup', activateButton)
    },
    beforeUnmount(element: HTMLElement) {
      element.removeEventListener('keydown', activateButton)
      element.removeEventListener('keyup', activateButton)
    }
  })
  .mount('#app')
