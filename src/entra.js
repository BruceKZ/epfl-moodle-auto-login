(function entraAutoLogin() {
  const STORAGE_DEFAULTS = {
    fallbackEmail: "",
    autoStaySignedIn: true
  };
  const CLICKED_ATTR = "data-epfl-auto-login-clicked";
  const FILLED_ATTR = "data-epfl-auto-login-filled";
  const EPFL_EMAIL_RE = /\b[A-Z0-9._%+-]+@epfl\.ch\b/i;

  let cachedSettings = null;

  const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();

  const normalizeLower = (value) => normalize(value).toLowerCase();

  const isVisible = (element) => {
    if (!element) {
      return false;
    }

    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return !element.disabled && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };

  const clickOnce = (element) => {
    if (!element || element.getAttribute(CLICKED_ATTR) === "1") {
      return false;
    }

    element.setAttribute(CLICKED_ATTR, "1");
    element.click();
    return true;
  };

  const setNativeValue = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const getSettings = async () => {
    if (cachedSettings) {
      return cachedSettings;
    }

    cachedSettings = await chrome.storage.sync.get(STORAGE_DEFAULTS);
    return cachedSettings;
  };

  const allClickableNodes = () => [...document.querySelectorAll("button, a, div[role='button'], input[type='button'], input[type='submit']")].filter(isVisible);

  const textFromNode = (node) =>
    normalize(
      [
        node.textContent,
        node.getAttribute("aria-label"),
        node.getAttribute("data-test-id"),
        node.getAttribute("value"),
        node.getAttribute("title")
      ]
        .filter(Boolean)
        .join(" ")
    );

  const findFirstEpflAccount = () => {
    const isLikelyAccountNode = (node) => {
      const href = (node.getAttribute("href") || "").toLowerCase();
      if (href.startsWith("mailto:")) {
        return false;
      }

      const markers = normalizeLower(
        [
          node.id,
          node.className,
          node.getAttribute("data-test-id"),
          node.getAttribute("data-report-event")
        ]
          .filter(Boolean)
          .join(" ")
      );

      if (node.matches("button, div[role='button'], input")) {
        return true;
      }

      return ["account", "tile", "picker", "session", "credential"].some((marker) => markers.includes(marker));
    };

    const candidates = allClickableNodes()
      .map((node) => ({ node, text: textFromNode(node) }))
      .filter(({ node }) => isLikelyAccountNode(node))
      .filter(({ text }) => EPFL_EMAIL_RE.test(text));

    return candidates[0]?.node || null;
  };

  const findUseAnotherAccount = () => {
    const targets = [
      "use another account",
      "sign in to another account",
      "choose another account"
    ];

    return (
      allClickableNodes().find((node) => {
        const text = normalizeLower(textFromNode(node));
        return targets.some((target) => text.includes(target));
      }) || null
    );
  };

  const findEmailInput = () =>
    document.querySelector("input[name='loginfmt'], input[type='email'], input#i0116");

  const findPrimarySubmit = () =>
    [
      "#idSIButton9",
      "button[type='submit']",
      "input[type='submit']",
      "button[data-report-event*='Signin_Submit']"
    ]
      .map((selector) => document.querySelector(selector))
      .find(isVisible) || null;

  const findStaySignedInButton = (preferYes) => {
    const byId = preferYes ? document.querySelector("#acceptButton") : document.querySelector("#declineButton");
    if (isVisible(byId)) {
      return byId;
    }

    const targetTexts = preferYes ? ["yes", "stay signed in"] : ["no"];

    return (
      allClickableNodes().find((node) => {
        const text = normalizeLower(textFromNode(node));
        return targetTexts.some((target) => text === target || text.includes(target));
      }) || null
    );
  };

  const pageText = () => normalizeLower(document.body?.innerText);

  const handleStaySignedIn = async () => {
    const settings = await getSettings();
    if (!settings.autoStaySignedIn) {
      return false;
    }

    const text = pageText();
    if (!text.includes("stay signed in")) {
      return false;
    }

    const yesButton = findStaySignedInButton(true) || findPrimarySubmit();
    return clickOnce(yesButton);
  };

  const handleAccountPicker = () => {
    const account = findFirstEpflAccount();
    return clickOnce(account);
  };

  const handleUseAnotherAccount = async () => {
    const settings = await getSettings();
    if (!settings.fallbackEmail) {
      return false;
    }

    const emailInput = findEmailInput();
    if (isVisible(emailInput)) {
      return false;
    }

    const node = findUseAnotherAccount();
    return clickOnce(node);
  };

  const handleEmailForm = async () => {
    const settings = await getSettings();
    const input = findEmailInput();

    if (!isVisible(input) || !settings.fallbackEmail) {
      return false;
    }

    const currentValue = normalizeLower(input.value);
    const desiredValue = normalizeLower(settings.fallbackEmail);

    if (currentValue !== desiredValue && input.getAttribute(FILLED_ATTR) !== "1") {
      input.setAttribute(FILLED_ATTR, "1");
      setNativeValue(input, settings.fallbackEmail);
    }

    if (normalizeLower(input.value) !== desiredValue) {
      return false;
    }

    const submit = findPrimarySubmit();
    return clickOnce(submit);
  };

  const run = async () => {
    if (await handleStaySignedIn()) {
      return;
    }

    if (handleAccountPicker()) {
      return;
    }

    if (await handleUseAnotherAccount()) {
      return;
    }

    await handleEmailForm();
  };

  const observer = new MutationObserver(() => {
    void run();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  void run();
  window.setInterval(() => {
    void run();
  }, 1500);
})();
