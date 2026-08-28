<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { Icon } from "@iconify/vue";
import { formatDate, formatBytes } from "../../lib/utils";
import { MEDIA_PAGE_SIZE } from "../../lib/info";

export interface MediaUsageItem {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  hash?: string | null;
  created_at: number;
  is_orphan: boolean;
  referenced_in: {
    id: string;
    title: string;
    slug: string;
    status?: "draft" | "published";
  }[];
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

const currentPage = ref(1);

const inspectingMedia = ref<MediaUsageItem | null>(null);

const assetToDelete = ref<MediaUsageItem | null>(null);
const isDeletingAsset = ref(false);
const showPruneModal = ref(false);

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
      item.referenced_in.some((r) => r.title.toLowerCase().includes(query))
    );
  });
});

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredMedia.value.length / MEDIA_PAGE_SIZE));
});

const paginatedMedia = computed(() => {
  const start = (currentPage.value - 1) * MEDIA_PAGE_SIZE;
  return filteredMedia.value.slice(start, start + MEDIA_PAGE_SIZE);
});

// Reset page on search or filter change
watch([searchQuery, filter], () => {
  currentPage.value = 1;
});

// Also return to top when page number changes
// FIXME: when last page has few items and user goes to previous page,
// the scroll jumps to top of the page instead of the search bar.
// if from last page to first page, no movement happens.
watch(currentPage, () => {
  const searchBar = document.getElementById("searchbar");
  if (searchBar) {
    searchBar.scrollIntoView({ block: "start", behavior: "smooth" });
  }
});

const totalOrphanBytes = computed(() => {
  return mediaList.value
    .filter((m) => m.is_orphan)
    .reduce((acc, m) => acc + m.size_bytes, 0);
});

function isImage(mimeType: string) {
  return mimeType.startsWith("image/");
}

function isVideo(mimeType: string) {
  return mimeType.startsWith("video/");
}

function isAudio(mimeType: string) {
  return mimeType.startsWith("audio/");
}

function toggleMediaPlay(e: Event) {
  const target = e.currentTarget as HTMLElement;
  const container = target.closest(".group\\/media");
  const media = container?.querySelector<HTMLMediaElement>("video, audio");
  const playOverlay = container?.querySelector<HTMLElement>(
    ".video-play-overlay",
  );
  const playIcon = container?.querySelector<HTMLElement>(".play-icon");
  const pauseIcon = container?.querySelector<HTMLElement>(".pause-icon");

  if (!media) return;
  if (media.paused) {
    media.play().catch(() => {});
    if (playOverlay) playOverlay.style.opacity = "0";
    playIcon?.classList.add("hidden");
    pauseIcon?.classList.remove("hidden");
  } else {
    media.pause();
    if (playOverlay) playOverlay.style.opacity = "1";
    playIcon?.classList.remove("hidden");
    pauseIcon?.classList.add("hidden");
  }
}

function onMediaTimeUpdate(e: Event) {
  const media = e.target as HTMLMediaElement;
  if (!media?.duration) return;
  const container = media.closest(".group\\/media");
  const progress = container?.querySelector<HTMLElement>(".media-progress");
  if (progress) {
    progress.style.width = `${(media.currentTime / media.duration) * 100}%`;
  }
}

function onMediaEnded(e: Event) {
  const media = e.target as HTMLMediaElement;
  if (!media) return;
  const container = media.closest(".group\\/media");
  const playOverlay = container?.querySelector<HTMLElement>(
    ".video-play-overlay",
  );
  if (playOverlay) playOverlay.style.opacity = "1";
  container?.querySelector(".play-icon")?.classList.remove("hidden");
  container?.querySelector(".pause-icon")?.classList.add("hidden");
}

