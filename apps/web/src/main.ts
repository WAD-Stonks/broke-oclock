import { createApp } from 'vue'
import '@broke-oclock/ui/styles.css'
import '@web/assets/main.css'
import App from '@web/App.vue'
import router from '@web/router'

createApp(App).use(router).mount('#app')
