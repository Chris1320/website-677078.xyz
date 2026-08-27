<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import type { PostItem } from "./PostList.vue";

const props = defineProps<{
  initialPost?: PostItem | null;
}>();

const emit = defineEmits<{
  (e: "back"): void;
  (e: "saved", post: PostItem): void;
}>();

const isEditing = ref(!!props.initialPost?.id);
const postId = ref(props.initialPost?.id || "");
const title = ref(props.initialPost?.title || "");
const slug = ref(props.initialPost?.slug || "");
const description = ref(props.initialPost?.description || "");
const content = ref(props.initialPost?.content || "");
const status = ref<"draft" | "published">(props.initialPost?.status || "draft");
const tags = ref<string[]>(props.initialPost?.tags?.map((t) => t.name) || []);
const tagInput = ref("");

const preserveFilename = ref(false);
const viewMode = ref<"split" | "editor" | "preview">("split");
const previewHtml = ref("");
const isRenderingPreview = ref(false);
const isSaving = ref(false);
const isUploading = ref(false);
const uploadStatus = ref("");
const errorMessage = ref("");
const successMessage = ref("");

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

let slugManuallyEdited = isEditing.value;

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "post"
  );
}

watch(title, (newTitle) => {
  if (!slugManuallyEdited) {
    slug.value = slugify(newTitle);
  }
});

function onSlugInput() {
  slugManuallyEdited = true;
}

function addTag() {
  const clean = tagInput.value.trim().replace(/^#/, "");
  if (clean && !tags.value.includes(clean)) {
    tags.value.push(clean);
  }
  tagInput.value = "";
}

function removeTag(index: number) {
  tags.value.splice(index, 1);
}

function handleTagKeyDown(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    addTag();
  } else if (
    e.key === "Backspace" &&
    !tagInput.value &&
    tags.value.length > 0
  ) {
    tags.value.pop();
  }
}

// Live Preview Debounce
let previewTimeout: any = null;
function fetchPreview() {
  if (previewTimeout) clearTimeout(previewTimeout);
  isRenderingPreview.value = true;
  previewTimeout = setTimeout(async () => {
    try {
      const res = await fetch("/api/admin/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: content.value }),
      });
      const data = await res.json();
      previewHtml.value =
        data.html || '<p class="text-[var(--text-muted)]">> Empty document</p>';
    } catch {
      previewHtml.value =
        '<p class="text-red-400">> Failed to render preview</p>';
    } finally {
      isRenderingPreview.value = false;
    }
  }, 250);
}

watch(content, () => {
  fetchPreview();
});

onMounted(() => {
  fetchPreview();
});

// Cursor insertion helper
function insertTextAtCursor(
  prefix: string,
  suffix: string = "",
  defaultText: string = "",
) {
  const el = textareaRef.value;
  if (!el) return;

  const start = el.selectionStart;
  const end = el.selectionEnd;
  const selectedText = el.value.substring(start, end) || defaultText;
  const replacement = `${prefix}${selectedText}${suffix}`;

  content.value =
    el.value.substring(0, start) + replacement + el.value.substring(end);

  setTimeout(() => {
    el.focus();
    el.setSelectionRange(
      start + prefix.length,
      start + prefix.length + selectedText.length,
    );
  }, 0);
}

// File Upload Handler
async function uploadFile(file: File) {
  isUploading.value = true;
  uploadStatus.value = `Uploading ${file.name}...`;
  errorMessage.value = "";

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("preserveName", preserveFilename.value ? "true" : "false");

    const res = await fetch("/api/media/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Upload failed");
    }

    const embedCode = `\n![[${data.filename}]]\n`;
    insertTextAtCursor(embedCode);
    uploadStatus.value = `Uploaded ${data.filename}`;
    setTimeout(() => {
      uploadStatus.value = "";
    }, 3000);
  } catch (err: any) {
    errorMessage.value = `Upload failed: ${err.message}`;
  } finally {
    isUploading.value = false;
  }
}

function handleDrop(e: DragEvent) {
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    for (let i = 0; i < files.length; i++) {
      uploadFile(files[i]);
    }
  }
}

function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (let i = 0; i < items.length; i++) {
    if (
      items[i].type.indexOf("image") !== -1 ||
      items[i].type.indexOf("video") !== -1
    ) {
      const file = items[i].getAsFile();
      if (file) {
        e.preventDefault();
        uploadFile(file);
      }
    }
  }
}

function triggerFilePicker() {
  fileInputRef.value?.click();
}

