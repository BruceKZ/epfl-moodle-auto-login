(function moodleAutoLogin() {
  const LOGIN_URL = "https://moodle.epfl.ch/login/index.php";
  const REDIRECT_THROTTLE_KEY = "epfl-auto-login:last-redirect";
  const IDP_CLICK_THROTTLE_KEY = "epfl-auto-login:last-idp-click";
  const THROTTLE_MS = 5000;
  const MANUAL_LOGIN_WINDOW_MS = 2 * 60 * 1000;
  const LAST_LOGOUT_AT_KEY = "epfl-auto-login:last-logout-at";
  const MANUAL_LOGIN_REQUESTED_AT_KEY = "epfl-auto-login:manual-login-requested-at";
  const TAB_WAS_LOGGED_IN_KEY = "epfl-auto-login:tab-was-logged-in";
  const SETTINGS_DEFAULTS = {
    autoLoginEnabled: true,
    logoutCooldownMinutes: 10,
    manualLoginBypassesCooldown: true
  };

  let cachedSettings = null;

  const normalize = (value) => (value || "").replace(/\s+/g, " ").trim().toLowerCase();

  const isVisible = (element) => {
    if (!element) {
      return false;
    }

    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };

  const withinThrottleWindow = (key) => {
    const lastAction = Number(sessionStorage.getItem(key) || 0);
    return Date.now() - lastAction < THROTTLE_MS;
  };

  const markAction = (key) => {
    sessionStorage.setItem(key, String(Date.now()));
  };

  const getSettings = async () => {
    if (cachedSettings) {
      return cachedSettings;
    }

    cachedSettings = await chrome.storage.sync.get(SETTINGS_DEFAULTS);
    return cachedSettings;
  };

  const getNumberFromStorage = (key) => Number(localStorage.getItem(key) || 0);

  const setNumberInStorage = (key, value) => {
    localStorage.setItem(key, String(Number(value) || 0));
  };

  const getBooleanFromSession = (key) => sessionStorage.getItem(key) === "1";

  const setBooleanInSession = (key, value) => {
    sessionStorage.setItem(key, value ? "1" : "0");
  };

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" && cachedSettings) {
      cachedSettings = {
        ...cachedSettings,
        ...Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value.newValue]))
      };
    }
  });

  const isLoggedIn = () => {
    if (onLoginPage()) {
      return false;
    }

    if (document.querySelector('a[href*="/login/logout.php"]')) {
      return true;
    }

    const loginLink = document.querySelector('.usermenu a[href*="/login/index.php"]');
    const loginText = normalize(document.body?.innerText);

    return !loginLink && !loginText.includes("you are not logged in");
  };

  const onLoginPage = () => window.location.pathname.startsWith("/login/index.php");
  const onLogoutPage = () => window.location.pathname.startsWith("/login/logout.php");

  const markLogoutCooldown = () => {
    setNumberInStorage(LAST_LOGOUT_AT_KEY, Date.now());
    setNumberInStorage(MANUAL_LOGIN_REQUESTED_AT_KEY, 0);
  };

  const cameFromLogoutFlow = () => {
    const referrer = document.referrer || "";
    const search = window.location.search || "";

    return (
      referrer.includes("moodle.epfl.ch/login/logout.php") ||
      referrer.includes("/login/logout.php") ||
      search.includes("loggedout") ||
      search.includes("sessionexpired")
    );
  };

  const isLogoutLink = (element) => {
    const href = element?.getAttribute?.("href") || "";
    const text = normalize(element?.textContent);
    return href.includes("/login/logout.php") || text === "log out" || text === "logout";
  };

  const isLogoutForm = (form) => {
    const action = form?.getAttribute?.("action") || "";
    return action.includes("/login/logout.php");
  };

  const isLoginLink = (element) => {
    const href = element?.getAttribute?.("href") || "";
    const text = normalize(element?.textContent);

    return href.includes("/login/index.php") || text === "log in" || text === "login" || text === "connection";
  };

  const isCooldownActive = async () => {
    const settings = await getSettings();
    const cooldownMinutes = Number(settings.logoutCooldownMinutes) || 0;

    if (cooldownMinutes <= 0) {
      return false;
    }

    return Date.now() - getNumberFromStorage(LAST_LOGOUT_AT_KEY) < cooldownMinutes * 60 * 1000;
  };

  const hasManualLoginBypass = async () => {
    const settings = await getSettings();
    if (!settings.manualLoginBypassesCooldown) {
      return false;
    }

    return Date.now() - getNumberFromStorage(MANUAL_LOGIN_REQUESTED_AT_KEY) < MANUAL_LOGIN_WINDOW_MS;
  };

  const findEpflEntraButton = () => {
    const preferredSelectors = [
      'a.login-identityprovider-btn[href*="/auth/oauth2/login.php?id=3"]',
      'a.login-identityprovider-btn[href*="/auth/oauth2/login.php"]'
    ];

    for (const selector of preferredSelectors) {
      const node = [...document.querySelectorAll(selector)].find((anchor) => {
        const text = normalize(anchor.textContent);
        const href = anchor.href || "";
        return isVisible(anchor) && (href.includes("id=3") || text.includes("epfl - entra id"));
      });

      if (node) {
        return node;
      }
    }

    const anchors = [...document.querySelectorAll("a[href]")].filter(isVisible);

    return anchors.find((anchor) => {
      const text = normalize(anchor.textContent);
      const href = anchor.href || "";
      return href.includes("/auth/oauth2/login.php") && (href.includes("id=3") || text.includes("epfl - entra id"));
    });
  };

  const handleTrustedClick = async (event) => {
    if (!event.isTrusted) {
      return;
    }

    const target = event.target instanceof Element ? event.target.closest("a, button") : null;
    if (!target) {
      return;
    }

    if (isLogoutLink(target) || isLogoutForm(target.closest("form"))) {
      markLogoutCooldown();
      return;
    }

    if (isLoginLink(target)) {
      setNumberInStorage(MANUAL_LOGIN_REQUESTED_AT_KEY, Date.now());
    }
  };

  const handleTrustedSubmit = (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (!form) {
      return;
    }

    if (isLogoutForm(form)) {
      markLogoutCooldown();
    }
  };

  const startLoginFlow = async () => {
    const settings = await getSettings();
    if (!settings.autoLoginEnabled) {
      return;
    }

    const currentlyLoggedIn = isLoggedIn();
    if (currentlyLoggedIn) {
      setBooleanInSession(TAB_WAS_LOGGED_IN_KEY, true);
    } else if (!onLoginPage() && getBooleanFromSession(TAB_WAS_LOGGED_IN_KEY)) {
      markLogoutCooldown();
      setBooleanInSession(TAB_WAS_LOGGED_IN_KEY, false);
    }

    if (onLogoutPage() || cameFromLogoutFlow()) {
      markLogoutCooldown();
      setBooleanInSession(TAB_WAS_LOGGED_IN_KEY, false);
    }

    if (onLogoutPage()) {
      return;
    }

    if (onLoginPage()) {
      const bypassCooldown = await hasManualLoginBypass();
      if (!bypassCooldown && (await isCooldownActive())) {
        return;
      }

      if (withinThrottleWindow(IDP_CLICK_THROTTLE_KEY)) {
        return;
      }

      const button = findEpflEntraButton();
      if (button) {
        if (bypassCooldown) {
          setNumberInStorage(LAST_LOGOUT_AT_KEY, 0);
          setNumberInStorage(MANUAL_LOGIN_REQUESTED_AT_KEY, 0);
        }

        markAction(IDP_CLICK_THROTTLE_KEY);
        button.click();
        window.setTimeout(() => {
          if (window.location.pathname.startsWith("/login/index.php") && button.href) {
            window.location.assign(button.href);
          }
        }, 250);
      }
      return;
    }

    if (currentlyLoggedIn || withinThrottleWindow(REDIRECT_THROTTLE_KEY)) {
      return;
    }

    if (await isCooldownActive()) {
      return;
    }

    markAction(REDIRECT_THROTTLE_KEY);
    window.location.assign(LOGIN_URL);
  };

  document.addEventListener("click", (event) => {
    void handleTrustedClick(event);
  }, true);
  document.addEventListener("submit", handleTrustedSubmit, true);

  const observer = new MutationObserver(() => {
    void startLoginFlow();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  void startLoginFlow();
  window.setInterval(startLoginFlow, 1500);
})();
