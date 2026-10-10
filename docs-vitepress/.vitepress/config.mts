import { defineConfig } from 'vitepress'

const base = '/Agentic-C-CPP-CodeReview/'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: 'zh-CN',
  title: 'Combinate Agentic Review',
  titleTemplate: 'AI 驱动的 C/C++ 代码安全审计平台',
  description:
    '面向大规模 C/C++ 系统的企业级 AI 代码安全审计平台文档：LLM Agent 与分布式 Worker 集群结合，实现自动化漏洞扫描、漏洞管理与知识沉淀。',

  base,
  lastUpdated: true,
  cleanUrls: true,
  srcExclude: ['README.md'],

  markdown: {
    // shiki 3.x 不再内置 cuda 语法, 用 cpp 高亮兜底
    languageAlias: { cuda: 'cpp' },
  },

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
    ['meta', { name: 'theme-color', content: '#2e7d5b', media: '(prefers-color-scheme: light)' }],
    ['meta', { name: 'theme-color', content: '#18191c', media: '(prefers-color-scheme: dark)' }],
    ['meta', { property: 'og:title', content: 'Combinate Agentic Review' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          '面向大规模 C/C++ 系统的企业级 AI 代码安全审计平台文档：分布式扫描集群、AI Agent 编排、漏洞生命周期管理。',
      },
    ],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    // 学习笔记悬浮组件（localStorage），VitePress SPA 路由切换由 theme/index.ts 通知其重挂载
    ['script', { src: `${base}notes.js` }],
  ],

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/favicon.svg',

    nav: [
      { text: '首页', link: '/' },
      { text: '快速开始', link: '/quickstart' },
      { text: '系统架构', link: '/architecture/' },
      { text: 'Worker 引擎', link: '/worker/' },
    ],

    sidebar: [
      { text: '简介', link: '/intro' },
      { text: '快速开始', link: '/quickstart' },
      {
        text: '系统架构',
        link: '/architecture/',
        collapsed: false,
        items: [
          { text: '整体架构', link: '/architecture/overview' },
          { text: '数据流', link: '/architecture/data-flow' },
          { text: '数据库模型', link: '/architecture/database' },
          { text: '认证与授权', link: '/architecture/auth' },
        ],
      },
      {
        text: '后端',
        link: '/backend/',
        collapsed: false,
        items: [
          { text: '概览与入口', link: '/backend/overview' },
          { text: 'API 路由', link: '/backend/routers' },
          { text: '核心服务', link: '/backend/services' },
          { text: '配置与基础设施', link: '/backend/infra' },
        ],
      },
      {
        text: '前端',
        link: '/frontend/',
        collapsed: false,
        items: [
          { text: '概览与组件', link: '/frontend/overview' },
          { text: '状态管理与 API 集成', link: '/frontend/api-integration' },
        ],
      },
      {
        text: 'Worker 引擎',
        link: '/worker/',
        collapsed: false,
        items: [
          { text: 'Remote Agent', link: '/worker/agent' },
          { text: 'SSH 部署服务', link: '/worker/deployer' },
          { text: 'Orchestrator 编排器', link: '/worker/orchestrator' },
          { text: 'Worker Node 独立节点', link: '/worker/worker-node' },
          { text: '技能与知识库', link: '/worker/skills' },
        ],
      },
      {
        text: '部署',
        link: '/deployment/',
        collapsed: false,
        items: [
          { text: 'Docker 部署', link: '/deployment/docker' },
          { text: 'GitHub Pages 文档站点', link: '/deployment/github-pages' },
        ],
      },
      { text: '路线图', link: '/roadmap' },
    ],

    outline: {
      level: [2, 3],
      label: '本页大纲',
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '无法找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
          },
        },
      },
    },

    editLink: {
      pattern: 'https://github.com/Atituiset/Agentic-C-CPP-CodeReview/edit/master/docs-vitepress/:path',
      text: '在 GitHub 上编辑此页',
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/Atituiset/Agentic-C-CPP-CodeReview' }],

    docFooter: { prev: '上一页', next: '下一页' },

    lastUpdated: {
      text: '最后更新于',
      formatOptions: { dateStyle: 'short', timeStyle: 'short' },
    },

    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    skipToContentLabel: '跳转到内容',

    footer: {
      message: 'Combinate Agentic Review 项目文档',
      copyright: 'Copyright © 2026 Combinate Agentic Review',
    },
  },
})
