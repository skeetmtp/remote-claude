"use strict";

const sessionList = document.getElementById("session-list");
const messagesEl = document.getElementById("messages");
const sessionMeta = document.getElementById("session-meta");
const newSessionBtn = document.getElementById("new-session");
const modelInput = document.getElementById("model-input");
const composer = document.getElementById("composer");
const promptInput = document.getElementById("prompt");
const interruptBtn = document.getElementById("interrupt");
const closeSessionBtn = document.getElementById("close-session");
const permissionModal = document.getElementById("permission-modal");
const permissionTool = document.getElementById("permission-tool");
const permissionInput = document.getElementById("permission-input");
const allowToolBtn = document.getElementById("allow-tool");
const denyToolBtn = document.getElementById("deny-tool");

const STORAGE_KEYS = {
  tokens: "remoteClaudeTokens",
  activeSession: "remoteClaudeActiveSession",
};

const state = {
  sessions: [],
  tokens: new Map(),
  activeId: null,
  source: null,
  pendingClientMessages: new Set(),
  permissionQueue: [],
  currentPermission: null,
};

function formatTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toLocaleTimeString();
}

function loadTokens() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.tokens);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    Object.entries(parsed).forEach(([id, token]) => {
      if (typeof token === "string") state.tokens.set(id, token);
    });
  } catch {}
}

function saveTokens() {
  const data = {};
  for (const [id, token] of state.tokens.entries()) data[id] = token;
  localStorage.setItem(STORAGE_KEYS.tokens, JSON.stringify(data));
}

function loadActiveSession() {
  try {
    const id = localStorage.getItem(STORAGE_KEYS.activeSession);
    if (id) state.activeId = id;
  } catch {}
}

function parseHashParams() {
  const hash = window.location.hash.slice(1);
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const sessionId = params.get("session");
  const token = params.get("token");
  if (sessionId && token) {
    return { sessionId, token };
  }
  return null;
}

function applyHashParams() {
  const params = parseHashParams();
  if (!params) return false;

  state.tokens.set(params.sessionId, params.token);
  saveTokens();
  state.activeId = params.sessionId;
  saveActiveSession(params.sessionId);

  // Clear the hash from URL for cleaner display
  history.replaceState(null, "", window.location.pathname);
  return true;
}

function saveActiveSession(id) {
  if (!id) {
    localStorage.removeItem(STORAGE_KEYS.activeSession);
    return;
  }
  localStorage.setItem(STORAGE_KEYS.activeSession, id);
}

async function api(path, options = {}) {
  const opts = { ...options };
  opts.headers = opts.headers || {};

  if (opts.body && !opts.headers["Content-Type"]) {
    opts.headers["Content-Type"] = "application/json";
  }

  const res = await fetch(path, opts);
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || "Request failed");
  }
  return res.json();
}

async function loadSessions() {
  const data = await api("/api/sessions");
  state.sessions = data.sessions || [];
  renderSessions();
  if (state.activeId) {
    const exists = state.sessions.some((session) => session.id === state.activeId);
    if (!exists) {
      state.activeId = null;
    } else {
      // Active session exists - open the stream if not already open
      if (!state.source) {
        openStream(state.activeId);
        updateSessionMeta();
        updateActionButtons();
      }
      return;
    }
  }
  if (!state.activeId && state.sessions.length > 0) {
    const candidate = state.sessions.find((session) => state.tokens.has(session.id));
    if (candidate) setActiveSession(candidate.id);
  } else {
    updateSessionMeta();
    updateActionButtons();
  }
}

function renderSessions() {
  sessionList.innerHTML = "";
  if (state.sessions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "session-card";
    empty.textContent = "No sessions yet";
    sessionList.appendChild(empty);
    return;
  }

  state.sessions.forEach((session) => {
    const card = document.createElement("div");
    card.className = "session-card";
    if (session.id === state.activeId) card.classList.add("active");

    const title = document.createElement("h4");
    title.textContent = session.id;

    const meta = document.createElement("div");
    meta.className = "session-meta";
    meta.textContent = `${session.status} · ${session.model || "default"}`;

    const time = document.createElement("div");
    time.className = "session-meta";
    time.textContent = `started ${formatTime(session.createdAt)}`;

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(time);

    card.addEventListener("click", () => setActiveSession(session.id));
    sessionList.appendChild(card);
  });
}

