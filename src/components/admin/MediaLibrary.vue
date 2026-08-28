<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { Icon } from "@iconify/vue";

export interface MediaUsageItem {
  id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  hash?: string | null;
  created_at: number;
  is_orphan: boolean;
  referenced_in: { id: string; title: string; slug: string }[];
}

const mediaList = ref<MediaUsageItem[]>([]);
const totalMedia = ref(0);
const orphanCount = ref(0);
const inUseCount = ref(0);
const loading = ref(false);
const filter = ref<"all" | "in_use" | "orphans">("all");
const searchQuery = ref("");
const preserveFilename = ref(false);
const isUploading = ref(false);
const isPruning = ref(false);
const copiedFilename = ref<string | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const errorMessage = ref("");
const successMessage = ref("");

// Pagination State
const PAGE_SIZE = 12;
const currentPage = ref(1);

// Media Reference Inspector Modal State
const inspectingMedia = ref<MediaUsageItem | null>(null);

async function fetchMedia() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const res = await fetch("/api/admin/media/orphans");
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to fetch media assets");

    mediaList.value = data.media || [];
    totalMedia.value = data.totalMedia || 0;
    orphanCount.value = data.orphanCount || 0;
    inUseCount.value = data.inUseCount || 0;
  } catch (err: any) {
    errorMessage.value = err.message;
  } finally {
    loading.value = false;
  }
}

const filteredMedia = computed(() => {
  return mediaList.value.filter((item) => {
    if (filter.value === "in_use" && item.is_orphan) return false;
    if (filter.value === "orphans" && !item.is_orphan) return false;

    const query = searchQuery.value.toLowerCase().trim();
    if (!query) return true;

    return (
      item.filename.toLowerCase().includes(query) ||
      item.original_name.toLowerCase().includes(query) ||
      item.referenced_in.some((r) => r.title.toLowerCase().includes(query))
    );
  });
});

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredMedia.value.length / PAGE_SIZE));
});

const paginatedMedia = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return filteredMedia.value.slice(start, start + PAGE_SIZE);
});

// Reset page on search or filter change
watch([searchQuery, filter], () => {
  currentPage.value = 1;
});

const totalOrphanBytes = computed(() => {
  return mediaList.value
    .filter((m) => m.is_orphan)
    .reduce((acc, m) => acc + m.size_bytes, 0);
});

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isImage(mimeType: string) {
  return mimeType.startsWith("image/");
}

function isVideo(mimeType: string) {
  return mimeType.startsWith("video/");
}

async function copyToClipboard(text: string, filenameKey: string) {
  try {
    await navigator.clipboard.writeText(text);
    copiedFilename.value = filenameKey;
    setTimeout(() => {
      if (copiedFilename.value === filenameKey) {
        copiedFilename.value = null;
      }
    }, 2500);
  } catch {
    alert("Failed to copy to clipboard");
  }
}

async function uploadFiles(files: FileList | File[]) {
  isUploading.value = true;
  errorMessage.value = "";
  successMessage.value = "";

  let deduplicatedCount = 0;
  let newCount = 0;

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append("file", file);
      formData.append(
        "preserveName",
        preserveFilename.value ? "true" : "false",
      );

      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: formData,
      });

      const data: any = await res.json();
      if (!res.ok)
        throw new Error(data.error || `Failed to upload ${file.name}`);

      if (data.deduplicated) {
        deduplicatedCount++;
      } else {
        newCount++;
      }
    }

    if (deduplicatedCount > 0 && newCount === 0) {
      successMessage.value = `Asset already exists in store (${deduplicatedCount} file(s) deduplicated).`;
    } else if (deduplicatedCount > 0) {
      successMessage.value = `Uploaded ${newCount} new asset(s) (${deduplicatedCount} file(s) matched existing hash and deduplicated).`;
    } else {
      successMessage.value = `Successfully uploaded ${newCount} asset(s).`;
    }

    await fetchMedia();
  } catch (err: any) {
    errorMessage.value = err.message;
  } finally {
    isUploading.value = false;
  }
}

function handleFileInput(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    uploadFiles(target.files);
  }
  target.value = "";
}

