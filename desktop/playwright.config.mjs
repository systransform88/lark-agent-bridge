import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',workers:1,timeout:45000,reporter:'list',outputDir:'../test-results',use:{trace:'retain-on-failure'}});
