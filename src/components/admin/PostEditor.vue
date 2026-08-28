<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { Icon } from "@iconify/vue";

import type { PostItem } from "./PostList.vue";
import { formatDate, formatBytes, slugify } from "../../lib/utils";
import {
  findTrueOrphans,
  pruneOrphanFiles,
  uploadFileWithProgress,
} from "../../lib/media";
import { extractMediaReferences } from "../../lib/markdown";

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
const publishedAt = ref<any>(props.initialPost?.published_at || null);
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
      const data: any = await res.json();
      previewHtml.value =
        data.html || '<p class="text-[var(--text-muted)]">> Empty document</p>';
    } catch {
      previewHtml.value =
        '<p class="text-(--status-error-text)">> Failed to render preview</p>';
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

const uploadProgress = ref({
  active: false,
  filename: "",
  loaded: 0,
  total: 0,
  percent: 0,
});

async function uploadFile(file: File) {
  isUploading.value = true;
  uploadStatus.value = `Uploading ${file.name}...`;
  errorMessage.value = "";
  uploadProgress.value = {
    active: true,
    filename: file.name,
    loaded: 0,
    total: file.size,
    percent: 0,
  };

  try {
    const data = await uploadFileWithProgress(
      file,
      preserveFilename.value,
      (p) => {
        uploadProgress.value.loaded = p.loaded;
        uploadProgress.value.total = p.total;
        uploadProgress.value.percent = p.percent;
      },
    );

    const embedCode = `\n![[${data.filename}]]\n`;
    insertTextAtCursor(embedCode);
    uploadStatus.value = `Uploaded ${data.filename}`;
    setTimeout(() => {
      uploadStatus.value = "";
    }, 3000);
  } catch (err: any) {
    errorMessage.value = `Upload failed: ${err.message}`;
  } finally {
    setTimeout(() => {
      uploadProgress.value.active = false;
      isUploading.value = false;
    }, 500);
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

const initialMediaRefs = ref<string[]>(
  extractMediaReferences(props.initialPost?.content || ""),
);
const showOrphanModal = ref(false);
const showPublishedDateModal = ref(false);
const pendingPublishStatus = ref<"draft" | "published">("draft");
const orphanedFilesToPrompt = ref<string[]>([]);
const pendingDeleteOrphans = ref(false);

async function savePost(publishStatus: "draft" | "published") {
  if (!title.value.trim()) {
    errorMessage.value = "Please enter a post title.";
    return;
  }

  pendingPublishStatus.value = publishStatus;

  if (isEditing.value) {
    const currentRefs = extractMediaReferences(content.value);
    const removed = initialMediaRefs.value.filter(
      (r) => !currentRefs.includes(r),
    );
    if (removed.length > 0) {
      isSaving.value = true;
      const trueOrphans = await findTrueOrphans(removed, postId.value);
      isSaving.value = false;

      if (trueOrphans.length > 0) {
        orphanedFilesToPrompt.value = trueOrphans;
        showOrphanModal.value = true;
        return;
      }
    }
  }

  proceedAfterOrphanCheck();
}

function proceedAfterOrphanCheck() {
  if (
    isEditing.value &&
    publishedAt.value &&
    pendingPublishStatus.value === "published"
  ) {
    showPublishedDateModal.value = true;
    return;
  }

  executeSave(pendingPublishStatus.value, false);
}

function confirmSaveWithOrphanChoice(deleteOrphans: boolean) {
  showOrphanModal.value = false;
  pendingDeleteOrphans.value = deleteOrphans;
  proceedAfterOrphanCheck();
}

async function confirmPublishedDateChoice(updatePublishedDate: boolean) {
  showPublishedDateModal.value = false;
  await executeSave(pendingPublishStatus.value, updatePublishedDate);
}

async function executeSave(
  publishStatus: "draft" | "published",
  updatePublishedDate: boolean = false,
) {
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
    updatePublishedDate,
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

    const data: any = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to save post");
    }

    if (pendingDeleteOrphans.value && orphanedFilesToPrompt.value.length > 0) {
      await pruneOrphanFiles(orphanedFilesToPrompt.value);
      pendingDeleteOrphans.value = false;
      orphanedFilesToPrompt.value = [];
    }

    status.value = publishStatus;
    isEditing.value = true;
    postId.value = data.post.id;
    slug.value = data.post.slug;
    publishedAt.value = data.post.published_at;
    initialMediaRefs.value = extractMediaReferences(content.value);

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
    <div
      class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-(--border-main) bg-(--bg-surface) p-4"
    >
      <div class="flex items-center gap-3">
        <button
          type="button"
          @click="emit('back')"
          class="px-3 py-1.5 text-xs uppercase tracking-wider border border-(--border-main) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--border-highlight) transition-colors inline-flex items-center gap-1.5"
        >
          <Icon icon="lucide:arrow-left" class="w-3.5 h-3.5" />
          <span>Back to Posts</span>
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
              : 'border border-(--status-warning-border) text-(--status-warning-text) bg-(--status-warning-bg)',
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
          class="flex-1 sm:flex-none px-4 py-1.5 text-xs uppercase tracking-wider border border-(--border-main) text-(--text-primary) hover:border-(--border-highlight) hover:bg-(--bg-surface-elevated) transition-colors inline-flex items-center gap-1.5"
        >
          <Icon icon="lucide:save" class="w-3.5 h-3.5" />
          <span>{{
            isSaving && status === "draft" ? "Saving..." : "Save Draft"
          }}</span>
        </button>
        <button
          type="button"
          @click="savePost('published')"
          :disabled="isSaving"
          class="flex-1 sm:flex-none px-4 py-1.5 text-xs uppercase tracking-wider font-bold bg-(--accent-green) text-(--text-inverse) hover:bg-(--accent-green-bright) transition-colors inline-flex items-center gap-1.5"
        >
          <Icon icon="lucide:send" class="w-3.5 h-3.5" />
          <span>{{
            isSaving && status === "published"
              ? "Publishing..."
              : isEditing && status === "published"
                ? "Update Post"
                : "Publish Post"
          }}</span>
        </button>
      </div>
    </div>

    <!-- Alert Messages -->
    <div
      v-if="errorMessage"
      class="p-3 border border-(--status-error-border) bg-(--status-error-bg) text-(--status-error-text) text-xs font-mono"
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

    <div
      class="grid grid-cols-1 md:grid-cols-2 gap-4 border border-(--border-main) bg-(--bg-surface) p-4"
    >
      <div class="space-y-3">
        <div>
          <label
            class="block text-xs uppercase tracking-wider text-(--text-secondary) mb-1"
          >
            Title *
          </label>
          <input
            v-model="title"
            type="text"
            placeholder="Enter your post title here"
            class="w-full px-3 py-1.5 text-sm bg-(--bg-primary) border border-(--border-main) text-(--text-primary) focus:outline-none focus:border-(--border-highlight) font-bold"
          />
        </div>
        <div>
          <label
            class="block text-xs uppercase tracking-wider text-(--text-secondary) mb-1"
          >
            Slug
          </label>
          <div class="flex items-center">
            <span
              class="px-2 py-1.5 text-xs bg-(--bg-surface-elevated) border border-r-0 border-(--border-main) text-(--text-muted) select-none"
            >
              /posts/
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
            Description
          </label>
          <input
            v-model="description"
            type="text"
            placeholder="Brief summary of the post"
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
                class="hover:text-(--status-error-text) text-xs font-bold"
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

    <!-- Editor Controls -->
    <div
      class="flex flex-wrap items-center justify-between gap-2 border border-(--border-main) bg-(--bg-surface-elevated) p-2"
    >
      <div class="flex flex-wrap items-center gap-1">
        <button
          type="button"
          @click="insertTextAtCursor('**', '**', '')"
          class="p-1.5 text-xs border border-(--border-main) hover:bg-(--bg-surface) text-(--text-primary) inline-flex items-center"
          title="Bold"
        >
          <Icon icon="lucide:bold" class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          @click="insertTextAtCursor('*', '*', '')"
          class="p-1.5 text-xs border border-(--border-main) hover:bg-(--bg-surface) text-(--text-primary) inline-flex items-center"
          title="Italic"
        >
          <Icon icon="lucide:italic" class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          @click="insertTextAtCursor('<u>', '</u>', '')"
          class="p-1.5 text-xs border border-(--border-main) hover:bg-(--bg-surface) text-(--text-primary) inline-flex items-center"
          title="Underline"
        >
          <Icon icon="lucide:underline" class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          @click="insertTextAtCursor('# ', '', 'Heading')"
          class="p-1.5 text-xs border border-(--border-main) hover:bg-(--bg-surface) text-(--text-primary) inline-flex items-center"
          title="Heading 1"
        >
          <Icon icon="lucide:heading-1" class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          @click="insertTextAtCursor('## ', '', 'Heading')"
          class="p-1.5 text-xs border border-(--border-main) hover:bg-(--bg-surface) text-(--text-primary) inline-flex items-center"
          title="Heading 2"
        >
          <Icon icon="lucide:heading-2" class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          @click="insertTextAtCursor('### ', '', 'Heading')"
          class="p-1.5 text-xs border border-(--border-main) hover:bg-(--bg-surface) text-(--text-primary) inline-flex items-center"
          title="Heading 3"
        >
          <Icon icon="lucide:heading-3" class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          @click="insertTextAtCursor('#### ', '', 'Heading')"
          class="p-1.5 text-xs border border-(--border-main) hover:bg-(--bg-surface) text-(--text-primary) inline-flex items-center"
          title="Heading 4"
        >
          <Icon icon="lucide:heading-4" class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          @click="insertTextAtCursor('##### ', '', 'Heading')"
          class="p-1.5 text-xs border border-(--border-main) hover:bg-(--bg-surface) text-(--text-primary) inline-flex items-center"
          title="Heading 5"
        >
          <Icon icon="lucide:heading-5" class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          @click="insertTextAtCursor('###### ', '', 'Heading')"
          class="p-1.5 text-xs border border-(--border-main) hover:bg-(--bg-surface) text-(--text-primary) inline-flex items-center"
          title="Heading 6"
        >
          <Icon icon="lucide:heading-6" class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          @click="insertTextAtCursor('```\n', '\n```', '// your code here')"
          class="p-1.5 text-xs border border-(--border-main) hover:bg-(--bg-surface) text-(--text-primary) inline-flex items-center"
          title="Code Block"
        >
          <Icon icon="lucide:code" class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          @click="insertTextAtCursor('[[', ']]', 'post-slug')"
          class="px-2 py-1 text-xs border border-(--border-main) hover:bg-(--bg-surface) text-(--accent-green) inline-flex items-center gap-1"
          title="Wikilink [[slug]]"
        >
          <Icon icon="lucide:link-2" class="w-3.5 h-3.5" />
          <span>[[Link]]</span>
        </button>
        <button
          type="button"
          @click="insertTextAtCursor('> [!NOTE] Title\n> ', '', 'Content')"
          class="px-2 py-1 text-xs border border-(--border-main) hover:bg-(--bg-surface) text-cyan-400 inline-flex items-center gap-1"
          title="Callout"
        >
          <Icon icon="lucide:message-square" class="w-3.5 h-3.5" />
          <span>[!Note]</span>
        </button>
        <button
          type="button"
          @click="insertTextAtCursor('$', '$', 'E=mc^2')"
          class="px-2 py-1 text-xs border border-(--border-main) hover:bg-(--bg-surface) text-purple-400 inline-flex items-center gap-1"
          title="Math Formula"
        >
          <Icon icon="lucide:sigma" class="w-3.5 h-3.5" />
          <span>$Math$</span>
        </button>

        <span class="w-px h-4 bg-(--border-main) mx-1"></span>

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
          class="px-2.5 py-1 text-xs border border-(--accent-green-dim) text-(--accent-green-bright) hover:bg-(--accent-green-glow) inline-flex items-center gap-1.5"
          title="Upload media"
        >
          <Icon icon="lucide:upload-cloud" class="w-3.5 h-3.5" />
          <span>{{ isUploading ? "Uploading..." : "Upload Media" }}</span>
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
          Editor
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
          Split
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
          Preview
        </button>
      </div>
    </div>

    <!-- Upload Progress Bar -->
    <div
      v-if="uploadProgress.active"
      class="p-3 border border-(--border-highlight) bg-(--bg-surface-elevated) font-mono text-xs space-y-2 shadow-sm"
    >
      <div class="flex items-center justify-between">
        <div
          class="flex items-center gap-2 text-(--accent-green-bright) font-bold truncate"
        >
          <Icon icon="lucide:loader" class="w-3.5 h-3.5 animate-spin" />
          <span class="truncate">Uploading: {{ uploadProgress.filename }}</span>
        </div>
        <span class="text-(--text-secondary) text-[11px] shrink-0 pl-2">
          {{ formatBytes(uploadProgress.loaded) }} /
          {{ formatBytes(uploadProgress.total) }} ({{ uploadProgress.percent }}%)
        </span>
      </div>
      <div
        class="h-1.5 bg-(--bg-primary) border border-(--border-subtle) overflow-hidden"
      >
        <div
          class="h-full bg-(--accent-green) transition-all duration-150 ease-out"
          :style="{ width: `${uploadProgress.percent}%` }"
        ></div>
      </div>
    </div>

    <!-- Main Workspace -->
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
          <span>Markdown</span>
          <span>{{ content.split(/\s+/).filter(Boolean).length }} words</span>
        </div>
        <textarea
          ref="textareaRef"
          v-model="content"
          @drop.prevent="handleDrop"
          @paste="handlePaste"
          placeholder="# Title&#10;&#10;Start writing your post..."
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
          <span>Preview</span>
          <span v-if="isRenderingPreview" class="text-(--accent-green)"
            >> Rendering...</span
          >
        </div>
        <div
          class="p-6 overflow-y-auto max-h-175 markdown-body text-sm leading-relaxed"
          v-html="previewHtml"
        ></div>
      </div>
    </div>

    <!-- Orphan Removal Confirmation Modal -->
    <div
      v-if="showOrphanModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-(--modal-overlay-bg) p-4"
    >
      <div
        class="max-w-lg w-full border border-(--status-warning-border) bg-(--bg-surface) p-6 space-y-4 shadow-2xl font-mono"
      >
        <div
          class="flex items-center gap-2 text-(--status-warning-text) text-sm font-bold uppercase tracking-wider"
        >
          <Icon
            icon="lucide:alert-triangle"
            class="w-4 h-4 text-(--status-warning-text)"
          />
          <span>[ORPHANED_MEDIA_DETECTED]</span>
        </div>

        <p class="text-xs text-(--text-primary) leading-relaxed">
          The following media asset(s) were previously linked in this post but
          are no longer referenced in your updated content:
        </p>

        <div
          class="p-3 bg-(--bg-primary) border border-(--border-main) max-h-36 overflow-y-auto space-y-1"
        >
          <div
            v-for="filename in orphanedFilesToPrompt"
            :key="filename"
            class="text-xs font-mono text-(--status-warning-text) truncate"
          >
            • {{ filename }}
          </div>
        </div>

        <p class="text-xs text-(--text-secondary)">
          Would you like to keep them or
          <span class="font-bold text-(--status-error-text)"
            >permanently delete</span
          >
          these unreferenced files from storage?
        </p>

        <div
          class="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-(--border-subtle)"
        >
          <button
            type="button"
            @click="showOrphanModal = false"
            class="px-3 py-1.5 text-xs uppercase tracking-wider border border-(--border-main) text-(--text-muted) hover:text-(--text-primary)"
          >
            Cancel
          </button>
          <button
            type="button"
            @click="confirmSaveWithOrphanChoice(false)"
            class="px-3 py-1.5 text-xs uppercase tracking-wider border border-(--border-highlight) text-(--text-primary) hover:bg-(--bg-surface-elevated)"
          >
            Keep & Save
          </button>
          <button
            type="button"
            @click="confirmSaveWithOrphanChoice(true)"
            class="px-3 py-1.5 text-xs uppercase tracking-wider font-bold bg-(--status-warning-solid) text-(--text-inverse) hover:bg-(--status-warning-solid-hover)"
          >
            Delete & Save
          </button>
        </div>
      </div>
    </div>
    <div
      v-if="showPublishedDateModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-(--modal-overlay-bg) p-4 font-mono text-xs"
    >
      <div
        class="max-w-lg w-full border border-(--border-main) bg-(--bg-surface) p-6 space-y-5 shadow-2xl"
      >
        <div
          class="flex items-center justify-between border-b border-(--border-subtle) pb-3"
        >
          <div
            class="flex items-center gap-2 text-(--accent-green) font-bold text-sm"
          >
            <Icon icon="lucide:calendar" class="w-4 h-4" />
            <span>// UPDATE_PUBLISHED_DATE</span>
          </div>
          <button
            type="button"
            @click="showPublishedDateModal = false"
            :disabled="isSaving"
            class="text-(--text-muted) hover:text-(--text-primary)"
          >
            [✕]
          </button>
        </div>
        <div
          class="p-4 border border-(--border-subtle) bg-(--bg-primary) space-y-2"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs uppercase text-(--text-muted)">
              Target Article:
            </span>
            <span
              class="px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider border border-(--accent-green) text-(--accent-green) bg-(--accent-green-glow)"
            >
              Published
            </span>
          </div>
          <div class="text-sm font-bold text-(--text-primary)">
            {{ title }}
          </div>
          <div
            class="text-[11px] text-(--text-muted) pt-1 border-t border-(--border-subtle) flex items-center justify-between"
          >
            <span>Original Published Date:</span>
            <strong class="text-(--text-secondary)">{{
              formatDate(publishedAt)
            }}</strong>
          </div>
        </div>
        <div
          class="p-3 border border-(--border-subtle) bg-(--bg-surface-elevated) text-(--text-secondary) space-y-1 leading-relaxed"
        >
          <div class="font-bold text-(--text-primary)">
            > Would you like to update the published date as well?
          </div>
          <div class="text-[11px]">
            You can keep the original publication timestamp or update it to the
            current time.
          </div>
        </div>
        <div
          class="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-(--border-subtle)"
        >
          <button
            type="button"
            @click="showPublishedDateModal = false"
            :disabled="isSaving"
            class="px-3 py-1.5 border border-(--border-main) text-(--text-muted) hover:text-(--text-primary) transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            @click="confirmPublishedDateChoice(false)"
            :disabled="isSaving"
            class="px-3 py-1.5 border border-(--border-highlight) text-(--text-primary) hover:bg-(--bg-surface-elevated) transition-colors"
          >
            Keep Original Date
          </button>
          <button
            type="button"
            @click="confirmPublishedDateChoice(true)"
            :disabled="isSaving"
            class="px-3 py-1.5 bg-(--accent-green) hover:bg-(--accent-green-bright) text-(--text-inverse) font-bold tracking-wider transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <span>Update Date & Save</span>
          </button>
        </div>
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
  background: var(--bg-surface-elevated);
  overflow-x: auto;
}

:deep(.code-block-wrapper pre) {
  padding: 1rem;
  margin: 0;
  background: transparent !important;
}
</style>
