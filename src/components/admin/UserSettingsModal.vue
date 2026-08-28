<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { Icon } from "@iconify/vue";
import QRCode from "qrcode";

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "user-updated", username: string): void;
}>();

const activeTab = ref<"credentials" | "totp">("credentials");
const loading = ref(false);
const errorMessage = ref("");
const successMessage = ref("");

const username = ref("");
const totpEnabled = ref(false);

const currentPassword = ref("");
const newUsername = ref("");
const newPassword = ref("");
const confirmPassword = ref("");

const isSettingUpTotp = ref(false);
const totpSecret = ref("");
const totpOtpauthUrl = ref("");
const totpQrSvg = ref("");
const totpVerificationCode = ref("");
const totpDisablePassword = ref("");
const totpDisableCode = ref("");

async function fetchUserProfile() {
  try {
    const res = await fetch("/api/auth/me");
    if (res.ok) {
      const data: any = await res.json();
      username.value = data.user?.username || "";
      newUsername.value = data.user?.username || "";
      totpEnabled.value = Boolean(data.user?.totp_enabled);
    }
  } catch (err) {
    console.error("Failed to load user profile", err);
  }
}

watch(
  () => props.show,
  (isShown) => {
    if (isShown) {
      errorMessage.value = "";
      successMessage.value = "";
      currentPassword.value = "";
      newPassword.value = "";
      confirmPassword.value = "";
      totpDisablePassword.value = "";
      totpDisableCode.value = "";
      totpQrSvg.value = "";
      isSettingUpTotp.value = false;
      fetchUserProfile();
    }
  },
  { immediate: true },
);

onMounted(() => {
  fetchUserProfile();
});

async function handleUpdateCredentials() {
  errorMessage.value = "";
  successMessage.value = "";

  if (!currentPassword.value) {
    errorMessage.value = "Current password is required to save changes";
    return;
  }

  if (newPassword.value && newPassword.value !== confirmPassword.value) {
    errorMessage.value = "New passwords do not match";
    return;
  }

  loading.value = true;
  try {
    const res = await fetch("/api/auth/credentials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: currentPassword.value,
        newUsername:
          newUsername.value !== username.value ? newUsername.value : undefined,
        newPassword: newPassword.value || undefined,
      }),
    });

    const data: any = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to update credentials");
    }

    username.value = data.user?.username || username.value;
    currentPassword.value = "";
    newPassword.value = "";
    confirmPassword.value = "";
    successMessage.value = "Credentials updated successfully";
    emit("user-updated", username.value);
  } catch (err: any) {
    errorMessage.value = err?.message || "Error updating credentials";
  } finally {
    loading.value = false;
  }
}

async function startTotpSetup() {
  errorMessage.value = "";
  successMessage.value = "";
  loading.value = true;
  try {
    const res = await fetch("/api/auth/totp/setup", {
      method: "POST",
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to setup TOTP");

    totpSecret.value = data.secret || "";
    totpOtpauthUrl.value = data.otpauthUrl || "";
    if (data.otpauthUrl) {
      totpQrSvg.value = await QRCode.toString(data.otpauthUrl, {
        type: "svg",
        margin: 2,
        color: {
          dark: "#8bedc8",
          light: "#00000000",
        },
      });
    } else {
      totpQrSvg.value = "";
    }
    isSettingUpTotp.value = true;
  } catch (err: any) {
    errorMessage.value = err?.message || "Error setting up TOTP";
  } finally {
    loading.value = false;
  }
}

async function confirmTotpEnable() {
  errorMessage.value = "";
  successMessage.value = "";

  if (!totpVerificationCode.value || totpVerificationCode.value.length !== 6) {
    errorMessage.value =
      "Please enter the 6-digit code from your authenticator app";
    return;
  }

  loading.value = true;
  try {
    const res = await fetch("/api/auth/totp/enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: totpSecret.value,
        code: totpVerificationCode.value,
      }),
    });

    const data: any = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Invalid verification code");
    }

    totpEnabled.value = true;
    isSettingUpTotp.value = false;
    totpSecret.value = "";
    totpVerificationCode.value = "";
    successMessage.value = "Two-factor authentication enabled successfully";
  } catch (err: any) {
    errorMessage.value = err?.message || "Error enabling TOTP";
  } finally {
    loading.value = false;
  }
}

