<div align="center">

# FluidFlow

**React Page Builder / AI Prototyping Tool**

Transform wireframes and sketches into functional React applications using AI.

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/) [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)](https://www.typescriptlang.org/) [![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite)](https://vitejs.dev/) [![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss)](https://tailwindcss.com/) [![Multi-AI](https://img.shields.io/badge/AI-Multi--Provider-8B5CF6)](https://ai.google.dev/) [![Tests](https://img.shields.io/badge/Tests-75%20passing-22c55e?logo=vitest)](https://vitest.dev/) [![ESLint](https://img.shields.io/badge/ESLint-0%20errors-4b32c3?logo=eslint)](https://eslint.org/)

[Features](#features) | [Installation](#installation) | [Usage](#usage) | [Architecture](#architecture) | [Security](#security)

</div>

---

## Features

### Core Capabilities

- **Sketch to Code** - Upload wireframes/mockups and generate complete React applications
- **Brand Integration** - Upload brand logos to automatically extract and apply color schemes
- **Multi-File Generation** - Creates organized project structure with components, utilities, and styles
- **Live Preview** - Real-time preview with device simulation (desktop, tablet, mobile)
- **Code Editor** - Monaco-powered editor with syntax highlighting and split view

### Multi-Provider AI Support

| Provider | Models |
|----------|--------|
| **Google Gemini** | Gemini 3 Flash, Gemini 3 Pro Preview, Gemini 2.5 Flash, Gemini 2.5 Pro |
| **OpenAI** | GPT-5.1 Codex, GPT-5.1, GPT-4o, GPT-4o Mini |
| **Anthropic** | Claude 4.5 Sonnet, Claude 4.5 Opus |
| **MiniMax** | MiniMax M2.1 |
| **ZAI (GLM)** | GLM-4.7, GLM-4.6, GLM-4.5-air [Coding Plans](https://z.ai/subscribe?ic=JQZ7TPPRA6) |
| **OpenRouter** | Access to 100+ models |
| **Ollama** | Local LLMs (Llama, Mistral, etc.) |
| **LMStudio** | Local LLM inference |

### Project Management

- **Cloud Projects** - Save and manage multiple projects with backend sync
- **Project Screenshots** - Automatic preview thumbnails with full-size lightbox
- **Git Integration** - Built-in version control with commit history
- **WIP Persistence** - Uncommitted changes survive page refresh (IndexedDB)
- **Scratch Mode** - Work without creating a project, state persists across page refresh
- **Discard Changes** - Restore to last commit with one click
- **AI Commit Messages** - Generate commit messages with AI
- **Unsaved Work Detection** - Smart detection when switching projects with unsaved changes

### GitHub Integration

| Feature | Description |
|---------|-------------|
| **Push to GitHub** | Create new repository or push to existing repo |
| **Import from GitHub** | Browse and import your GitHub repositories |
| **Clone by URL** | Import any public repository by URL |
| **Auto-Backup** | Automatic backup to GitHub branch on each commit |
| **Conversation Sync** | Optionally include AI chat history in `.fluidflow/` folder |
| **Metadata Restore** | Restore project context when importing from GitHub |
| **Privacy Control** | Choose public or private repository on push |

### Context Management

- **Token Tracking** - Real-time monitoring of conversation context size
- **Auto-Compaction** - AI-powered summarization when context exceeds limits
- **Multi-Context Support** - Separate contexts for different features (chat, prompt improver, git, etc.)
- **Compaction Logs** - Track all context compactions with before/after stats
- **Model-Aware Limits** - Dynamic context limits based on selected AI model

### AI-Powered Features

| Feature | Description |
|---------|-------------|
| **Consultant Mode** | Get UX/UI suggestions before generating code |
| **Prompt Improver** | Interactive AI assistant to refine and enhance your prompts |
| **Auto-Fix** | Automatically detects and fixes runtime errors |
| **Inspect & Edit** | Click elements to modify specific components |
| **Accessibility Audit** | WCAG 2.1 compliance checking with auto-fix |
| **Responsiveness Fix** | AI-powered mobile optimization |
| **Context Compaction** | AI summarizes long conversations to stay within token limits |
| **Sandbox Auto-Fix** | Automatically fixes common AI code errors (syntax, reserved names, etc.) |

### Export Options

- **ZIP Download** - Complete Vite + React + Tailwind project ready to run
- **GitHub Push** - Push to new or existing repository with metadata sync

### Developer Tools

- **Console Panel** - View logs, warnings, and errors from preview
- **Network Panel** - Monitor HTTP requests
- **Activity Log** - Track all actions (generation, edits, commits, errors) with timestamps
- **Debug Mode** - Track all AI API calls with JSON inspection
- **Version History** - Undo/redo with full timeline navigation
- **Database Studio** - Visual SQLite database management
- **Environment Panel** - Manage environment variables
- **CodeMap** - Visual project structure analysis and navigation

---

## Installation

### Prerequisites

- Node.js 20+ (LTS recommended)
- API Key from any supported provider

### Quick Start

```bash
# Clone the repository
git clone https://github.com/ersinkoc/fluidflow.git
cd fluidflow

# Install dependencies
npm install

# Start development servers (frontend + backend)
npm run dev
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
# At least one API key required
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
OPENROUTER_API_KEY=your_openrouter_api_key
ZAI_API_KEY=your_zai_api_key
MINIMAX_API_KEY=your_minimax_api_key

# GitHub Integration (optional - can also be set in UI)
GITHUB_TOKEN=your_github_personal_access_token

# Backend API (optional)
VITE_API_URL=https://localhost:3101/api
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both frontend (port 3100) and backend (port 3101) (Self-Signed SSL) |
| `npm run dev:frontend` | Start only frontend development server |
| `npm run dev:server` | Start only backend development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |

### Code Quality

| Command | Description |
|---------|-------------|
| `npm run type-check` | TypeScript type checking |
| `npm run lint` | ESLint checking |
| `npm run lint:fix` | Auto-fix ESLint issues |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check Prettier formatting |

### Testing

| Command | Description |
|---------|-------------|
| `npm test` | Run tests in watch mode (Vitest) |
| `npm run test:run` | Run tests once (CI mode) - 75 tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:ui` | Run tests with Vitest UI |
| `npm run test:security` | Run security tests only |

---

## Usage

### Basic Workflow

1. **Upload Sketch** - Drag & drop or click to upload a wireframe/mockup image
2. **Add Context** (Optional) - Describe features or add a brand logo
3. **Generate** - Click generate to create your React app
4. **Review** - Inspect the generated code in the diff modal
5. **Iterate** - Use quick edit or chat to refine the result
6. **Export** - Download as ZIP or push to GitHub

### Modes

#### Engineer Mode (Default)
Generates complete React applications from sketches.

#### Consultant Mode
Analyzes designs and provides UX improvement suggestions before code generation.

### AI Provider Selection

Configure your preferred AI provider in the Settings modal (gear icon). Each provider offers different models optimized for various use cases.

### GitHub Workflow

#### Pushing to GitHub

1. Click the **GitHub** button in the export options
2. Enter your GitHub Personal Access Token (stored securely)
3. Choose **Create New** or **Push to Existing** repository
4. Configure options:
   - Repository name and description
   - Public or private visibility
   - Include project metadata (`.fluidflow/config.json`)
   - Include conversation history (`.fluidflow/context.json`)
5. Click **Push** to create/update the repository

#### Importing from GitHub

1. Click **Import from GitHub** in the Projects panel
2. Authenticate with your GitHub token
3. Browse your repositories or enter a URL directly
4. Repositories with FluidFlow backups show a special badge
5. Select a repository to import
6. FluidFlow automatically restores:
   - Project files and structure
   - Project metadata and settings
   - Conversation history (if synced)

#### Auto-Backup

Enable automatic GitHub backups in Settings > GitHub:
1. Configure backup token and branch name
2. Enable auto-backup toggle
3. Every commit automatically pushes to your backup branch

---

## Architecture

### Project Structure

```
fluidflow/
├── server/           # Express.js backend API
├── components/       # React components (ControlPanel, PreviewPanel, GitPanel, etc.)
├── contexts/         # React context providers (AppContext)
├── hooks/            # Custom hooks (useProject, useVersionHistory, etc.)
├── services/         # Business logic (AI providers, context management)
├── utils/            # Utilities (validation, parsing, security)
├── types/            # TypeScript definitions
├── tests/            # Vitest test suites
├── App.tsx           # Main application
└── index.tsx         # Entry point
```

### Data Flow

```
User Input → ControlPanel.handleSend()
    ↓
AI Provider (streaming)
    ↓
Parse Response → Extract Files
    ↓
DiffModal (review changes)
    ↓
Confirm → Update State → Save to FS
    ↓
PreviewPanel (live iframe render)
```

### Virtual File System

Generated apps are stored in memory as a `FileSystem` object:

```typescript
type FileSystem = Record<string, string>;
// Example:
{
  "src/App.tsx": "export default function App() {...}",
  "src/components/Header.tsx": "...",
  "src/index.css": "@import 'tailwindcss';..."
}
```

---

## Context Management

FluidFlow includes an intelligent context management system to handle long conversations efficiently.

### How It Works

1. **Token Tracking** - Each conversation context tracks estimated token usage (~4 chars = 1 token)
2. **Threshold Monitoring** - Visual indicator shows when context approaches model limits
3. **AI Compaction** - When limits are reached, older messages are summarized by AI
4. **Separate Contexts** - Different features maintain independent contexts:
   - `main-chat` - Primary code generation chat
   - `prompt-improver` - Prompt enhancement sessions
   - `git-commit` - Commit message generation
   - `quick-edit` - Inline code modifications

### Context Indicator

The context indicator in the chat panel shows:
- Current token usage vs. model limit
- Color-coded status (green → yellow → red)
- Click to open full context manager modal

### Compaction Process

When context exceeds limits:
1. Recent messages are preserved (last 2-4 messages)
2. Older messages are summarized by AI
3. Summary replaces old messages as a system message
4. Compaction is logged with before/after stats

### Model Context Limits

| Model | Context Window |
|-------|----------------|
| Gemini 3 | 1,000,000 tokens |
| GPT-5.1 | 256,000 tokens |
| Claude 4.5 | 200,000 tokens |
| GLM-4.7 | 200,000 tokens |
| MiniMax M2.1 | 200,000 tokens |

---

## Debug Mode

Monitor all AI API interactions in real-time.

### Enabling Debug Mode

1. Open **Settings** (bottom of left panel)
2. Toggle **Debug Mode** on
3. Switch to the **Debug** tab in the right panel

### Log Types

| Type | Icon | Description |
|------|------|-------------|
| Request | 🔵 | Outgoing API calls |
| Response | 🟢 | Successful responses |
| Stream | 🟣 | Streaming chunks |
| Error | 🔴 | Failed requests |
| Info | ⚪ | Informational logs |

### Categories

- `generation` - Main code generation
- `accessibility` - A11y audits
- `quick-edit` - Inline edits
- `auto-fix` - Error auto-correction

### Features

- **JSON Viewer** - Expandable/collapsible response inspection
- **Filtering** - Filter by type, category, or search text
- **Copy** - One-click JSON export
- **Duration** - Response time tracking
- **Model Info** - See which model was used

---

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | React 19 |
| Language | TypeScript 5.9 |
| Build Tool | Vite 7 |
| AI | Multi-provider (Gemini, OpenAI, Claude, GLM, MiniMax, Ollama, OpenRouter) |
| Styling | Tailwind CSS 4 |
| Icons | Lucide React |
| Editor | Monaco Editor |
| Backend | Express.js 5 |
| Storage | File system + IndexedDB |
| Version Control | simple-git |
| Testing | Vitest 4 |
| Export | JSZip, FileSaver, StackBlitz SDK |

---

## Browser Support

- Chrome 90+
- Firefox 90+
- Safari 15+
- Edge 90+

---

## Security

FluidFlow includes built-in security measures:

- **Input Validation** - XSS prevention, SQL injection protection, path traversal detection
- **Content Sanitization** - Safe handling of user inputs and AI responses
- **Security Testing** - Automated tests for common attack vectors
- **ESLint Security Plugin** - Static analysis for security vulnerabilities

Run security tests with:
```bash
npm run test:security
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [Google Gemini](https://ai.google.dev/), [OpenAI](https://openai.com/), [Anthropic](https://anthropic.com/), [MiniMax](https://www.minimax.io/), [Z.AI](https://z.ai/) for AI capabilities
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) for code editing
- [Lucide](https://lucide.dev/) for icons
- [simple-git](https://github.com/steveukx/git-js) for Git integration
- [Vitest](https://vitest.dev/) for testing

---

<div align="center">

**Built with AI, for Builders**

[Report Bug](https://github.com/ersinkoc/fluidflow/issues) | [Request Feature](https://github.com/ersinkoc/fluidflow/issues)

</div>
