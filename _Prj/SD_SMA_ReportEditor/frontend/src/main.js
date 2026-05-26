import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './style.css'
import { applyStoredElectronDevtoolsPref } from './lib/electron-devtools-storage'

applyStoredElectronDevtoolsPref()

const app = createApp(App)
app.config.errorHandler = (err, _instance, info) => {
  console.error('[ReportEditor]', info, err)
}
app.use(createPinia())
app.use(router)
app.mount('#app')
