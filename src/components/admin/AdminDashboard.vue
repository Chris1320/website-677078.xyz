<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Icon } from "@iconify/vue";

import PostList, { type PostItem } from "./PostList.vue";
import MediaLibrary from "./MediaLibrary.vue";
import PostEditor from "./PostEditor.vue";
import UserSettingsModal from "./UserSettingsModal.vue";
import { extractMediaReferences } from "../../lib/markdown";
import { findTrueOrphans, pruneOrphanFiles } from "../../lib/media";

type Tab = "posts" | "editor" | "media";

const currentTab = ref<Tab>("posts"); // `posts` or `editor` or `media`
const loading = ref(false);
const editingPost = ref<PostItem | null>(null);
const postToDelete = ref<PostItem | null>(null);
const postOrphansToPrompt = ref<string[]>([]);
const alsoDeleteOrphans = ref(true);
const isScanningOrphans = ref(false);
const isDeleting = ref(false);
const errorMessage = ref("");
const deleteError = ref("");
const showUserSettings = ref(false);
const currentUsername = ref("username");

const posts = ref<PostItem[]>([]);

async function fetchCurrentUser() {
  try {
    const res = await fetch("/api/auth/me");
    if (res.ok) {
      const data: any = await res.json();
      currentUsername.value = data.user?.username || "admin";
    }
  } catch (err) {
    console.error("Failed to fetch user session", err);
  }
}

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

function updateEditUrl(idOrSlug?: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (idOrSlug) {
    url.searchParams.set("edit", idOrSlug);
  } else {
    url.searchParams.delete("edit");
  }
  window.history.replaceState(null, "", url.toString());
}

function handleNewPost() {
  editingPost.value = null;
  currentTab.value = "editor";
  updateEditUrl(null);
}

async function handleEditPost(post: PostItem) {
  editingPost.value = post;
  currentTab.value = "editor";
  updateEditUrl(post.id);

  try {
    const res = await fetch(`/api/admin/posts/${post.id}`);
    if (res.ok) {
      const data: any = await res.json();
      if (data.post && editingPost.value?.id === post.id) {
        editingPost.value = data.post;
      }
    }
  } catch (err) {
    console.error("Failed to fetch latest post data", err);
  }
}

function handleBackToPosts() {
  currentTab.value = "posts";
  editingPost.value = null;
  updateEditUrl(null);
  fetchPosts();
}

function switchTab(tab: Tab) {
  currentTab.value = tab;
  if (tab !== "editor") {
    editingPost.value = null;
    updateEditUrl(null);
  }
  if (tab === "posts") {
    fetchPosts();
  }
}

async function checkDeepLinkEdit() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const editTarget = params.get("edit");
  if (!editTarget) return;

  const foundInList = posts.value.find(
    (p) => p.id === editTarget || p.slug === editTarget,
  );
  if (foundInList) {
    handleEditPost(foundInList);
    return;
  }

  // If not found in current loaded posts list, fetch directly
  try {
    loading.value = true;
    const res = await fetch(`/api/admin/posts/${editTarget}`);
    if (res.ok) {
      const data: any = await res.json();
      if (data.post) {
        handleEditPost(data.post);
      }
    }
  } catch (err) {
    console.error("Failed to load deep-linked post:", err);
  } finally {
    loading.value = false;
  }
}

async function promptDeletePost(post: PostItem) {
  deleteError.value = "";
  postToDelete.value = post;
  postOrphansToPrompt.value = [];
  alsoDeleteOrphans.value = true;

  const refs = extractMediaReferences(post.content || "");
  if (refs.length > 0) {
    isScanningOrphans.value = true;
    postOrphansToPrompt.value = await findTrueOrphans(refs, post.id);
    isScanningOrphans.value = false;
  }
}

function cancelDeletePost() {
  if (isDeleting.value) return;
  postToDelete.value = null;
  postOrphansToPrompt.value = [];
  deleteError.value = "";
}

