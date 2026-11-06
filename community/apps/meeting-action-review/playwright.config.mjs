import { defineConfig } from '@playwright/test'
export default defineConfig({ testDir:'./tests',testMatch:'workbench.spec.mjs',workers:1,timeout:30000,
  use:{headless:true,channel:process.env.MAR_BROWSER_CHANNEL || undefined,viewport:{width:650,height:900},screenshot:'only-on-failure'},reporter:'list' })
