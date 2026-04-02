"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { CategoryInfo, EmployeeInfo, GenerateSettings } from "@/lib/types";

// ============================================================
// Sub-components
// ============================================================

function TabBtn({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 20px",
        fontSize: 14,
        fontWeight: 500,
        borderRadius: "8px 8px 0 0",
        border: "none",
        cursor: "pointer",
        borderBottom: active ? "2px solid #111827" : "2px solid transparent",
        color: active ? "#111827" : "#6b7280",
        background: active ? "#fff" : "#f9fafb",
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}

function FileDrop({
  label,
  accept,
  onFile,
  file,
  hint,
}: {
  label: string;
  accept: string;
  onFile: (f: File) => void;
  file: File | null;
  hint?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) onFile(f);
    },
    [onFile]
  );

  const borderColor = drag ? "#111827" : file ? "#34d399" : "#d1d5db";
  const bgColor = drag ? "#f9fafb" : file ? "#ecfdf5" : "#fff";

  return (
    <div
      style={{
        border: "2px dashed " + borderColor,
        borderRadius: 12,
        padding: 24,
        textAlign: "center",
        cursor: "pointer",
        background: bgColor,
        transition: "all 0.15s",
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => ref.current?.click()}
    >
      <input
        ref={ref}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      {file ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <svg
            style={{ width: 20, height: 20, color: "#16a34a" }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <span style={{ fontSize: 14, color: "#15803d", fontWeight: 500 }}>
            {file.name}
          </span>
        </div>
      ) : (
        <div>
          <svg
            style={{
              width: 32,
              height: 32,
              margin: "0 auto 8px",
              color: "#9ca3af",
            }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p style={{ fontSize: 14, fontWeight: 500, color: "#374151" }}>
            {label}
          </p>
          {hint && (
            <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
              {hint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SettingsPanel({
  settings,
  onChange,
  mode,
}: {
  settings: GenerateSettings;
  onChange: (s: GenerateSettings) => void;
  mode: "excel" | "manual";
}) {
  const set = (k: keyof GenerateSettings, v: GenerateSettings[keyof GenerateSettings]) =>
    onChange({ ...settings, [k]: v });
  return (
    <div style={{ background: "#f9fafb", borderRadius: 12, padding: 20 }}>
      <h3
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#374151",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 16,
        }}
      >
        Настройки
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: mode === "excel" ? "1fr 1fr" : "1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "#6b7280",
              marginBottom: 4,
            }}
          >
            Макс. вопросов на тему
          </label>
          <input
            type="number"
            min={1}
            max={5}
            value={settings.maxQuestions}
            onChange={(e) =>
              set("maxQuestions", parseInt(e.target.value) || 2)
            }
            style={{
              width: "100%",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 14,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        {mode === "excel" && (
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "#6b7280",
                marginBottom: 4,
              }}
            >
              Порог оценки (ниже &rarr; в ИПР)
            </label>
            <input
              type="number"
              min={0}
              max={10}
              step={0.5}
              value={settings.threshold}
              onChange={(e) =>
                set("threshold", parseFloat(e.target.value) || 5)
              }
              style={{
                width: "100%",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        )}
      </div>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 14,
          color: "#374151",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={settings.includeTasks}
          onChange={(e) => set("includeTasks", e.target.checked)}
        />
        Включить практические задания
      </label>
    </div>
  );
}

interface TopicWithSelection extends CategoryInfo {
  selected: boolean;
}

function TopicChip({
  topic,
  onRemove,
  onToggle,
}: {
  topic: TopicWithSelection;
  onRemove?: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 9999,
        fontSize: 13,
        border: "1px solid " + (topic.selected ? "#111827" : "#d1d5db"),
        background: topic.selected ? "#111827" : "#fff",
        color: topic.selected ? "#fff" : "#4b5563",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      <span onClick={onToggle} style={{ cursor: "pointer" }}>
        {topic.name}
      </span>
      {topic.score != null && (
        <span style={{ fontSize: 11, opacity: 0.6 }}>{topic.score}/10</span>
      )}
      {onRemove && (
        <span
          onClick={onRemove}
          style={{ marginLeft: 4, cursor: "pointer", opacity: 0.6, fontSize: 16 }}
        >
          &times;
        </span>
      )}
    </div>
  );
}

function EmbeddedBadge({
  label,
  count,
}: {
  label: string;
  count?: number | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "#ecfdf5",
        border: "1px solid #bbf7d0",
        borderRadius: 12,
        padding: "12px 16px",
      }}
    >
      <svg
        style={{ width: 20, height: 20, color: "#16a34a", flexShrink: 0 }}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 13l4 4L19 7"
        />
      </svg>
      <div>
        <span style={{ fontSize: 14, color: "#15803d", fontWeight: 500 }}>
          {label}
        </span>
        {count != null && (
          <span style={{ fontSize: 12, color: "#6b7280", marginLeft: 8 }}>
            ({count} разделов)
          </span>
        )}
      </div>
    </div>
  );
}

// Searchable dropdown for selecting topics from mapping
function TopicSearchInput({
  options,
  alreadySelected,
  onSelect,
}: {
  options: string[];
  alreadySelected: string[];
  onSelect: (topic: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Filter options: match query and exclude already selected
  const filtered = options.filter(
    (o) =>
      !alreadySelected.some((s) => s.toLowerCase() === o.toLowerCase()) &&
      o.toLowerCase().includes(query.toLowerCase())
  );

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (topic: string) => {
    onSelect(topic);
    setQuery("");
    setOpen(false);
  };

  // Capitalize first letter for display
  const displayName = (s: string) =>
    s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtered.length > 0) {
              e.preventDefault();
              handleSelect(filtered[0]);
            }
          }}
          placeholder="Поиск темы: NodeJS, Security, Docker..."
          style={{
            flex: 1,
            border: "1px solid #d1d5db",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 14,
            outline: "none",
          }}
        />
      </div>
      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            background: "#fff",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            maxHeight: 220,
            overflowY: "auto",
            zIndex: 50,
          }}
        >
          {filtered.map((topic) => (
            <div
              key={topic}
              onClick={() => handleSelect(topic)}
              style={{
                padding: "8px 12px",
                fontSize: 14,
                cursor: "pointer",
                borderBottom: "1px solid #f3f4f6",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#f3f4f6")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "#fff")
              }
            >
              {displayName(topic)}
            </div>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && query && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            background: "#fff",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            padding: "10px 12px",
            fontSize: 13,
            color: "#9ca3af",
            zIndex: 50,
          }}
        >
          Тема не найдена
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main App
// ============================================================

export default function Home() {
  const [mode, setMode] = useState<"excel" | "manual">("excel");
  const [settings, setSettings] = useState<GenerateSettings>({
    maxQuestions: 2,
    threshold: 5,
    outputName: "",
    includeTasks: true,
  });

  // Server-loaded data status
  const [pdpTopicsCount, setPdpTopicsCount] = useState(0);
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  // Mapping keys per grade (for searchable topic selector)
  const [mappingKeys, setMappingKeys] = useState<Record<string, string[]>>({});

  // Excel upload
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [info, setInfo] = useState<EmployeeInfo | null>(null);
  const [categories, setCategories] = useState<TopicWithSelection[]>([]);

  // Manual mode
  const [manualTopics, setManualTopics] = useState<TopicWithSelection[]>([]);
  const [manualGrade, setManualGrade] = useState<"jun" | "mid">("jun");
  const [manualEmployee, setManualEmployee] = useState("");
  const [manualManager, setManualManager] = useState("");

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load data status on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/data");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setPdpTopicsCount(data.pdpTopicsCount);
        setTemplateLoaded(data.templateLoaded);
        if (data.mappingKeys) setMappingKeys(data.mappingKeys);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        setError("Ошибка загрузки данных: " + message);
      }
      setDataLoading(false);
    }
    load();
  }, []);

  // Handle Excel upload
  const handleExcel = useCallback(
    async (file: File) => {
      setExcelFile(file);
      setError("");
      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/parse-excel", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setSheets(data.sheets || []);
        setSelectedSheet(data.sheets?.[0] || "");
        setInfo(data.info);
        setCategories(
          (data.categories as CategoryInfo[]).map((c) => ({
            ...c,
            selected: c.score !== null && c.score < settings.threshold,
          }))
        );
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        setError("Ошибка чтения Excel: " + message);
      }
    },
    [settings.threshold]
  );

  // Handle sheet change
  const handleSheetChange = useCallback(
    async (sheetName: string) => {
      setSelectedSheet(sheetName);
      if (!excelFile) return;
      try {
        const formData = new FormData();
        formData.append("file", excelFile);
        formData.append("sheetName", sheetName);

        const res = await fetch("/api/parse-excel", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setInfo(data.info);
        setCategories(
          (data.categories as CategoryInfo[]).map((c) => ({
            ...c,
            selected: c.score !== null && c.score < settings.threshold,
          }))
        );
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        setError("Ошибка чтения шита: " + message);
      }
    },
    [excelFile, settings.threshold]
  );

  const applyThreshold = useCallback((th: number) => {
    setCategories((prev) =>
      prev.map((c) => ({
        ...c,
        selected: c.score !== null && c.score < th,
      }))
    );
  }, []);

  const addManualTopic = (topicName: string) => {
    if (!topicName.trim()) return;
    setManualTopics((prev) => [
      ...prev,
      {
        name: topicName.trim(),
        selected: true,
        subtopics: [],
        score: null,
        comment: "",
      },
    ]);
  };

  const toggleTopic = (idx: number, isManual: boolean) => {
    const setter = isManual ? setManualTopics : setCategories;
    setter((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, selected: !t.selected } : t))
    );
  };

  // Generate PDP
  const handleGenerate = async () => {
    setError("");
    setSuccess("");
    setGenerating(true);
    try {
      if (!templateLoaded) throw new Error("Шаблон ИПР не загружен");

      const isManualMode = mode === "manual";
      const topics = isManualMode ? manualTopics : categories;
      const selected = topics.filter((t) => t.selected);
      if (selected.length === 0) throw new Error("Не выбрано ни одной темы");

      const usedInfo: EmployeeInfo = isManualMode
        ? {
            employee: manualEmployee || "NAME SURNAME",
            manager: manualManager || "",
            grade: manualGrade,
            next_date: "",
            date: "",
            level_before: "",
            project: "",
            interviewer: "",
          }
        : info || {
            employee: "NAME SURNAME",
            manager: "",
            grade: "jun",
            next_date: "",
            date: "",
            level_before: "",
            project: "",
            interviewer: "",
          };

      // Auto-generate output filename from employee name
      const employeeName = usedInfo.employee || "NAME SURNAME";
      const outputName =
        employeeName !== "NAME SURNAME"
          ? "ИПР_" + employeeName.replace(/ /g, "_") + ".docx"
          : "ИПР.docx";

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weakTopics: selected,
          info: usedInfo,
          settings: { ...settings, outputName },
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Generation failed");
      }

      // Download the blob
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outputName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess(
        'Файл "' + outputName + '" сгенерирован и скачан!'
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setGenerating(false);
    }
  };

  const isManual = mode === "manual";
  const currentTopics = isManual ? manualTopics : categories;
  const selectedCount = currentTopics.filter((t) => t.selected).length;
  const containerStyle: React.CSSProperties = {
    maxWidth: 720,
    margin: "0 auto",
    padding: "0 24px",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ ...containerStyle, padding: "20px 24px" }}>
          <h1
            style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: 0 }}
          >
            PDP Generator
          </h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
            Генерация индивидуального плана развития (ИПР)
          </p>
        </div>
      </div>

      <div style={{ ...containerStyle, paddingTop: 24, paddingBottom: 48 }}>
        {/* Data status badges */}
        {dataLoading ? (
          <div
            style={{
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 12,
              padding: "12px 16px",
              fontSize: 14,
              color: "#92400e",
              marginBottom: 16,
            }}
          >
            Загрузка данных...
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <EmbeddedBadge label="Шаблон ИПР" />
            <EmbeddedBadge label="PDP Topics" count={pdpTopicsCount} />
          </div>
        )}

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 4,
            borderBottom: "1px solid #e5e7eb",
            marginBottom: 24,
          }}
        >
          <TabBtn active={mode === "excel"} onClick={() => setMode("excel")}>
            Из Excel ассессмента
          </TabBtn>
          <TabBtn active={mode === "manual"} onClick={() => setMode("manual")}>
            Ручной ввод тем
          </TabBtn>
        </div>

        {/* Excel upload */}
        {!isManual && (
          <div style={{ marginBottom: 24 }}>
            <FileDrop
              label="Excel с ассессментом (.xlsx)"
              accept=".xlsx,.xls"
              onFile={handleExcel}
              file={excelFile}
              hint="Загрузите Node assessment template"
            />
          </div>
        )}

        {/* Sheet selector */}
        {!isManual && sheets.length > 1 && (
          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "#6b7280",
                marginBottom: 4,
              }}
            >
              Шит
            </label>
            <select
              value={selectedSheet}
              onChange={(e) => handleSheetChange(e.target.value)}
              style={{
                width: "100%",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 14,
                background: "#fff",
                outline: "none",
              }}
            >
              {sheets.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Manual mode */}
        {isManual && (
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              padding: 20,
              marginBottom: 24,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "#6b7280",
                    marginBottom: 4,
                  }}
                >
                  Имя сотрудника
                </label>
                <input
                  type="text"
                  value={manualEmployee}
                  onChange={(e) => setManualEmployee(e.target.value)}
                  placeholder="Иванов Иван"
                  style={{
                    width: "100%",
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 14,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "#6b7280",
                    marginBottom: 4,
                  }}
                >
                  Менеджер
                </label>
                <input
                  type="text"
                  value={manualManager}
                  onChange={(e) => setManualManager(e.target.value)}
                  placeholder="Петров Пётр"
                  style={{
                    width: "100%",
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 14,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "#6b7280",
                  marginBottom: 4,
                }}
              >
                Грейд
              </label>
              <select
                value={manualGrade}
                onChange={(e) =>
                  setManualGrade(e.target.value as "jun" | "mid")
                }
                style={{
                  width: "100%",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 14,
                  background: "#fff",
                  outline: "none",
                }}
              >
                <option value="jun">Junior</option>
                <option value="mid">Middle</option>
              </select>
            </div>
          </div>
        )}

        {/* Employee info */}
        {!isManual && info && (
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              padding: 16,
              marginBottom: 24,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
                fontSize: 14,
              }}
            >
              <div>
                <span
                  style={{ fontSize: 12, color: "#9ca3af", display: "block" }}
                >
                  Сотрудник
                </span>
                <span style={{ fontWeight: 500 }}>{info.employee}</span>
              </div>
              <div>
                <span
                  style={{ fontSize: 12, color: "#9ca3af", display: "block" }}
                >
                  Грейд
                </span>
                <span style={{ fontWeight: 500 }}>
                  {(info.grade || "").toUpperCase()}
                </span>
              </div>
              <div>
                <span
                  style={{ fontSize: 12, color: "#9ca3af", display: "block" }}
                >
                  Менеджер
                </span>
                <span style={{ fontWeight: 500 }}>{info.manager}</span>
              </div>
            </div>
          </div>
        )}

        {/* Topics */}
        {(currentTopics.length > 0 || isManual) && (
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              padding: 20,
              marginBottom: 24,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#374151",
                  margin: 0,
                }}
              >
                Темы для ИПР
                {currentTopics.length > 0 && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 12,
                      fontWeight: 400,
                      color: "#9ca3af",
                    }}
                  >
                    {selectedCount} из {currentTopics.length} выбрано
                  </span>
                )}
              </h3>
              {!isManual && (
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    onClick={() =>
                      setCategories((prev) =>
                        prev.map((c) => ({ ...c, selected: true }))
                      )
                    }
                    style={{
                      fontSize: 12,
                      color: "#6b7280",
                      padding: "4px 8px",
                      borderRadius: 4,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                  >
                    Все
                  </button>
                  <button
                    onClick={() => applyThreshold(settings.threshold)}
                    style={{
                      fontSize: 12,
                      color: "#6b7280",
                      padding: "4px 8px",
                      borderRadius: 4,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                  >
                    По порогу
                  </button>
                  <button
                    onClick={() =>
                      setCategories((prev) =>
                        prev.map((c) => ({ ...c, selected: false }))
                      )
                    }
                    style={{
                      fontSize: 12,
                      color: "#6b7280",
                      padding: "4px 8px",
                      borderRadius: 4,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                  >
                    Сбросить
                  </button>
                </div>
              )}
            </div>

            {/* Search input for manual mode — inside the topics block */}
            {isManual && (
              <div style={{ marginBottom: currentTopics.length > 0 ? 12 : 0 }}>
                <TopicSearchInput
                  options={mappingKeys[manualGrade] || []}
                  alreadySelected={manualTopics.map((t) => t.name)}
                  onSelect={addManualTopic}
                />
              </div>
            )}

            {currentTopics.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {currentTopics.map((t, i) => (
                  <TopicChip
                    key={i}
                    topic={t}
                    onToggle={() => toggleTopic(i, isManual)}
                    onRemove={
                      isManual
                        ? () =>
                            setManualTopics((prev) =>
                              prev.filter((_, j) => j !== i)
                            )
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings */}
        <div style={{ marginBottom: 24 }}>
          <SettingsPanel settings={settings} onChange={setSettings} mode={mode} />
        </div>

        {/* Status messages */}
        {error && (
          <div
            style={{
              background: "#fef2f2",
              color: "#b91c1c",
              border: "1px solid #fecaca",
              borderRadius: 12,
              padding: "12px 16px",
              fontSize: 14,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}
        {success && (
          <div
            style={{
              background: "#ecfdf5",
              color: "#15803d",
              border: "1px solid #bbf7d0",
              borderRadius: 12,
              padding: "12px 16px",
              fontSize: 14,
              marginBottom: 16,
            }}
          >
            {success}
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={generating || dataLoading}
          style={{
            width: "100%",
            padding: "14px 0",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            border: "none",
            cursor: generating ? "wait" : "pointer",
            background: generating ? "#d1d5db" : "#111827",
            color: generating ? "#6b7280" : "#fff",
            transition: "all 0.15s",
          }}
        >
          {generating
            ? "Генерация..."
            : `Сгенерировать ИПР (${selectedCount} тем)`}
        </button>
      </div>
    </div>
  );
}
