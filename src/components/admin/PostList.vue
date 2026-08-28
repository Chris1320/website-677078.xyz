<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Icon } from "@iconify/vue";
import { formatDate, getPaginationWindow } from "../../lib/utils";
import { POSTS_PAGE_SIZE } from "../../lib/info";

export interface PostItem {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  content: string;
  status: "draft" | "published";
  created_at: number | string | Date;
  updated_at: number | string | Date;
  published_at?: number | string | Date | null;
  tags?: { id: string; name: string; slug: string }[];
}

const props = defineProps<{
  posts: PostItem[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: "new-post"): void;
  (e: "edit-post", post: PostItem): void;
  (e: "delete-post", post: PostItem): void;
  (e: "refresh"): void;
}>();

const searchQuery = ref("");
const statusFilter = ref<"all" | "published" | "draft">("all");

const currentPage = ref(1);

const filteredPosts = computed(() => {
  return props.posts.filter((post) => {
    const matchesStatus =
      statusFilter.value === "all" || post.status === statusFilter.value;
    const query = searchQuery.value.toLowerCase().trim();
    const matchesSearch =
      !query ||
      post.title.toLowerCase().includes(query) ||
      post.slug.toLowerCase().includes(query) ||
      post.description?.toLowerCase().includes(query) ||
      post.tags?.some((t) => t.name.toLowerCase().includes(query));

    return matchesStatus && matchesSearch;
  });
});

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredPosts.value.length / POSTS_PAGE_SIZE));
});

const visiblePages = computed(() => {
  return getPaginationWindow(currentPage.value, totalPages.value);
});

const paginatedPosts = computed(() => {
  const start = (currentPage.value - 1) * POSTS_PAGE_SIZE;
  return filteredPosts.value.slice(start, start + POSTS_PAGE_SIZE);
});

