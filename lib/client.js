// DSH Enter Customizer — Client half (web bundle), DSH 0.2.0-rc.2.
//
// Module format: window.__ModuleLoader__ factory bundle (see
// @deepseek-ai/dsh-client-modules). Takes over the composer input shortcuts
// (Enter / Ctrl+Enter / Shift+Enter / Alt+Enter / send button) with four
// configurable behaviors (send / queue-while-busy / newline / no-op).
//
// Compatibility notes (0.1.x -> 0.2.0-rc.2), every one verified against the
// published 0.2.0-rc.2 packages:
//
// 1. PERSISTENCE CHANNEL: `settingsScope` no longer exists. The client now
//    reads a Host plugin's durable section through `ctx.configForms.get(<entry
//    id>)`, which returns a `ConfigForm<T>`:
//      getSnapshot() -> { status, value, revision, writable, ... }
//      subscribe(listener) -> disposer
//      set(field, value) / unset(field) / mutate(ops) -> Promise<boolean>
//    `inject` must therefore list "configForms" instead of "settingsScope".
//    The providing fiber owns the write channel, so consumers need NOT declare
//    "remote" / "remote.settings" themselves.
//
// 2. SLOT CONTRACT: `slots.register` still takes (options, component) and
//    `slots.inject(name, thunk)` is unchanged; `id` / `order` / `label` survive.
//    `label` is now documented as registrant-localized text. Scope of
//    'conversation.input.dock' is 'session', so dock entries are mounted once
//    per session — the component MUST be resilient to remounting.
//
// 3. INPUT STATE: the dock's owner props are `{ session, input }` (InputZone).
//    `InputState.imageIds` IS GONE -> `attachmentIds` (readonly
//    DraftAttachmentId[]). `phase` gained 'adjudicating' / 'claimed' /
//    'submitting' alongside 'plain'. `occurrences` stays.
//
// 4. SUBMISSION: `sessions.binding(id).session.prompt(content, mode, signal?,
//    requestId?)`. `mode` is now 'queue' | 'steer' — 'steer' interrupts the
//    running turn, which is NOT what "queue while busy" meant in 0.1.x, so
//    every send path keeps 'queue'. The result is a discriminated union:
//    `{ ok: true, value } | { ok: false, error }` — `error` is a RemoteError
//    with `.code` / `.message`, not a plain object, so the old
//    `result.error || {}` fallback is still safe but `.code` is now always
//    present on the failure branch.
//
// 5. TIMER: there is no `timer` service in 0.2.0-rc.2; it was dropped from
//    `inject` and replaced by plain window timeouts with disposal on unmount.
//
// Build note: this bundle is intentionally dependency-free (plain JS plus
// require("react")), so it ships as-is without a bundling step.