async function handleDisableTotp() {
  errorMessage.value = "";
  successMessage.value = "";

  if (!totpDisablePassword.value || !totpDisableCode.value) {
    errorMessage.value =
      "Please enter both your password and 6-digit 2FA code to disable 2FA";
    return;
  }

  loading.value = true;
  try {
    const res = await fetch("/api/auth/totp/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: totpDisablePassword.value,
        totpCode: totpDisableCode.value,
      }),
    });

    const data: any = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to disable 2FA");
    }

    totpEnabled.value = false;
    totpDisablePassword.value = "";
    totpDisableCode.value = "";
    successMessage.value = "Two-factor authentication disabled";
  } catch (err: any) {
    errorMessage.value = err?.message || "Error disabling TOTP";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-(--modal-overlay-bg) backdrop-blur-xs font-mono"
  >
    <div
      class="bg-(--bg-surface) border border-(--border-main) w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]"
    >
      <div
        class="flex items-center justify-between p-4 border-b border-(--border-subtle) bg-(--bg-primary)"
      >
        <div
          class="flex items-center gap-2 text-sm font-bold text-(--accent-green)"
        >
          <Icon icon="lucide:shield-check" class="w-4 h-4" />
          <span>USER SETTINGS</span>
        </div>
        <button
          type="button"
          @click="emit('close')"
          :disabled="loading"
          class="text-(--text-muted) hover:text-(--text-primary)"
        >
          [✕]
        </button>
      </div>
      <div
        class="flex border-b border-(--border-subtle) bg-(--bg-surface-elevated)"
      >
        <button
          @click="activeTab = 'credentials'"
          :class="[
            'px-4 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border-b-2 transition-colors',
            activeTab === 'credentials'
              ? 'border-(--accent-green) text-(--accent-green) bg-(--bg-surface)'
              : 'border-transparent text-(--text-muted) hover:text-(--text-primary)',
          ]"
        >
          <Icon icon="lucide:user" class="w-3.5 h-3.5" />
          <span>Credentials</span>
        </button>
        <button
          @click="activeTab = 'totp'"
          :class="[
            'px-4 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border-b-2 transition-colors',
            activeTab === 'totp'
              ? 'border-(--accent-green) text-(--accent-green) bg-(--bg-surface)'
              : 'border-transparent text-(--text-muted) hover:text-(--text-primary)',
          ]"
        >
          <Icon icon="lucide:smartphone" class="w-3.5 h-3.5" />
          <span>Two-Factor Auth</span>
          <span
            v-if="totpEnabled"
            class="text-[9px] bg-(--status-success-bg) border border-(--status-success-border) text-(--status-success-text) px-1 py-0.2"
          >
            ACTIVE
          </span>
        </button>
      </div>
      <div class="p-6 overflow-y-auto space-y-4 text-xs">
        <div
          v-if="errorMessage"
          class="p-3 bg-(--status-error-bg) border border-(--status-error-border) text-(--status-error-text) flex items-start gap-2"
        >
          <Icon
            icon="lucide:alert-circle"
            class="w-4 h-4 shrink-0 mt-0.5 text-(--status-error-text)"
          />
          <span>{{ errorMessage }}</span>
        </div>

        <div
          v-if="successMessage"
          class="p-3 bg-(--status-success-bg) border border-(--status-success-border) text-(--status-success-text) flex items-start gap-2"
        >
          <Icon
            icon="lucide:check-circle-2"
            class="w-4 h-4 shrink-0 mt-0.5 text-(--status-success-text)"
          />
          <span>{{ successMessage }}</span>
        </div>
        <form
          v-if="activeTab === 'credentials'"
          @submit.prevent="handleUpdateCredentials"
          class="space-y-4"
        >
          <div class="space-y-1">
            <label
              class="block text-(--text-secondary) font-bold uppercase tracking-wider"
            >
              Username
            </label>
            <input
              v-model="newUsername"
              type="text"
              required
              class="w-full bg-(--bg-primary) border border-(--border-main) p-2 text-xs text-(--text-primary) focus:border-(--border-highlight) focus:outline-none"
            />
          </div>
          <div class="space-y-1">
            <label
              class="block text-(--text-secondary) font-bold uppercase tracking-wider"
            >
              New Password
            </label>
            <input
              v-model="newPassword"
              type="password"
              placeholder="••••••••"
              class="w-full bg-(--bg-primary) border border-(--border-main) p-2 text-xs text-(--text-primary) focus:border-(--border-highlight) focus:outline-none"
            />
          </div>
          <div v-if="newPassword" class="space-y-1">
            <label
              class="block text-(--text-secondary) font-bold uppercase tracking-wider"
            >
              Confirm New Password
            </label>
            <input
              v-model="confirmPassword"
              type="password"
              placeholder="••••••••"
              class="w-full bg-(--bg-primary) border border-(--border-main) p-2 text-xs text-(--text-primary) focus:border-(--border-highlight) focus:outline-none"
            />
          </div>
          <div class="pt-2 border-t border-(--border-subtle) space-y-1">
            <label
              class="block text-(--text-secondary) font-bold uppercase tracking-wider"
            >
              Current Password
            </label>
            <input
              v-model="currentPassword"
              type="password"
              required
              placeholder="Enter current password"
              class="w-full bg-(--bg-primary) border border-(--border-main) p-2 text-xs text-(--text-primary) focus:border-(--border-highlight) focus:outline-none"
            />
          </div>
          <div class="pt-3 flex justify-end gap-2">
            <button
              type="button"
              @click="emit('close')"
              class="px-4 py-2 border border-(--border-subtle) text-(--text-muted) hover:text-(--text-primary)"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="loading"
              class="px-4 py-2 bg-(--accent-green) hover:bg-(--accent-green-bright) text-(--text-inverse) font-bold disabled:opacity-50 flex items-center gap-1.5"
            >
              <Icon icon="lucide:save" class="w-3.5 h-3.5" />
              <span>{{ loading ? "Saving..." : "Update Credentials" }}</span>
            </button>
          </div>
        </form>
        <div v-else-if="activeTab === 'totp'" class="space-y-4">
          <div v-if="totpEnabled && !isSettingUpTotp" class="space-y-4">
            <div
              class="p-3 border border-(--status-success-border) bg-(--status-success-bg) text-(--status-success-text) flex items-start gap-3"
            >
              <Icon
                icon="lucide:shield-check"
                class="w-5 h-5 text-(--status-success-text) shrink-0"
              />
              <div>
                <p class="font-bold">Two-Factor Authentication is Enabled</p>
                <p class="text-(--text-secondary) text-[11px] mt-1">
                  Your account requires a 6-digit TOTP token generated by your
                  authenticator app upon login.
                </p>
              </div>
            </div>
            <div class="pt-3 border-t border-(--border-subtle) space-y-2">
              <label class="block text-(--text-secondary) font-bold">
                Disable Two-Factor Authentication
              </label>
              <p class="text-[11px] text-(--text-muted)">
                To disable 2FA, enter your current password and 6-digit
                authenticator code below.
              </p>
              <input
                v-model="totpDisablePassword"
                type="password"
                placeholder="Enter current password"
                class="w-full bg-(--bg-primary) border border-(--border-main) p-2 text-xs text-(--text-primary) focus:border-(--border-highlight) focus:outline-none"
              />
              <input
                v-model="totpDisableCode"
                type="text"
                maxlength="6"
                placeholder="Enter 6-digit 2FA code"
                class="w-full bg-(--bg-primary) border border-(--border-main) p-2 text-xs text-(--text-primary) tracking-widest text-center font-mono focus:border-(--border-highlight) focus:outline-none"
              />
              <button
                @click="handleDisableTotp"
                :disabled="loading || !totpDisablePassword || !totpDisableCode"
                class="w-full py-2 border border-(--status-error-border) text-(--status-error-text) hover:bg-(--status-error-bg) font-bold text-xs uppercase disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Icon icon="lucide:shield-alert" class="w-3.5 h-3.5" />
                <span>{{ loading ? "Disabling..." : "Disable 2FA" }}</span>
              </button>
            </div>
            <div class="pt-3 flex justify-end">
              <button
                type="button"
                @click="emit('close')"
                class="px-4 py-2 border border-(--border-subtle) text-(--text-muted) hover:text-(--text-primary)"
              >
                Close
              </button>
            </div>
          </div>
          <div v-else-if="isSettingUpTotp" class="space-y-4">
            <div class="space-y-3">
              <p class="font-bold text-(--accent-green)">
                Step 1: Scan QR Code or Enter Secret
              </p>
              <p class="text-[11px] text-(--text-secondary)">
                Scan this QR code with your authenticator app (Google
                Authenticator, Aegis, Bitwarden, 1Password, etc.):
              </p>
              <div
                v-if="totpQrSvg"
                class="flex justify-center p-4 bg-(--bg-primary) border border-(--border-main) rounded max-w-xs mx-auto shadow-inner"
              >
                <div
                  class="w-48 h-48 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg>path]:stroke-(--accent-green-bright)"
                  v-html="totpQrSvg"
                ></div>
              </div>
              <div class="space-y-1">
                <p class="text-[11px] text-(--text-muted)">
                  Can't scan? Enter this secret key manually:
                </p>
                <div
                  class="p-2.5 bg-(--bg-primary) border border-(--border-main) text-(--accent-green-bright) font-mono tracking-widest text-center select-all text-xs"
                >
                  {{ totpSecret }}
                </div>
              </div>
            </div>
            <div class="space-y-2 pt-2 border-t border-(--border-subtle)">
              <p class="font-bold text-(--accent-green)">
                Step 2: Enter Verification Token
              </p>
              <p class="text-[11px] text-(--text-secondary)">
                Enter the 6-digit code shown in your app to activate 2FA:
              </p>
              <input
                v-model="totpVerificationCode"
                type="text"
                maxlength="6"
                placeholder="000000"
                class="w-full bg-(--bg-primary) border border-(--border-highlight) p-2 text-center text-sm font-bold text-(--accent-green-bright) tracking-widest focus:outline-none"
              />
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button
                type="button"
                @click="isSettingUpTotp = false"
                class="px-4 py-2 border border-(--border-subtle) text-(--text-muted) hover:text-(--text-primary)"
              >
                Cancel
              </button>
              <button
                @click="confirmTotpEnable"
                :disabled="loading || totpVerificationCode.length !== 6"
                class="px-4 py-2 bg-(--accent-green) hover:bg-(--accent-green-bright) text-(--text-inverse) font-bold disabled:opacity-50 flex items-center gap-1.5"
              >
                <Icon icon="lucide:check" class="w-3.5 h-3.5" />
                <span>{{ loading ? "Verifying..." : "Activate 2FA" }}</span>
              </button>
            </div>
          </div>
          <div v-else class="space-y-4">
            <div
              class="p-3 border border-(--border-subtle) bg-(--bg-primary) text-(--text-secondary) space-y-1"
            >
              <p class="font-bold text-(--text-primary)">
                Two-Factor Authentication is Disabled
              </p>
              <p class="text-[11px]">
                Protect your account by requiring an authenticator code when
                signing in.
              </p>
            </div>
            <button
              @click="startTotpSetup"
              :disabled="loading"
              class="w-full py-2.5 bg-(--accent-green) hover:bg-(--accent-green-bright) text-(--text-inverse) font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-2"
            >
              <Icon icon="lucide:shield-plus" class="w-4 h-4" />
              <span>{{
                loading ? "Starting..." : "Set Up Two-Factor Authentication"
              }}</span>
            </button>
            <div class="pt-2 flex justify-end">
              <button
                type="button"
                @click="emit('close')"
                class="px-4 py-2 border border-(--border-subtle) text-(--text-muted) hover:text-(--text-primary)"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
