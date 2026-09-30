"use client";

import { useRef, useState, useSyncExternalStore } from "react";

type TodoStatus = "todo" | "in-progress" | "completed";
type NoteColor = "yellow" | "green" | "blue" | "pink";
type View = "list" | "kanban" | "sticky-notes" | "calendar";

interface BreakdownStep {
  text: string;
  completed: boolean;
}

interface Todo {
  id: number;
  text: string;
  completed: boolean;
  status: TodoStatus;
  breakdown: BreakdownStep[];
  dueDate?: string;
}

interface StickyNote {
  id: number;
  text: string;
  color: NoteColor;
}

const TODO_STATUSES: { value: TodoStatus; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in-progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

const NOTE_COLORS: { value: NoteColor; label: string; className: string }[] = [
  { value: "yellow", label: "Yellow", className: "bg-yellow-200" },
  { value: "green", label: "Green", className: "bg-green-200" },
  { value: "blue", label: "Blue", className: "bg-blue-200" },
  { value: "pink", label: "Pink", className: "bg-pink-200" },
];

const TODO_STORAGE_KEY = "todos";
const TODO_STORAGE_EVENT = "todos-updated";
const EMPTY_TODOS: Todo[] = [];
const VIEW_STORAGE_KEY = "app-view";
const VIEW_STORAGE_EVENT = "app-view-updated";
const NOTE_STORAGE_KEY = "sticky-notes";
const NOTE_STORAGE_EVENT = "sticky-notes-updated";
const EMPTY_NOTES: StickyNote[] = [];

let cachedTodosRaw: string | null | undefined;
let cachedTodosSnapshot: Todo[] = EMPTY_TODOS;
let cachedViewRaw: string | null | undefined;
let cachedViewSnapshot: View = "list";
let cachedNotesRaw: string | null | undefined;
let cachedNotesSnapshot: StickyNote[] = EMPTY_NOTES;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTodoStatus(value: unknown): value is TodoStatus {
  return TODO_STATUSES.some((status) => status.value === value);
}

function isView(value: unknown): value is View {
  return (
    value === "list" ||
    value === "kanban" ||
    value === "sticky-notes" ||
    value === "calendar"
  );
}

function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  return formatLocalDate(new Date(year, month - 1, day)) === value;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseStoredTodos(value: unknown): Todo[] {
  if (!Array.isArray(value)) {
    throw new Error("Stored tasks must be an array.");
  }

  return value.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "number" ||
      typeof item.text !== "string"
    ) {
      throw new Error("Stored task has an invalid shape.");
    }

    const status =
      item.status === undefined
        ? item.completed === true
          ? "completed"
          : "todo"
        : item.status;

    if (!isTodoStatus(status)) {
      throw new Error("Stored task has an invalid status.");
    }

    const storedBreakdown = item.breakdown ?? [];
    if (!Array.isArray(storedBreakdown)) {
      throw new Error("Stored task has an invalid AI breakdown.");
    }
    const breakdown = storedBreakdown.map((step) => {
      if (
        !isRecord(step) ||
        typeof step.text !== "string" ||
        typeof step.completed !== "boolean"
      ) {
        throw new Error("Stored task has an invalid AI breakdown.");
      }
      return { text: step.text, completed: step.completed };
    });
    if (item.dueDate !== undefined && !isISODate(item.dueDate)) {
      throw new Error("Stored task has an invalid due date.");
    }

    return {
      id: item.id,
      text: item.text,
      status,
      completed: status === "completed",
      breakdown,
      ...(typeof item.dueDate === "string" ? { dueDate: item.dueDate } : {}),
    };
  });
}

function isNoteColor(value: unknown): value is NoteColor {
  return NOTE_COLORS.some((color) => color.value === value);
}

