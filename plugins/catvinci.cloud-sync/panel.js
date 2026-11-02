"use strict";
(() => {
  // development/cloud-sync/src/panel.ts
  var api = acquireTextusApi();
  var element = (id) => document.getElementById(id);
  var input = (id) => element(id);
  var buttons = ["sync", "test", "unlock"];
  var secretFields = [
    "account",
    "secret",
    "token",
    "sync-password",
    "confirm-password"
  ];
  var DEFAULT_PREFIX = "textus/my-workspace";
  function folderPrefix(root2) {
    const name = (root2.split(/[\\/]/).filter(Boolean).pop() ?? "").replace(/[\x00-\x1f\x7f\\:*?"<>|]/g, "-").replace(/[. ]+$/, "");
    return name ? `textus/${name}` : DEFAULT_PREFIX;
  }
  var initialized = false;
  var dirty = false;
  var root = null;
  var busy = false;
  var configured = false;
  document.documentElement.lang = api.language;
  for (const item of document.querySelectorAll("[data-t]"))
    item.textContent = api.t(item.dataset.t);
  document.querySelector("section.sync-status")?.setAttribute("aria-label", api.t("name"));
  var signIn = {
    s3: ["accountS3", "secretS3"],
    webdav: ["accountDav", "secretDav"],
    nutstore: ["accountNutstore", "secretNutstore"]
  };
  var providerTabs = [
    ...document.querySelectorAll("[data-provider]")
  ];
  for (const tab of providerTabs)
    tab.onclick = () => {
      if (input("provider").value === tab.dataset.provider) return;
      input("provider").value = tab.dataset.provider;
      input("endpoint").value = "";
      for (const id of secretFields) input(id).value = "";
      dirty = true;
      toggles();
    };
  function toggles() {
    const provider = input("provider").value;
    for (const tab of providerTabs)
      tab.setAttribute("aria-checked", String(tab.dataset.provider === provider));
    element("bucket-field").hidden = provider !== "s3";
    element("s3-more").hidden = provider !== "s3";
    element("endpoint-field").hidden = provider === "nutstore";
    element("nutstore-help").hidden = provider !== "nutstore";
    const [account, secret] = signIn[provider] ?? signIn.s3;
    element("account-label").textContent = api.t(account);
    element("secret-label").textContent = api.t(secret);
    input("endpoint").required = provider !== "s3";
    if (provider === "nutstore")
      input("endpoint").value = "https://dav.jianguoyun.com/dav";
    input("bucket").required = provider === "s3";
    element("interval-field").hidden = !input("automatic").checked;
    for (const id of buttons)
      element(id).disabled = busy || !root || !configured || dirty;
  }
  function fill(config) {
    for (const id of [
      "provider",
      "endpoint",
      "region",
      "bucket",
      "prefix",
      "interval"
    ])
      input(id).value = String(config[id]);
    for (const id of ["pathStyle", "automatic"])
      input(id).checked = config[id];
    toggles();
  }
  element("connection").addEventListener("input", () => {
    dirty = true;
    toggles();
  });
  element("connection").addEventListener("change", () => {
    dirty = true;
    toggles();
  });
  function save() {
    if (busy) return;
    if (!element("connection").reportValidity()) return;
    const config = {
      provider: input("provider").value,
      endpoint: input("endpoint").value,
      region: input("region").value,
      bucket: input("bucket").value,
      prefix: input("prefix").value,
      pathStyle: input("pathStyle").checked,
      automatic: input("automatic").checked,
      interval: Number(input("interval").value)
    };
    api.postMessage({
      type: "save",
      config,
      credentials: {
        account: input("account").value,
        secret: input("secret").value,
        sessionToken: input("token").value,
        syncPassword: input("sync-password").value,
        confirmPassword: input("confirm-password").value
      }
    });
  }
  element("save").onclick = save;
  element("connection").addEventListener(
    "submit",
    (event) => event.preventDefault()
  );
  element("connection").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      save();
    }
  });
  for (const id of [...buttons, "cancel"])
    element(id).onclick = () => api.postMessage({ type: id });
  function showResult(result) {
    const container = element("results");
    container.replaceChildren();
    for (const key of ["conflicts", "deferred"]) {
      const entries = result?.[key];
      if (!entries?.length) continue;
      const title = document.createElement("h3");
      title.textContent = api.t(key);
      const list = document.createElement("ul");
      for (const path of entries) {
        const row = document.createElement("li");
        row.textContent = path;
        list.append(row);
      }
      container.append(title, list);
    }
  }
  api.onMessage((value) => {
    const m = value;
    if (m.type === "saved") {
      dirty = false;
      initialized = false;
      for (const id of secretFields) input(id).value = "";
      api.postMessage({ type: "ready" });
      return;
    }
    if (m.type !== "state") return;
    busy = m.busy;
    configured = m.configured;
    if (!initialized || root !== m.root) {
      if (root !== m.root) for (const id of secretFields) input(id).value = "";
      fill(
        !m.configured && m.root && m.config.prefix === DEFAULT_PREFIX ? { ...m.config, prefix: folderPrefix(m.root) } : m.config
      );
      initialized = true;
      dirty = false;
    }
    root = m.root;
    element("status").textContent = m.message || api.t("loading");
    element("status").dataset.error = String(m.error);
    element("fields").disabled = busy || !root;
    element("cancel").hidden = !busy;
    const progress = element("progress");
    progress.hidden = !busy;
    if (m.progress == null) progress.removeAttribute("value");
    else {
      progress.max = 1;
      progress.value = m.progress;
    }
    element("credentials-state").textContent = api.t(
      configured ? "credentialsSaved" : "credentialsMissing"
    );
    const last = element("last-run");
    last.hidden = !m.lastRun;
    last.textContent = m.lastRun ? `${api.t("lastRun")} \xB7 ${new Date(m.lastRun).toLocaleString(api.language)}` : "";
    showResult(m.result);
    toggles();
  });
  api.postMessage({ type: "ready" });
})();
