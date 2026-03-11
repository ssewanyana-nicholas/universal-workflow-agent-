import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  Square,
  Trash2,
  Settings,
  History,
  Eye,
  ShieldCheck,
  Globe,
  Maximize,
  Image,
  Terminal,
  Loader2,
  Target,
  CheckCircle2,
  XCircle,
  Activity,
  ChevronUp,
  ChevronDown,
  Clock,
  Zap,
  AlertCircle,
  FileText,
  Cpu,
  RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "./lib/utils";

interface Action {
  id: string;
  type: string;
  description: string;
  args?: Record<string, any>;
}

interface Step {
  id: string;
  timestamp: number;
  actions: Action[];
  analysis?: string;
  backendScreenshot?: string;
}

interface SessionState {
  current_url: string;
  viewport_size: { width: number; height: number };
  safe_mode: boolean;
  demo_mode: boolean;
}

interface LogEntry {
  id: number;
  time: string;
  msg: string;
  type: "info" | "success" | "error" | "action" | "warning";
}

const defaultSessionState: SessionState = {
  current_url: "https://example.com",
  viewport_size: { width: 1920, height: 1080 },
  safe_mode: true,
  demo_mode: false,
};

const EXAMPLE_TASKS = [
  "Search for the president of Kenya",
  "Find the weather in Nairobi",
  "Go to wikipedia and search for AI",
  "Find the latest news on technology",
];

