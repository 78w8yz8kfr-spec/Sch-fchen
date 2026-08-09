export function apprenticeTodayPrompt({
  apprentice = false,
  pane = "start",
  status = "draft",
  activities = [],
  workdayStarted = false,
  returnComment = ""
} = {}) {
  const returned = status === "returned";
  const editable = status === "draft" || returned;
  const todayMissing = editable && !returned && workdayStarted && activities.length === 0;

  if (!apprentice || pane !== "start" || (!returned && !todayMissing)) {
    return { visible: false };
  }

  if (returned) {
    return {
      visible: true,
      state: "Überarbeiten",
      summary: returnComment || "Dein Ausbilder hat die Woche zur Überarbeitung zurückgegeben.",
      action: "week",
      actionLabel: "Woche öffnen"
    };
  }

  return {
    visible: true,
    state: "Heute offen",
    summary: "Ergänze kurz deine Tätigkeiten, bevor der Tag abgeschlossen ist.",
    action: "today",
    actionLabel: "Heute eintragen"
  };
}
