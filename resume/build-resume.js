const {
  Document, Packer, Paragraph, TextRun, AlignmentType, LevelFormat,
  ExternalHyperlink, TabStopType, BorderStyle,
} = require("docx");

const ACCENT = "0E7490";   // deep cyan-teal
const DARK = "1F2937";     // near-black gray
const MUTED = "6B7280";    // gray for dates/links
const FONT = "Calibri";

const PAGE = { size: { width: 12240, height: 15840 }, margin: { top: 620, bottom: 620, left: 850, right: 850 } };

// ---------- helpers ----------
const t = (text, opts = {}) => new TextRun({ text, font: FONT, size: 20, color: DARK, ...opts });

const sectionHeader = (title) =>
  new Paragraph({
    spacing: { before: 190, after: 70 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ACCENT, space: 2 } },
    children: [t(title.toUpperCase(), { bold: true, size: 21, color: ACCENT, characterSpacing: 20 })],
  });

const bullet = (children, opts = {}) =>
  new Paragraph({
    numbering: { reference: "dash", level: 0 },
    spacing: { after: 30, line: 244, lineRule: "auto" },
    children: children.map((c) => (typeof c === "string" ? t(c) : c)),
    ...opts,
  });

const link = (text, url, opts = {}) =>
  new ExternalHyperlink({
    link: url,
    children: [t(text, { color: ACCENT, ...opts })],
  });

// Project title line: name (bold) + tech (muted) + right-aligned link
const projectTitle = (name, sub, url, urlLabel) =>
  new Paragraph({
    spacing: { before: 110, after: 20 },
    tabStops: [{ type: TabStopType.RIGHT, position: 10540 }],
    children: [
      t(name, { bold: true, size: 21 }),
      t("  —  " + sub, { italics: true, color: MUTED, size: 19 }),
      t("\t", {}),
      link(urlLabel, url, { size: 18 }),
    ],
  });

const roleLine = (role, org, dates) =>
  new Paragraph({
    spacing: { before: 100, after: 20 },
    tabStops: [{ type: TabStopType.RIGHT, position: 10540 }],
    children: [
      t(role, { bold: true, size: 21 }),
      t("  ·  " + org, { color: DARK, size: 20 }),
      t("\t" + dates, { color: MUTED, size: 19 }),
    ],
  });

const skillLine = (label, items) =>
  new Paragraph({
    spacing: { after: 34, line: 244, lineRule: "auto" },
    children: [t(label + ":  ", { bold: true, size: 20 }), t(items, { size: 20 })],
  });

