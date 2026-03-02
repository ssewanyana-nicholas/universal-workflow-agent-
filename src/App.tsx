/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Monitor, 
  Play, 
  History, 
  Settings, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight, 
  Terminal,
  MousePointer2,
  Keyboard,
  ScrollText,
  Eye,
  Loader2,
  Trash2,
  ArrowRight,
  Globe,
  Maximize,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import Markdown from 'react-markdown';
import { cn } from './lib/utils';

// --- Types ---

interface Action {
  type: string;
  description: string;
  args: any;
  timestamp: number;
  status: 'pending' | 'executing' | 'completed' | 'failed';
}

interface SessionState {
  current_url: string;
  active_app: string;
  viewport_size: { width: number; height: number };
  zoom: number;
  domain_whitelist: string[];
  safe_mode: boolean;
  demo_mode: boolean;
}

interface Step {
  id: string;
  goal: string;
  screenshot: string | null;
  analysis: string;
  actions: Action[];
  verification: string | null;
  timestamp: number;
}

// --- Function Declarations (Tools) ---

const tools: { functionDeclarations: FunctionDeclaration[] }[] = [
  {
    functionDeclarations: [
      {
        name: "find_element",
        description: "Return candidate bounding boxes for an element by textual/visual description and optional landmarks.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: "Textual or visual description of the element." },
            hints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Optional visual hints or landmarks." },
            top_k: { type: Type.INTEGER, description: "Number of candidates to return." }
          },
          required: ["query"]
        }
      },
      {
        name: "click",
        description: "Click at a bounding box center (normalized).",
        parameters: {
          type: Type.OBJECT,
          properties: {
            x: { type: Type.NUMBER, description: "X coordinate (0-1)." },
            y: { type: Type.NUMBER, description: "Y coordinate (0-1)." }
          },
          required: ["x", "y"]
        }
      },
      {
        name: "double_click",
        description: "Double-click at a bounding box center.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            x: { type: Type.NUMBER, description: "X coordinate (0-1)." },
            y: { type: Type.NUMBER, description: "Y coordinate (0-1)." }
          },
          required: ["x", "y"]
        }
      },
      {
        name: "right_click",
        description: "Right-click at a bounding box center.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            x: { type: Type.NUMBER, description: "X coordinate (0-1)." },
            y: { type: Type.NUMBER, description: "Y coordinate (0-1)." }
          },
          required: ["x", "y"]
        }
      },
      {
        name: "type_text",
        description: "Type text into the currently focused field.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING, description: "The text to type." },
            submit: { type: Type.BOOLEAN, description: "Whether to press Enter after typing." }
          },
          required: ["text"]
        }
      },
      {
        name: "key_press",
        description: "Send a keyboard shortcut (e.g., Enter, Tab, Ctrl+C).",
        parameters: {
          type: Type.OBJECT,
          properties: {
            keys: { type: Type.STRING, description: "The key combination to press." }
          },
          required: ["keys"]
        }
      },
      {
        name: "scroll",
        description: "Scroll viewport by pixels (positive = down/right).",
        parameters: {
          type: Type.OBJECT,
          properties: {
            dx: { type: Type.INTEGER, description: "Horizontal scroll amount." },
            dy: { type: Type.INTEGER, description: "Vertical scroll amount." }
          }
        }
      },
      {
        name: "hover",
        description: "Move mouse to bounding box center to reveal menus/tooltips.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            x: { type: Type.NUMBER, description: "X coordinate (0-1)." },
            y: { type: Type.NUMBER, description: "Y coordinate (0-1)." }
          },
          required: ["x", "y"]
        }
      },
      {
        name: "drag_and_drop",
        description: "Drag from source bbox center to target bbox center.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            from_x: { type: Type.NUMBER, description: "Source X coordinate (0-1)." },
            from_y: { type: Type.NUMBER, description: "Source Y coordinate (0-1)." },
            to_x: { type: Type.NUMBER, description: "Target X coordinate (0-1)." },
            to_y: { type: Type.NUMBER, description: "Target Y coordinate (0-1)." }
          },
          required: ["from_x", "from_y", "to_x", "to_y"]
        }
      },
      {
        name: "open_url",
        description: "Open a URL in the active tab or new tab.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            url: { type: Type.STRING, description: "The URL to open." },
            new_tab: { type: Type.BOOLEAN, description: "Whether to open in a new tab." }
          },
          required: ["url"]
        }
      },
      {
        name: "switch_tab",
        description: "Activate a browser tab by index or title match.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            index: { type: Type.INTEGER, description: "Tab index." },
            title_contains: { type: Type.STRING, description: "Title substring to match." }
          }
        }
      },
      {
        name: "upload_file",
        description: "Upload a local file to an input element; backend resolves file path.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            file_label: { type: Type.STRING, description: "Label or description of the file to upload." }
          },
          required: ["file_label"]
        }
      },
      {
        name: "take_screenshot",
        description: "Capture and return a new screenshot of the active window/tab.",
        parameters: {
          type: Type.OBJECT,
          properties: {}
        }
      },
      {
        name: "verify_element",
        description: "Assert that an element is visible with optional text matching.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: "Element description." },
            must_include_text: { type: Type.STRING, description: "Text that must be present." },
            region: {
              type: Type.OBJECT,
              properties: {
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
                width: { type: Type.NUMBER },
                height: { type: Type.NUMBER }
              }
            }
          },
          required: ["query"]
        }
      },
      {
        name: "finish_with_report",
        description: "Stop the session and return a final report summary.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, enum: ["success", "partial", "failed"], description: "Final status." },
            summary: { type: Type.STRING, description: "Task summary." },
            artifacts: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of artifacts produced." }
          },
          required: ["status", "summary"]
        }
      }
    ]
  }
];