async function confirmDeletePost() {
  if (!postToDelete.value) return;
  isDeleting.value = true;
  deleteError.value = "";

  try {
    const targetPost = postToDelete.value;
    const res = await fetch(`/api/admin/posts/${targetPost.id}`, {
      method: "DELETE",
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to delete post");

    // If user opted to delete orphaned media
    if (alsoDeleteOrphans.value && postOrphansToPrompt.value.length > 0) {
      await pruneOrphanFiles(postOrphansToPrompt.value);
    }

    if (editingPost.value?.id === targetPost.id) {
      editingPost.value = null;
      updateEditUrl(null);
    }

    postToDelete.value = null;
    postOrphansToPrompt.value = [];
    await fetchPosts();
  } catch (err: any) {
    deleteError.value = err.message;
  } finally {
    isDeleting.value = false;
  }
}

function handlePostSaved(savedPost: PostItem) {
  editingPost.value = savedPost;
  updateEditUrl(savedPost.id);
  fetchPosts();
}

async function handleLogout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch (err) {
    console.error("Logout error");
  } finally {
    window.location.href = "/";
  }
}

onMounted(async () => {
  fetchCurrentUser();
  await fetchPosts();
  checkDeepLinkEdit();
});
</script>

<template>
  <div class="admin-workspace space-y-6">
    <div
      class="flex flex-wrap items-center justify-between gap-4 border-b border-(--border-main) pb-4 font-mono"
    >
      <div class="flex items-center gap-3">
        <Icon icon="lucide:terminal" class="w-5 h-5 text-(--accent-green)" />
        <h1
          class="text-lg font-bold text-(--accent-green) uppercase tracking-wider"
        >
          // ADMIN_CONSOLE
        </h1>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          @click="switchTab('posts')"
          :class="[
            'px-3 py-1.5 text-xs uppercase tracking-wider transition-colors border inline-flex items-center gap-1.5',
            currentTab === 'posts'
              ? 'border-(--border-highlight) bg-(--accent-green-glow) text-(--accent-green-bright) font-bold'
              : 'border-(--border-subtle) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--border-main)',
          ]"
        >
          <Icon icon="lucide:file-text" class="w-3.5 h-3.5" />
          <span>Posts ({{ posts.length }})</span>
        </button>
        <button
          type="button"
          @click="switchTab('media')"
          :class="[
            'px-3 py-1.5 text-xs uppercase tracking-wider transition-colors border inline-flex items-center gap-1.5',
            currentTab === 'media'
              ? 'border-(--border-highlight) bg-(--accent-green-glow) text-(--accent-green-bright) font-bold'
              : 'border-(--border-subtle) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--border-main)',
          ]"
        >
          <Icon icon="lucide:image" class="w-3.5 h-3.5" />
          <span>Media Library</span>
        </button>
        <button
          type="button"
          @click="showUserSettings = true"
          class="px-3 py-1.5 text-xs uppercase tracking-wider border border-(--border-subtle) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--border-main) inline-flex items-center gap-1.5"
          title="Account Settings"
        >
          <Icon
            icon="lucide:shield-check"
            class="w-3.5 h-3.5 text-(--accent-green)"
          />
          <span>{{ currentUsername }}</span>
        </button>
        <button
          type="button"
          @click="handleLogout"
          class="px-3 py-1.5 text-xs uppercase tracking-wider border border-(--status-error-border) text-(--status-error-text) hover:bg-(--status-error-bg) inline-flex items-center gap-1.5"
          title="Log Out"
        >
          <Icon icon="lucide:log-out" class="w-3.5 h-3.5" />
          <span>Logout</span>
        </button>
      </div>
    </div>

    <!-- Error Banner -->
    <div
      v-if="errorMessage"
      class="p-4 border border-(--status-error-border) bg-(--status-error-bg) text-(--status-error-text) text-xs font-mono"
    >
      > ERROR: {{ errorMessage }}
    </div>

    <PostList
      v-show="currentTab === 'posts'"
      :posts="posts"
      :loading="loading"
      @new-post="handleNewPost"
      @edit-post="handleEditPost"
      @delete-post="promptDeletePost"
      @refresh="fetchPosts"
    />
    <PostEditor
      v-if="currentTab === 'editor' || editingPost !== null"
      v-show="currentTab === 'editor'"
      :initial-post="editingPost"
      @back="handleBackToPosts"
      @saved="handlePostSaved"
    />

    <MediaLibrary v-show="currentTab === 'media'" @posts-updated="fetchPosts" />

    <UserSettingsModal
      :show="showUserSettings"
      @close="showUserSettings = false"
      @user-updated="(u) => (currentUsername = u)"
    />

    <div
      v-if="postToDelete"
      class="fixed inset-0 z-50 flex items-center justify-center bg-(--modal-overlay-bg) p-4"
    >
      <div
        class="max-w-lg w-full border border-(--status-error-border) bg-(--bg-surface) p-6 space-y-5 shadow-2xl font-mono text-xs"
      >
        <div
          class="flex items-center justify-between border-b border-(--border-subtle) pb-3"
        >
          <div
            class="flex items-center gap-2 text-(--status-error-text) font-bold text-sm"
          >
            <Icon icon="lucide:alert-triangle" class="w-4 h-4" />
            <span>// CONFIRM_POST_DELETION // DESTRUCTIVE_ACTION</span>
          </div>
          <button
            type="button"
            @click="cancelDeletePost"
            :disabled="isDeleting"
            class="text-(--text-muted) hover:text-(--text-primary)"
          >
            [✕]
          </button>
        </div>
        <div
          class="p-4 border border-(--border-subtle) bg-(--bg-primary) space-y-2"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs uppercase text-(--text-muted)"
              >Target Article:</span
            >
            <span
              :class="[
                'px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider',
                postToDelete.status === 'published'
                  ? 'border border-(--accent-green) text-(--accent-green) bg-(--accent-green-glow)'
                  : 'border border-(--status-warning-border) text-(--status-warning-text) bg-(--status-warning-bg)',
              ]"
            >
              {{ postToDelete.status }}
            </span>
          </div>
          <div class="text-sm font-bold text-(--text-primary)">
            {{ postToDelete.title }}
          </div>
          <div class="text-[11px] text-(--text-muted)">
            /posts/{{ postToDelete.slug }}
          </div>
        </div>
        <div
          v-if="postOrphansToPrompt.length > 0"
          class="p-3 border border-(--status-warning-border) bg-(--status-warning-bg) text-(--status-warning-text) space-y-2"
        >
          <div class="flex items-center gap-1.5 font-bold text-xs">
            <Icon icon="lucide:alert-triangle" class="w-4 h-4 text-amber-400" />
            <span
              >Unreferenced Media Detected ({{
                postOrphansToPrompt.length
              }})</span
            >
          </div>
          <div class="text-[11px] text-(--text-secondary)">
            This post contains media file(s) not used in any other article:
          </div>
          <div
            class="max-h-24 overflow-y-auto space-y-1 bg-(--bg-primary) p-2 border border-(--border-subtle) font-mono text-[11px]"
          >
            <div
              v-for="file in postOrphansToPrompt"
              :key="file"
              class="flex items-center gap-1 text-(--text-primary)"
            >
              <span>📎</span>
              <span class="truncate">{{ file }}</span>
            </div>
          </div>
          <label
            class="flex items-center gap-2 text-[11px] text-(--text-primary) cursor-pointer pt-1"
          >
            <input
              type="checkbox"
              v-model="alsoDeleteOrphans"
              class="accent-(--accent-green)"
            />
            <span>Also permanently delete these orphaned media files</span>
          </label>
        </div>

        <div
          class="p-3 border border-(--status-error-border) bg-(--status-error-bg) text-(--status-error-text) space-y-1 leading-relaxed"
        >
          <div class="font-bold">> WARNING: This action cannot be undone.</div>
          <div class="text-[11px] text-(--text-secondary)">
            This will permanently remove the post record and its tag
            associations from the database.
          </div>
        </div>
        <div
          v-if="deleteError"
          class="p-3 border border-(--status-error-border) bg-(--status-error-bg) text-(--status-error-text) font-bold"
        >
          > ERROR: {{ deleteError }}
        </div>
        <div
          class="flex items-center justify-end gap-3 pt-3 border-t border-(--border-subtle)"
        >
          <button
            type="button"
            @click="cancelDeletePost"
            :disabled="isDeleting"
            class="px-4 py-2 border border-(--border-main) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--border-highlight) transition-colors font-mono disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            @click="confirmDeletePost"
            :disabled="isDeleting"
            class="px-4 py-2 bg-(--status-error-solid) hover:bg-(--status-error-solid-hover) text-(--text-inverse) font-bold uppercase tracking-wider inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Icon
              :icon="isDeleting ? 'lucide:rotate-cw' : 'lucide:trash-2'"
              :class="['w-3.5 h-3.5', isDeleting ? 'animate-spin' : '']"
            />
            <span>{{ isDeleting ? "Deleting..." : "Delete Permanently" }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
