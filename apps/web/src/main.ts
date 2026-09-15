import { createApp } from 'vue'
import 'bootstrap/dist/css/bootstrap.min.css'
import '@web/assets/main.css'
import App from '@web/App.vue'
import router from '@web/router'

createApp(App).use(router).mount('#app')