function setActiveSession(sessionId) {
  if (state.activeId === sessionId) return;
  state.activeId = sessionId;
  saveActiveSession(sessionId);
  clearMessages();
  resetPermissions();
  renderSessions();
  openStream(sessionId);
  updateSessionMeta();
  updateActionButtons();
}

function updateSessionMeta(statusOverride) {
  const session = state.sessions.find((item) => item.id === state.activeId);
  if (!session) {
    sessionMeta.textContent = "No active session";
    return;
  }
  const status = statusOverride || session.status;
  sessionMeta.textContent = `${session.id} · ${status} · ${session.model || "default"}`;
}

function updateActionButtons() {
  const enabled = Boolean(state.activeId);
  interruptBtn.disabled = !enabled;
  closeSessionBtn.disabled = !enabled;
  promptInput.disabled = !enabled;
}

function clearMessages() {
  messagesEl.innerHTML = "";
}

function resetPermissions() {
  state.permissionQueue = [];
  state.currentPermission = null;
  permissionModal.classList.add("hidden");
}

function appendMessage(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `message ${role}`;
  bubble.textContent = text;
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendSystem(text) {
  const bubble = document.createElement("div");
  bubble.className = "message system";
  bubble.textContent = text;
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function closeStream() {
  if (state.source) {
    state.source.close();
    state.source = null;
  }
}

function openStream(sessionId) {
  closeStream();
  const token = state.tokens.get(sessionId);
  if (!token) {
    appendSystem("Session token missing. Create a new session to reconnect.");
    return;
  }

  const url = `/api/sessions/${sessionId}/stream?token=${encodeURIComponent(token)}`;
  const source = new EventSource(url);
  state.source = source;

  source.addEventListener("assistant_text", (event) => {
    const payload = JSON.parse(event.data);
    appendMessage("assistant", payload.data.text);
  });

  source.addEventListener("user_message", (event) => {
    const payload = JSON.parse(event.data);
    const clientMessageId = payload.data.clientMessageId;
    if (clientMessageId && state.pendingClientMessages.has(clientMessageId)) {
      state.pendingClientMessages.delete(clientMessageId);
      return;
    }
    appendMessage("user", payload.data.text);
  });

  source.addEventListener("permission_request", (event) => {
    const payload = JSON.parse(event.data);
    enqueuePermission(payload.data);
  });

  source.addEventListener("session_status", (event) => {
    const payload = JSON.parse(event.data);
    const session = state.sessions.find((item) => item.id === state.activeId);
    if (session) {
      session.status = payload.data.status || session.status;
    }
    updateSessionMeta(payload.data.status);
    if (payload.data.status === "exited" || payload.data.status === "closed") {
      appendSystem("Session ended.");
    }
  });

  source.addEventListener("error", () => {
    appendSystem("Connection lost. Refresh or reopen the session.");
  });
}

function enqueuePermission(request) {
  state.permissionQueue.push(request);
  if (!state.currentPermission) {
    showNextPermission();
  }
}

function showNextPermission() {
  if (state.permissionQueue.length === 0) {
    state.currentPermission = null;
    permissionModal.classList.add("hidden");
    return;
  }

  state.currentPermission = state.permissionQueue.shift();

  // Check if this is an AskUserQuestion tool
  if (state.currentPermission.toolName === "AskUserQuestion") {
    renderQuestionPrompt(state.currentPermission);
  } else {
    renderToolPermission(state.currentPermission);
  }

  permissionModal.classList.remove("hidden");
}

function renderToolPermission(permission) {
  permissionTool.textContent = permission.toolName || "Tool";

  // Check if this is a file operation tool
  if (["Write", "Edit", "Read"].includes(permission.toolName)) {
    renderFileOperation(permission);
  } else {
    // Default rendering for other tools
    permissionInput.textContent = JSON.stringify(permission.input || {}, null, 2);

    // Show default allow/deny buttons
    document.getElementById("permission-body").style.display = "block";
    document.getElementById("file-operation-body").style.display = "none";
    document.getElementById("question-body").style.display = "none";
    document.getElementById("modal-actions").style.display = "flex";
    document.getElementById("question-actions").style.display = "none";
    document.querySelector(".modal-title").textContent = "Tool permission requested";
    document.querySelector(".modal-footnote").textContent = "Default is deny unless you approve.";
  }

  // Render permission suggestions if available
  renderPermissionSuggestions(permission);
}

function renderFileOperation(permission) {
  const input = permission.input || {};
  const toolName = permission.toolName;

  // Hide default permission body, show file operation body
  document.getElementById("permission-body").style.display = "none";
  document.getElementById("question-body").style.display = "none";
  document.getElementById("file-operation-body").style.display = "block";
  document.getElementById("modal-actions").style.display = "flex";
  document.getElementById("question-actions").style.display = "none";

  // Update modal title based on tool
  const titles = {
    "Write": "Create/overwrite file",
    "Edit": "Edit file",
    "Read": "Read file"
  };
  document.querySelector(".modal-title").textContent = titles[toolName] || "File operation requested";
  document.querySelector(".modal-footnote").textContent = "Review the changes carefully before approving.";

  // Get file operation body container
  const fileOpBody = document.getElementById("file-operation-body");
  fileOpBody.innerHTML = "";

  // Show file path
  if (input.file_path) {
    const pathSection = document.createElement("div");
    pathSection.className = "file-path-section";

    const pathLabel = document.createElement("div");
    pathLabel.className = "label";
    pathLabel.textContent = "File path";

    const pathValue = document.createElement("div");
    pathValue.className = "file-path";
    pathValue.textContent = input.file_path;

    pathSection.appendChild(pathLabel);
    pathSection.appendChild(pathValue);
    fileOpBody.appendChild(pathSection);
  }

  // For Edit operations, show old and new strings
  if (toolName === "Edit" && (input.old_string || input.new_string)) {
    const editSection = document.createElement("div");
    editSection.className = "edit-section";

    if (input.old_string) {
      const oldLabel = document.createElement("div");
      oldLabel.className = "label";
      oldLabel.textContent = "Remove";
      editSection.appendChild(oldLabel);

      const oldPre = document.createElement("pre");
      oldPre.className = "code-block removed";
      oldPre.textContent = input.old_string;
      editSection.appendChild(oldPre);
    }

    if (input.new_string) {
      const newLabel = document.createElement("div");
      newLabel.className = "label";
      newLabel.textContent = "Add";
      editSection.appendChild(newLabel);

      const newPre = document.createElement("pre");
      newPre.className = "code-block added";
      newPre.textContent = input.new_string;
      editSection.appendChild(newPre);
    }

    if (input.replace_all !== undefined) {
      const replaceAllNote = document.createElement("div");
      replaceAllNote.className = "replace-all-note";
      replaceAllNote.textContent = input.replace_all
        ? "⚠ Will replace all occurrences"
        : "Will replace first occurrence";
      editSection.appendChild(replaceAllNote);
    }

    fileOpBody.appendChild(editSection);
  }

  // For Write operations, show content with line numbers
  if (toolName === "Write" && input.content) {
    const contentSection = document.createElement("div");
    contentSection.className = "content-section";

    const contentLabel = document.createElement("div");
    contentLabel.className = "label";
    contentLabel.textContent = `Content (${input.content.split('\n').length} lines)`;
    contentSection.appendChild(contentLabel);

    const codeBlock = document.createElement("div");
    codeBlock.className = "code-block-container";

    const lineNumbers = document.createElement("div");
    lineNumbers.className = "line-numbers";

    const codeContent = document.createElement("pre");
    codeContent.className = "code-block";
    codeContent.textContent = input.content;

    const lines = input.content.split('\n');
    lines.forEach((_, i) => {
      const lineNum = document.createElement("div");
      lineNum.textContent = i + 1;
      lineNumbers.appendChild(lineNum);
    });

    codeBlock.appendChild(lineNumbers);
    codeBlock.appendChild(codeContent);
    contentSection.appendChild(codeBlock);
    fileOpBody.appendChild(contentSection);
  }

  // For Read operations, just show basic info
  if (toolName === "Read") {
    if (input.offset !== undefined || input.limit !== undefined) {
      const readInfo = document.createElement("div");
      readInfo.className = "read-info";

      const parts = [];
      if (input.offset) parts.push(`Starting from line ${input.offset}`);
      if (input.limit) parts.push(`Reading ${input.limit} lines`);

      readInfo.textContent = parts.join(", ") || "Reading entire file";
      fileOpBody.appendChild(readInfo);
    }
  }
}

function renderPermissionSuggestions(permission) {
  const suggestions = permission.suggestions || [];
  if (suggestions.length === 0) return;

  // Get or create suggestions container
  let suggestionsContainer = document.getElementById("permission-suggestions");
  if (!suggestionsContainer) {
    suggestionsContainer = document.createElement("div");
    suggestionsContainer.id = "permission-suggestions";
    suggestionsContainer.className = "permission-suggestions";

    // Insert before modal-actions
    const modalActions = document.getElementById("modal-actions");
    modalActions.parentNode.insertBefore(suggestionsContainer, modalActions);
  }

  suggestionsContainer.innerHTML = "";
  suggestionsContainer.style.display = "block";

  const label = document.createElement("div");
  label.className = "label";
  label.textContent = "Quick Actions";
  label.style.marginBottom = "10px";
  suggestionsContainer.appendChild(label);

  const buttonsContainer = document.createElement("div");
  buttonsContainer.className = "suggestion-buttons";

  suggestions.forEach((suggestion, index) => {
    const btn = document.createElement("button");
    btn.className = "btn suggestion-btn";
    btn.dataset.suggestionIndex = index;

    // Format the suggestion text
    let text = "";
    if (suggestion.type === "addRules" && suggestion.rules && suggestion.rules.length > 0) {
      const rule = suggestion.rules[0];
      const behavior = suggestion.behavior === "allow" ? "Always allow" : "Always deny";
      text = `${behavior}: ${rule.toolName} ${rule.ruleContent}`;
    } else {
      text = `Apply rule ${index + 1}`;
    }

    btn.textContent = text;
    btn.addEventListener("click", () => {
      respondPermissionWithSuggestion(suggestion);
    });

    buttonsContainer.appendChild(btn);
  });

  suggestionsContainer.appendChild(buttonsContainer);
}

function renderQuestionPrompt(permission) {
  const questions = permission.input?.questions || [];
  const questionBody = document.getElementById("question-body");

  permissionTool.textContent = "";
  document.querySelector(".modal-title").textContent = "Claude has a question";
  document.querySelector(".modal-footnote").textContent = "";

  // Hide default permission UI
  document.getElementById("permission-body").style.display = "none";
  document.getElementById("modal-actions").style.display = "none";

  // Hide permission suggestions for questions
  const suggestionsContainer = document.getElementById("permission-suggestions");
  if (suggestionsContainer) {
    suggestionsContainer.style.display = "none";
  }

  // Show question UI
  questionBody.style.display = "block";
  document.getElementById("question-actions").style.display = "flex";
  questionBody.innerHTML = "";

  questions.forEach((q, qIndex) => {
    const questionContainer = document.createElement("div");
    questionContainer.className = "question-container";

    const questionTitle = document.createElement("div");
    questionTitle.className = "question-title";
    questionTitle.textContent = q.question;
    questionContainer.appendChild(questionTitle);

    const optionsContainer = document.createElement("div");
    optionsContainer.className = "question-options";

    q.options.forEach((option, optIndex) => {
      const optionLabel = document.createElement("label");
      optionLabel.className = "question-option";

      const input = document.createElement("input");
      input.type = q.multiSelect ? "checkbox" : "radio";
      input.name = `question-${qIndex}`;
      input.value = option.label;
      input.dataset.questionIndex = qIndex;
      input.dataset.optionLabel = option.label;

      const labelContent = document.createElement("div");
      labelContent.className = "option-content";

      const labelText = document.createElement("div");
      labelText.className = "option-label";
      labelText.textContent = option.label;

      const descText = document.createElement("div");
      descText.className = "option-description";
      descText.textContent = option.description;

      labelContent.appendChild(labelText);
      labelContent.appendChild(descText);

      optionLabel.appendChild(input);
      optionLabel.appendChild(labelContent);
      optionsContainer.appendChild(optionLabel);
    });

    questionContainer.appendChild(optionsContainer);
    questionBody.appendChild(questionContainer);
  });
}

async function submitQuestionAnswers() {
  const current = state.currentPermission;
  if (!current || !state.activeId) return;

  const questions = current.input?.questions || [];
  const answers = {};

  // Collect answers
  questions.forEach((q, qIndex) => {
    const inputs = document.querySelectorAll(`input[name="question-${qIndex}"]`);
    const selectedValues = [];

    inputs.forEach(input => {
      if (input.checked) {
        selectedValues.push(input.dataset.optionLabel);
      }
    });

    // Store answer
    if (q.multiSelect) {
      answers[qIndex.toString()] = selectedValues;
    } else {
      answers[qIndex.toString()] = selectedValues.length > 0 ? selectedValues[0] : null;
    }
  });

  const token = state.tokens.get(state.activeId);
  if (!token) return;

  // Send response with answers
  await api(`/api/sessions/${state.activeId}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      requestId: current.requestId,
      decision: "allow",
      message: JSON.stringify({ answers }),
    }),
  });

  state.currentPermission = null;
  showNextPermission();
}

async function respondPermission(decision) {
  const current = state.currentPermission;
  if (!current || !state.activeId) return;

  const token = state.tokens.get(state.activeId);
  if (!token) return;

  await api(`/api/sessions/${state.activeId}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      requestId: current.requestId,
      decision,
    }),
  });

  state.currentPermission = null;
  showNextPermission();
}