// Reset page on search or status filter change
watch([searchQuery, statusFilter], () => {
  currentPage.value = 1;
});
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div
      class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-(--border-main) bg-(--bg-surface) p-4"
    >
      <div class="flex items-center gap-2">
        <Icon icon="lucide:layers" class="w-4 h-4 text-(--accent-green)" />
        <span
          class="text-xs uppercase tracking-widest text-(--accent-green) font-bold font-mono"
        >
          POSTS // {{ posts.length }} TOTAL
        </span>
      </div>
      <div class="flex items-center gap-3 w-full sm:w-auto">
        <button
          type="button"
          @click="emit('refresh')"
          class="px-3 py-1.5 text-xs uppercase tracking-wider border border-(--border-main) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--border-highlight) transition-colors inline-flex items-center gap-1.5 font-mono"
          :disabled="loading"
        >
          <Icon
            icon="lucide:rotate-cw"
            :class="['w-3.5 h-3.5', loading ? 'animate-spin' : '']"
          />
          <span>{{ loading ? "Reloading..." : "Reload" }}</span>
        </button>
        <button
          type="button"
          @click="emit('new-post')"
          class="flex-1 sm:flex-none px-4 py-1.5 text-xs uppercase tracking-wider font-bold bg-(--accent-green) text-(--text-inverse) hover:bg-(--accent-green-bright) transition-colors inline-flex items-center gap-1.5 font-mono"
        >
          <Icon icon="lucide:plus" class="w-4 h-4" />
          <span>Create</span>
        </button>
      </div>
    </div>

    <!-- Filters & Search -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
      <div class="flex-1 relative">
        <Icon
          icon="lucide:search"
          class="w-4 h-4 text-(--text-muted) absolute left-3 top-1/2 -translate-y-1/2"
        />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by title, slug, tag..."
          class="w-full pl-9 pr-3 py-2 text-sm bg-(--bg-surface) border border-(--border-main) text-(--text-primary) placeholder-(--text-muted) focus:outline-none focus:border-(--border-highlight) font-mono"
        />
      </div>
      <div
        class="flex items-center gap-1 border border-(--border-main) p-1 bg-(--bg-surface)"
      >
        <button
          type="button"
          @click="statusFilter = 'all'"
          :class="[
            'px-3 py-1 text-xs uppercase tracking-wider transition-colors font-mono',
            statusFilter === 'all'
              ? 'bg-(--accent-green-dim) text-(--text-primary) font-bold'
              : 'text-(--text-secondary) hover:text-(--text-primary)',
          ]"
        >
          All ({{ posts.length }})
        </button>
        <button
          type="button"
          @click="statusFilter = 'published'"
          :class="[
            'px-3 py-1 text-xs uppercase tracking-wider transition-colors font-mono',
            statusFilter === 'published'
              ? 'bg-(--accent-green) text-(--text-inverse) font-bold'
              : 'text-(--text-secondary) hover:text-(--text-primary)',
          ]"
        >
          Published ({{ posts.filter((p) => p.status === "published").length }})
        </button>
        <button
          type="button"
          @click="statusFilter = 'draft'"
          :class="[
            'px-3 py-1 text-xs uppercase tracking-wider transition-colors font-mono',
            statusFilter === 'draft'
              ? 'bg-(--status-warning-solid) text-(--text-inverse) font-bold'
              : 'text-(--text-secondary) hover:text-(--text-primary)',
          ]"
        >
          Drafts ({{ posts.filter((p) => p.status === "draft").length }})
        </button>
      </div>
    </div>

    <!-- Posts Table & Content -->
    <div class="space-y-4">
      <div
        class="border border-(--border-main) bg-(--bg-surface) overflow-x-auto"
      >
        <div
          v-if="loading && posts.length === 0"
          class="p-8 text-center text-(--text-muted) font-mono text-sm"
        >
          > Querying database...
        </div>
        <div
          v-else-if="filteredPosts.length === 0"
          class="p-8 text-center text-(--text-muted) font-mono text-sm"
        >
          > No posts found matching filter.
        </div>
        <table v-else class="w-full text-left text-sm font-mono">
          <thead
            class="border-b border-(--border-main) bg-(--bg-surface-elevated) text-(--text-secondary) text-xs uppercase tracking-wider"
          >
            <tr>
              <th class="p-3">Status</th>
              <th class="p-3">Title</th>
              <th class="p-3">Tags</th>
              <th class="p-3">Date Updated</th>
              <th class="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-(--border-subtle)">
            <tr
              v-for="post in paginatedPosts"
              :key="post.id"
              class="hover:bg-(--bg-surface-hover) transition-colors group"
            >
              <td class="p-3 whitespace-nowrap">
                <span
                  :class="[
                    'px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider',
                    post.status === 'published'
                      ? 'border border-(--accent-green) text-(--accent-green) bg-(--accent-green-glow)'
                      : 'border border-(--status-warning-border) text-(--status-warning-text) bg-(--status-warning-bg)',
                  ]"
                >
                  {{ post.status }}
                </span>
              </td>
              <td class="p-3">
                <div
                  class="font-bold text-(--text-primary) group-hover:text-(--accent-green-bright) transition-colors"
                >
                  {{ post.title }}
                </div>
                <div class="text-xs text-(--text-muted) mt-0.5">
                  /posts/{{ post.slug }}
                </div>
              </td>
              <td class="p-3">
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="tag in post.tags"
                    :key="tag.id"
                    class="px-1.5 py-0.5 text-[10px] bg-(--bg-surface-elevated) border border-(--border-subtle) text-(--text-secondary)"
                  >
                    #{{ tag.name }}
                  </span>
                  <span
                    v-if="!post.tags || post.tags.length === 0"
                    class="text-xs text-(--text-muted)"
                  >
                    —
                  </span>
                </div>
              </td>
              <td class="p-3 whitespace-nowrap text-xs text-(--text-secondary)">
                {{ formatDate(post.updated_at) }}
              </td>
              <td class="p-3 text-right whitespace-nowrap space-x-2">
                <a
                  v-if="post.status === 'published'"
                  :href="`/posts/${post.slug}`"
                  target="_blank"
                  class="px-2 py-1 text-xs border border-(--border-subtle) text-(--text-muted) hover:text-(--text-primary) hover:border-(--border-main) inline-flex items-center gap-1"
                >
                  <Icon icon="lucide:external-link" class="w-3 h-3" />
                  <span>View</span>
                </a>
                <button
                  type="button"
                  @click="emit('edit-post', post)"
                  class="px-2 py-1 text-xs border border-(--border-main) text-(--text-primary) hover:border-(--border-highlight) hover:bg-(--accent-green-glow) inline-flex items-center gap-1"
                >
                  <Icon icon="lucide:pencil" class="w-3 h-3" />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  @click="emit('delete-post', post)"
                  class="px-2 py-1 text-xs border border-(--status-error-border) text-(--status-error-text) hover:bg-(--status-error-bg) inline-flex items-center gap-1"
                >
                  <Icon icon="lucide:trash-2" class="w-3 h-3" />
                  <span>Delete</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination Toolbar -->
      <div
        v-if="totalPages > 1"
        class="flex flex-col md:flex-row items-center justify-between gap-4 border border-(--border-main) bg-(--bg-surface) p-4 font-mono text-xs"
      >
        <div class="text-(--text-muted) whitespace-nowrap">
          Showing
          <strong class="text-(--text-primary)">{{
            paginatedPosts.length
          }}</strong>
          of
          <strong class="text-(--text-primary)">{{
            filteredPosts.length
          }}</strong>
          posts (Page {{ currentPage }} of {{ totalPages }})
        </div>

        <div
          class="flex flex-wrap items-center justify-center gap-1.5 max-w-full"
        >
          <button
            type="button"
            @click="currentPage = Math.max(1, currentPage - 1)"
            :disabled="currentPage === 1"
            class="px-2.5 py-1 border border-(--border-main) text-(--text-primary) hover:border-(--border-highlight) hover:bg-(--accent-green-glow) transition-colors inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
          >
            <Icon icon="lucide:arrow-left" class="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>

          <div class="flex flex-wrap items-center gap-1">
            <template v-for="(p, idx) in visiblePages" :key="idx">
              <span
                v-if="p === '...'"
                class="w-7 h-7 flex items-center justify-center text-xs text-(--text-muted) select-none"
              >
                ...
              </span>
              <button
                v-else
                type="button"
                @click="currentPage = Number(p)"
                :class="[
                  'w-7 h-7 flex items-center justify-center text-xs border transition-colors',
                  p === currentPage
                    ? 'border-(--accent-green) bg-(--accent-green-glow) text-(--accent-green-bright) font-bold'
                    : 'border-(--border-subtle) text-(--text-secondary) hover:border-(--border-main) hover:text-(--text-primary)',
                ]"
              >
                {{ p }}
              </button>
            </template>
          </div>

          <button
            type="button"
            @click="currentPage = Math.min(totalPages, currentPage + 1)"
            :disabled="currentPage === totalPages"
            class="px-2.5 py-1 border border-(--border-main) text-(--text-primary) hover:border-(--border-highlight) hover:bg-(--accent-green-glow) transition-colors inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
          >
            <span>Next</span>
            <Icon icon="lucide:arrow-right" class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