const SYSTEM_INSTRUCTION = `You are "Universal Workflow Agent," a UI Navigator that completes multi-step workflows across web apps and desktop UIs.

PRIMARY OBJECTIVE
- Achieve the user’s goal with the fewest reliable steps.
- Work only from what you can SEE in screenshots.
- After every action, VERIFY success visually from a new screenshot before proceeding.

EXPECTED BEHAVIOR
- Only produce function/tool calls.
- Every action is followed by a ‘take_screenshot’ call.
- Prefer stable visual anchors (labels, icons, landmarks) and normalized bounding boxes [0..1].

VERIFICATION POLICY
- Confirm success using visible UI evidence that aligns with the intended outcome.
- Prefer region-scoped checks near where the action occurred.
- Accept variations in text (case/whitespace) but require semantic match.
- If verification fails once, try one recovery (scroll, wait one step, open likely menu), then verify again.

RECOVERY POLICY
- Attempt up to three of the following then stop and ask the user:
  1) scroll {dy: 500} and retry find_element with synonyms
  2) open common menus (kebab, gear, hamburger), then find_element
  3) use a visible page search field (find → click → type_text with query)
  4) switch_tab by title_contains if clearly in another tab
- Keep each attempt to ONE line of rationale; avoid long explanations.
- If still failing: Ask the user a concise question with 1 specific option (e.g., “Do you want me to use the Export menu instead?”).

FINISH POLICY
- When the goal condition is clearly satisfied and verified, call finish_with_report with:
  - status: "success" | "partial" | "failed"
  - summary: concise bullet list of steps and outcomes
  - artifacts: any filenames, links, or screenshot IDs
- Do not continue acting after finish_with_report.

STATE CONTEXT:
The user will provide the current session state including URL, viewport, and history.

EXAMPLES:

EXAMPLE A — Stripe: Download latest invoices CSV
USER: Download the most recent invoices CSV from Stripe.
ASSISTANT: Opening Stripe invoices.
→ open_url { "url": "https://dashboard.stripe.com/invoices" }
ASSISTANT: Capturing the page.
→ take_screenshot {}
ASSISTANT: Locating the latest invoice export.
→ find_element { "query": "Download CSV", "hints": ["top-right", "download icon", "blue button"] }
ASSISTANT:
→ click { "x": 0.91, "y": 0.18 }
ASSISTANT:
→ take_screenshot {}
ASSISTANT: Verifying download started or file chip visible.
→ verify_element { "query": "Download chip", "region": { "x": 0.70, "y": 0.88, "width": 0.28, "height": 0.12 } }

EXAMPLE B — Google Sheets: Paste summary
USER: Paste totals into the Monthly Revenue sheet.
ASSISTANT: Switching to the Sheets tab.
→ switch_tab { "title_contains": "Monthly Revenue - Google Sheets" }
ASSISTANT:
→ take_screenshot {}
ASSISTANT: Selecting Totals column first cell.
→ find_element { "query": "First cell in Totals column", "hints": ["header: Totals"] }
ASSISTANT:
→ click { "x": 0.34, "y": 0.28 }
ASSISTANT:
→ type_text { "text": "Q1 2026 Total: $128,440" }
ASSISTANT:
→ take_screenshot {}
ASSISTANT:
→ verify_element { "query": "Cell content shows Q1 2026 Total", "must_include_text": "Q1 2026 Total: $128,440" }

EXAMPLE C — Gmail: Send email with attachment
USER: Email finance with the summary and the CSV attached.
ASSISTANT: Switching to Gmail tab.
→ switch_tab { "title_contains": "Gmail" }
ASSISTANT:
→ take_screenshot {}
ASSISTANT: Composing a new email.
→ find_element { "query": "Compose", "hints": ["left panel", "red/pink button"] }
ASSISTANT:
→ click { "x": 0.12, "y": 0.18 }
ASSISTANT:
→ take_screenshot {}
ASSISTANT: Filling fields.
→ find_element { "query": "To field", "hints": ["top chip input"] }
ASSISTANT:
→ click { "x": 0.63, "y": 0.23 }
ASSISTANT:
→ type_text { "text": "finance@company.com" }
ASSISTANT:
→ find_element { "query": "Subject", "hints": ["below 'To'"] }
ASSISTANT:
→ click { "x": 0.62, "y": 0.29 }
ASSISTANT:
→ type_text { "text": "Invoice summary for Q1 2026" }
ASSISTANT:
→ find_element { "query": "Message body", "hints": ["main editor area"] }
ASSISTANT:
→ click { "x": 0.63, "y": 0.35 }
ASSISTANT:
→ type_text { "text": "Hi team,\nAttached is the latest invoices CSV and the revenue summary added to Sheets.\nRegards," }
ASSISTANT: Attaching the CSV.
→ find_element { "query": "Attach files", "hints": ["paperclip", "bottom"] }
ASSISTANT:
→ click { "x": 0.71, "y": 0.64 }
ASSISTANT:
→ upload_file { "file_label": "latest invoice CSV" }
ASSISTANT:
→ take_screenshot {}
ASSISTANT:
→ verify_element { "query": "Attachment chip visible" }
ASSISTANT: Sending.
→ find_element { "query": "Send", "hints": ["blue button", "compose window"] }
ASSISTANT:
→ click { "x": 0.18, "y": 0.65 }
ASSISTANT:
→ take_screenshot {}
ASSISTANT:
→ verify_element { "query": "Message sent notification", "hints": ["Snackbar", "bottom-left"] }
ASSISTANT:
→ finish_with_report { "status": "success", "summary": "Downloaded invoices CSV, updated Google Sheets, emailed finance with attachment.", "artifacts": ["stripe_invoices_2026Q1.csv", "screenshot_ids: 12-27"] }`;

