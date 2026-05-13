import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      { path: '', name: 'Dashboard', component: () => import('@/views/Dashboard.vue') },
      { path: 'datasource', name: 'DataSourceConfig', component: () => import('@/views/DataSourceConfig.vue') },
      { path: 'templates', name: 'TemplateManager', component: () => import('@/views/TemplateManager.vue') },
      { path: 'layouts', name: 'LayoutPresets', component: () => import('@/views/LayoutPresets.vue') },
      { path: 'signatures', name: 'SignaturesLibrary', component: () => import('@/views/SignaturesLibrary.vue') },
      { path: 'editor/:id?', name: 'TemplateEditor', component: () => import('@/views/TemplateEditor.vue') },
      { path: 'generate', name: 'ReportGenerator', component: () => import('@/views/ReportGenerator.vue') },
      { path: 'history', name: 'ReportHistory', component: () => import('@/views/ReportHistory.vue') },
      { path: 'settings', name: 'Settings', component: () => import('@/views/Settings.vue') },
    ],
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