export default function App() {
  const [goal, setGoal] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [currentScreenshot, setCurrentScreenshot] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState>(defaultSessionState);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [sidebarTab, setSidebarTab] = useState<"history" | "settings">("history");
  const [logsExpanded, setLogsExpanded] = useState(true);
  const [finalResult, setFinalResult] = useState<{status: string; summary: string} | null>(null);
  const [logId, setLogId] = useState(0);
  
  const logsRef = useRef<HTMLDivElement>(null);
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080";

  useEffect(() => {
    if (logsRef.current && logsExpanded) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs, logsExpanded]);

  const addLog = (msg: string, type: LogEntry["type"] = "info") => {
    setLogId(id => id + 1);
    setLogs(prev => [...prev, {
      id: logId,
      time: new Date().toLocaleTimeString(),
      msg,
      type
    }]);
  };

  const runAgent = async (analysisOnly = false) => {
    if (!goal.trim()) {
      addLog("Please enter a goal", "error");
      return;
    }

    setIsProcessing(true);
    setFinalResult(null);
    addLog(`🚀 Starting: ${goal}`, "info");

    try {
      const sessionId = Math.random().toString(36).substr(2, 9);
      const base64Data = currentScreenshot ? currentScreenshot.split(",")[1] : null;
      const endpoint = analysisOnly ? "/agent/analyze" : "/agent/run";

      addLog("Connecting to agent...", "info");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ sessionId, userGoal: goal, sessionState, screenshotBase64: base64Data }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`Error: ${response.status}`);

      const result = await response.json();
      addLog("Agent response received", "success");

      if (result.steps) {
        addLog(`Processing ${result.steps.length} steps...`, "info");
        for (const step of result.steps) {
          let screenshotData = step.screenshot || step.backendScreenshot;
          if (screenshotData && !screenshotData.startsWith('data:image')) {
            screenshotData = `data:image/jpeg;base64,${screenshotData}`;
          }

          const newStep: Step = {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: Date.now(),
            actions: [{ id: Math.random().toString(36).substr(2, 9), type: step.tool, description: step.action || step.tool, args: step.args }],
            analysis: step.analysis,
            backendScreenshot: screenshotData,
          };

          setSteps(prev => [...prev, newStep]);
          if (screenshotData) {
            setCurrentScreenshot(screenshotData);
            addLog(`Screenshot updated: ${step.action || step.tool}`, "action");
          }
          addLog(`✓ ${step.action || step.tool}`, "info");
        }
      }

      if (result.final) {
        setFinalResult({ status: result.final.status, summary: result.final.summary });
        if (result.final.status === "success") {
          addLog(`✅ ${result.final.summary}`, "success");
        } else {
          addLog(`❌ ${result.final.summary || "Task failed"}`, "error");
        }
        let finalSS = result.final.screenshot || result.final.backendScreenshot;
        if (finalSS && !finalSS.startsWith('data:image')) {
          setCurrentScreenshot(`data:image/jpeg;base64,${finalSS}`);
        }
      } else {
        addLog("⚠ No final result returned", "warning");
      }

    } catch (error: any) {
      addLog(`❌ Error: ${error.message || "Request failed"}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const clearSession = () => {
    setSteps([]);
    setLogs([]);
    setCurrentScreenshot(null);
    setGoal("");
    setFinalResult(null);
    addLog("🆕 Session cleared - Ready for new task", "info");
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setCurrentScreenshot(e.target?.result as string);
      addLog(`📷 Screenshot loaded: ${file.name}`, "success");
    };
    reader.readAsDataURL(file);
  };

  const selectExample = (task: string) => {
    setGoal(task);
    addLog(`Task selected: ${task}`, "info");
  };

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Top Bar */}
      <header className="h-14 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm flex items-center justify-between px-5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">UI Navigator</h1>
            <p className="text-[10px] text-zinc-500 -mt-0.5">Autonomous Web Agent</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Status Indicators */}
          <div className="flex items-center gap-3 px-3 py-1.5 bg-zinc-900 rounded-full border border-zinc-800">
            {isProcessing ? (
              <>
                <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />
                <span className="text-xs text-amber-500">Processing</span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs text-zinc-500">Ready</span>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-full border border-zinc-800">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs text-zinc-400">Safe Mode</span>
            <button
              onClick={() => setSessionState(s => ({ ...s, safe_mode: !s.safe_mode }))}
              className={cn("w-7 h-3.5 rounded-full transition-all ml-1", sessionState.safe_mode ? "bg-emerald-500" : "bg-zinc-700")}
            >
              <div className={cn("w-2.5 h-2.5 bg-white rounded-full transition-transform", sessionState.safe_mode ? "translate-x-4" : "translate-x-0.5")} />
            </button>
          </div>
          
          <button onClick={clearSession} className="p-1.5 hover:bg-zinc-800 rounded-md transition-colors">
            <Trash2 className="w-4 h-4 text-zinc-500" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel */}
        <aside className="w-80 border-r border-zinc-800 bg-zinc-900/30 flex flex-col shrink-0">
          {/* Task Input */}
          <div className="p-4 border-b border-zinc-800/60">
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Target className="w-3 h-3" />
              Your Task
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Describe what you want the agent to do..."
              className="w-full h-28 bg-zinc-900/60 rounded-lg border border-zinc-800 p-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 resize-none"
            />
            
            {/* Quick Examples */}
            <div className="mt-3">
              <p className="text-[10px] text-zinc-600 uppercase mb-2">Quick examples:</p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLE_TASKS.slice(0, 3).map((task, i) => (
                  <button
                    key={i}
                    onClick={() => selectExample(task)}
                    className="text-[10px] px-2 py-1 bg-zinc-800/50 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-300 transition-colors truncate max-w-[150px]"
                  >
                    {task.split(' ').slice(0, 3).join(' ')}...
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => runAgent(false)}
                disabled={isProcessing || !goal.trim()}
                className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white py-2.5 rounded-lg font-medium text-sm transition-all"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {isProcessing ? "Running..." : "Execute"}
              </button>
              <button
                onClick={() => runAgent(true)}
                disabled={isProcessing || !goal.trim()}
                className="px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-zinc-400 text-sm transition-colors"
              >
                Analyze
              </button>
              <label className="px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 text-sm transition-colors cursor-pointer">
                <Image className="w-4 h-4" />
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-zinc-800/60 bg-zinc-900/20">
            {(["history", "settings"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setSidebarTab(tab)}
                className={cn(
                  "flex-1 py-3 text-xs font-medium uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5",
                  sidebarTab === tab 
                    ? "text-emerald-400 border-b-2 border-emerald-500 bg-zinc-800/30" 
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                {tab === "history" ? <History className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5" />}
                {tab}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {sidebarTab === "history" ? (
              <div className="h-full flex flex-col">
                <div className="p-3 bg-zinc-900/40 flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">Execution History</span>
                  <span className="text-[10px] px-2 py-0.5 bg-zinc-800 rounded-full text-zinc-500">{steps.length} steps</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {steps.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-600 p-4">
                      <Clock className="w-10 h-10 mb-3 opacity-40" />
                      <p className="text-sm font-medium">No history yet</p>
                      <p className="text-xs text-zinc-600 mt-1 text-center">Execute a task to see the execution history here</p>
                    </div>
                  ) : (
                    steps.map((step, i) => (
                      <motion.div 
                        key={step.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={cn(
                          "p-3 bg-zinc-900/60 rounded-lg border transition-all cursor-pointer hover:border-zinc-700",
                          i === steps.length - 1 ? "border-emerald-500/30" : "border-zinc-800/50"
                        )}
                        onClick={() => step.backendScreenshot && setCurrentScreenshot(step.backendScreenshot)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase bg-emerald-500/10 px-1.5 py-0.5 rounded">Step {i + 1}</span>
                          </div>
                          <span className="text-[9px] text-zinc-600">{new Date(step.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div className="text-xs text-zinc-400 truncate">{step.actions[0]?.description}</div>
                        {step.backendScreenshot && (
                          <div className="mt-2 flex items-center gap-1 text-[10px] text-zinc-500">
                            <Image className="w-3 h-3" />
                            <span>Screenshot available</span>
                          </div>
                        )}
                      </motion.div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-5 overflow-y-auto">
                {/* URL Setting */}
                <div>
                  <label className="text-xs text-zinc-500 uppercase mb-2.5 block flex items-center gap-1.5">
                    <Globe className="w-3 h-3" />
                    Target URL
                  </label>
                  <input
                    type="text"
                    value={sessionState.current_url}
                    onChange={(e) => setSessionState(s => ({ ...s, current_url: e.target.value }))}
                    className="w-full bg-zinc-900/60 rounded-md border border-zinc-800 p-2.5 text-sm focus:border-emerald-500/50 outline-none"
                    placeholder="https://..."
                  />
                </div>

                {/* Viewport */}
                <div>
                  <label className="text-xs text-zinc-500 uppercase mb-2.5 block flex items-center gap-1.5">
                    <Maximize className="w-3 h-3" />
                    Viewport Size
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-zinc-600 block mb-1">Width</span>
                      <input 
                        type="number" 
                        value={sessionState.viewport_size.width} 
                        onChange={(e) => setSessionState(s => ({ ...s, viewport_size: { ...s.viewport_size, width: parseInt(e.target.value) } }))} 
                        className="w-full bg-zinc-900/60 rounded-md border border-zinc-800 p-2 text-sm focus:border-emerald-500/50 outline-none" 
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-600 block mb-1">Height</span>
                      <input 
                        type="number" 
                        value={sessionState.viewport_size.height} 
                        onChange={(e) => setSessionState(s => ({ ...s, viewport_size: { ...s.viewport_size, height: parseInt(e.target.value) } }))} 
                        className="w-full bg-zinc-900/60 rounded-md border border-zinc-800 p-2 text-sm focus:border-emerald-500/50 outline-none" 
                      />
                    </div>
                  </div>
                </div>

                {/* Screenshot Upload */}
                <div>
                  <label className="text-xs text-zinc-500 uppercase mb-2.5 block flex items-center gap-1.5">
                    <Image className="w-3 h-3" />
                    Screenshot {currentScreenshot && "(Uploaded)"}
                  </label>
                  {currentScreenshot ? (
                    <div className="relative group">
                      <img src={currentScreenshot} alt="Uploaded" className="w-full h-32 object-cover rounded-md border border-zinc-800" />
                      <button 
                        onClick={() => { setCurrentScreenshot(null); addLog("Screenshot removed", "info"); }}
                        className="absolute top-2 right-2 p-1 bg-red-500/80 hover:bg-red-500 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <XCircle className="w-4 h-4 text-white" />
                      </button>
                      <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 rounded text-[10px] text-white">
                        Click to change
                      </div>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center p-6 border-2 border-dashed border-zinc-700 rounded-md cursor-pointer hover:border-emerald-500/50 hover:bg-zinc-900/40 transition-colors">
                      <div className="text-center">
                        <Image className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                        <span className="text-xs text-zinc-600">Click to upload image</span>
                      </div>
                      <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                    </label>
                  )}
                </div>

                {/* Agent Info */}
                <div className="pt-4 border-t border-zinc-800">
                  <div className="flex items-center gap-2 mb-3">
                    <Cpu className="w-4 h-4 text-zinc-500" />
                    <span className="text-xs text-zinc-500 uppercase">Agent Configuration</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-600">Backend</span>
                      <span className="text-zinc-400 truncate ml-2">{BACKEND_URL}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600">Safe Mode</span>
                      <span className={sessionState.safe_mode ? "text-emerald-400" : "text-amber-400"}>
                        {sessionState.safe_mode ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0 bg-zinc-950">
          {/* Viewport */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="h-10 border-b border-zinc-800/60 bg-zinc-900/30 flex items-center justify-between px-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/60" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
                </div>
                <div className="h-4 w-px bg-zinc-800" />
                <Eye className="w-4 h-4 text-zinc-500" />
                <span className="text-xs text-zinc-500">Live Viewport</span>
              </div>
              <div className="flex items-center gap-3">
                {currentScreenshot && (
                  <span className="text-[10px] flex items-center gap-1 text-emerald-500/70">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Screenshot Active
                  </span>
                )}
                <span className="text-[10px] text-zinc-600">{steps.length} steps</span>
              </div>
            </div>
            
            <div className="flex-1 relative bg-zinc-950 flex items-center justify-center overflow-hidden p-6">
              {/* Result Banner */}
              <AnimatePresence>
                {finalResult && (
                  <motion.div
                    initial={{ opacity: 0, y: -20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    className={cn(
                      "absolute top-4 left-4 right-4 z-20 px-5 py-3.5 rounded-xl flex items-center gap-3 shadow-2xl border",
                      finalResult.status === "success" 
                        ? "bg-emerald-500/95 border-emerald-400" 
                        : "bg-red-500/95 border-red-400"
                    )}
                  >
                    {finalResult.status === "success" ? (
                      <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 text-white shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">
                        {finalResult.status === "success" ? "Task Completed Successfully" : "Task Failed"}
                      </p>
                      <p className="text-xs text-white/80 truncate">{finalResult.summary}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {currentScreenshot ? (
                <img 
                  src={currentScreenshot} 
                  alt="Screen" 
                  className="max-w-full max-h-full object-contain rounded-lg shadow-2xl border border-zinc-800" 
                />
              ) : (
                <div className="text-center text-zinc-700 p-8">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-zinc-900/50 flex items-center justify-center">
                    <Eye className="w-10 h-10 opacity-40" />
                  </div>
                  <p className="text-base font-medium text-zinc-500 mb-2">No Screenshot</p>
                  <p className="text-sm text-zinc-600 max-w-xs mx-auto">
                    Screenshot will appear here when the agent starts executing tasks
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Console */}
          <div className={cn("border-t border-zinc-800 bg-zinc-900/20 transition-all", logsExpanded ? "h-48" : "h-10")}>
            <button 
              onClick={() => setLogsExpanded(!logsExpanded)}
              className="w-full h-10 flex items-center justify-between px-4 hover:bg-zinc-800/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-zinc-500" />
                <span className="text-xs font-medium text-zinc-400">Activity Log</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 rounded-full text-zinc-500">{logs.length}</span>
              </div>
              <ChevronUp className={cn("w-4 h-4 text-zinc-500 transition-transform", logsExpanded ? "" : "rotate-180")} />
            </button>
            
            <AnimatePresence>
              {logsExpanded && (
                <motion.div 
                  initial={{ height: 0 }} 
                  animate={{ height: "calc(100% - 40px)" }} 
                  exit={{ height: 0 }}
                  className="overflow-hidden"
                >
                  <div ref={logsRef} className="h-full overflow-y-auto px-4 pb-3 font-mono text-xs">
                    {logs.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-zinc-600">
                        <span>No activity yet</span>
                      </div>
                    ) : (
                      logs.map((log, i) => (
                        <div 
                          key={i} 
                          className={cn(
                            "flex gap-3 py-1.5 border-b border-zinc-800/30",
                            log.type === "error" && "text-red-400 bg-red-500/5 -mx-4 px-4",
                            log.type === "success" && "text-emerald-400",
                            log.type === "warning" && "text-amber-400",
                            log.type === "action" && "text-amber-400",
                            log.type === "info" && "text-zinc-400"
                          )}
                        >
                          <span className="text-zinc-600 shrink-0">{log.time}</span>
                          <span className="truncate">{log.msg}</span>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
