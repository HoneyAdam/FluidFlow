import React, { useState, useEffect } from 'react';
import { Settings2, Check, Info, FlaskConical } from 'lucide-react';
import { SettingsSection } from '../shared';
import { SettingsSelect } from '../shared/SettingsSelect';
import { getFluidFlowConfig, type AIResponseFormat } from '../../../services/fluidflowConfig';

export const AdvancedPanel: React.FC = () => {
  const [editingRules, setEditingRules] = useState(false);
  const [rulesInput, setRulesInput] = useState('');
  const [savedRules, setSavedRules] = useState('');

  // AI Response Format - default to marker
  const [responseFormat, setResponseFormat] = useState<AIResponseFormat>('marker');

  useEffect(() => {
    const config = getFluidFlowConfig();
    const rules = config.getRules();
    setRulesInput(rules);
    setSavedRules(rules);

    // Load response format
    setResponseFormat(config.getResponseFormat());
  }, []);

  const handleResponseFormatChange = (format: string) => {
    const config = getFluidFlowConfig();
    config.setResponseFormat(format as AIResponseFormat);
    setResponseFormat(format as AIResponseFormat);
  };

  const saveRules = () => {
    const config = getFluidFlowConfig();
    config.setRules(rulesInput);
    setSavedRules(rulesInput);
    setEditingRules(false);
  };

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-info-subtle)' }}>
          <Settings2 className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
        </div>
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>Advanced Settings</h2>
          <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Configure project rules for AI code generation</p>
        </div>
      </div>

      {/* Project Rules */}
      <SettingsSection
        title="Project Rules"
        description="Custom instructions added to every AI generation request"
      >
        {/* Info Box */}
        <div className="flex items-start gap-3 p-3 rounded-lg mb-4" style={{ backgroundColor: 'var(--color-info-subtle)', border: '1px solid var(--color-info-border)' }}>
          <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--color-info)' }} />
          <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
            These rules are included in every AI generation request. Use them to define
            coding standards, naming conventions, preferred patterns, or any other
            guidelines you want the AI to follow.
          </div>
        </div>

        <div className="space-y-3">
          {editingRules ? (
            <>
              <textarea
                value={rulesInput}
                onChange={(e) => setRulesInput(e.target.value)}
                className="w-full h-80 px-3 py-2 rounded-lg text-sm font-mono outline-none resize-none"
                style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
                placeholder={`# Project Rules\n\n## Code Style\n- Use TypeScript strict mode\n- Prefer const over let\n- Use descriptive variable names\n\n## Component Guidelines\n- Use functional components\n- Keep components small and focused\n- Extract reusable logic into custom hooks\n\n## Styling\n- Use Tailwind utility classes\n- Follow mobile-first approach\n- Maintain consistent spacing`}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setRulesInput(savedRules);
                    setEditingRules(false);
                  }}
                  className="px-3 py-1.5 text-sm rounded-lg transition-colors"
                  style={{ color: 'var(--theme-text-muted)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveRules}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors"
                  style={{ backgroundColor: 'var(--theme-accent)', color: 'var(--theme-text-on-accent)' }}
                >
                  <Check className="w-4 h-4" />
                  Save Rules
                </button>
              </div>
            </>
          ) : (
            <div
              onClick={() => setEditingRules(true)}
              className="p-4 rounded-lg cursor-pointer transition-colors group"
              style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}
            >
              {savedRules ? (
                <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-hidden" style={{ color: 'var(--theme-text-muted)' }}>
                  {savedRules}
                </pre>
              ) : (
                <div className="text-sm italic" style={{ color: 'var(--theme-text-dim)' }}>
                  No rules defined. Click to add custom AI generation rules.
                </div>
              )}
              <div className="mt-3 text-xs" style={{ color: 'var(--theme-accent)' }}>
                Click to edit rules
              </div>
            </div>
          )}
        </div>
      </SettingsSection>

      {/* Example Rules */}
      <SettingsSection
        title="Example Rules"
        description="Common rules you might want to add"
      >
        <div className="grid grid-cols-1 gap-2">
          {[
            { title: 'TypeScript Strict', rule: '- Always use TypeScript with strict mode\n- Avoid "any" type, use proper typing' },
            { title: 'Accessibility', rule: '- Include ARIA labels on interactive elements\n- Ensure keyboard navigation works' },
            { title: 'Performance', rule: '- Use React.memo for expensive components\n- Implement proper loading states' },
            { title: 'Error Handling', rule: '- Add try-catch blocks for async operations\n- Show user-friendly error messages' },
          ].map((example, i) => (
            <button
              key={i}
              onClick={() => {
                const newRules = savedRules
                  ? `${savedRules}\n\n## ${example.title}\n${example.rule}`
                  : `# Project Rules\n\n## ${example.title}\n${example.rule}`;
                setRulesInput(newRules);
                setEditingRules(true);
              }}
              className="p-3 rounded-lg text-left transition-colors"
              style={{ backgroundColor: 'var(--theme-glass-100)', border: '1px solid var(--theme-border-light)' }}
            >
              <div className="text-sm" style={{ color: 'var(--theme-text-primary)' }}>{example.title}</div>
              <div className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--theme-text-dim)' }}>{example.rule.split('\n')[0]}</div>
            </button>
          ))}
        </div>
      </SettingsSection>

      {/* AI Response Format */}
      <SettingsSection
        title="AI Response Format"
        description="Experimental: Choose how AI returns generated code"
      >
        {/* Experimental Badge */}
        <div className="flex items-start gap-3 p-3 rounded-lg mb-4" style={{ backgroundColor: 'var(--color-warning-subtle)', border: '1px solid var(--color-warning-border)' }}>
          <FlaskConical className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--color-warning)' }} />
          <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
            <span className="font-medium" style={{ color: 'var(--color-warning)' }}>Experimental Feature:</span> The marker format
            is an alternative to JSON that may improve streaming reliability. Both formats are
            automatically detected and parsed. Use this to A/B test which works better for your use case.
          </div>
        </div>

        <div className="space-y-4">
          <SettingsSelect
            label="Response Format"
            description="How AI should structure code in responses"
            value={responseFormat}
            options={[
              {
                value: 'json',
                label: 'JSON (Default)',
                description: 'Standard JSON format with escaped content. Supports diff mode.'
              },
              {
                value: 'marker',
                label: 'Marker (Experimental)',
                description: 'HTML-style markers, no escaping needed. Diff mode disabled.'
              },
              {
                value: 'tools',
                label: 'Tool Calling',
                description: 'AI uses tools directly to create/modify files'
              }
            ]}
            onChange={handleResponseFormatChange}
          />

          {/* Marker format note */}
          {responseFormat === 'marker' && (
            <div className="flex items-start gap-2 p-2 rounded text-xs" style={{ backgroundColor: 'var(--color-info-subtle)', border: '1px solid var(--color-info-border)', color: 'var(--theme-text-muted)' }}>
              <Info className="w-3 h-3 shrink-0 mt-0.5" style={{ color: 'var(--color-info)' }} />
              <span>
                <span style={{ color: 'var(--color-info)' }}>Note:</span> Diff mode (search/replace) is JSON-only.
                With marker format, updates use full file content.
              </span>
            </div>
          )}

          {/* Tool calling format note */}
          {responseFormat === 'tools' && (
            <div className="flex items-start gap-2 p-2 rounded text-xs" style={{ backgroundColor: 'var(--color-info-subtle)', border: '1px solid var(--color-info-border)', color: 'var(--theme-text-muted)' }}>
              <Info className="w-3 h-3 shrink-0 mt-0.5" style={{ color: 'var(--color-info)' }} />
              <span>
                <span style={{ color: 'var(--color-info)' }}>Note:</span> Tool calling requires a provider with tool calling enabled.
                AI will use file operation tools directly instead of returning code in the response.
              </span>
            </div>
          )}

          {/* Format Details */}
          <div className="grid grid-cols-2 gap-3">
            <div
              className="p-3 rounded-lg"
              style={{
                backgroundColor: responseFormat === 'json' ? 'var(--color-info-subtle)' : 'var(--theme-glass-100)',
                border: responseFormat === 'json' ? '1px solid var(--color-info-border)' : '1px solid var(--theme-border-light)'
              }}
            >
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--theme-text-primary)' }}>JSON Format</div>
              <pre className="text-[10px] font-mono overflow-hidden" style={{ color: 'var(--theme-text-dim)' }}>
{`// PLAN: {"create":[...]}
{"files":{"src/App.tsx":"..."}}`}
              </pre>
            </div>
            <div
              className="p-3 rounded-lg"
              style={{
                backgroundColor: responseFormat === 'marker' ? 'var(--color-info-subtle)' : 'var(--theme-glass-100)',
                border: responseFormat === 'marker' ? '1px solid var(--color-info-border)' : '1px solid var(--theme-border-light)'
              }}
            >
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--theme-text-primary)' }}>Marker Format</div>
              <pre className="text-[10px] font-mono overflow-hidden" style={{ color: 'var(--theme-text-dim)' }}>
{`<!-- PLAN -->
create: src/App.tsx
<!-- FILE:src/App.tsx -->
...code...
<!-- /FILE:src/App.tsx -->`}
              </pre>
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
};

export default AdvancedPanel;
