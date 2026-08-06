<template>
  <div class="app-container">
    <AppSidebar />
    <main class="main-content">
      <router-view />
    </main>
    <WelcomeGuide v-if="showWelcome" @close="showWelcome = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AppSidebar from './components/AppSidebar.vue';
import WelcomeGuide from './components/WelcomeGuide.vue';

const showWelcome = ref(false);

onMounted(async () => {
  try {
    const res = await window.electronAPI.app.firstRun();
    showWelcome.value = !!(res && res.firstRun);
  } catch { showWelcome.value = false; }
});
</script>

<style scoped>
.app-container {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 1500px;
}
</style>
