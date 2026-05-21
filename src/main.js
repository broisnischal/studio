import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { applySettings, loadSettings } from '$lib/stores/settings.js'

applySettings(loadSettings())

const app = mount(App, {
  target: document.getElementById('app'),
})

export default app