async function respondPermissionWithSuggestion(suggestion) {
  const current = state.currentPermission;
  if (!current || !state.activeId) return;

  const token = state.tokens.get(state.activeId);
  if (!token) return;

  await api(`/api/sessions/${state.activeId}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      requestId: current.requestId,
      decision: "allow",
      suggestion: suggestion,
    }),
  });

  state.currentPermission = null;
  showNextPermission();
}

async function createSession() {
  const model = modelInput.value.trim();
  const data = await api("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ model }),
  });

  state.tokens.set(data.id, data.token);
  saveTokens();
  await loadSessions();
  setActiveSession(data.id);
}

async function sendMessage(text) {
  if (!state.activeId) return;
  const token = state.tokens.get(state.activeId);
  if (!token) return;

  const clientMessageId = `${state.activeId}-${Date.now()}`;
  state.pendingClientMessages.add(clientMessageId);
  appendMessage("user", text);

  await api(`/api/sessions/${state.activeId}/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text, clientMessageId }),
  });
}

async function interruptSession() {
  if (!state.activeId) return;
  const token = state.tokens.get(state.activeId);
  if (!token) return;

  await api(`/api/sessions/${state.activeId}/interrupt`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

async function closeSession() {
  if (!state.activeId) return;
  const token = state.tokens.get(state.activeId);
  if (!token) return;

  await api(`/api/sessions/${state.activeId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  state.tokens.delete(state.activeId);
  saveTokens();
  state.activeId = null;
  saveActiveSession(null);
  closeStream();
  clearMessages();
  resetPermissions();
  await loadSessions();
  updateSessionMeta();
  updateActionButtons();
}

newSessionBtn.addEventListener("click", () => {
  createSession().catch((err) => appendSystem(err.message));
});

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = promptInput.value.trim();
  if (!text) return;
  promptInput.value = "";
  sendMessage(text).catch((err) => appendSystem(err.message));
});

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

interruptBtn.addEventListener("click", () => {
  interruptSession().catch((err) => appendSystem(err.message));
});

closeSessionBtn.addEventListener("click", () => {
  closeSession().catch((err) => appendSystem(err.message));
});

allowToolBtn.addEventListener("click", () => {
  respondPermission("allow").catch((err) => appendSystem(err.message));
});

denyToolBtn.addEventListener("click", () => {
  respondPermission("deny").catch((err) => appendSystem(err.message));
});

document.getElementById("submit-answers").addEventListener("click", () => {
  submitQuestionAnswers().catch((err) => appendSystem(err.message));
});

loadTokens();
loadActiveSession();
applyHashParams(); // Apply session from URL hash if present
loadSessions().catch((err) => appendSystem(err.message));
updateActionButtons();