function handleFileInputChange(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    for (let i = 0; i < target.files.length; i++) {
      uploadFile(target.files[i]);
    }
  }
  target.value = "";
}

// Save & Publish
async function savePost(publishStatus: "draft" | "published") {
  if (!title.value.trim()) {
    errorMessage.value = "Please enter a post title.";
    return;
  }

  isSaving.value = true;
  errorMessage.value = "";
  successMessage.value = "";

  const payload = {
    title: title.value.trim(),
    slug: slug.value.trim() || slugify(title.value),
    description: description.value.trim(),
    content: content.value,
    status: publishStatus,
    tags: tags.value,
  };

  try {
    const url = isEditing.value
      ? `/api/admin/posts/${postId.value}`
      : "/api/admin/posts";
    const method = isEditing.value ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to save post");
    }

    status.value = publishStatus;
    isEditing.value = true;
    postId.value = data.post.id;
    slug.value = data.post.slug;

    successMessage.value =
      publishStatus === "published"
        ? "Post published successfully!"
        : "Draft saved successfully!";

    emit("saved", data.post);

    setTimeout(() => {
      successMessage.value = "";
    }, 4000);
  } catch (err: any) {
    errorMessage.value = err.message || "Error saving post";
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Top Action Bar -->
    <div
      class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-(--border-main) bg-(--bg-surface) p-4"
    >
      <div class="flex items-center gap-3">
        <button
          type="button"
          @click="emit('back')"
          class="px-3 py-1 text-xs uppercase tracking-wider border border-(--border-main) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--border-highlight) transition-colors"
        >
          &larr; Back to Posts
        </button>
        <span
          class="text-xs uppercase tracking-widest text-(--accent-green) font-bold"
        >
          [{{ isEditing ? "EDITING POST" : "NEW POST" }}]
        </span>
        <span
          :class="[
            'px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider',
            status === 'published'
              ? 'border border-(--accent-green) text-(--accent-green) bg-(--accent-green-glow)'
              : 'border border-amber-500/50 text-amber-400 bg-amber-950/30',
          ]"
        >
          {{ status }}
        </span>
      </div>

      <div class="flex items-center gap-2 w-full sm:w-auto">
        <button
          type="button"
          @click="savePost('draft')"
          :disabled="isSaving"
          class="flex-1 sm:flex-none px-4 py-1.5 text-xs uppercase tracking-wider border border-(--border-main) text-(--text-primary) hover:border-(--border-highlight) hover:bg-(--bg-surface-elevated) transition-colors"
        >
          {{ isSaving && status === "draft" ? "Saving..." : "Save Draft" }}
        </button>
        <button
          type="button"
          @click="savePost('published')"
          :disabled="isSaving"
          class="flex-1 sm:flex-none px-4 py-1.5 text-xs uppercase tracking-wider font-bold bg-(--accent-green) text-(--text-inverse) hover:bg-(--accent-green-bright) transition-colors"
        >
          {{
            isSaving && status === "published"
              ? "Publishing..."
              : isEditing && status === "published"
                ? "Update Post"
                : "Publish Post"
          }}
        </button>
      </div>
    </div>

    <!-- Alert Messages -->
    <div
      v-if="errorMessage"
      class="p-3 border border-red-500 bg-red-950/30 text-red-400 text-xs"
    >
      > ERROR: {{ errorMessage }}
    </div>
    <div
      v-if="successMessage"
      class="p-3 border border-(--accent-green) bg-(--accent-green-glow) text-(--accent-green-bright) text-xs"
    >
      > SUCCESS: {{ successMessage }}
    </div>
    <div
      v-if="uploadStatus"
      class="p-3 border border-cyan-500 bg-cyan-950/30 text-cyan-400 text-xs"
    >
      > UPLOAD: {{ uploadStatus }}
    </div>

    <!-- Metadata Fields -->
    <div
      class="grid grid-cols-1 md:grid-cols-2 gap-4 border border-(--border-main) bg-(--bg-surface) p-4"
    >
      <div class="space-y-3">
        <div>
          <label
            class="block text-xs uppercase tracking-wider text-(--text-secondary) mb-1"
          >
            Post Title *
          </label>
          <input
            v-model="title"
            type="text"
            placeholder="e.g. Building an Edge Blog with Cloudflare"
            class="w-full px-3 py-1.5 text-sm bg-(--bg-primary) border border-(--border-main) text-(--text-primary) focus:outline-none focus:border-(--border-highlight) font-bold"
          />
        </div>
        <div>
          <label
            class="block text-xs uppercase tracking-wider text-(--text-secondary) mb-1"
          >
            Slug URL
          </label>
          <div class="flex items-center">
            <span
              class="px-2 py-1.5 text-xs bg-(--bg-surface-elevated) border border-r-0 border-(--border-main) text-(--text-muted) select-none"
            >
              /blogs/
            </span>
            <input
              v-model="slug"
              @input="onSlugInput"
              type="text"
              placeholder="post-slug"
              class="w-full px-3 py-1.5 text-sm bg-(--bg-primary) border border-(--border-main) text-(--text-primary) focus:outline-none focus:border-(--border-highlight)"
            />
          </div>
        </div>
      </div>

      <div class="space-y-3">
        <div>
          <label
            class="block text-xs uppercase tracking-wider text-(--text-secondary) mb-1"
          >
            Excerpt / Description
          </label>
          <input
            v-model="description"
            type="text"
            placeholder="Brief summary shown in blog list and metadata..."
            class="w-full px-3 py-1.5 text-sm bg-(--bg-primary) border border-(--border-main) text-(--text-primary) focus:outline-none focus:border-(--border-highlight)"
          />
        </div>

        <div>
          <label
            class="block text-xs uppercase tracking-wider text-(--text-secondary) mb-1"
          >
            Tags (Press Enter or Comma)
          </label>
          <div
            class="flex flex-wrap items-center gap-1.5 p-1.5 bg-(--bg-primary) border border-(--border-main) focus-within:border-(--border-highlight) min-h-9.5"
          >
            <span
              v-for="(tag, index) in tags"
              :key="index"
              class="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-(--bg-surface-elevated) border border-(--border-subtle) text-(--accent-green)"
            >
              #{{ tag }}
              <button
                type="button"
                @click="removeTag(index)"
                class="hover:text-red-400 text-xs font-bold"
              >
                &times;
              </button>
            </span>
            <input
              v-model="tagInput"
              @keydown="handleTagKeyDown"
              @blur="addTag"
              type="text"
              placeholder="Add tag..."
              class="flex-1 min-w-25 bg-transparent text-xs text-(--text-primary) focus:outline-none p-1"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Editor Toolbar & View Controls -->
    <div
      class="flex flex-wrap items-center justify-between gap-2 border border-(--border-main) bg-(--bg-surface-elevated) p-2"
    >
      <!-- Formatting Buttons -->
      <div class="flex flex-wrap items-center gap-1">
        <button
          type="button"
          @click="insertTextAtCursor('**', '**', 'bold text')"
          class="px-2 py-1 text-xs border border-(--border-main) hover:bg-(--bg-surface) font-bold text-(--text-primary)"
          title="Bold"
        >
          B
        </button>
        <button
          type="button"
          @click="insertTextAtCursor('*', '*', 'italic text')"
          class="px-2 py-1 text-xs border border-(--border-main) hover:bg-(--bg-surface) italic text-(--text-primary)"
          title="Italic"
        >
          I
        </button>
        <button
          type="button"
          @click="insertTextAtCursor('## ', '', 'Heading')"
          class="px-2 py-1 text-xs border border-(--border-main) hover:bg-(--bg-surface) text-(--text-primary)"
          title="Heading 2"
        >
          H2
        </button>
        <button
          type="button"
          @click="
            insertTextAtCursor('```typescript\n', '\n```', '// code here')
          "
          class="px-2 py-1 text-xs border border-(--border-main) hover:bg-(--bg-surface) text-(--text-primary)"
          title="Code Block"
        >
          &lt;/&gt;
        </button>
        <button
          type="button"
          @click="insertTextAtCursor('[[', ']]', 'post-slug')"
          class="px-2 py-1 text-xs border border-(--border-main) hover:bg-(--bg-surface) text-(--accent-green)"
          title="Obsidian Wikilink [[slug]]"
        >
          [[Link]]
        </button>
        <button
          type="button"
          @click="insertTextAtCursor('> [!NOTE] Title\n> ', '', 'Content')"
          class="px-2 py-1 text-xs border border-(--border-main) hover:bg-(--bg-surface) text-cyan-400"
          title="Obsidian Callout"
        >
          [!Note]
        </button>

        <span class="w-px h-4 bg-(--border-main) mx-1"></span>

        <!-- Upload File Button -->
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*,video/*,audio/*,.pdf"
          class="hidden"
          @change="handleFileInputChange"
        />
        <button
          type="button"
          @click="triggerFilePicker"
          :disabled="isUploading"
          class="px-2.5 py-1 text-xs border border-(--accent-green-dim) text-(--accent-green-bright) hover:bg-(--accent-green-glow)"
          title="Upload image or video"
        >
          {{ isUploading ? "Uploading..." : "📁 Upload Media" }}
        </button>

        <label
          class="flex items-center gap-1.5 text-[11px] text-(--text-muted) cursor-pointer ml-2"
        >
          <input
            v-model="preserveFilename"
            type="checkbox"
            class="accent-(--accent-green)"
          />
          Keep original filename
        </label>
      </div>

      <!-- View Switcher -->
      <div class="flex items-center gap-1">
        <button
          type="button"
          @click="viewMode = 'editor'"
          :class="[
            'px-2 py-1 text-xs uppercase tracking-wider transition-colors',
            viewMode === 'editor'
              ? 'bg-(--accent-green-dim) text-white font-bold'
              : 'text-(--text-secondary) hover:text-(--text-primary)',
          ]"
        >
          Editor Only
        </button>
        <button
          type="button"
          @click="viewMode = 'split'"
          :class="[
            'px-2 py-1 text-xs uppercase tracking-wider transition-colors',
            viewMode === 'split'
              ? 'bg-(--accent-green-dim) text-white font-bold'
              : 'text-(--text-secondary) hover:text-(--text-primary)',
          ]"
        >
          Split View
        </button>
        <button
          type="button"
          @click="viewMode = 'preview'"
          :class="[
            'px-2 py-1 text-xs uppercase tracking-wider transition-colors',
            viewMode === 'preview'
              ? 'bg-(--accent-green-dim) text-white font-bold'
              : 'text-(--text-secondary) hover:text-(--text-primary)',
          ]"
        >
          Preview Only
        </button>
      </div>
    </div>

    <!-- Main Workspace (Split / Editor / Preview) -->
    <div
      class="grid border border-(--border-main) bg-(--bg-surface) min-h-125"
      :class="[
        viewMode === 'split'
          ? 'grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-(--border-main)'
          : 'grid-cols-1',
      ]"
    >
      <!-- Editor Pane -->
      <div
        v-show="viewMode === 'split' || viewMode === 'editor'"
        class="flex flex-col relative"
      >
        <div
          class="p-2 border-b border-(--border-subtle) bg-(--bg-surface-elevated) flex items-center justify-between text-xs text-(--text-muted)"
        >
          <span>Obsidian Markdown (Drag-and-drop or paste images here)</span>
          <span>{{ content.split(/\s+/).filter(Boolean).length }} words</span>
        </div>
        <textarea
          ref="textareaRef"
          v-model="content"
          @drop.prevent="handleDrop"
          @paste="handlePaste"
          placeholder="# Post title&#10;&#10;Start writing your Obsidian Markdown post...&#10;&#10;Use [[wikilinks]], ![[media.png]], and > [!NOTE] callouts."
          class="w-full flex-1 p-4 bg-(--bg-primary) text-(--text-primary) font-mono text-sm leading-relaxed focus:outline-none resize-none min-h-112.5"
        ></textarea>
      </div>

      <!-- Preview Pane -->
      <div
        v-show="viewMode === 'split' || viewMode === 'preview'"
        class="flex flex-col bg-(--bg-surface)"
      >
        <div
          class="p-2 border-b border-(--border-subtle) bg-(--bg-surface-elevated) flex items-center justify-between text-xs text-(--text-muted)"
        >
          <span>Live Rendered Preview</span>
          <span v-if="isRenderingPreview" class="text-(--accent-green)"
            >> Rendering...</span
          >
        </div>
        <div
          class="p-6 overflow-y-auto max-h-175 prose prose-invert prose-emerald max-w-none text-sm leading-relaxed"
          v-html="previewHtml"
        ></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.obsidian-embed) {
  max-width: 100%;
  border: 1px solid var(--border-main);
  margin: 1rem 0;
  display: block;
}

:deep(.obsidian-callout) {
  margin: 1.25rem 0;
  padding: 1rem;
  border-left: 3px solid var(--accent-green);
  background: var(--bg-surface-elevated);
}

:deep(.callout-header) {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: bold;
  margin-bottom: 0.5rem;
  color: var(--accent-green);
}

:deep(.code-block-wrapper) {
  margin: 1.25rem 0;
  border: 1px solid var(--border-main);
  background: #121212;
  overflow-x: auto;
}

:deep(.code-block-wrapper pre) {
  padding: 1rem;
  margin: 0;
  background: transparent !important;
}
</style>
