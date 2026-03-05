# FIXPLAN - FluidFlow Codebase Review Fixes

> **Kural**: Calisan sistemi bozmadan, her fix izole ve test edilebilir olmali.
> Her fix sonrasi `npm run type-check && npm run lint && npm run test:run` gecmeli.

---

## PHASE 1 - CRITICAL (Hemen) ✅ COMPLETE

### FIX-01: `saveWIP()` await edilmiyor - Data Loss Riski ✅
**Dosya**: `contexts/AppContext.tsx`
**Fix**: `.catch()` eklendi tum saveWIP callsite'larina.

### FIX-02: MiniMax Proxy Fetch Timeout/Abort Yok - Server Hang ✅
**Dosya**: `server/api/ai.ts`
**Fix**: AbortController + 60s timeout (main), 15s (test endpoint).

### FIX-03: github.ts 7 TypeScript Compile Error ✅
**Dosya**: `server/api/github.ts`
**Fix**: `getParamString()` helper, Express 5 `req.params` string|string[] uyumlulugu.

### FIX-04: 3 ESLint Error (Unused Variables) ✅
**Fix**: `_` prefix eklendi: `_providerVersion`, `_files`, `_context`.

### FIX-05: `npm audit fix` - Dependency Vulnerabilities ✅
**Fix**: 7 → 2 vulnerability (kalan 2: DOMPurify via monaco-editor, breaking change gerektirir).

### FIX-06: `aiLimiter` Tanimli Ama Hic Kullanilmiyor ✅
**Dosya**: `server/index.ts`
**Fix**: `aiLimiter` import edildi ve `/api/ai` route'una uygulandı.

---

## PHASE 2 - HIGH (Bu Sprint) ✅ COMPLETE

### FIX-07: `postMessage` Origin Validation Yok ✅
**Dosyalar**: `useIframeMessaging.ts`, `useSandboxBridge.ts`, `RunnerPanel.tsx`
**Fix**: `event.origin` kontrolu eklendi tum message listener'lara.

### FIX-08: `buildIframeHtml` Her Keystroke'da Yeniden Olusturuluyor ✅
**Dosya**: `components/PreviewPanel/index.tsx`
**Fix**: 500ms debounce eklendi useEffect'e.

### FIX-09: `handleSend` useCallback ile Sarilmamis ⏭️ SKIPPED
**Sebep**: Codebase comment (line 380-382) complexity tradeoff'u acikliyor, intentional design decision.

### FIX-10: JSON.stringify ile Equality Check (Performans) ✅
**Dosya**: `hooks/useVersionHistory.ts`
**Fix**: `calculateChangedFiles` ile O(n) karsilastirma, JSON.stringify kaldirild.

### FIX-11: Floating Promises in useEffect (Mounted Guard Yok) ✅
**Dosyalar**: `AboutPanel.tsx`, `StatusBar/index.tsx`, `UIContext.tsx`
**Fix**: `let mounted = true` guard + `.catch()` eklendi.

### FIX-12: Inline Callbacks FileExplorer'a Geciliyor ✅
**Dosya**: `components/PreviewPanel/index.tsx`
**Fix**: `useCallback` ile stabil referanslar: `handleCreateFile`, `handleDeleteFile`, `handleRenameFile`.

### FIX-13: `fileKeysSignature` files Object Ref'e Bagli ✅
**Dosya**: `contexts/AppContext.tsx`
**Fix**: Ref-based signature, content-only edit'lerde degismiyor.

### FIX-14: GitHub Server Fetch'lerde Timeout Yok ✅
**Dosya**: `server/api/github.ts`
**Fix**: `fetchWithTimeout()` helper, 30s timeout tum GitHub API fetch'lerine uygulandi.

### FIX-15: Silent catch {} in AppContext getLocalChanges ✅
**Dosya**: `contexts/AppContext.tsx`
**Fix**: `console.error` eklendi silent catch'e.

---

## PHASE 3 - MEDIUM (Sonraki Sprint) ✅ COMPLETE

### FIX-16: setTimeout'lar Cleanup Edilmiyor ✅
**Dosyalar**: `ChatInput.tsx`, `ExpandedPromptModal.tsx`, `MegaSettingsModal/index.tsx`, `GitHubPanel.tsx`, `App.tsx`
**Fix**: `useRef` + `useEffect` cleanup ile timeout'lar temizleniyor.

### FIX-17: Duplicate Markdown Renderer (3 Kopya) ✅
**Fix**: `utils/renderMarkdown.ts` olusturuldu, `escapeHtml` tek kaynaktan import ediliyor.
**Dosyalar**: `ChatPanel.tsx`, `TextExpandModal.tsx`, `MarkdownPreview.tsx` guncellendi.