// --- Components ---

export default function App() {
  const [goal, setGoal] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [currentScreenshot, setCurrentScreenshot] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ msg: string; type: 'info' | 'success' | 'error' | 'action' }[]>([]);
  
  const [sessionState, setSessionState] = useState<SessionState>({
    current_url: "https://app.workflow.io/dashboard",
    active_app: "Chrome",
    viewport_size: { width: 1920, height: 1080 },
    zoom: 1,
    domain_whitelist: ["workflow.io", "stripe.com", "google.com"],
    safe_mode: true,
    demo_mode: true
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, steps]);

  const addLog = (msg: string, type: 'info' | 'success' | 'error' | 'action' = 'info') => {
    setLogs(prev => [...prev, { msg, type }]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCurrentScreenshot(event.target?.result as string);
        addLog(`Screenshot captured: ${file.name}`, 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  const runAgent = async () => {
    if (!goal) {
      addLog("Please provide a goal first.", "error");
      return;
    }
    if (!currentScreenshot) {
      addLog("Please capture a screenshot to begin.", "error");
      return;
    }

    setIsProcessing(true);
    addLog(`Initiating workflow: "${goal}"`, 'info');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3.1-pro-preview";

      const base64Data = currentScreenshot.split(',')[1];
      
      const prompt = `
GOAL
- User goal: "${goal}"

CONTEXT
- current_url: ${sessionState.current_url}
- active_app: ${sessionState.active_app}
- viewport: ${sessionState.viewport_size.width}x${sessionState.viewport_size.height}, zoom: ${sessionState.zoom}
- last_screenshot_id: ${steps[steps.length - 1]?.id || "none"}
- safe_mode: ${sessionState.safe_mode}, demo_mode: ${sessionState.demo_mode}
- domain_whitelist: ${sessionState.domain_whitelist.join(", ")}

RULES (per turn)
- If the goal is ambiguous, ask ONE clarifying question.
- Otherwise, produce EXACTLY ONE tool call per message.
- After any action, immediately call take_screenshot, then verify_element for the intended outcome.
- For delete/payment/bulk actions: ask for explicit confirmation first.
      `;

      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/png", data: base64Data } }
            ]
          }
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: tools
        }
      });

      const functionCalls = response.functionCalls;
      
      if (!functionCalls || functionCalls.length === 0) {
        addLog("Agent completed the task or no actions were identified.", 'success');
        setIsProcessing(false);
        return;
      }

      const actions: Action[] = functionCalls.map(fc => ({
        type: fc.name,
        description: `Calling ${fc.name}: ${JSON.stringify(fc.args)}`,
        args: fc.args,
        timestamp: Date.now(),
        status: 'pending'
      }));

      const newStep: Step = {
        id: Math.random().toString(36).substr(2, 9),
        goal,
        screenshot: currentScreenshot,
        analysis: response.text || "Executing planned tool calls...",
        actions,
        verification: "Waiting for next state capture",
        timestamp: Date.now()
      };

      setSteps(prev => [...prev, newStep]);
      addLog(`Plan generated: ${actions.length} tool calls identified.`, 'info');

      // Simulate execution
      for (const action of actions) {
        addLog(`Executing Tool [${action.type}]...`, 'action');
        await new Promise(r => setTimeout(r, 1200));
        action.status = 'completed';
        
        if (action.type === 'navigate_to') {
          setSessionState(prev => ({ ...prev, current_url: action.args.url }));
        }
      }

      addLog(`Step complete. Please provide a new screenshot for visual verification.`, 'success');
      setCurrentScreenshot(null); // Clear for next step verification

    } catch (error) {
      console.error(error);
      addLog("Workflow interrupted. Check system logs.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const clearSession = () => {
    setSteps([]);
    setLogs([]);
    setCurrentScreenshot(null);
    setGoal('');
    addLog("Session reset.", "info");
  };

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1800px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.4)]">
              <Monitor className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight uppercase leading-none">Universal Workflow Agent</h1>
              <p className="text-[10px] text-emerald-500/60 font-mono uppercase tracking-[0.2em] mt-1">Autonomous UI Navigator</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-4 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3 h-3 text-emerald-500" />
                <span>Safe Mode: {sessionState.safe_mode ? "ON" : "OFF"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-3 h-3 text-amber-500" />
                <span>Latency: 1.2s</span>
              </div>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <button 
              onClick={clearSession}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors text-zinc-500 hover:text-white"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto p-6 grid grid-cols-1 lg:grid-cols-[320px_1fr_400px] gap-6 h-[calc(100vh-88px)]">
        
        {/* Left Column: Session State */}
        <div className="flex flex-col gap-6 overflow-hidden">
          <div className="bg-zinc-900/30 rounded-2xl border border-white/5 overflow-hidden flex flex-col shadow-xl">
            <div className="p-4 border-b border-white/5 bg-black/40 flex items-center gap-2">
              <Settings className="w-4 h-4 text-zinc-500" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">Session State</span>
            </div>
            <div className="p-4 space-y-6 overflow-y-auto">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                  <Globe className="w-3 h-3" />
                  Current URL
                </label>
                <div className="p-2 bg-black/40 rounded-lg border border-white/5 text-[11px] font-mono text-emerald-400 break-all">
                  {sessionState.current_url}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                  <Maximize className="w-3 h-3" />
                  Viewport
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-black/40 rounded-lg border border-white/5 text-[11px] font-mono text-zinc-400">
                    W: {sessionState.viewport_size.width}px
                  </div>
                  <div className="p-2 bg-black/40 rounded-lg border border-white/5 text-[11px] font-mono text-zinc-400">
                    H: {sessionState.viewport_size.height}px
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Whitelist</label>
                <div className="flex flex-wrap gap-1.5">
                  {sessionState.domain_whitelist.map(d => (
                    <span key={d} className="px-2 py-0.5 bg-zinc-800/50 rounded text-[9px] font-mono text-zinc-500 border border-white/5">
                      {d}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Safe Mode</span>
                  <button 
                    onClick={() => setSessionState(s => ({ ...s, safe_mode: !s.safe_mode }))}
                    className={cn("w-8 h-4 rounded-full transition-colors relative", sessionState.safe_mode ? "bg-emerald-500" : "bg-zinc-800")}
                  >
                    <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", sessionState.safe_mode ? "left-4.5" : "left-0.5")} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Demo Mode</span>
                  <button 
                    onClick={() => setSessionState(s => ({ ...s, demo_mode: !s.demo_mode }))}
                    className={cn("w-8 h-4 rounded-full transition-colors relative", sessionState.demo_mode ? "bg-emerald-500" : "bg-zinc-800")}
                  >
                    <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", sessionState.demo_mode ? "left-4.5" : "left-0.5")} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 bg-zinc-900/20 rounded-2xl border border-white/5 p-4 flex flex-col gap-4">
             <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <History className="w-3.5 h-3.5" />
              History
            </h4>
            <div className="flex-1 overflow-y-auto space-y-3">
              {steps.map((step, i) => (
                <div key={step.id} className="p-3 bg-black/20 rounded-xl border border-white/5 group hover:border-emerald-500/30 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] font-bold text-zinc-600 uppercase">Step {i + 1}</span>
                    <span className="text-[9px] text-zinc-700 font-mono">{new Date(step.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed">{step.actions[0]?.description || "Analysis"}</p>
                </div>
              ))}
              {steps.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 opacity-20">
                  <History className="w-8 h-8 mb-2" />
                  <p className="text-[10px] uppercase tracking-widest">No history</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center Column: Viewport */}
        <div className="flex flex-col gap-6 overflow-hidden">
          <div className="flex-1 bg-zinc-900/30 rounded-3xl border border-white/5 overflow-hidden flex flex-col relative group shadow-2xl">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(24,24,27,0),rgba(5,5,5,1))] pointer-events-none z-10" />
            
            <div className="p-4 border-b border-white/5 bg-black/40 flex items-center justify-between z-20">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/40" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500/40" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/40" />
                </div>
                <div className="h-4 w-px bg-white/10 mx-2" />
                <Eye className="w-4 h-4 text-zinc-500" />
                <span className="text-xs font-medium text-zinc-400 uppercase tracking-widest">Live Agent Viewport</span>
              </div>
            </div>

            <div className="flex-1 relative flex items-center justify-center p-8 overflow-auto bg-[#020202]">
              {currentScreenshot ? (
                <div className="relative">
                  <img 
                    src={currentScreenshot} 
                    alt="Current UI" 
                    className="max-w-full h-auto rounded-xl shadow-[0_40px_100px_rgba(0,0,0,0.8)] border border-white/10"
                  />
                  {/* Action Overlays */}
                  {steps[steps.length - 1]?.actions.map((action, i) => (
                    <React.Fragment key={i}>
                      {action.args?.x !== undefined && action.args?.y !== undefined && (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="absolute w-10 h-10 -ml-5 -mt-5 flex items-center justify-center"
                          style={{ left: `${action.args.x * 100}%`, top: `${action.args.y * 100}%` }}
                        >
                          <div className="absolute inset-0 bg-emerald-500/30 rounded-full animate-ping" />
                          <div className="w-5 h-5 bg-emerald-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
                             <MousePointer2 className="w-3 h-3 text-black" />
                          </div>
                          <div className="absolute top-full mt-1 px-2 py-0.5 bg-black/80 rounded text-[8px] text-white whitespace-nowrap border border-white/10">
                            {action.type}
                          </div>
                        </motion.div>
                      )}
                      {action.type === 'drag_and_drop' && action.args?.from_x !== undefined && (
                        <>
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="absolute w-8 h-8 -ml-4 -mt-4 flex items-center justify-center"
                            style={{ left: `${action.args.from_x * 100}%`, top: `${action.args.from_y * 100}%` }}
                          >
                            <div className="w-4 h-4 bg-amber-500 rounded-full border-2 border-white shadow-lg" />
                          </motion.div>
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="absolute w-8 h-8 -ml-4 -mt-4 flex items-center justify-center"
                            style={{ left: `${action.args.to_x * 100}%`, top: `${action.args.to_y * 100}%` }}
                          >
                            <div className="w-4 h-4 bg-emerald-500 rounded-full border-2 border-white shadow-lg" />
                          </motion.div>
                          <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                            <motion.line
                              initial={{ pathLength: 0 }}
                              animate={{ pathLength: 1 }}
                              x1={`${action.args.from_x * 100}%`}
                              y1={`${action.args.from_y * 100}%`}
                              x2={`${action.args.to_x * 100}%`}
                              y2={`${action.args.to_y * 100}%`}
                              stroke="rgba(16, 185, 129, 0.5)"
                              strokeWidth="2"
                              strokeDasharray="4 2"
                            />
                          </svg>
                        </>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              ) : (
                <div className="text-center space-y-6 max-w-sm">
                  <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center mx-auto border border-white/5 shadow-inner">
                    <Upload className="w-10 h-10 text-zinc-700" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">Awaiting Visual Input</h3>
                    <p className="text-xs text-zinc-500 mt-2 leading-relaxed">The agent requires a screenshot of the target interface to begin navigation.</p>
                  </div>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="px-6 py-3 bg-white text-black text-xs font-bold rounded-xl transition-all hover:bg-emerald-500 hover:text-black shadow-lg"
                  >
                    Capture Screenshot
                  </button>
                </div>
              )}
            </div>

            {/* Input Bar */}
            <div className="p-6 bg-black/60 border-t border-white/5 z-20 backdrop-blur-md">
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <input 
                    type="text"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="Describe the workflow goal..."
                    className="w-full bg-zinc-900/80 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/40 transition-all shadow-inner"
                    onKeyDown={(e) => e.key === 'Enter' && runAgent()}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                      accept="image/*" 
                      className="hidden" 
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 hover:bg-white/5 rounded-xl text-zinc-500 hover:text-white transition-colors"
                    >
                      <Upload className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <button 
                  onClick={runAgent}
                  disabled={isProcessing || !goal || !currentScreenshot}
                  className="px-8 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-black text-xs tracking-widest rounded-2xl transition-all flex items-center gap-3 shadow-[0_0_30px_rgba(16,185,129,0.3)]"
                >
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
                  EXECUTE
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Console */}
        <div className="flex flex-col gap-6 overflow-hidden">
          <div className="flex-1 bg-zinc-900/50 rounded-2xl border border-white/5 overflow-hidden flex flex-col shadow-2xl">
            <div className="p-4 border-b border-white/5 bg-black/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">Agent Intelligence</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-mono text-emerald-500/70 uppercase">Active</span>
              </div>
            </div>

            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-[11px] leading-relaxed"
            >
              {logs.length === 0 && (
                <div className="text-zinc-700 italic border-l-2 border-zinc-800 pl-3">System ready. Awaiting multimodal input...</div>
              )}
              {logs.map((log, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    "flex gap-3 p-2 rounded-lg transition-colors",
                    log.type === 'error' && "bg-red-500/5 text-red-400 border border-red-500/10",
                    log.type === 'success' && "bg-emerald-500/5 text-emerald-400 border border-emerald-500/10",
                    log.type === 'action' && "bg-amber-500/5 text-amber-400 border border-amber-500/10",
                    log.type === 'info' && "text-zinc-500"
                  )}
                >
                  <span className="text-zinc-700 shrink-0 font-bold">{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  <span className="break-words">{log.msg}</span>
                </motion.div>
              ))}
              {isProcessing && (
                <div className="flex gap-3 p-2 text-emerald-500/50 animate-pulse">
                   <span className="text-zinc-700 shrink-0 font-bold">{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                   <Loader2 className="w-3 h-3 mt-0.5 animate-spin" />
                   <span>Reasoning over visual state...</span>
                </div>
              )}
            </div>

            {/* Analysis Panel */}
            <AnimatePresence>
              {steps.length > 0 && (
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  className="bg-black/80 border-t border-white/5 p-5 max-h-80 overflow-y-auto backdrop-blur-md"
                >
                  <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <ScrollText className="w-3.5 h-3.5" />
                    Visual Grounding
                  </h4>
                  <div className="text-xs text-zinc-300 prose prose-invert prose-xs max-w-none leading-relaxed">
                    <Markdown>{steps[steps.length - 1].analysis}</Markdown>
                  </div>
                  {steps[steps.length - 1].actions.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Planned Tool Calls</p>
                      {steps[steps.length - 1].actions.map((action, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono bg-white/5 p-1.5 rounded border border-white/5">
                          <ChevronRight className="w-3 h-3 text-emerald-500" />
                          <span className="text-emerald-400">{action.type}</span>
                          <span className="opacity-50 truncate">({JSON.stringify(action.args)})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Toolset Info */}
          <div className="bg-zinc-900/30 rounded-2xl border border-white/5 p-4 space-y-4">
            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <Settings className="w-3 h-3" />
              Available Tools
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: Eye, label: "Find Element" },
                { icon: MousePointer2, label: "Click / Double / Right" },
                { icon: Keyboard, label: "Type / Key Press" },
                { icon: ScrollText, label: "Scroll / Hover" },
                { icon: ArrowRight, label: "Drag & Drop" },
                { icon: Globe, label: "Open URL / Tab" },
                { icon: Upload, label: "Upload File" },
                { icon: CheckCircle2, label: "Verify / Finish" },
              ].map((tool, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-black/20 rounded-lg border border-white/5">
                  <tool.icon className="w-3 h-3 text-zinc-500" />
                  <span className="text-[10px] text-zinc-400">{tool.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
