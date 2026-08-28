<script setup lang="ts">
import { ref, computed } from "vue";
import { Icon } from "@iconify/vue";

export interface PostItem {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  content: string;
  status: "draft" | "published";
  created_at: number;
  updated_at: number;
  published_at?: number | null;
  tags?: { id: string; name: string; slug: string }[];
}

const props = defineProps<{
  posts: PostItem[];
  loading: boolean;
}>();

const emit = defineEmits<{
  (e: "new-post"): void;
  (e: "edit-post", post: PostItem): void;
  (e: "delete-post", post: PostItem): void;
  (e: "refresh"): void;
}>();

const searchQuery = ref("");
const statusFilter = ref<"all" | "published" | "draft">("all");

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

function formatDate(timestamp?: number | null) {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header Actions -->
    <div
      class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-(--border-main) bg-(--bg-surface) p-4"
    >
      <div class="flex items-center gap-2">
        <Icon icon="lucide:layers" class="w-4 h-4 text-(--accent-green)" />
        <span
          class="text-xs uppercase tracking-widest text-(--accent-green) font-bold"
        >
          POSTS // {{ posts.length }} TOTAL
        </span>
      </div>
      <div class="flex items-center gap-3 w-full sm:w-auto">
        <button
          type="button"
          @click="emit('refresh')"
          class="px-3 py-1.5 text-xs uppercase tracking-wider border border-(--border-main) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--border-highlight) transition-colors inline-flex items-center gap-1.5"
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
          class="flex-1 sm:flex-none px-4 py-1.5 text-xs uppercase tracking-wider font-bold bg-(--accent-green) text-(--text-inverse) hover:bg-(--accent-green-bright) transition-colors inline-flex items-center gap-1.5"
        >
          <Icon icon="lucide:plus" class="w-4 h-4" />
          <span>Create Post</span>
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
          class="w-full pl-9 pr-3 py-2 text-sm bg-(--bg-surface) border border-(--border-main) text-(--text-primary) placeholder-(--text-muted) focus:outline-none focus:border-(--border-highlight)"
        />
      </div>
      <div
        class="flex items-center gap-1 border border-(--border-main) p-1 bg-(--bg-surface)"
      >
        <button
          type="button"
          @click="statusFilter = 'all'"
          :class="[
            'px-3 py-1 text-xs uppercase tracking-wider transition-colors',
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
            'px-3 py-1 text-xs uppercase tracking-wider transition-colors',
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
            'px-3 py-1 text-xs uppercase tracking-wider transition-colors',
            statusFilter === 'draft'
              ? 'bg-amber-600 text-black font-bold'
              : 'text-(--text-secondary) hover:text-(--text-primary)',
          ]"
        >
          Drafts ({{ posts.filter((p) => p.status === "draft").length }})
        </button>
      </div>
    </div>

    <!-- Posts Table -->
    <div
      class="border border-(--border-main) bg-(--bg-surface) overflow-x-auto"
    >
      <div
        v-if="loading && posts.length === 0"
        class="p-8 text-center text-(--text-muted)"
      >
        > Querying D1 database...
      </div>
      <div
        v-else-if="filteredPosts.length === 0"
        class="p-8 text-center text-(--text-muted)"
      >
        > No posts found.
      </div>
      <table v-else class="w-full text-left text-sm">
        <thead
          class="border-b border-(--border-main) bg-(--bg-surface-elevated) text-(--text-secondary) text-xs uppercase tracking-wider"
        >
          <tr>
            <th class="p-3">Status</th>
            <th class="p-3">Title & Slug</th>
            <th class="p-3">Tags</th>
            <th class="p-3">Updated</th>
            <th class="p-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-(--border-subtle)">
          <tr
            v-for="post in filteredPosts"
            :key="post.id"
            class="hover:bg-(--bg-surface-hover) transition-colors group"
          >
            <td class="p-3 whitespace-nowrap">
              <span
                :class="[
                  'px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider',
                  post.status === 'published'
                    ? 'border border-(--accent-green) text-(--accent-green) bg-(--accent-green-glow)'
                    : 'border border-amber-500/50 text-amber-400 bg-amber-950/30',
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
                title="View Live Page"
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
                class="px-2 py-1 text-xs border border-red-900/50 text-red-400 hover:border-red-500 hover:bg-red-950/30 inline-flex items-center gap-1"
              >
                <Icon icon="lucide:trash-2" class="w-3 h-3" />
                <span>Delete</span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