window.__ModuleLoader__.load({
  id: "dsh-enter-customizer",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require("react");

    const CSS =
      ".cti-page{display:flex;flex-direction:column;gap:2px;padding:4px 0 24px;}" +
      ".cti-title{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary);margin-bottom:6px;}" +
      ".cti-toggle-row{display:flex;align-items:center;gap:8px;padding:10px 0;}" +
      ".cti-toggle-row label{font-size:13px;color:var(--dsw-alias-label-primary);}" +
      ".cti-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--dsw-alias-border-l1);}" +
      ".cti-row-name{width:190px;font-size:13px;color:var(--dsw-alias-label-primary);flex-shrink:0;}" +
      ".cti-row-behavior{width:230px;}" +
      ".cti-select{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:5px 8px;font-size:13px;}" +
      ".cti-desc{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.8;padding:10px 0;border-top:1px solid var(--dsw-alias-border-l1);}" +
      ".cti-reset{margin-top:10px;align-self:flex-start;background:transparent;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:5px 14px;font-size:12px;cursor:pointer;}" +
      ".cti-float{pointer-events:none;z-index:60;display:flex;justify-content:center;align-items:flex-start;}" +
      ".cti-float-inner{background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:5px 14px;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-error-primary);box-shadow:0 4px 16px rgba(0,0,0,0.15);white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;}";

    if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="dsh-enter-customizer"]') === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-enter-customizer";
      tag.dataset.pluginCss = "dsh-enter-customizer";
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    /** Services required by the client half. */
    // 0.2.0-rc.2: "settingsScope" -> "configForms"; "timer" removed (no such
    // service exists any more); "connection" no longer needed because
    // configForms owns its own write channel.
    const inject = ["slots", "sessions", "configForms"];

    /** Settings namespace owned by the Host half (== profile entry id). */
    const NAMESPACE = "dsh-enter-customizer";

    /**
     * Mounts the composer shortcut customization.
     * @param ctx - Client root context.
     */
    function apply(ctx) {
      const slots = ctx.get("slots");
      const sessions = ctx.get("sessions");
      const configForms = ctx.get("configForms");
      if (slots === undefined || sessions === undefined) return;

      const BEHAVIOR_LABELS = { send: "发送消息", queue: "繁忙时插入消息", newline: "换行", none: "无作用" };
      const BEHAVIOR_KEYS = Object.keys(BEHAVIOR_LABELS);
      const KEY_ROWS = ["enter", "ctrlEnter", "shiftEnter", "altEnter"];
      const COMBO_OF = { enter: "enter", ctrlEnter: "ctrl+enter", shiftEnter: "shift+enter", altEnter: "alt+enter" };
      const ROW_LABELS = { enter: "Enter", ctrlEnter: "Ctrl + Enter", shiftEnter: "Shift + Enter", altEnter: "Alt + Enter", sendButton: "发送按钮" };
      const DEFAULT_CONFIG = {
        enabled: true,
        enter: "send",
        ctrlEnter: "queue",
        shiftEnter: "newline",
        altEnter: "send",
        sendButton: "send",
      };
      const normalize = (raw) => {
        const src = raw && typeof raw === "object" ? raw : {};
        const out = { enabled: src.enabled !== false };
        for (const key of Object.keys(DEFAULT_CONFIG)) {
          if (key === "enabled") continue;
          out[key] = BEHAVIOR_KEYS.includes(src[key]) ? src[key] : DEFAULT_CONFIG[key];
        }
        if (out.sendButton === "newline") out.sendButton = DEFAULT_CONFIG.sendButton;
        return out;
      };

      // ----- durable settings scope (persisted in the Host settings document) -----
      // 0.2.0-rc.2: `ctx.configForms.get(NAMESPACE)` replaces
      // `settingsScope.bind({ namespace })`. Its snapshot is a ConfigFormSnapshot:
      // { status: 'loading' | 'ready' | 'unavailable', value, revision, writable, ... }.
      // `status !== 'ready'` means the Host has not served a value yet (plugin
      // not composed, or the client keeps preferences process-local in memory
      // mode), so we fall back to defaults instead of projecting `undefined`.
      let form = undefined;
      if (configForms !== undefined) {
        try {
          form = configForms.get(NAMESPACE);
        } catch (err) {
          form = undefined;
        }
      }

      let config = normalize(null);
      const listeners = new Set();
      const store = {
        get: () => config,
        set(next) { config = next; for (const fn of Array.from(listeners)) fn(); },
        subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
      };
      if (form !== undefined) {
        const snap = form.getSnapshot();
        if (snap !== undefined && snap.status === "ready" && snap.value) store.set(normalize(snap.value));
        form.subscribe(() => {
          const s = form.getSnapshot();
          if (s !== undefined && s.status === "ready" && s.value) store.set(normalize(s.value));
        });
      }
      const persist = (next) => {
        const prev = store.get();
        store.set(next);
        if (form === undefined) return;
        for (const key of Object.keys(next)) {
          if (next[key] !== prev[key]) {
            // 0.2.0-rc.2: set() returns Promise<boolean> (Host acceptance).
            // A rejection means a transport failure, not a refusal; swallow it
            // so a dropped connection cannot break the settings surface.
            Promise.resolve(form.set(key, next[key])).catch(() => {});
          }
        }
      };
      const useConfig = () => {
        const [, force] = React.useState(0);
        React.useEffect(() => store.subscribe(() => force((n) => n + 1)), []);
        return store.get();
      };

      const eventCombo = (e) => {
        const parts = [];
        if (e.ctrlKey) parts.push("ctrl");
        if (e.altKey) parts.push("alt");
        if (e.shiftKey) parts.push("shift");
        if (e.metaKey) parts.push("meta");
        parts.push(String(e.key).toLowerCase());
        return parts.join("+");
      };
      const insertNewline = (el, actions) => {
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? start;
        const next = el.value.slice(0, start) + "\n" + el.value.slice(end);
        el.value = next;
        el.setSelectionRange(start + 1, start + 1);
        actions.setDraft(next);
      };

      // ---------- interception component: dock row above the composer (toast floats over the input bar) ----------
      const StatusDock = (props) => {
        const zoneSession = props.session;
        const zoneInput = props.input;
        const [notice, setNotice] = React.useState(null);
        const [rect, setRect] = React.useState(null);
        const stateRef = React.useRef({ sessionId: undefined });
        stateRef.current = {
          sessionId: props.sessionId,
          draft: zoneInput ? zoneInput.draft : "",
          phase: zoneInput ? zoneInput.phase : "plain",
          occurrences: zoneInput ? zoneInput.occurrences : [],
          // 0.2.0-rc.2: InputState.imageIds -> InputState.attachmentIds.
          attachmentIds: zoneInput ? zoneInput.attachmentIds : [],
          running: zoneSession ? zoneSession.running : false,
          subagent: zoneSession ? zoneSession.subagent : null,
          removed: zoneSession ? zoneSession.removed : false,
        };
        const actionsRef = React.useRef(props.inputActions);
        actionsRef.current = props.inputActions;

        /**
         * Submit the draft through the Host admission channel.
         * 0.2.0-rc.2: `sessions.binding(id).session.prompt(content, mode, ...)`.
         * `mode` is 'queue' | 'steer'; 'steer' INTERRUPTS the running turn, so
         * both the send and the queue-while-busy behavior keep 'queue' — that
         * is exactly what 0.1.x called 'queue' and it matches the system
         * queue bar the settings copy promises.
         */
        const submitDirect = async (behavior, st, text, flash) => {
          const binding = sessions.binding(st.sessionId);
          const session = binding === undefined ? undefined : binding.session;
          if (session === undefined) return;
          try {
            const result = await session.prompt([{ type: "text", text }], "queue");
            if (result.ok) {
              if (stateRef.current.draft === st.draft) actionsRef.current.setDraft("");
            } else {
              if (stateRef.current.draft === "") actionsRef.current.setDraft(st.draft);
              // 0.2.0-rc.2: `error` is a RemoteError — `.code` is always
              // present on the failure branch; `.message` carries the text.
              const err = result.error || {};
              flash("error", "发送失败：" + (err.code || "unknown"));
            }
          } catch (err) {
            if (stateRef.current.draft === "") actionsRef.current.setDraft(st.draft);
            flash("error", "发送失败");
          }
        };

        const flash = (kind, text) => setNotice({ kind, text, seq: Date.now() });
        const handlersRef = React.useRef({ onKeyDown: null, onClick: null });
        handlersRef.current.onKeyDown = (e) => {
          const cfg = store.get();
          if (!cfg.enabled) return;
          if (e.isComposing || e.keyCode === 229) return;
          const target = e.target;
          if (!(target instanceof HTMLElement)) return;
          if (target.tagName !== "TEXTAREA") return;
          const card = target.closest("[data-composer-card]");
          if (card === null) return;
          if (card.querySelector('[role="listbox"], [role="menu"], [role="dialog"]') !== null) return;
          const combo = eventCombo(e);
          let rowKey = null;
          for (const key of KEY_ROWS) {
            if (COMBO_OF[key] === combo) { rowKey = key; break; }
          }
          if (rowKey === null) return;
          const behavior = cfg[rowKey];
          const st = stateRef.current;
          // 0.2.0-rc.2: 'plain' is still the only phase in which a raw draft
          // may be submitted; 'adjudicating' / 'claimed' / 'submitting' all
          // belong to an in-flight command or submission.
          if (st.phase !== "plain" || st.removed || st.sessionId === undefined) return;
          if (behavior === "none") {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (behavior === "newline") {
            e.preventDefault();
            e.stopPropagation();
            insertNewline(target, actionsRef.current);
            return;
          }
          const text = st.draft.trim();
          if (text === "" || text.startsWith("/") || st.occurrences.length > 0 || st.attachmentIds.length > 0) return;
          e.preventDefault();
          e.stopPropagation();
          if (e.repeat) return;
          submitDirect(behavior, st, text, flash);
        };
        handlersRef.current.onClick = (e) => {
          const cfg = store.get();
          if (!cfg.enabled) return;
          const behavior = cfg.sendButton;
          if (behavior === "send") return;
          const target = e.target;
          if (!(target instanceof HTMLElement)) return;
          const card = target.closest("[data-composer-card]");
          if (card === null) return;
          const btn = target.closest("button");
          if (btn === null) return;
          const buttons = card.querySelectorAll("button");
          if (buttons.length === 0 || buttons[buttons.length - 1] !== btn) return;
          const st = stateRef.current;
          if (st.phase !== "plain" || st.removed || st.sessionId === undefined) return;
          const text = st.draft.trim();
          if (text === "" || text.startsWith("/") || st.occurrences.length > 0 || st.attachmentIds.length > 0) return;
          e.preventDefault();
          e.stopPropagation();
          if (behavior === "none") return;
          submitDirect(behavior, st, text, flash);
        };

        // document-level capture listeners; scoped to the composer card by the
        // handlers themselves.
        React.useEffect(() => {
          const onKeyDown = (e) => handlersRef.current.onKeyDown(e);
          const onClick = (e) => handlersRef.current.onClick(e);
          document.addEventListener("keydown", onKeyDown, true);
          document.addEventListener("click", onClick, true);
          return () => {
            document.removeEventListener("keydown", onKeyDown, true);
            document.removeEventListener("click", onClick, true);
          };
        }, []);

        // measure the composer card so the toast can float right above it
        React.useEffect(() => {
          const measure = () => {
            const card = document.querySelector("[data-composer-card]");
            if (card === null) { setRect(null); return; }
            const r = card.getBoundingClientRect();
            setRect({ top: r.top, left: r.left, width: r.width });
          };
          measure();
          window.addEventListener("resize", measure);
          const id = window.setInterval(measure, 500);
          return () => {
            window.removeEventListener("resize", measure);
            window.clearInterval(id);
          };
        }, []);

        // 0.2.0-rc.2: no `timer` service — the toast retires on a plain window
        // timeout, cleared on unmount and on replacement.
        React.useEffect(() => {
          if (notice === null) return undefined;
          const id = window.setTimeout(() => setNotice(null), 3200);
          return () => window.clearTimeout(id);
        }, [notice]);

        const toast = notice === null ? null : React.createElement(
          "div",
          {
            className: "cti-float",
            style: rect === null
              ? { position: "fixed", left: 0, right: 0, bottom: 12 }
              : { position: "fixed", left: rect.left, width: rect.width, top: Math.max(rect.top - 36, 8) },
          },
          React.createElement("div", { className: "cti-float-inner" }, notice.text),
        );
        return toast;
      };

      // ---------- settings page ----------
      const SettingsPage = () => {
        const cfg = useConfig();
        const setBehavior = (key, value) => persist(Object.assign({}, store.get(), { [key]: value }));
        const toggleEnabled = (e) => persist(Object.assign({}, store.get(), { enabled: e.target.checked }));
        const reset = () => persist(Object.assign({}, DEFAULT_CONFIG));
        const behaviorOptions = (includeNewline) => BEHAVIOR_KEYS
          .filter((key) => includeNewline || key !== "newline")
          .map((key) => React.createElement("option", { key, value: key }, BEHAVIOR_LABELS[key]));
        const row = (key, includeNewline) => React.createElement(
          "div", { className: "cti-row" },
          React.createElement("span", { className: "cti-row-name" }, ROW_LABELS[key]),
          React.createElement("select", {
            className: "cti-select cti-row-behavior",
            value: cfg[key],
            onChange: (e) => setBehavior(key, e.target.value),
          }, ...behaviorOptions(includeNewline)),
        );

        return React.createElement(
          "div", { className: "cti-page" },
          React.createElement("div", { className: "cti-title" }, "输入快捷键"),
          React.createElement(
            "div", { className: "cti-toggle-row" },
            React.createElement("input", {
              type: "checkbox", id: "cti-enable", checked: cfg.enabled,
              onChange: toggleEnabled,
            }),
            React.createElement("label", { htmlFor: "cti-enable" }, "启用后接管系统输入快捷键"),
          ),
          ...KEY_ROWS.map((key) => row(key, true)),
          row("sendButton", false),
          React.createElement(
            "div", { className: "cti-desc" },
            React.createElement("div", null, "· 发送：空闲立即发送；忙碌时自动排队，回合结束后发送。"),
            React.createElement("div", null, "· 繁忙时插入：空闲立即发送；忙碌时进入系统队列（可查看、编辑、引导）。"),
            React.createElement("div", null, "· 换行：插入换行，不发送。"),
            React.createElement("div", null, "· 无作用：按键无任何效果。"),
            React.createElement("div", null, "· 斜杠命令、@引用、图片草稿及未列出的组合键仍按系统默认处理。"),
          ),
          React.createElement("button", { className: "cti-reset", onClick: reset }, "恢复默认"),
        );
      };

      slots.inject("settings.section", () => slots.register(
        { name: "settings.section", id: "input-triggers", order: 25, label: () => "输入快捷键" },
        () => React.createElement(SettingsPage),
      ));
      slots.inject("conversation.input.dock", () => slots.register(
        { name: "conversation.input.dock", id: "input-trigger-status", order: 30 },
        (props) => React.createElement(StatusDock, props),
      ));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
