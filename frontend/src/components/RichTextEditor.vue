<script setup lang="ts">
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor, type Content } from "@tiptap/vue-3";
import { computed, ref, watch } from "vue";

// 需求/規格描述的所見即所得編輯器：粗體/斜體/項目符號清單/連結/圖片。
// 存的是 Tiptap 原生 JSON（序列化成字串），不是 HTML——後端把這個欄位當不透明字串處理，
// 不解讀內容；檢視模式（editable=false）也是同一個元件、同一份 schema 解析顯示，
// 不另外用 v-html 顯示存起來的內容（見 CONTEXT 討論）。
const props = withDefaults(defineProps<{ modelValue: string; editable?: boolean }>(), {
  editable: true,
});
const emit = defineEmits<{ "update:modelValue": [string] }>();

// 這個欄位在導入 Tiptap 之前存的是純文字（Markdown 語法）；不是合法 JSON 就當純文字
// 顯示成一段內容，不能憑空消失——舊資料才不會因為這次改版而看起來像被清空。
function parseContent(value: string): Content {
  if (!value) return "";
  try {
    return JSON.parse(value);
  } catch {
    return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: value }] }] };
  }
}

const editor = useEditor({
  content: parseContent(props.modelValue),
  editable: props.editable,
  extensions: [StarterKit.configure({ link: { openOnClick: false } }), Image],
  onUpdate: ({ editor }) => {
    emit("update:modelValue", JSON.stringify(editor.getJSON()));
  },
});

watch(
  () => props.editable,
  (value) => editor.value?.setEditable(value),
);

// 外部把 modelValue 換成另一筆資料時（例如切換檢視另一個需求/規格）才需要重新載入內容；
// 排除掉「使用者自己打字造成的 onUpdate」那種情況，避免游標被重置。
watch(
  () => props.modelValue,
  (value) => {
    if (!editor.value) return;
    const current = JSON.stringify(editor.value.getJSON());
    if (value !== current) editor.value.commands.setContent(parseContent(value), { emitUpdate: false });
  },
);

const isEmpty = computed(() => editor.value?.isEmpty ?? true);

// 連結/圖片改用行內小表單輸入網址，不用瀏覽器原生 prompt()（無法測試、體驗也差）。
const showLinkForm = ref(false);
const linkUrl = ref("");

function openLinkForm() {
  linkUrl.value = (editor.value?.getAttributes("link").href as string | undefined) ?? "";
  showLinkForm.value = true;
}

function applyLink() {
  if (!editor.value) return;
  if (linkUrl.value) {
    editor.value.chain().focus().extendMarkRange("link").setLink({ href: linkUrl.value }).run();
  } else {
    editor.value.chain().focus().unsetLink().run();
  }
  showLinkForm.value = false;
}

const showImageForm = ref(false);
const imageUrl = ref("");

function openImageForm() {
  imageUrl.value = "";
  showImageForm.value = true;
}

function applyImage() {
  if (!editor.value || !imageUrl.value) return;
  editor.value.chain().focus().setImage({ src: imageUrl.value }).run();
  showImageForm.value = false;
}

// jsdom 沒有完整實作 contenteditable 的 Selection/Range API，測試無法模擬真的打字；
// 暴露 setContent 讓測試改用 Tiptap 的 command API 寫入內容（Tiptap 官方測試建議的做法）。
function setContent(content: Content) {
  editor.value?.commands.setContent(content, { emitUpdate: true });
}

defineExpose({ isEmpty, setContent });
</script>

<template>
  <div class="rich-text-editor" data-testid="richtext-editor">
    <div v-if="editable && editor" class="toolbar" data-testid="richtext-toolbar">
      <button
        type="button"
        :class="{ active: editor.isActive('bold') }"
        data-testid="richtext-bold"
        @click="editor.chain().focus().toggleBold().run()"
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        :class="{ active: editor.isActive('italic') }"
        data-testid="richtext-italic"
        @click="editor.chain().focus().toggleItalic().run()"
      >
        <em>I</em>
      </button>
      <button
        type="button"
        :class="{ active: editor.isActive('bulletList') }"
        data-testid="richtext-bullet-list"
        @click="editor.chain().focus().toggleBulletList().run()"
      >
        ☰
      </button>
      <button
        type="button"
        :class="{ active: editor.isActive('link') }"
        data-testid="richtext-link"
        @click="openLinkForm"
      >
        🔗
      </button>
      <button type="button" data-testid="richtext-image" @click="openImageForm">🖼</button>
    </div>

    <div v-if="showLinkForm" class="inline-form" data-testid="richtext-link-form">
      <input v-model="linkUrl" type="text" placeholder="https://..." data-testid="richtext-link-url" />
      <button type="button" class="btn-primary" data-testid="richtext-link-apply" @click="applyLink">套用</button>
      <button type="button" class="btn-ghost" @click="showLinkForm = false">取消</button>
    </div>

    <div v-if="showImageForm" class="inline-form" data-testid="richtext-image-form">
      <input v-model="imageUrl" type="text" placeholder="https://..." data-testid="richtext-image-url" />
      <button type="button" class="btn-primary" data-testid="richtext-image-apply" @click="applyImage">插入</button>
      <button type="button" class="btn-ghost" @click="showImageForm = false">取消</button>
    </div>

    <EditorContent :editor="editor" class="content" data-testid="richtext-content" />
  </div>
</template>

<style scoped>
.rich-text-editor {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
}

.toolbar {
  display: flex;
  gap: 4px;
  padding: 6px;
  border-bottom: 1px solid var(--border);
}

.toolbar button {
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-dim);
  border-radius: var(--radius-sm);
  width: 26px;
  height: 26px;
  cursor: pointer;
  font-size: 13px;
}

.toolbar button:hover {
  background: var(--surface-2);
}

.toolbar button.active {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-tint);
}

.inline-form {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.inline-form input {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 9px;
  font-size: 12.5px;
  background: var(--surface);
  color: var(--text);
  outline: none;
}

.inline-form .btn-primary {
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.inline-form .btn-ghost {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-dim);
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  font-size: 12.5px;
  cursor: pointer;
}

.content {
  padding: 8px 11px;
  font-size: 13px;
  color: var(--text);
  min-height: 100px;
}

.content :deep(.ProseMirror) {
  outline: none;
  min-height: 90px;
}

.content :deep(.ProseMirror p) {
  margin: 0 0 8px;
}

.content :deep(.ProseMirror p:last-child) {
  margin-bottom: 0;
}

.content :deep(.ProseMirror ul) {
  padding-left: 20px;
  margin: 0 0 8px;
}

.content :deep(.ProseMirror img) {
  max-width: 100%;
  border-radius: var(--radius-sm);
}

.content :deep(.ProseMirror a) {
  color: var(--primary);
}
</style>
