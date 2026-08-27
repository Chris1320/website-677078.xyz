<script setup lang="ts">
import { ref, onMounted } from "vue";
import PostList, { type PostItem } from "./PostList.vue";
import PostEditor from "./PostEditor.vue";
import MediaLibrary from "./MediaLibrary.vue";

type Tab = "posts" | "editor" | "media";

const currentTab = ref<Tab>("posts");
const posts = ref<PostItem[]>([]);
const loading = ref(false);
const editingPost = ref<PostItem | null>(null);
const errorMessage = ref("");

async function fetchPosts() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const res = await fetch("/api/admin/posts");
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to fetch posts");
    posts.value = data.posts || [];
  } catch (err: any) {
    errorMessage.value = err.message;
  } finally {
    loading.value = false;
  }
}

function handleNewPost() {
  editingPost.value = null;
  currentTab.value = "editor";
}

function handleEditPost(post: PostItem) {
  editingPost.value = post;
  currentTab.value = "editor";
}

async function handleDeletePost(post: PostItem) {
  const confirmed = window.confirm(
    `Are you sure you want to delete post "${post.title}" (/blogs/${post.slug})?`,
  );
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/admin/posts/${post.id}`, {
      method: "DELETE",
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to delete post");
    await fetchPosts();
  } catch (err: any) {
    alert(`Error deleting post: ${err.message}`);
  }
}

function handlePostSaved(savedPost: PostItem) {
  editingPost.value = savedPost;
  fetchPosts();
}

onMounted(() => {
  fetchPosts();
});
</script>

<template>
  <div class="admin-workspace space-y-6">
    <!-- Navigation Banner -->
    <div
      class="flex flex-wrap items-center justify-between gap-4 border-b border-(--border-main) pb-4"
    >
      <div class="flex items-center gap-3">
        <h1
          class="text-lg font-bold text-(--accent-green) uppercase tracking-wider"
        >
          // ADMIN_CONSOLE
        </h1>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          @click="currentTab = 'posts'"
          :class="[
            'px-3 py-1.5 text-xs uppercase tracking-wider transition-colors border',
            currentTab === 'posts'
              ? 'border-(--border-highlight) bg-(--accent-green-glow) text-(--accent-green-bright) font-bold'
              : 'border-(--border-subtle) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--border-main)',
          ]"
        >
          Posts ({{ posts.length }})
        </button>
        <button
          type="button"
          @click="handleNewPost"
          :class="[
            'px-3 py-1.5 text-xs uppercase tracking-wider transition-colors border',
            currentTab === 'editor' && !editingPost
              ? 'border-(--border-highlight) bg-(--accent-green-glow) text-(--accent-green-bright) font-bold'
              : 'border-(--border-subtle) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--border-main)',
          ]"
        >
          + New Post
        </button>
        <button
          type="button"
          @click="currentTab = 'media'"
          :class="[
            'px-3 py-1.5 text-xs uppercase tracking-wider transition-colors border',
            currentTab === 'media'
              ? 'border-(--border-highlight) bg-(--accent-green-glow) text-(--accent-green-bright) font-bold'
              : 'border-(--border-subtle) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--border-main)',
          ]"
        >
          Media Library
        </button>
      </div>
    </div>

    <!-- Error Banner -->
    <div
      v-if="errorMessage"
      class="p-4 border border-red-500 bg-red-950/30 text-red-400 text-xs"
    >
      > SYSTEM ALERT: {{ errorMessage }}
    </div>

    <!-- Tab: Posts List -->
    <PostList
      v-if="currentTab === 'posts'"
      :posts="posts"
      :loading="loading"
      @new-post="handleNewPost"
      @edit-post="handleEditPost"
      @delete-post="handleDeletePost"
      @refresh="fetchPosts"
    />

    <!-- Tab: Editor -->
    <PostEditor
      v-else-if="currentTab === 'editor'"
      :initial-post="editingPost"
      @back="currentTab = 'posts'"
      @saved="handlePostSaved"
    />

    <!-- Tab: Media Library -->
    <MediaLibrary v-else-if="currentTab === 'media'" />
  </div>
</template>