function parseStoredNotes(value: unknown): StickyNote[] {
  if (!Array.isArray(value)) {
    throw new Error("Stored sticky notes must be an array.");
  }

  return value.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "number" ||
      typeof item.text !== "string" ||
      !isNoteColor(item.color)
    ) {
      throw new Error("Stored sticky note has an invalid shape.");
    }

    return { id: item.id, text: item.text, color: item.color };
  });
}

function getTodosSnapshot(): Todo[] {
  try {
    const storedTodos = window.localStorage.getItem(TODO_STORAGE_KEY);
    if (storedTodos === cachedTodosRaw) return cachedTodosSnapshot;

    cachedTodosRaw = storedTodos;
    cachedTodosSnapshot = storedTodos
      ? parseStoredTodos(JSON.parse(storedTodos))
      : EMPTY_TODOS;
  } catch (error) {
    console.error("Failed to load tasks from localStorage.", error);
    cachedTodosSnapshot = EMPTY_TODOS;
  }

  return cachedTodosSnapshot;
}

function getServerTodosSnapshot(): Todo[] {
  return EMPTY_TODOS;
}

function subscribeToTodos(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(TODO_STORAGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(TODO_STORAGE_EVENT, onStoreChange);
  };
}

function updateStoredTodos(update: (currentTodos: Todo[]) => Todo[]) {
  const updatedTodos = update(getTodosSnapshot());
  const serializedTodos = JSON.stringify(updatedTodos);
  cachedTodosSnapshot = updatedTodos;

  try {
    window.localStorage.setItem(TODO_STORAGE_KEY, serializedTodos);
    cachedTodosRaw = serializedTodos;
  } catch (error) {
    console.error("Failed to save tasks to localStorage.", error);
  }

  window.dispatchEvent(new Event(TODO_STORAGE_EVENT));
}

function getViewSnapshot(): View {
  try {
    const storedView = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (storedView === cachedViewRaw) return cachedViewSnapshot;

    cachedViewRaw = storedView;
    cachedViewSnapshot = isView(storedView) ? storedView : "list";
  } catch (error) {
    console.error("Failed to load app view from localStorage.", error);
    cachedViewSnapshot = "list";
  }

  return cachedViewSnapshot;
}

function getServerViewSnapshot(): View {
  return "list";
}

function subscribeToView(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(VIEW_STORAGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(VIEW_STORAGE_EVENT, onStoreChange);
  };
}

function updateStoredView(view: View) {
  cachedViewSnapshot = view;

  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    cachedViewRaw = view;
  } catch (error) {
    console.error("Failed to save app view to localStorage.", error);
  }

  window.dispatchEvent(new Event(VIEW_STORAGE_EVENT));
}

