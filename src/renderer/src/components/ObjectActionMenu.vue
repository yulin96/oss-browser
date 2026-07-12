<script setup lang="ts">
import {
  CloudCog,
  Copy,
  Download,
  FileCog,
  Info,
  KeyRound,
  Link,
  Move,
  Pencil,
  ShieldCheck,
  Trash2,
  Undo2
} from '@lucide/vue'
import type { ObjectInfo } from '../../../shared/types'
import { t } from '../i18n'

export type ObjectAction =
  | 'download'
  | 'copy'
  | 'move'
  | 'rename'
  | 'acl'
  | 'headers'
  | 'share'
  | 'symlink'
  | 'restore'
  | 'details'
  | 'grant'
  | 'cache'
  | 'delete'

const props = defineProps<{ selected: ObjectInfo[] }>()
const emit = defineEmits<{ select: [action: ObjectAction] }>()

function enabled(action: ObjectAction): boolean {
  const count = props.selected.length
  if (action === 'grant') return count <= 1
  if (action === 'share') return count === 1 && !props.selected[0]?.isDirectory
  if (['rename', 'acl', 'symlink', 'details', 'cache'].includes(action)) return count === 1
  return count > 0
}

function select(action: ObjectAction): void {
  if (enabled(action)) emit('select', action)
}
</script>

<template>
  <div class="more-menu">
    <div :class="{ disabled: !enabled('download') }" @click="select('download')">
      <Download :size="15" />{{ t('下载') }}
    </div>
    <div :class="{ disabled: !enabled('copy') }" @click="select('copy')">
      <Copy :size="15" />{{ t('复制') }}
    </div>
    <div :class="{ disabled: !enabled('move') }" @click="select('move')">
      <Move :size="15" />{{ t('移动') }}
    </div>
    <div :class="{ disabled: !enabled('rename') }" @click="select('rename')">
      <Pencil :size="15" />{{ t('重命名') }}
    </div>
    <div :class="{ disabled: !enabled('acl') }" @click="select('acl')">
      <ShieldCheck :size="15" />{{ t('对象权限') }}
    </div>
    <div :class="{ disabled: !enabled('headers') }" @click="select('headers')">
      <FileCog :size="15" />{{ t('HTTP 头') }}
    </div>
    <div :class="{ disabled: !enabled('share') }" @click="select('share')">
      <Link :size="15" />{{ t('获取地址') }}
    </div>
    <div :class="{ disabled: !enabled('symlink') }" @click="select('symlink')">
      <Link :size="15" />{{ t('创建软链接') }}
    </div>
    <div :class="{ disabled: !enabled('restore') }" @click="select('restore')">
      <Undo2 :size="15" />{{ t('恢复归档对象') }}
    </div>
    <div :class="{ disabled: !enabled('details') }" @click="select('details')">
      <Info :size="15" />{{ t('对象详情') }}
    </div>
    <div :class="{ disabled: !enabled('grant') }" @click="select('grant')">
      <KeyRound :size="15" />{{ t('生成授权码') }}
    </div>
    <div :class="{ disabled: !enabled('cache') }" @click="select('cache')">
      <CloudCog :size="15" />{{ t('刷新此项缓存') }}
    </div>
    <div class="danger" :class="{ disabled: !enabled('delete') }" @click="select('delete')">
      <Trash2 :size="15" />{{ t('删除') }}
    </div>
  </div>
</template>