function handleDrop(e: DragEvent) {
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    uploadFiles(files);
  }
}

async function deleteSingleAsset(item: MediaUsageItem) {
  const confirmMsg = item.is_orphan
    ? `Permanently delete orphaned file "${item.filename}" from R2?`
    : `WARNING: "${item.filename}" is currently referenced in ${item.referenced_in.length} post(s). Are you sure you want to permanently delete it?`;

  if (!window.confirm(confirmMsg)) return;

  try {
    const res = await fetch(`/api/media/${item.id}`, { method: "DELETE" });
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to delete asset");
    successMessage.value = `Asset "${item.filename}" deleted successfully.`;
    if (inspectingMedia.value?.id === item.id) {
      inspectingMedia.value = null;
    }
    await fetchMedia();
  } catch (err: any) {
    errorMessage.value = err.message;
  }
}

async function pruneAllOrphans() {
  if (orphanCount.value === 0) return;

  const confirmed = window.confirm(
    `Are you sure you want to permanently delete ${orphanCount.value} orphaned media asset(s) (${formatBytes(totalOrphanBytes.value)}) from R2? This action cannot be undone.`,
  );
  if (!confirmed) return;

  isPruning.value = true;
  errorMessage.value = "";
  successMessage.value = "";

  try {
    const res = await fetch("/api/admin/media/orphans", { method: "DELETE" });
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to prune orphans");

    successMessage.value = `Successfully pruned ${data.deletedCount} orphaned asset(s).`;
    await fetchMedia();
  } catch (err: any) {
    errorMessage.value = err.message;
  } finally {
    isPruning.value = false;
  }
}

function openInspectModal(item: MediaUsageItem) {
  inspectingMedia.value = item;
}

function closeInspectModal() {
  inspectingMedia.value = null;
}

