<template>
  <div class="tree-node">
    <div class="tree-row" :style="{ paddingLeft: 12 + depth * 16 + 'px' }" @click="handleClick">
      <span v-if="node.type === 'folder'" class="toggle" @click.stop="toggle">
        {{ expanded ? '▼' : '▶' }}
      </span>
      <span class="icon">{{ node.type === 'folder' ? (expanded ? '📂' : '📁') : '📄' }}</span>
      <span class="name">{{ node.name }}</span>
    </div>
    <div v-if="node.type === 'folder' && expanded">
      <div v-if="loading" class="loading">加载中...</div>
      <TreeNode
        v-for="child in children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        @select="(n: TreeNode) => emit('select', n)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  node: TreeNode;
  depth: number;
}>();

const emit = defineEmits<{
  select: [node: TreeNode];
}>();

const expanded = ref(false);
const children = ref<TreeNode[]>([]);
const loaded = ref(false);
const loading = ref(false);

async function loadChildren() {
  if (loaded.value) return;
  if (props.node.type !== 'folder') return;
  loading.value = true;
  try {
    children.value = await (window as any).electronAPI?.notes?.treeChildren(props.node.path) || [];
    loaded.value = true;
  } catch {}
  loading.value = false;
}

async function toggle() {
  if (!expanded.value) {
    await loadChildren();
  }
  expanded.value = !expanded.value;
}

function handleClick() {
  if (props.node.type === 'folder') {
    toggle();
  }
  emit('select', props.node);
}
</script>

<style scoped>
.tree-node { user-select: none; }
.tree-row { display: flex; align-items: center; gap: 4px; padding: 4px 8px; cursor: pointer; font-size: 13px; border-radius: var(--radius-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tree-row:hover { background: var(--hover); }
.toggle { font-size: 10px; width: 14px; text-align: center; flex-shrink: 0; color: var(--text-muted); }
.icon { font-size: 14px; flex-shrink: 0; }
.name { overflow: hidden; text-overflow: ellipsis; }
.loading { font-size: 12px; color: var(--text-muted); padding: 4px 0 4px 28px; }
</style>