// ---------- document ----------
const doc = new Document({
  numbering: {
    config: [
      {
        reference: "dash",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 260, hanging: 180 } }, run: { color: ACCENT } },
        }],
      },
    ],
  },
  styles: { default: { document: { run: { font: FONT, size: 20, color: DARK } } } },
  sections: [{
    properties: { page: PAGE },
    children: [
      // ===== Header =====
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 30 },
        children: [t("K. R. YOGANAND", { bold: true, size: 40, color: DARK, characterSpacing: 30 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 50 },
        children: [t("AI Engineer  ·  Agentic Systems, LLM Applications & Developer Tooling", { size: 22, color: ACCENT, bold: true })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [
          t("yogini.nand@gmail.com   ·   +91-80120 70015   ·   ", { size: 19, color: MUTED }),
          link("github.com/JrKrishh", "https://github.com/JrKrishh", { size: 19 }),
          t("   ·   ", { size: 19, color: MUTED }),
          link("clawverseworlds.vercel.app", "https://clawverseworlds.vercel.app", { size: 19 }),
        ],
      }),

      // ===== Summary =====
      sectionHeader("Summary"),
      new Paragraph({
        spacing: { after: 40, line: 250, lineRule: "auto" },
        children: [t(
          "AI engineer who designs, ships, and operates production LLM systems end to end — autonomous multi-agent platforms, " +
          "brain-inspired memory engines, token-efficient model routing, RAG pipelines, and Model Context Protocol (MCP) tooling. " +
          "Five shipped open-source AI products with live deployments, automated eval suites, and hackathon builds for OpenAI, AMD, and Qwen challenges. " +
          "Earlier career in industrial automation (PLC/SCADA) provides hard-won rigor in real-time systems, reliability, and instrumentation."
        )],
      }),

      // ===== Skills =====
      sectionHeader("Technical Skills"),
      skillLine("AI / LLM Engineering", "Agentic architectures (LangGraph, Google ADK), RAG, hybrid retrieval (semantic + BM25), LLM reranking, long-term memory & consolidation, prompt engineering, JSON-schema structured output, guardrails & adversarial evals, multi-model routing, MCP servers, voice agents (TTS/STT)"),
      skillLine("Models & Inference", "Anthropic Claude, OpenAI, Gemini, DeepSeek, Qwen, Fireworks AI, OpenRouter, Groq, vLLM self-hosting on AMD ROCm, ElevenLabs"),
      skillLine("Languages & Frameworks", "TypeScript, Python, Node.js, FastAPI, Express 5, Next.js 15, React 18, Vite, Tailwind CSS, Zod"),
      skillLine("Data & Infrastructure", "PostgreSQL + Drizzle ORM, Qdrant, Neo4j, MongoDB Atlas Vector Search, Supabase, Docker, sandboxed code execution, Vercel, pnpm monorepos, esbuild, CI & automated testing"),
      skillLine("Industrial Automation", "PLC programming (Siemens, Allen-Bradley, ABB, GE-Fanuc — LD/FBD), DCS, SCADA, HMI, VFD commissioning, field instrumentation"),

      // ===== Projects =====
      sectionHeader("Featured Projects"),

      projectTitle("Clawverse Worlds", "TypeScript · Express 5 · PostgreSQL/Drizzle · React 18 · LLM agents", "https://github.com/JrKrishh/clawverseworlds", "github.com/JrKrishh/clawverseworlds"),
      bullet(["Built and deployed a persistent social simulation where autonomous AI agents register via REST API and live independently — chatting, forming friendships and gangs, declaring wars, playing wagered Chess/Tic-Tac-Toe, founding planets, and earning reputation and currency — while humans observe via a real-time dashboard (live at clawverseworlds.vercel.app)."]),
      bullet(["Designed the full agent-facing REST API (Express 5 + Zod validation + Drizzle ORM), a persistent agent “consciousness” model (moods, opinions, memories), and a bundled LLM runner that turns any OpenAI-compatible model into a full inhabitant on a 30-second think-act loop."]),

      projectTitle("Guy Rick", "Python · FastAPI · LangGraph/Google ADK · Qdrant + Neo4j · Next.js", "https://github.com/JrKrishh/guy-rick", "github.com/JrKrishh/guy-rick"),
      bullet(["Built a voice + chat agent with a hybrid multi-model brain: RAG lore, graph “grudge” memory, episodic memory, sandboxed code execution, web search, and agentic self-correction loops; agent runtime (LangGraph vs Google ADK) and memory backend (Qdrant+Neo4j vs MongoDB Atlas) are swappable by env var."]),
      bullet(["AMD Developer Hackathon (Track 1): shipped a token-efficient routing agent — SIMPLE requests served by Qwen2.5-3B on self-hosted vLLM/ROCm, COMPLEX escalated to DeepSeek via Fireworks — serving 4 of 6 mixed-workload requests with zero frontier-model tokens."]),

      projectTitle("Nova Memory", "Python · hybrid retrieval + rerank · Qwen Cloud", "https://github.com/JrKrishh/nova-memory", "github.com/JrKrishh/nova-memory"),
      bullet(["Engineered a brain-inspired memory engine for AI agents based on Complementary Learning Systems theory: salience-gated writes, hybrid semantic + BM25 retrieval with LLM reranking, and “sleep” consolidation that supersedes stale facts and decays trivia — keeping the store bounded while recalling critical memories in a few hundred tokens."]),
      bullet(["Demonstrated with “Remember Me,” a playable 2D game whose station AI genuinely remembers the player across in-game days; five-line drop-in library API; Global AI Hackathon with Qwen Cloud, MemoryAgent track."]),

      projectTitle("Socratic", "Next.js 15 · TypeScript · Fireworks AI structured output", "https://github.com/JrKrishh/socratic-tutor", "github.com/JrKrishh/socratic-tutor"),
      bullet(["Built an AI tutor that never reveals answers: one guiding question at a time, a four-level hint ladder, and a JSON-schema structured student model (progress, misconceptions, frustration) driving live recaps, shareable teacher reports, and a private progress dashboard — OpenAI Build Week, Education category."]),
      bullet(["Hardened guardrails against answer-begging, prompt injection, and authority claims; automated evaluation suite of 10 hostile personas across 29 turns passed 153/153 checks on the production build."]),

      projectTitle("sove-mcp", "TypeScript · Model Context Protocol · published on npm", "https://github.com/JrKrishh/sove-mcp", "github.com/JrKrishh/sove-mcp"),
      bullet(["Published an MCP server that gives Claude structural understanding of a codebase — dependency graph, entry points, complexity ranking, and import cycles — computed locally and returned in a few hundred tokens instead of reading every file into context; resolves CommonJS, ESM, and TypeScript path aliases."]),

      // ===== Hackathons =====
      sectionHeader("Hackathons & Recognition"),
      bullet(["AMD Developer Hackathon, Act II — Track 1 (Token-Efficient Routing Agent) submission on AMD AI Developer Cloud, ROCm, and vLLM."]),
      bullet(["Global AI Hackathon Series with Qwen Cloud — MemoryAgent track submission (Nova Memory), with demo media generated on Qwen Cloud (Wan 2.2, Qwen3-TTS)."]),
      bullet(["OpenAI Build Week — Education category submission (Socratic), built through an iterative AI-assisted product-and-QA loop with adversarial test briefs."]),

      // ===== Experience =====
      sectionHeader("Experience"),
      roleLine("Independent AI Engineer & Open-Source Developer", "Self-directed", "2025 – Present"),
      bullet(["Shipped five open-source AI products end to end — concept, architecture, implementation, deployment, and evals — spanning multi-agent simulation, agent memory, tutoring guardrails, model routing, and MCP developer tooling (projects above)."]),
      bullet(["Operate live services on Vercel with PostgreSQL/Supabase backends; practice eval-driven development with automated adversarial test suites and structured-output contracts."]),
      roleLine("Automation Engineer", "IOLOGIX Automation Solutions, Chennai", "2 years"),
      bullet(["Programmed PLCs and DCS systems (Ladder Diagram, Function Block Diagram) across Siemens, Allen-Bradley, ABB, and GE-Fanuc platforms for industrial clients."]),
      bullet(["Designed SCADA/HMI screens with PC–PLC interfacing and data collection; commissioned and troubleshot VFDs, control valves, transmitters, and panel wiring in the field."]),

      // ===== Education =====
      sectionHeader("Education & Certification"),
      new Paragraph({
        spacing: { before: 60, after: 20 },
        tabStops: [{ type: TabStopType.RIGHT, position: 10540 }],
        children: [
          t("B.E. Electronics & Instrumentation Engineering", { bold: true, size: 21 }),
          t("  ·  Karpagam College of Engineering, Anna University, Coimbatore", { size: 20 }),
          t("\t2014", { color: MUTED, size: 19 }),
        ],
      }),
      new Paragraph({
        spacing: { after: 20 },
        children: [t("Advanced Training in Industrial Automation (ATIA) — Technocrat Automation Pvt. Ltd. (IAO Accredited), Chennai", { size: 20 })],
      }),
    ],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  require("fs").writeFileSync(process.argv[2] || "YOGANAND_AI_ENGINEER_RESUME.docx", buf);
  console.log("written");
});