onMounted(() => {
  fetchMedia();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Header Stats Banner -->
    <div
      class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-(--border-main) bg-(--bg-surface) p-4"
    >
      <div class="flex flex-wrap items-center gap-4">
        <div class="flex items-center gap-2">
          <Icon icon="lucide:image" class="w-4 h-4 text-(--accent-green)" />
          <span
            class="text-xs uppercase tracking-widest text-(--accent-green) font-bold font-mono"
          >
            ASSETS // {{ totalMedia }} TOTAL
          </span>
        </div>
        <span class="text-xs text-(--text-secondary) font-mono">
          In Use:
          <strong class="text-(--text-primary)">{{ inUseCount }}</strong>
        </span>
        <span class="text-xs text-(--text-secondary) font-mono">
          Orphaned:
          <strong class="text-amber-400">{{ orphanCount }}</strong> ({{
            formatBytes(totalOrphanBytes)
          }})
        </span>
      </div>

      <div class="flex items-center gap-3 w-full sm:w-auto">
        <button
          type="button"
          @click="fetchMedia"
          :disabled="loading"
          class="px-3 py-1.5 text-xs uppercase tracking-wider border border-(--border-main) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--border-highlight) transition-colors inline-flex items-center gap-1.5 font-mono"
        >
          <Icon
            icon="lucide:rotate-cw"
            :class="['w-3.5 h-3.5', loading ? 'animate-spin' : '']"
          />
          <span>{{ loading ? "Scanning..." : "Rescan" }}</span>
        </button>
        <button
          v-if="orphanCount > 0"
          type="button"
          @click="pruneAllOrphans"
          :disabled="isPruning"
          class="px-3 py-1.5 text-xs uppercase tracking-wider font-bold border border-amber-600 bg-amber-950/40 text-amber-300 hover:bg-amber-900/60 transition-colors inline-flex items-center gap-1.5 font-mono"
        >
          <Icon icon="lucide:sparkles" class="w-3.5 h-3.5" />
          <span>{{
            isPruning ? "Pruning..." : `Prune ${orphanCount} Orphans`
          }}</span>
        </button>
      </div>
    </div>

    <!-- Alert Messages -->
    <div
      v-if="errorMessage"
      class="p-3 border border-red-500 bg-red-950/30 text-red-400 text-xs font-mono"
    >
      > ERROR: {{ errorMessage }}
    </div>
    <div
      v-if="successMessage"
      class="p-3 border border-(--accent-green) bg-(--accent-green-glow) text-(--accent-green-bright) text-xs font-mono"
    >
      > SUCCESS: {{ successMessage }}
    </div>

    <!-- Upload Dropzone Box -->
    <div
      @dragover.prevent
      @drop.prevent="handleDrop"
      class="border border-dashed border-(--border-main) hover:border-(--accent-green) bg-(--bg-surface-elevated) p-6 text-center transition-colors"
    >
      <input
        ref="fileInputRef"
        type="file"
        multiple
        accept="image/*,video/*,audio/*,.pdf"
        class="hidden"
        @change="handleFileInput"
      />
      <div class="space-y-3">
        <Icon
          icon="lucide:upload-cloud"
          class="w-8 h-8 text-(--accent-green) mx-auto"
        />
        <div class="text-sm text-(--text-primary) font-bold font-mono">
          Drag and drop images or media files (automatic SHA-256 deduplication
          enabled)
        </div>
        <div class="flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            @click="fileInputRef?.click()"
            :disabled="isUploading"
            class="px-4 py-1.5 text-xs uppercase tracking-wider font-bold bg-(--accent-green) text-(--text-inverse) hover:bg-(--accent-green-bright) inline-flex items-center gap-1.5 font-mono"
          >
            <Icon icon="lucide:folder-open" class="w-3.5 h-3.5" />
            <span>{{
              isUploading ? "Uploading Assets..." : "Browse Files"
            }}</span>
          </button>
          <label
            class="flex items-center gap-2 text-xs text-(--text-secondary) cursor-pointer font-mono"
          >
            <input
              v-model="preserveFilename"
              type="checkbox"
              class="accent-(--accent-green)"
            />
            Keep original filename
          </label>
        </div>
      </div>
    </div>

    <!-- Filter & Search Controls -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
      <div class="flex-1 relative">
        <Icon
          icon="lucide:search"
          class="w-4 h-4 text-(--text-muted) absolute left-3 top-1/2 -translate-y-1/2"
        />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Filter by filename, original name, post title..."
          class="w-full pl-9 pr-3 py-2 text-sm bg-(--bg-surface) border border-(--border-main) text-(--text-primary) placeholder-(--text-muted) focus:outline-none focus:border-(--border-highlight) font-mono"
        />
      </div>
      <div
        class="flex items-center gap-1 border border-(--border-main) p-1 bg-(--bg-surface)"
      >
        <button
          type="button"
          @click="filter = 'all'"
          :class="[
            'px-3 py-1 text-xs uppercase tracking-wider transition-colors font-mono',
            filter === 'all'
              ? 'bg-(--accent-green-dim) text-white font-bold'
              : 'text-(--text-secondary) hover:text-(--text-primary)',
          ]"
        >
          All ({{ totalMedia }})
        </button>
        <button
          type="button"
          @click="filter = 'in_use'"
          :class="[
            'px-3 py-1 text-xs uppercase tracking-wider transition-colors font-mono',
            filter === 'in_use'
              ? 'bg-(--accent-green) text-black font-bold'
              : 'text-(--text-secondary) hover:text-(--text-primary)',
          ]"
        >
          In Use ({{ inUseCount }})
        </button>
        <button
          type="button"
          @click="filter = 'orphans'"
          :class="[
            'px-3 py-1 text-xs uppercase tracking-wider transition-colors font-mono',
            filter === 'orphans'
              ? 'bg-amber-600 text-black font-bold'
              : 'text-(--text-secondary) hover:text-(--text-primary)',
          ]"
        >
          Orphans ({{ orphanCount }})
        </button>
      </div>
    </div>

    <!-- Assets Grid -->
    <div
      v-if="loading && mediaList.length === 0"
      class="border border-(--border-main) bg-(--bg-surface) p-8 text-center text-(--text-muted) font-mono text-sm"
    >
      > Scanning R2 and D1 for media references...
    </div>
    <div
      v-else-if="filteredMedia.length === 0"
      class="border border-(--border-main) bg-(--bg-surface) p-8 text-center text-(--text-muted) font-mono text-sm"
    >
      > No assets found matching criteria.
    </div>
    <div v-else class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="item in paginatedMedia"
          :key="item.id"
          class="border border-(--border-main) bg-(--bg-surface) flex flex-col justify-between hover:border-(--border-highlight) transition-colors group"
        >
          <!-- Preview Area -->
          <div
            class="h-44 bg-(--bg-primary) border-b border-(--border-subtle) flex items-center justify-center overflow-hidden relative"
          >
            <img
              v-if="isImage(item.mime_type)"
              :src="`/media/${item.filename}`"
              :alt="item.original_name"
              class="w-full h-full object-contain p-2"
              loading="lazy"
            />
            <video
              v-else-if="isVideo(item.mime_type)"
              :src="`/media/${item.filename}`"
              controls
              class="w-full h-full object-contain"
              preload="metadata"
            ></video>
            <div
              v-else
              class="text-center p-4 text-(--text-muted) flex flex-col items-center justify-center"
            >
              <Icon
                icon="lucide:file"
                class="w-10 h-10 mb-1 text-(--text-muted)"
              />
              <span class="text-xs uppercase font-mono">{{
                item.mime_type
              }}</span>
            </div>

            <!-- Status Badge -->
            <div class="absolute top-2 right-2 flex items-center gap-1.5">
              <span
                :class="[
                  'px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider backdrop-blur-sm font-mono',
                  item.is_orphan
                    ? 'border border-amber-500 bg-amber-950/80 text-amber-300'
                    : 'border border-(--accent-green) bg-(--bg-surface-elevated)/90 text-(--accent-green)',
                ]"
              >
                {{ item.is_orphan ? "Orphan" : "In Use" }}
              </span>
            </div>
          </div>

          <!-- Details Area -->
          <div class="p-3 space-y-2 flex-1">
            <div
              class="text-xs font-bold text-(--text-primary) truncate font-mono"
              :title="item.filename"
            >
              {{ item.filename }}
            </div>
            <div
              class="text-[11px] text-(--text-muted) flex items-center justify-between font-mono"
            >
              <span>{{ formatBytes(item.size_bytes) }}</span>
              <span>{{ formatDate(item.created_at) }}</span>
            </div>

            <!-- References link pill -->
            <div
              class="text-[11px] text-(--text-secondary) border-t border-(--border-subtle) pt-1.5 flex items-center justify-between"
            >
              <span class="text-(--text-muted) text-[10px] uppercase font-mono">
                {{
                  item.referenced_in.length === 1
                    ? "1 Post Links"
                    : `${item.referenced_in.length} Posts Link`
                }}
              </span>
              <button
                type="button"
                @click="openInspectModal(item)"
                class="text-[10px] font-mono text-(--accent-green) hover:underline inline-flex items-center gap-0.5"
              >
                <span>Inspect</span>
                <Icon icon="lucide:arrow-right" class="w-3 h-3" />
              </button>
            </div>
          </div>

          <!-- Action Buttons -->
          <div
            class="p-2 border-t border-(--border-subtle) bg-(--bg-surface-elevated) flex items-center justify-between gap-1.5 text-xs"
          >
            <!-- Copy Embed Tag Button -->
            <button
              type="button"
              @click="
                copyToClipboard(`![[${item.filename}]]`, `embed-${item.id}`)
              "
              class="flex-1 py-1 border border-(--border-main) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--border-highlight) transition-colors inline-flex items-center justify-center gap-1.5 font-mono"
            >
              <Icon
                :icon="
                  copiedFilename === `embed-${item.id}`
                    ? 'lucide:check'
                    : 'lucide:copy'
                "
                class="w-3.5 h-3.5"
              />
              <span>{{
                copiedFilename === `embed-${item.id}` ? "Copied" : "Copy Embed"
              }}</span>
            </button>

            <!-- Linked Posts Inspector Button -->
            <button
              type="button"
              @click="openInspectModal(item)"
              class="p-1.5 border border-(--border-main) text-(--text-secondary) hover:text-(--accent-green-bright) hover:border-(--border-highlight) inline-flex items-center"
              :title="`Inspect ${item.referenced_in.length} linked post(s)`"
            >
              <Icon icon="lucide:link-2" class="w-3.5 h-3.5" />
            </button>

            <!-- Open Raw URL -->
            <a
              :href="`/media/${item.filename}`"
              target="_blank"
              class="p-1.5 border border-(--border-main) text-(--text-secondary) hover:text-(--text-primary) inline-flex items-center"
              title="Open raw file"
            >
              <Icon icon="lucide:external-link" class="w-3.5 h-3.5" />
            </a>

            <!-- Delete Asset -->
            <button
              type="button"
              @click="deleteSingleAsset(item)"
              class="p-1.5 border border-red-900/50 text-red-400 hover:border-red-500 hover:bg-red-950/40 inline-flex items-center"
              title="Delete Asset"
            >
              <Icon icon="lucide:trash-2" class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <!-- Pagination Toolbar -->
      <div
        v-if="totalPages > 1"
        class="flex flex-col sm:flex-row items-center justify-between gap-4 border border-(--border-main) bg-(--bg-surface) p-4 font-mono text-xs"
      >
        <div class="text-(--text-muted)">
          Showing
          <strong class="text-(--text-primary)">{{
            paginatedMedia.length
          }}</strong>
          of
          <strong class="text-(--text-primary)">{{
            filteredMedia.length
          }}</strong>
          assets (Page {{ currentPage }} of {{ totalPages }})
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="currentPage = Math.max(1, currentPage - 1)"
            :disabled="currentPage === 1"
            class="px-3 py-1.5 border border-(--border-main) text-(--text-primary) hover:border-(--border-highlight) hover:bg-(--accent-green-glow) transition-colors inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Icon icon="lucide:arrow-left" class="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>

          <div class="flex items-center gap-1">
            <button
              v-for="p in totalPages"
              :key="p"
              type="button"
              @click="currentPage = p"
              :class="[
                'w-7 h-7 flex items-center justify-center text-xs border transition-colors',
                p === currentPage
                  ? 'border-(--accent-green) bg-(--accent-green-glow) text-(--accent-green-bright) font-bold'
                  : 'border-(--border-subtle) text-(--text-secondary) hover:border-(--border-main) hover:text-(--text-primary)',
              ]"
            >
              {{ p }}
            </button>
          </div>

          <button
            type="button"
            @click="currentPage = Math.min(totalPages, currentPage + 1)"
            :disabled="currentPage === totalPages"
            class="px-3 py-1.5 border border-(--border-main) text-(--text-primary) hover:border-(--border-highlight) hover:bg-(--accent-green-glow) transition-colors inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>Next</span>
            <Icon icon="lucide:arrow-right" class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Media Reference Inspector Modal -->
    <div
      v-if="inspectingMedia"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <div
        class="max-w-xl w-full border border-(--border-highlight) bg-(--bg-surface) p-6 space-y-5 shadow-2xl"
      >
        <!-- Modal Header -->
        <div
          class="flex items-center justify-between border-b border-(--border-subtle) pb-3"
        >
          <div
            class="flex items-center gap-2 text-(--accent-green) font-mono text-sm font-bold"
          >
            <Icon icon="lucide:link-2" class="w-4 h-4" />
            <span>// ASSET_REFERENCE_INSPECTOR</span>
          </div>
          <button
            type="button"
            @click="closeInspectModal"
            class="text-(--text-muted) hover:text-(--text-primary) text-sm font-mono"
          >
            [✕ Close]
          </button>
        </div>

        <!-- Asset Overview Card -->
        <div
          class="flex items-center gap-4 p-3 bg-(--bg-primary) border border-(--border-subtle)"
        >
          <div
            class="w-16 h-16 bg-(--bg-surface-elevated) border border-(--border-subtle) flex items-center justify-center shrink-0 overflow-hidden"
          >
            <img
              v-if="isImage(inspectingMedia.mime_type)"
              :src="`/media/${inspectingMedia.filename}`"
              :alt="inspectingMedia.original_name"
              class="w-full h-full object-contain"
            />
            <Icon
              v-else
              icon="lucide:file"
              class="w-8 h-8 text-(--text-muted)"
            />
          </div>

          <div class="flex-1 min-w-0 space-y-1 font-mono text-xs">
            <div
              class="font-bold text-(--text-primary) truncate"
              :title="inspectingMedia.filename"
            >
              {{ inspectingMedia.filename }}
            </div>
            <div class="text-(--text-muted) text-[11px] flex flex-wrap gap-x-3">
              <span>{{ formatBytes(inspectingMedia.size_bytes) }}</span>
              <span>{{ inspectingMedia.mime_type }}</span>
              <span>{{ formatDate(inspectingMedia.created_at) }}</span>
            </div>
            <div class="pt-0.5">
              <span
                :class="[
                  'px-1.5 py-0.2 text-[10px] uppercase font-bold',
                  inspectingMedia.is_orphan
                    ? 'border border-amber-500 text-amber-300 bg-amber-950/60'
                    : 'border border-(--accent-green) text-(--accent-green) bg-(--accent-green-glow)',
                ]"
              >
                {{
                  inspectingMedia.is_orphan
                    ? "Orphan (0 Posts)"
                    : `Linked in ${inspectingMedia.referenced_in.length} Post(s)`
                }}
              </span>
            </div>
          </div>
        </div>

        <!-- Referencing Posts List -->
        <div class="space-y-3">
          <div
            class="text-xs uppercase tracking-wider font-mono text-(--text-secondary) font-bold"
          >
            Posts Referencing This Asset:
          </div>

          <div
            v-if="inspectingMedia.referenced_in.length === 0"
            class="p-4 border border-amber-500/40 bg-amber-950/20 text-amber-300 text-xs font-mono space-y-1"
          >
            <div>> No articles currently reference this media file.</div>
            <div class="text-[11px] text-(--text-muted)">
              This asset is an orphan and safe to delete or prune.
            </div>
          </div>

          <div
            v-else
            class="max-h-60 overflow-y-auto space-y-2 border border-(--border-subtle) bg-(--bg-primary) p-3"
          >
            <div
              v-for="post in inspectingMedia.referenced_in"
              :key="post.id"
              class="p-2.5 border border-(--border-subtle) bg-(--bg-surface-elevated) hover:border-(--border-highlight) transition-colors flex items-center justify-between gap-3"
            >
              <div class="min-w-0 flex-1 font-mono">
                <div class="text-xs font-bold text-(--text-primary) truncate">
                  {{ post.title }}
                </div>
                <div class="text-[11px] text-(--text-muted) truncate">
                  /posts/{{ post.slug }}
                </div>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <a
                  :href="`/posts/${post.slug}`"
                  target="_blank"
                  class="px-2 py-1 text-xs border border-(--border-main) text-(--accent-green) hover:border-(--accent-green) hover:bg-(--accent-green-glow) inline-flex items-center gap-1 font-mono"
                >
                  <Icon icon="lucide:external-link" class="w-3 h-3" />
                  <span>View Post</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer Actions -->
        <div
          class="flex items-center justify-between pt-3 border-t border-(--border-subtle) font-mono text-xs"
        >
          <button
            type="button"
            @click="
              copyToClipboard(
                `![[${inspectingMedia.filename}]]`,
                `modal-copy-${inspectingMedia.id}`,
              )
            "
            class="px-3 py-1.5 border border-(--border-main) text-(--text-primary) hover:border-(--border-highlight) hover:bg-(--accent-green-glow) inline-flex items-center gap-1.5"
          >
            <Icon icon="lucide:copy" class="w-3.5 h-3.5" />
            <span>{{
              copiedFilename === `modal-copy-${inspectingMedia.id}`
                ? "Copied Embed Tag!"
                : "Copy Embed Tag"
            }}</span>
          </button>

          <button
            type="button"
            @click="closeInspectModal"
            class="px-4 py-1.5 bg-(--accent-green) text-(--text-inverse) font-bold uppercase tracking-wider hover:bg-(--accent-green-bright)"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