function seekMedia(e: MouseEvent) {
  const timeline = e.currentTarget as HTMLElement;
  const container = timeline.closest(".group\\/media");
  const media = container?.querySelector<HTMLMediaElement>("video, audio");
  if (media?.duration) {
    const rect = timeline.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    media.currentTime = pos * media.duration;
  }
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
      successMessage.value = `Uploaded ${newCount} new asset(s) (${deduplicatedCount} file(s) deduplicated).`;
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

function promptDeleteSingleAsset(item: MediaUsageItem) {
  assetToDelete.value = item;
}

function cancelDeleteAsset() {
  if (isDeletingAsset.value) return;
  assetToDelete.value = null;
}

async function confirmDeleteSingleAsset() {
  if (!assetToDelete.value) return;

  isDeletingAsset.value = true;
  errorMessage.value = "";
  successMessage.value = "";

  try {
    const res = await fetch(`/api/media/${assetToDelete.value.id}`, {
      method: "DELETE",
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to delete asset");

    successMessage.value = `Asset "${assetToDelete.value.filename}" deleted successfully from the database.`;
    if (inspectingMedia.value?.id === assetToDelete.value.id) {
      inspectingMedia.value = null;
    }
    assetToDelete.value = null;
    await fetchMedia();
  } catch (err: any) {
    errorMessage.value = err.message;
  } finally {
    isDeletingAsset.value = false;
  }
}

function promptPruneAllOrphans() {
  if (orphanCount.value === 0) return;
  showPruneModal.value = true;
}

function cancelPruneOrphans() {
  if (isPruning.value) return;
  showPruneModal.value = false;
}

async function confirmPruneAllOrphans() {
  isPruning.value = true;
  errorMessage.value = "";
  successMessage.value = "";

  try {
    const res = await fetch("/api/admin/media/orphans", { method: "DELETE" });
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to prune orphans");

    showPruneModal.value = false;
    successMessage.value = `Successfully pruned ${data.deletedCount} orphaned asset(s) (${formatBytes(totalOrphanBytes.value)}) from the database.`;
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
          <strong class="text-(--status-warning-text)">{{
            orphanCount
          }}</strong>
          ({{ formatBytes(totalOrphanBytes) }})
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
          @click="promptPruneAllOrphans"
          :disabled="isPruning"
          class="px-3 py-1.5 text-xs uppercase tracking-wider font-bold border border-(--status-warning-border) bg-(--status-warning-bg) text-(--status-warning-text) hover:bg-(--status-warning-solid) hover:text-(--text-inverse) transition-colors inline-flex items-center gap-1.5 font-mono"
        >
          <Icon icon="lucide:shredder" class="w-3.5 h-3.5" />
          <span>{{ isPruning ? "Pruning..." : "Prune" }}</span>
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
          Drag and drop media files here
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

    <div
      id="searchbar"
      class="flex flex-col sm:flex-row items-stretch sm:items-center gap-4"
    >
      <div class="flex-1 relative">
        <Icon
          icon="lucide:search"
          class="w-4 h-4 text-(--text-muted) absolute left-3 top-1/2 -translate-y-1/2"
        />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Filter by filename or post title..."
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
              ? 'bg-(--status-warning-solid) text-(--text-inverse) font-bold'
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
      > Scanning for media...
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
          <div
            class="h-44 bg-(--bg-primary) border-b border-(--border-subtle) flex items-center justify-center overflow-hidden relative"
          >
            <img
              v-if="isImage(item.mime_type)"
              :src="`/media/${item.filename}`"
              :alt="item.filename"
              class="w-full h-full object-contain p-2"
              loading="lazy"
            />
            <div
              v-else-if="isVideo(item.mime_type)"
              class="w-full h-full relative group/media flex items-center justify-center bg-(--bg-primary) overflow-hidden"
            >
              <video
                :src="`/media/${item.filename}`"
                class="w-full h-full object-contain cursor-pointer"
                preload="metadata"
                playsinline
                @click="toggleMediaPlay($event)"
                @timeupdate="onMediaTimeUpdate($event)"
                @ended="onMediaEnded($event)"
              ></video>
              <div
                class="video-play-overlay absolute inset-0 flex items-center justify-center pointer-events-none bg-black/25 transition-opacity duration-200"
              >
                <span
                  class="w-10 h-10 rounded-full border border-(--border-highlight) bg-(--bg-surface-elevated) text-(--accent-green-bright) flex items-center justify-center shadow-lg transform group-hover/media:scale-110 transition-transform"
                >
                  <Icon
                    icon="lucide:play"
                    class="w-5 h-5 fill-current ml-0.5"
                  />
                </span>
              </div>
              <div
                class="absolute bottom-0 left-0 right-0 p-2 bg-linear-to-t from-black/80 to-transparent flex items-center gap-2 font-mono text-[10px] text-white opacity-0 group-hover/media:opacity-100 transition-opacity z-10"
              >
                <button
                  type="button"
                  @click.stop="toggleMediaPlay($event)"
                  class="text-(--accent-green) hover:text-(--accent-green-bright) p-0.5"
                >
                  <Icon
                    icon="lucide:play"
                    class="w-3.5 h-3.5 play-icon fill-current"
                  />
                  <Icon
                    icon="lucide:pause"
                    class="w-3.5 h-3.5 pause-icon hidden fill-current"
                  />
                </button>
                <div
                  class="flex-1 h-1.5 bg-white/20 rounded cursor-pointer relative hover:h-2 transition-all"
                  @click.stop="seekMedia($event)"
                >
                  <div
                    class="h-full bg-(--accent-green) rounded media-progress pointer-events-none"
                    style="width: 0%"
                  ></div>
                </div>
              </div>
            </div>
            <div
              v-else-if="isAudio(item.mime_type)"
              class="w-full h-full relative group/media flex flex-col items-center justify-center p-4 bg-(--bg-primary) overflow-hidden"
            >
              <audio
                :src="`/media/${item.filename}`"
                preload="metadata"
                @timeupdate="onMediaTimeUpdate($event)"
                @ended="onMediaEnded($event)"
              ></audio>
              <div
                class="w-12 h-12 rounded-full text-(--accent-green-bright) flex items-center justify-center mb-3"
              >
                <Icon
                  icon="lucide:music"
                  class="w-10 h-10 text-(--text-muted)"
                />
              </div>
              <div
                class="w-full flex items-center gap-2 font-mono text-[10px] text-(--text-primary)"
              >
                <button
                  type="button"
                  @click.stop="toggleMediaPlay($event)"
                  class="text-(--accent-green) hover:text-(--accent-green-bright) p-1 rounded-full bg-(--bg-surface) border border-(--border-subtle)"
                  aria-label="Play/Pause Audio"
                >
                  <Icon
                    icon="lucide:play"
                    class="w-3.5 h-3.5 play-icon fill-current"
                  />
                  <Icon
                    icon="lucide:pause"
                    class="w-3.5 h-3.5 pause-icon hidden fill-current"
                  />
                </button>
                <div
                  class="flex-1 h-1.5 bg-(--border-subtle) rounded cursor-pointer relative hover:h-2 transition-all"
                  @click.stop="seekMedia($event)"
                >
                  <div
                    class="h-full bg-(--accent-green) rounded media-progress pointer-events-none"
                    style="width: 0%"
                  ></div>
                </div>
              </div>
            </div>
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

            <div class="absolute top-2 right-2 flex items-center gap-1.5">
              <span
                :class="[
                  'px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider backdrop-blur-sm font-mono',
                  item.is_orphan
                    ? 'border border-(--status-warning-border) bg-(--status-warning-bg) text-(--status-warning-text)'
                    : 'border border-(--accent-green) bg-(--bg-surface-elevated)/90 text-(--accent-green)',
                ]"
              >
                {{ item.is_orphan ? "Orphan" : "In Use" }}
              </span>
            </div>
          </div>

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
          <div
            class="p-2 border-t border-(--border-subtle) bg-(--bg-surface-elevated) flex items-center justify-between gap-1.5 text-xs"
          >
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
            <a
              :href="`/media/${item.filename}`"
              target="_blank"
              class="p-1.5 border border-(--border-main) text-(--text-secondary) hover:text-(--text-primary) inline-flex items-center"
              title="Open file"
            >
              <Icon icon="lucide:external-link" class="w-3.5 h-3.5" />
            </a>
            <button
              type="button"
              @click="promptDeleteSingleAsset(item)"
              class="p-1.5 border border-(--status-error-border) text-(--status-error-text) hover:bg-(--status-error-bg) inline-flex items-center"
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

    <!-- Inspector Modal -->
    <div
      v-if="inspectingMedia"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <div
        class="max-w-xl w-full border border-(--border-highlight) bg-(--bg-surface) p-6 space-y-5 shadow-2xl"
      >
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
        <div
          class="flex items-center gap-4 p-3 bg-(--bg-primary) border border-(--border-subtle)"
        >
          <div
            class="w-16 h-16 bg-(--bg-surface-elevated) border border-(--border-subtle) flex items-center justify-center shrink-0 overflow-hidden"
          >
            <img
              v-if="isImage(inspectingMedia.mime_type)"
              :src="`/media/${inspectingMedia.filename}`"
              :alt="inspectingMedia.filename"
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
                    ? 'border border-(--status-warning-border) text-(--status-warning-text) bg-(--status-warning-bg)'
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
        <div class="space-y-3">
          <div
            class="text-xs uppercase tracking-wider font-mono text-(--text-secondary) font-bold"
          >
            Posts Referencing This Asset:
          </div>
          <div
            v-if="inspectingMedia.referenced_in.length === 0"
            class="p-4 border border-(--status-warning-border) bg-(--status-warning-bg) text-(--status-warning-text) text-xs font-mono space-y-1"
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
              class="p-2 border border-(--border-subtle) bg-(--bg-surface) flex items-center justify-between text-xs font-mono"
            >
              <div class="space-y-0.5 truncate">
                <div class="font-bold text-(--text-primary) truncate">
                  {{ post.title }}
                </div>
                <div class="text-[10px] text-(--text-muted)">
                  /posts/{{ post.slug }}
                </div>
              </div>
              <span
                :class="[
                  'px-1.5 py-0.5 text-[9px] uppercase font-bold tracking-wider shrink-0 ml-2',
                  post.status === 'published'
                    ? 'border border-(--accent-green) text-(--accent-green)'
                    : 'border border-(--status-warning-border) text-(--status-warning-text)',
                ]"
              >
                {{ post.status }}
              </span>
            </div>
          </div>
        </div>
        <div class="flex justify-end pt-2 border-t border-(--border-subtle)">
          <button
            type="button"
            @click="closeInspectModal"
            class="px-4 py-2 border border-(--border-main) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--border-highlight) transition-colors font-mono text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Single Asset Modal -->
    <div
      v-if="assetToDelete"
      class="fixed inset-0 z-50 flex items-center justify-center bg-(--modal-overlay-bg) p-4 font-mono text-xs"
    >
      <div
        class="max-w-lg w-full border border-(--status-error-border) bg-(--bg-surface) p-6 space-y-5 shadow-2xl"
      >
        <div
          class="flex items-center justify-between border-b border-(--border-subtle) pb-3"
        >
          <div
            class="flex items-center gap-2 text-(--status-error-text) font-bold text-sm"
          >
            <Icon icon="lucide:alert-triangle" class="w-4 h-4" />
            <span>// CONFIRM_ASSET_DELETION // DESTRUCTIVE_ACTION</span>
          </div>
          <button
            type="button"
            @click="cancelDeleteAsset"
            :disabled="isDeletingAsset"
            class="text-(--text-muted) hover:text-(--text-primary)"
          >
            [✕]
          </button>
        </div>
        <div
          class="p-4 border border-(--border-subtle) bg-(--bg-primary) space-y-2"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs uppercase text-(--text-muted)"
              >Target Asset:</span
            >
            <span
              :class="[
                'px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider',
                assetToDelete.is_orphan
                  ? 'border border-(--status-warning-border) bg-(--status-warning-bg) text-(--status-warning-text)'
                  : 'border border-(--accent-green) bg-(--accent-green-glow) text-(--accent-green)',
              ]"
            >
              {{
                assetToDelete.is_orphan
                  ? "Orphan"
                  : `In Use (${assetToDelete.referenced_in.length} Post${assetToDelete.referenced_in.length === 1 ? "" : "s"})`
              }}
            </span>
          </div>
          <div
            class="w-16 h-16 bg-(--bg-surface-elevated) border border-(--border-subtle) flex items-center justify-center shrink-0 overflow-hidden"
          >
            <img
              v-if="isImage(assetToDelete.mime_type)"
              :src="`/media/${assetToDelete.filename}`"
              :alt="assetToDelete.filename"
              class="w-full h-full object-contain"
            />
            <Icon
              v-else
              icon="lucide:file"
              class="w-8 h-8 text-(--text-muted)"
            />
          </div>
          <div
            class="font-bold text-(--text-primary) text-sm truncate"
            :title="assetToDelete.filename"
          >
            {{ assetToDelete.filename }}
          </div>
          <div class="text-[11px] text-(--text-muted) flex items-center gap-4">
            <span>{{ formatBytes(assetToDelete.size_bytes) }}</span>
            <span>{{ assetToDelete.mime_type }}</span>
            <span>{{ formatDate(assetToDelete.created_at) }}</span>
          </div>
        </div>
        <div
          v-if="!assetToDelete.is_orphan"
          class="p-3 border border-(--status-warning-border) bg-(--status-warning-bg) text-(--status-warning-text) space-y-1"
        >
          <div class="font-bold">> WARNING: File is currently referenced!</div>
          <div class="text-[11px] text-(--text-secondary)">
            This asset is currently embedded in
            {{ assetToDelete.referenced_in.length }} post(s). Deleting it will
            result in broken Wikilinks on those articles. Consider removing the
            references before deleting this file.
          </div>
        </div>
        <div
          v-else
          class="p-3 border border-(--status-error-border) bg-(--status-error-bg) text-(--status-error-text) space-y-1"
        >
          <div class="font-bold">> Delete asset from database.</div>
          <div class="text-[11px] text-(--text-secondary)">
            This file will be permanently deleted from the database. This
            process is irreversible and cannot be undone.
          </div>
        </div>
        <div
          class="flex items-center justify-end gap-3 pt-3 border-t border-(--border-subtle)"
        >
          <button
            type="button"
            @click="cancelDeleteAsset"
            :disabled="isDeletingAsset"
            class="px-4 py-2 border border-(--border-main) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--border-highlight) transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            @click="confirmDeleteSingleAsset"
            :disabled="isDeletingAsset"
            class="px-4 py-2 bg-(--status-error-solid) hover:bg-(--status-error-solid-hover) text-(--text-inverse) font-bold uppercase tracking-wider inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Icon
              :icon="isDeletingAsset ? 'lucide:rotate-cw' : 'lucide:trash-2'"
              :class="['w-3.5 h-3.5', isDeletingAsset ? 'animate-spin' : '']"
            />
            <span>{{
              isDeletingAsset ? "Deleting..." : "Delete Permanently"
            }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Batch Prune Orphans Modal -->
    <div
      v-if="showPruneModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-(--modal-overlay-bg) p-4 font-mono text-xs"
    >
      <div
        class="max-w-lg w-full border border-(--status-warning-border) bg-(--bg-surface) p-6 space-y-5 shadow-2xl"
      >
        <div
          class="flex items-center justify-between border-b border-(--border-subtle) pb-3"
        >
          <div
            class="flex items-center gap-2 text-(--status-warning-text) font-bold text-sm"
          >
            <Icon icon="lucide:shredder" class="w-4 h-4" />
            <span>// CONFIRM_ORPHAN_PRUNING</span>
          </div>
          <button
            type="button"
            @click="cancelPruneOrphans"
            :disabled="isPruning"
            class="text-(--text-muted) hover:text-(--text-primary)"
          >
            [✕]
          </button>
        </div>
        <div
          class="p-4 border border-(--border-subtle) bg-(--bg-primary) space-y-2"
        >
          <div class="text-xs uppercase text-(--text-muted)">
            Pruning Summary:
          </div>
          <div class="text-base font-bold text-(--status-warning-text)">
            {{ orphanCount }} Orphaned Asset(s)
          </div>
          <div class="text-xs text-(--text-secondary)">
            Will be deleting a total of
            <strong class="text-(--text-primary)">{{
              formatBytes(totalOrphanBytes)
            }}</strong>
            worth of files.
          </div>
        </div>
        <div
          class="p-3 border border-(--status-warning-border) bg-(--status-warning-bg) text-(--status-warning-text) space-y-1 leading-relaxed"
        >
          <div class="font-bold">
            > Permanently delete all unreferenced assets.
          </div>
          <div class="text-[11px] text-(--text-secondary)">
            These files have no active markdown links in any published or
            drafted posts. This process is irreversible. Once deleted, they
            cannot be recovered.
          </div>
        </div>
        <div
          class="flex items-center justify-end gap-3 pt-3 border-t border-(--border-subtle)"
        >
          <button
            type="button"
            @click="cancelPruneOrphans"
            :disabled="isPruning"
            class="px-4 py-2 border border-(--border-main) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--border-highlight) transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            @click="confirmPruneAllOrphans"
            :disabled="isPruning"
            class="px-4 py-2 bg-(--status-warning-solid) hover:bg-(--status-warning-solid-hover) text-(--text-inverse) font-bold uppercase tracking-wider inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Icon
              :icon="isPruning ? 'lucide:rotate-cw' : 'lucide:trash-2'"
              :class="['w-3.5 h-3.5', isPruning ? 'animate-spin' : '']"
            />
            <span>{{
              isPruning ? "Pruning Assets..." : `Prune ${orphanCount} Orphans`
            }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
