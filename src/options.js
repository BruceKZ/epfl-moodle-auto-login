const STORAGE_DEFAULTS = {
  autoLoginEnabled: true,
  logoutCooldownMinutes: 10,
  manualLoginBypassesCooldown: true,
  fallbackEmail: "",
  autoStaySignedIn: true
};

const autoLoginEnabledInput = document.querySelector("#autoLoginEnabled");
const logoutCooldownMinutesInput = document.querySelector("#logoutCooldownMinutes");
const manualLoginBypassesCooldownInput = document.querySelector("#manualLoginBypassesCooldown");
const fallbackEmailInput = document.querySelector("#fallbackEmail");
const autoStaySignedInInput = document.querySelector("#autoStaySignedIn");
const saveButton = document.querySelector("#save");
const statusNode = document.querySelector("#status");

const setStatus = (message, timeout = 2500) => {
  statusNode.textContent = message;

  if (timeout > 0) {
    window.setTimeout(() => {
      if (statusNode.textContent === message) {
        statusNode.textContent = "";
      }
    }, timeout);
  }
};

const restore = async () => {
  const settings = await chrome.storage.sync.get(STORAGE_DEFAULTS);
  autoLoginEnabledInput.checked = Boolean(settings.autoLoginEnabled);
  logoutCooldownMinutesInput.value = String(settings.logoutCooldownMinutes ?? 10);
  manualLoginBypassesCooldownInput.checked = Boolean(settings.manualLoginBypassesCooldown);
  fallbackEmailInput.value = settings.fallbackEmail || "";
  autoStaySignedInInput.checked = Boolean(settings.autoStaySignedIn);
};

const save = async () => {
  const autoLoginEnabled = autoLoginEnabledInput.checked;
  const logoutCooldownMinutes = Number.parseInt(logoutCooldownMinutesInput.value.trim() || "0", 10);
  const manualLoginBypassesCooldown = manualLoginBypassesCooldownInput.checked;
  const fallbackEmail = fallbackEmailInput.value.trim();
  const autoStaySignedIn = autoStaySignedInInput.checked;

  if (!Number.isInteger(logoutCooldownMinutes) || logoutCooldownMinutes < 0 || logoutCooldownMinutes > 1440) {
    setStatus("冷却时间必须是 0 到 1440 之间的整数分钟", 3500);
    return;
  }

  if (fallbackEmail && !/@epfl\.ch$/i.test(fallbackEmail)) {
    setStatus("备用邮箱必须是 @epfl.ch", 3500);
    return;
  }

  await chrome.storage.sync.set({
    autoLoginEnabled,
    logoutCooldownMinutes,
    manualLoginBypassesCooldown,
    fallbackEmail,
    autoStaySignedIn
  });

  setStatus("已保存");
};

saveButton.addEventListener("click", () => {
  void save();
});

document.addEventListener("DOMContentLoaded", () => {
  void restore();
});
