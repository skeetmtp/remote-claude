const { formatRelativeTime } = require("./session-discovery");

/**
 * Show an interactive CLI picker for session selection
 * @param {Array<{id: string, summary: string, mtime: Date}>} sessions
 * @returns {Promise<{sessionId: string, isNew: boolean} | null>}
 */
async function showSessionPicker(sessions) {
  // Dynamic import for ESM module
  const { default: select } = await import("@inquirer/select");

  const choices = [
    {
      name: "[New Session] Start fresh",
      value: { sessionId: null, isNew: true },
    },
    ...sessions.map((session) => ({
      name: `[${formatRelativeTime(session.mtime)}] ${truncate(session.summary, 50)}`,
      value: { sessionId: session.id, isNew: false },
    })),
  ];

  try {
    const answer = await select({
      message: "Select a session to resume:",
      choices: choices,
    });
    return answer;
  } catch (error) {
    // User cancelled with Ctrl+C
    if (error.name === "ExitPromptError") {
      return null;
    }
    throw error;
  }
}

/**
 * Truncate a string to a maximum length
 */
function truncate(str, maxLength) {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + "...";
}

module.exports = {
  showSessionPicker,
};