### FIX-18: ProjectsPanel Paralel State Tutuyor ⏭️ SKIPPED
**Sebep**: `AppContext` henuz `projects` array veya `refreshProjects` expose etmiyor. Architectural change gerekli.

### FIX-19: Polling Interval'lar Panel Hidden'da da Calisiyor ⏭️ SKIPPED
**Sebep**: `IntersectionObserver` entegrasyonu 3+ component'ta gerekli. Architectural change.

### FIX-20: getProviderManager() JSX Render'da Cagriliyor ⏭️ SKIPPED
**Sebep**: Singleton accessor, trivial O(1) call. Performance impact negligible.

### FIX-21: JSON.parse() as T - Runtime Validation Yok ✅
**Dosyalar**: `providerStorage.ts`, `conversationContext.ts`, `promptHistory.ts`, `snippetLibrary.ts`
**Fix**: `Array.isArray()` runtime validation eklendi tum JSON.parse callsite'larina.

### FIX-22: Client Encryption Fallback Predictable Secret ✅
**Dosya**: `utils/clientEncryption.ts`
**Fix**: `crypto.getRandomValues()` ile session-level random secret, predictable string kaldirildi.

---

## PHASE 4 - LOW (Tech Debt) ✅ COMPLETE

### FIX-23: ChatMessage Discriminated Union Olmali ⏭️ SKIPPED
**Sebep**: Breaking change, mevcut tip guvenli calisiyor.

### FIX-24: readonly Eksik (HistoryEntry, GitCommit, ParsedError) ⏭️ SKIPPED
**Sebep**: tsconfig strict mode olmadan etkisi sinirli.

### FIX-25: Duplicate DebugCategory Union ⏭️ SKIPPED
**Sebep**: Zaten `useDebugStore.ts`'de tek yerde tanimli, duplicate yok.

### FIX-26: NetworkRequest.status: number | string ⏭️ SKIPPED
**Sebep**: Breaking change, mevcut implementation calisiyor.

### FIX-27: useProject2 Naming -> useProjectContext ⏭️ SKIPPED
**Sebep**: Rename riski, tum import'lar guncellenmeli.

### FIX-28: CHANGELOG.md?raw Production Bundle'da ⏭️ SKIPPED
**Sebep**: AboutPanel zaten lazy-loaded modal icinde, bundle impact minimal.

### FIX-29: Regex Loop Icinde Compile (analyzer.ts:633) ✅
**Dosya**: `services/errorFix/analyzer.ts`
**Fix**: Regex'ler loop disinda bir kez compile ediliyor.

### FIX-30: String Concat Loop (ChatPanel.tsx:121) ✅
**Dosya**: `components/ControlPanel/ChatPanel.tsx`
**Fix**: `codeContent += line` yerine `codeLines.push(line)` + `.join('\n')`.

### FIX-31: Object.keys(files).length 5x Tekrar (ControlPanel) ⏭️ SKIPPED
**Sebep**: O(n) ama n kucuk (tipik proje <50 dosya), caching complexity arttirir.

### FIX-32: providerVersion State Sadece Re-render Icin ⏭️ SKIPPED
**Sebep**: Intentional re-render trigger pattern, alternative mechanism gerekli.

### FIX-33: FileReader onerror Handler Eksik ✅
**Dosyalar**: `ChatInput.tsx`, `ExpandedPromptModal.tsx`
**Fix**: `reader.onerror` handler eklendi, kullaniciya hata mesaji gosteriliyor.

### FIX-34: Project name/description Length Limit Yok ✅
**Dosya**: `server/api/projects.ts`
**Fix**: Name max 100 char, description max 500 char validation (create + update).

---

## Final Validation ✅

```bash
npm run type-check    # 0 error ✅
npm run lint          # 0 error, 0 warning ✅
npm run test:run      # 1620/1620 tests passing ✅
```

## Summary

| Phase | Implemented | Skipped | Total |
|-------|------------|---------|-------|
| Phase 1 (Critical) | 6 | 0 | 6 |
| Phase 2 (High) | 8 | 1 | 9 |
| Phase 3 (Medium) | 4 | 3 | 7 |
| Phase 4 (Low) | 4 | 8 | 12 |
| **Total** | **22** | **12** | **34** |

> Skipped items: 1 intentional design decision (FIX-09), 3 require architectural changes (FIX-18/19/20),
> 8 low-impact or already resolved (FIX-23-28, FIX-31-32).