function TaskBreakdown({
  todo,
  loading,
  error,
  onGenerate,
  onToggleStep,
}: {
  todo: Todo;
  loading: boolean;
  error: string | undefined;
  onGenerate: (todo: Todo) => void;
  onToggleStep: (todoId: number, stepIndex: number) => void;
}) {
  return (
    <div className="mt-3 border-t border-gray-200 pt-3">
      <button
        type="button"
        onClick={() => onGenerate(todo)}
        disabled={loading}
        className="rounded border border-purple-300 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-50 disabled:cursor-wait disabled:opacity-60"
      >
        {loading
          ? "Generating..."
          : todo.breakdown.length > 0
            ? "Regenerate AI Breakdown"
            : "AI Breakdown"}
      </button>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {todo.breakdown.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label={`Action steps for ${todo.text}`}>
          {todo.breakdown.map((step, index) => (
            <li key={`${todo.id}-step-${index}`} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={step.completed}
                onChange={() => onToggleStep(todo.id, index)}
                aria-label={`Mark step ${index + 1} ${
                  step.completed ? "incomplete" : "complete"
                }`}
                className="mt-0.5 h-4 w-4"
              />
              <span
                className={`text-sm ${
                  step.completed
                    ? "text-gray-400 line-through"
                    : "text-gray-700"
                }`}
              >
                {step.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function getNotesSnapshot(): StickyNote[] {
  try {
    const storedNotes = window.localStorage.getItem(NOTE_STORAGE_KEY);
    if (storedNotes === cachedNotesRaw) return cachedNotesSnapshot;

    cachedNotesRaw = storedNotes;
    cachedNotesSnapshot = storedNotes
      ? parseStoredNotes(JSON.parse(storedNotes))
      : EMPTY_NOTES;
  } catch (error) {
    console.error("Failed to load sticky notes from localStorage.", error);
    cachedNotesSnapshot = EMPTY_NOTES;
  }

  return cachedNotesSnapshot;
}

function getServerNotesSnapshot(): StickyNote[] {
  return EMPTY_NOTES;
}

function subscribeToNotes(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(NOTE_STORAGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(NOTE_STORAGE_EVENT, onStoreChange);
  };
}

function updateStoredNotes(
  update: (currentNotes: StickyNote[]) => StickyNote[]
) {
  const updatedNotes = update(getNotesSnapshot());
  const serializedNotes = JSON.stringify(updatedNotes);
  cachedNotesSnapshot = updatedNotes;

  try {
    window.localStorage.setItem(NOTE_STORAGE_KEY, serializedNotes);
    cachedNotesRaw = serializedNotes;
  } catch (error) {
    console.error("Failed to save sticky notes to localStorage.", error);
  }

  window.dispatchEvent(new Event(NOTE_STORAGE_EVENT));
}

export default function Home() {
  const todos = useSyncExternalStore(
    subscribeToTodos,
    getTodosSnapshot,
    getServerTodosSnapshot
  );
  const notes = useSyncExternalStore(
    subscribeToNotes,
    getNotesSnapshot,
    getServerNotesSnapshot
  );
  const view = useSyncExternalStore(
    subscribeToView,
    getViewSnapshot,
    getServerViewSnapshot
  );
  const taskInputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [selectedCalendarTaskId, setSelectedCalendarTaskId] = useState<
    number | null
  >(null);
  const [newNoteColor, setNewNoteColor] = useState<NoteColor>("yellow");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [breakdownLoadingIds, setBreakdownLoadingIds] = useState<number[]>([]);
  const [breakdownErrors, setBreakdownErrors] = useState<
    Record<number, string>
  >({});

  const monthStart = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth(),
    1
  );
  const calendarStart = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth(),
    1 - monthStart.getDay()
  );
  const daysInMonth = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    0
  ).getDate();
  const calendarCellCount =
    Math.ceil((monthStart.getDay() + daysInMonth) / 7) * 7;
  const calendarDays = Array.from({ length: calendarCellCount }, (_, index) => {
    const day = new Date(calendarStart);
    day.setDate(calendarStart.getDate() + index);
    return day;
  });
  const today = formatLocalDate(new Date());
  const selectedCalendarTask = todos.find(
    (todo) => todo.id === selectedCalendarTaskId
  );

  const addTodo = () => {
    if (!input.trim()) return;
    updateStoredTodos((currentTodos) => [
      ...currentTodos,
      {
        id: Date.now(),
        text: input.trim(),
        completed: false,
        status: "todo",
        breakdown: [],
        ...(dueDate ? { dueDate } : {}),
      },
    ]);
    setInput("");
    setDueDate("");
  };

  const toggleTodo = (id: number) => {
    updateStoredTodos((currentTodos) =>
      currentTodos.map((todo) => {
        if (todo.id !== id) return todo;
        const status = todo.completed ? "todo" : "completed";
        return { ...todo, status, completed: status === "completed" };
      })
    );
  };

  const moveTodo = (id: number, status: TodoStatus) => {
    updateStoredTodos((currentTodos) =>
      currentTodos.map((todo) =>
        todo.id === id
          ? { ...todo, status, completed: status === "completed" }
          : todo
      )
    );
  };

  const deleteTodo = (id: number) => {
    updateStoredTodos((currentTodos) =>
      currentTodos.filter((todo) => todo.id !== id)
    );
  };

  const toggleBreakdownStep = (todoId: number, stepIndex: number) => {
    updateStoredTodos((currentTodos) =>
      currentTodos.map((todo) =>
        todo.id === todoId
          ? {
              ...todo,
              breakdown: todo.breakdown.map((step, index) =>
                index === stepIndex
                  ? { ...step, completed: !step.completed }
                  : step
              ),
            }
          : todo
      )
    );
  };

  const generateBreakdown = async (todo: Todo) => {
    setBreakdownLoadingIds((ids) => [...ids, todo.id]);
    setBreakdownErrors((errors) => {
      const nextErrors = { ...errors };
      delete nextErrors[todo.id];
      return nextErrors;
    });

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Break this task into exactly 3 concise, actionable steps. Return only the 3 steps, one per line, without an introduction or conclusion:\n\n${todo.text}`,
        }),
      });
      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : `AI request failed (${response.status}).`;
        throw new Error(message);
      }

      const result =
        isRecord(data) && typeof data.result === "string" ? data.result : "";
      const steps = result
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*(?:(?:[-*•])\s*|\d+[.)]\s*)/, "").trim())
        .filter(Boolean)
        .slice(0, 3);

      if (steps.length !== 3) {
        throw new Error(
          "The AI did not return three steps. Please try generating the breakdown again."
        );
      }

      updateStoredTodos((currentTodos) =>
        currentTodos.map((currentTodo) =>
          currentTodo.id === todo.id
            ? {
                ...currentTodo,
                breakdown: steps.map((text) => ({ text, completed: false })),
              }
            : currentTodo
        )
      );
    } catch (error) {
      setBreakdownErrors((errors) => ({
        ...errors,
        [todo.id]:
          error instanceof Error
            ? error.message
            : "Failed to generate an AI breakdown.",
      }));
    } finally {
      setBreakdownLoadingIds((ids) => ids.filter((id) => id !== todo.id));
    }
  };

  const addNote = () => {
    updateStoredNotes((currentNotes) => [
      ...currentNotes,
      { id: Date.now(), text: "", color: newNoteColor },
    ]);
  };

  const editNote = (id: number, text: string) => {
    updateStoredNotes((currentNotes) =>
      currentNotes.map((note) => (note.id === id ? { ...note, text } : note))
    );
  };

  const recolorNote = (id: number, color: NoteColor) => {
    updateStoredNotes((currentNotes) =>
      currentNotes.map((note) => (note.id === id ? { ...note, color } : note))
    );
  };

  const deleteNote = (id: number) => {
    updateStoredNotes((currentNotes) =>
      currentNotes.filter((note) => note.id !== id)
    );
  };

  const askAI = async () => {
    if (!input.trim()) {
      alert("Type a task first, then click Ask AI");
      return;
    }

    setAiLoading(true);
    setAiSuggestion("");

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: input }),
      });

      const data: unknown = await res.json();
      if (!res.ok) {
        const message =
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : `AI request failed (${res.status}).`;
        setAiSuggestion(message);
        return;
      }

      const result =
        isRecord(data) && typeof data.result === "string" ? data.result : "";
      setAiSuggestion(result || "The AI returned an empty response. Please try again.");
    } catch (error) {
      setAiSuggestion(
        error instanceof Error
          ? `Failed to get AI response: ${error.message}`
          : "Failed to get AI response."
      );
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-6">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
          AI Todo List
        </h1>

        <div
          className="mb-6 flex flex-wrap justify-center"
          role="group"
          aria-label="App view"
        >
          {([
            { value: "list", label: "List View" },
            { value: "kanban", label: "Kanban View" },
            { value: "sticky-notes", label: "Sticky Notes" },
          ] as const).map((viewOption, index, options) => (
            <button
              key={viewOption.value}
              type="button"
              onClick={() => updateStoredView(viewOption.value)}
              aria-pressed={view === viewOption.value}
              className={`px-4 py-2 border text-sm font-medium ${
                view === viewOption.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              } ${index === 0 ? "rounded-l-lg" : ""} ${
                index === options.length - 1 ? "rounded-r-lg" : ""
              }`}
            >
              {viewOption.label}
            </button>
          ))}
        </div>

        {view !== "sticky-notes" && (
          <>
            {/* Input Section */}
            <form
              className="mb-4 flex flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                addTodo();
              }}
            >
              <input
                ref={taskInputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Add a new task..."
                className="min-w-48 flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <label className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 focus-within:ring-2 focus-within:ring-blue-500">
                <span>Due date</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="min-w-0 bg-transparent text-gray-800 focus:outline-none"
                  aria-label="Task due date"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Add
              </button>
              <button
                type="button"
                onClick={askAI}
                disabled={aiLoading}
                className="rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {aiLoading ? "..." : "Ask AI"}
              </button>
            </form>

            {/* AI Suggestion */}
            {aiSuggestion && (
              <div className="mb-4 rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm text-purple-800">
                <strong>AI Suggestion:</strong>
                <p className="mt-1 whitespace-pre-wrap">{aiSuggestion}</p>
                <button
                  onClick={() => {
                    setInput(aiSuggestion);
                    setAiSuggestion("");
                  }}
                  className="mt-2 rounded bg-purple-600 px-3 py-1 text-xs text-white hover:bg-purple-700"
                >
                  Use this as task
                </button>
              </div>
            )}
          </>
        )}

        {view === "sticky-notes" ? (
          <section aria-label="Sticky notes">
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-gray-700">
                New note color:
              </span>
              <div className="flex gap-2" role="group" aria-label="New note color">
                {NOTE_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setNewNoteColor(color.value)}
                    aria-label={color.label}
                    aria-pressed={newNoteColor === color.value}
                    className={`h-8 w-8 rounded-full ${color.className} ${
                      newNoteColor === color.value
                        ? "ring-2 ring-gray-700 ring-offset-2"
                        : "hover:ring-2 hover:ring-gray-400 hover:ring-offset-1"
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={addNote}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Add note
              </button>
            </div>

            {notes.length === 0 ? (
              <p className="py-10 text-center text-gray-400">
                No notes yet. Add a note for a quick idea!
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {notes.map((note) => {
                  const noteColor = NOTE_COLORS.find(
                    (color) => color.value === note.color
                  );

                  return (
                    <li
                      key={note.id}
                      className={`flex min-h-56 flex-col rounded-lg p-4 shadow-sm ${noteColor?.className ?? "bg-yellow-200"}`}
                    >
                      <label
                        htmlFor={`note-${note.id}`}
                        className="mb-2 text-sm font-semibold text-gray-700"
                      >
                        Note
                      </label>
                      <textarea
                        id={`note-${note.id}`}
                        value={note.text}
                        onChange={(event) =>
                          editNote(note.id, event.target.value)
                        }
                        placeholder="Write a quick idea..."
                        className="min-h-32 flex-1 resize-y bg-transparent text-gray-800 placeholder:text-gray-600/60 focus:outline-none"
                      />
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div
                          className="flex gap-2"
                          role="group"
                          aria-label="Change note color"
                        >
                          {NOTE_COLORS.map((color) => (
                            <button
                              key={color.value}
                              type="button"
                              onClick={() => recolorNote(note.id, color.value)}
                              aria-label={`Change note to ${color.label.toLowerCase()}`}
                              aria-pressed={note.color === color.value}
                              className={`h-6 w-6 rounded-full border border-black/10 ${color.className} ${
                                note.color === color.value
                                  ? "ring-2 ring-gray-700 ring-offset-1"
                                  : "hover:ring-2 hover:ring-gray-400"
                              }`}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteNote(note.id)}
                          aria-label="Delete note"
                          className="rounded px-2 py-1 text-sm text-red-700 hover:bg-white/40"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : view === "calendar" ? (
          <section aria-label="Task calendar">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-gray-800">
                {new Intl.DateTimeFormat(undefined, {
                  month: "long",
                  year: "numeric",
                }).format(monthStart)}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCalendarMonth(
                      (month) =>
                        new Date(month.getFullYear(), month.getMonth() - 1, 1)
                    )
                  }
                  aria-label="Previous month"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCalendarMonth(
                      new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                    )
                  }
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCalendarMonth(
                      (month) =>
                        new Date(month.getFullYear(), month.getMonth() + 1, 1)
                    )
                  }
                  aria-label="Next month"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                (weekday) => (
                  <div
                    key={weekday}
                    className="bg-gray-50 px-1 py-2 text-center text-xs font-semibold text-gray-500 sm:px-2 sm:text-sm"
                  >
                    <span className="sm:hidden">{weekday[0]}</span>
                    <span className="hidden sm:inline">{weekday}</span>
                  </div>
                )
              )}

              {calendarDays.map((day) => {
                const dateKey = formatLocalDate(day);
                const dayTodos = todos.filter(
                  (todo) => todo.dueDate === dateKey
                );
                const isCurrentMonth =
                  day.getMonth() === monthStart.getMonth();

                return (
                  <div
                    key={dateKey}
                    className={`min-h-24 bg-white p-1 sm:min-h-32 sm:p-2 ${
                      isCurrentMonth ? "" : "bg-gray-50/70"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setDueDate(dateKey);
                        taskInputRef.current?.focus();
                      }}
                      aria-label={`Create a task due ${new Intl.DateTimeFormat(
                        undefined,
                        { dateStyle: "full" }
                      ).format(day)}`}
                      className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                        dateKey === today
                          ? "bg-blue-600 font-semibold text-white"
                          : isCurrentMonth
                            ? "text-gray-700 hover:bg-blue-50"
                            : "text-gray-400 hover:bg-white"
                      }`}
                    >
                      {day.getDate()}
                    </button>
                    <ul className="space-y-1">
                      {dayTodos.map((todo) => {
                        const isOverdue =
                          todo.status !== "completed" && dateKey < today;
                        const taskColorClass = isOverdue
                          ? "border-red-200 bg-red-50 text-red-800 hover:bg-red-100"
                          : todo.status === "completed"
                            ? "border-green-200 bg-green-50 text-green-800 hover:bg-green-100"
                            : todo.status === "in-progress"
                              ? "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"
                              : "border-yellow-200 bg-yellow-50 text-yellow-900 hover:bg-yellow-100";

                        return (
                          <li key={todo.id}>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedCalendarTaskId(todo.id)
                              }
                              className={`w-full truncate rounded-md border px-1.5 py-1 text-left text-[10px] leading-tight sm:px-2 sm:text-xs ${taskColorClass}`}
                              aria-label={`${todo.text}, ${
                                isOverdue
                                  ? "overdue"
                                  : TODO_STATUSES.find(
                                      (status) => status.value === todo.status
                                    )?.label
                              }. Open task details`}
                            >
                              {todo.text}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>

            <p className="mt-3 text-xs text-gray-500">
              Click a date to set it as the due date for your next task.{" "}
              <span className="text-yellow-800">To Do</span> ·{" "}
              <span className="text-blue-700">In Progress</span> ·{" "}
              <span className="text-green-700">Completed</span> ·{" "}
              <span className="text-red-700">Overdue</span>
            </p>

            {selectedCalendarTask && (
              <section
                aria-labelledby="calendar-task-details"
                className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3
                      id="calendar-task-details"
                      className="text-lg font-semibold text-gray-800"
                    >
                      {selectedCalendarTask.text}
                    </h3>
                    <p className="mt-1 text-sm text-gray-600">
                      {TODO_STATUSES.find(
                        (status) => status.value === selectedCalendarTask.status
                      )?.label}
                      {selectedCalendarTask.dueDate &&
                        ` · Due ${new Intl.DateTimeFormat(undefined, {
                          dateStyle: "long",
                        }).format(
                          new Date(`${selectedCalendarTask.dueDate}T00:00:00`)
                        )}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCalendarTaskId(null)}
                    aria-label="Close task details"
                    className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-200 hover:text-gray-800"
                  >
                    Close
                  </button>
                </div>
                <TaskBreakdown
                  todo={selectedCalendarTask}
                  loading={breakdownLoadingIds.includes(
                    selectedCalendarTask.id
                  )}
                  error={breakdownErrors[selectedCalendarTask.id]}
                  onGenerate={generateBreakdown}
                  onToggleStep={toggleBreakdownStep}
                />
              </section>
            )}
          </section>
        ) : view === "list" ? (
          <ul className="space-y-2">
            {todos.length === 0 && (
              <li className="py-6 text-center text-gray-400">
                No tasks yet. Add one above!
              </li>
            )}

            {todos.map((todo) => (
              <li
                key={todo.id}
                className="flex items-center gap-3 rounded-lg bg-gray-50 p-3"
              >
                <input
                  type="checkbox"
                  checked={todo.completed}
                  onChange={() => toggleTodo(todo.id)}
                  aria-label={`Mark ${todo.text} ${
                    todo.completed ? "incomplete" : "complete"
                  }`}
                  className="h-5 w-5"
                />
                <div className="min-w-0 flex-1">
                  <span
                    className={`${
                      todo.completed
                        ? "text-gray-400 line-through"
                        : "text-gray-800"
                    }`}
                  >
                    {todo.text}
                  </span>
                  <TaskBreakdown
                    todo={todo}
                    loading={breakdownLoadingIds.includes(todo.id)}
                    error={breakdownErrors[todo.id]}
                    onGenerate={generateBreakdown}
                    onToggleStep={toggleBreakdownStep}
                  />
                </div>
                <button
                  onClick={() => deleteTodo(todo.id)}
                  className="text-sm text-red-500 hover:text-red-700"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {TODO_STATUSES.map((status) => {
              const statusTodos = todos.filter(
                (todo) => todo.status === status.value
              );

              return (
                <section
                  key={status.value}
                  aria-labelledby={`column-${status.value}`}
                  className="min-h-48 rounded-lg bg-gray-50 p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h2
                      id={`column-${status.value}`}
                      className="font-semibold text-gray-800"
                    >
                      {status.label}
                    </h2>
                    <span className="rounded-full bg-white px-2 py-1 text-xs text-gray-500">
                      {statusTodos.length}
                    </span>
                  </div>

                  <ul className="space-y-3">
                    {statusTodos.map((todo) => (
                      <li
                        key={todo.id}
                        className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                      >
                        <p
                          className={`break-words text-sm ${
                            todo.completed
                              ? "text-gray-400 line-through"
                              : "text-gray-800"
                          }`}
                        >
                          {todo.text}
                        </p>
                        <TaskBreakdown
                          todo={todo}
                          loading={breakdownLoadingIds.includes(todo.id)}
                          error={breakdownErrors[todo.id]}
                          onGenerate={generateBreakdown}
                          onToggleStep={toggleBreakdownStep}
                        />
                        <div className="mt-3 flex flex-wrap gap-2">
                          {TODO_STATUSES.filter(
                            (option) => option.value !== todo.status
                          ).map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => moveTodo(todo.id, option.value)}
                              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                            >
                              Move to {option.label}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => deleteTodo(todo.id)}
                            className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {statusTodos.length === 0 && (
                    <p className="py-4 text-center text-sm text-gray-400">
                      No tasks
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}