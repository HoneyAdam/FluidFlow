import React, { useState, useCallback, useEffect } from 'react';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { TOAST_DURATION_MS } from '../../constants/timing';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  Handle,
  Position,
  MarkerType,
  NodeChange,
  EdgeChange
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Database, Table2, Key, Plus, Trash2, Sparkles,
  Copy, Check, Loader2, Wand2, Save,
  RefreshCw, Settings, ChevronDown
} from 'lucide-react';
import { getProviderManager } from '../../services/ai';
import { DATABASE_SCHEMA_SCHEMA } from '../../services/ai/utils/schemas';
import { FileSystem } from '../../types';
import {
  parseSQLToSchema,
  generateSQL,
  generateFakeData,
  type TableSchema,
  type Column
} from '../../utils/sqlUtils';

interface DBStudioProps {
  files: FileSystem;
  setFiles: (files: FileSystem) => void;
}

// Relations file structure for persisting edges and positions
interface RelationsData {
  version: number;
  positions: Record<string, { x: number; y: number }>;
  edges: {
    id: string;
    source: string;
    target: string;
    sourceHandle: string | null;
    targetHandle: string | null;
    label?: string;
    relationType?: 'one-to-one' | 'one-to-many' | 'many-to-many';
  }[];
}

// Custom Table Node Component
const TableNode: React.FC<{
  data: {
    table: TableSchema;
    onUpdate: (table: TableSchema) => void;
    onDelete: () => void;
  };
}> = ({ data }) => {
  const { table, onUpdate, onDelete } = data;
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(table.name);

  const handleNameSubmit = () => {
    onUpdate({ ...table, name: editName });
    setIsEditing(false);
  };

  const addColumn = () => {
    onUpdate({
      ...table,
      columns: [...table.columns, { name: 'new_column', type: 'VARCHAR(255)' }]
    });
  };

  const updateColumn = (index: number, updates: Partial<Column>) => {
    const newColumns = [...table.columns];
    newColumns[index] = { ...newColumns[index], ...updates };
    onUpdate({ ...table, columns: newColumns });
  };

  const deleteColumn = (index: number) => {
    onUpdate({
      ...table,
      columns: table.columns.filter((_, i) => i !== index)
    });
  };

  const togglePrimaryKey = (index: number) => {
    const newColumns = [...table.columns];
    newColumns[index] = { ...newColumns[index], isPrimaryKey: !newColumns[index].isPrimaryKey };
    onUpdate({ ...table, columns: newColumns });
  };

  return (
    <div className="rounded-lg shadow-xl min-w-[220px] overflow-hidden" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}>
      {/* Table Header */}
      <div className="px-3 py-2 flex items-center justify-between" style={{ background: 'linear-gradient(to right, var(--color-success), var(--color-info))' }}>
        <div className="flex items-center gap-2">
          <Table2 className="w-4 h-4" style={{ color: 'white' }} />
          {isEditing ? (
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
              className="bg-transparent border-b border-white/50 text-sm font-semibold outline-none w-28"
              style={{ color: 'white' }}
              autoFocus
            />
          ) : (
            <span
              className="text-sm font-semibold cursor-pointer hover:underline"
              style={{ color: 'white' }}
              onClick={() => setIsEditing(true)}
            >
              {table.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={addColumn}
            className="p-1 hover:bg-white/20 rounded transition-colors"
            title="Add column"
          >
            <Plus className="w-3 h-3" style={{ color: 'white' }} />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded transition-colors"
            style={{ ['--hover-bg' as string]: 'rgba(var(--color-error-rgb), 0.5)' }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-error) 50%, transparent)')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            title="Delete table"
          >
            <Trash2 className="w-3 h-3" style={{ color: 'white' }} />
          </button>
        </div>
      </div>

      {/* Columns */}
      <div style={{ borderTop: '1px solid var(--theme-border-light)' }}>
        {table.columns.map((column, index) => (
          <div key={index} className="px-3 py-1.5 flex items-center gap-2 text-xs group relative" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
            <Handle
              type="source"
              position={Position.Right}
              id={`${table.name}-${column.name}-source`}
              className="!w-2 !h-2"
              style={{ borderColor: 'var(--theme-surface)', backgroundColor: 'var(--color-info)' }}
            />
            <Handle
              type="target"
              position={Position.Left}
              id={`${table.name}-${column.name}-target`}
              className="!w-2 !h-2"
              style={{ borderColor: 'var(--theme-surface)', backgroundColor: 'var(--color-feature)' }}
            />

            <button
              onClick={() => togglePrimaryKey(index)}
              title="Toggle Primary Key"
              style={{ color: column.isPrimaryKey ? 'var(--color-warning)' : 'var(--theme-text-dim)' }}
            >
              <Key className="w-3 h-3" />
            </button>

            <input
              value={column.name}
              onChange={(e) => updateColumn(index, { name: e.target.value })}
              className="bg-transparent flex-1 outline-none min-w-0 text-xs"
              style={{ color: 'var(--theme-text-secondary)' }}
            />
            <select
              value={column.type}
              onChange={(e) => updateColumn(index, { type: e.target.value })}
              className="text-[10px] rounded px-1 py-0.5 outline-none cursor-pointer"
              style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-muted)' }}
            >
              <option value="INT">INT</option>
              <option value="BIGINT">BIGINT</option>
              <option value="SERIAL">SERIAL</option>
              <option value="VARCHAR(255)">VARCHAR</option>
              <option value="TEXT">TEXT</option>
              <option value="BOOLEAN">BOOLEAN</option>
              <option value="DATE">DATE</option>
              <option value="DATETIME">DATETIME</option>
              <option value="TIMESTAMP">TIMESTAMP</option>
              <option value="DECIMAL(10,2)">DECIMAL</option>
              <option value="FLOAT">FLOAT</option>
              <option value="JSON">JSON</option>
              <option value="UUID">UUID</option>
            </select>
            <button
              onClick={() => deleteColumn(index)}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all"
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-error) 30%, transparent)')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <Trash2 className="w-3 h-3" style={{ color: 'var(--color-error)' }} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const nodeTypes = { table: TableNode };

// Parse relations.json to restore edges and positions
function parseRelationsJson(json: string): RelationsData | null {
  try {
    const data = JSON.parse(json);
    if (data.version && data.positions && data.edges) {
      return data as RelationsData;
    }
  } catch (e) {
    console.error('Failed to parse relations.json:', e);
  }
  return null;
}

// Generate relations.json content
function generateRelationsJson(nodes: Node[], edges: Edge[]): string {
  const positions: Record<string, { x: number; y: number }> = {};
  nodes.forEach(node => {
    positions[node.id] = { x: node.position.x, y: node.position.y };
  });

  const relationsData: RelationsData = {
    version: 1,
    positions,
    edges: edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle || null,
      targetHandle: edge.targetHandle || null,
      label: typeof edge.label === 'string' ? edge.label : undefined,
      relationType: (edge.data?.relationType as RelationsData['edges'][0]['relationType']) || 'one-to-many'
    }))
  };

  return JSON.stringify(relationsData, null, 2);
}

// Convert RelationsData edges to ReactFlow edges
function relationsToEdges(relations: RelationsData): Edge[] {
  return relations.edges.map(rel => ({
    id: rel.id,
    source: rel.source,
    target: rel.target,
    sourceHandle: rel.sourceHandle,
    targetHandle: rel.targetHandle,
    type: 'smoothstep',
    animated: true,
    label: rel.label,
    style: { stroke: 'var(--theme-accent)' },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--theme-accent)' },
    data: { relationType: rel.relationType }
  }));
}

export const DBStudio: React.FC<DBStudioProps> = ({ files, setFiles }) => {
  const [tables, setTables] = useState<TableSchema[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const { isCopied: copied, copy: copyText } = useCopyToClipboard();
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(10);
  const [showSettings, setShowSettings] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Show toast notification
  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), TOAST_DURATION_MS);
  };

  // Store loaded positions for initial render
  const [loadedPositions, setLoadedPositions] = useState<Record<string, { x: number; y: number }>>({});

  // Load existing schema and relations from files on mount
  useEffect(() => {
    const schemaFile = files['db/schema.sql'];
    const relationsFile = files['db/relations.json'];

    if (schemaFile && tables.length === 0) {
      const { tables: parsedTables, relationships } = parseSQLToSchema(schemaFile);
      if (parsedTables.length > 0) {
        setTables(parsedTables);

        // Try to load relations.json first (has positions + edges)
        if (relationsFile) {
          const relationsData = parseRelationsJson(relationsFile);
          if (relationsData) {
            setLoadedPositions(relationsData.positions);
            setEdges(relationsToEdges(relationsData));
            showToast(`Loaded ${parsedTables.length} tables with ${relationsData.edges.length} relations`);
            return;
          }
        }

        // Fallback: Create edges from SQL relationships
        const newEdges: Edge[] = relationships.map((rel, i) => {
          const [fromTable, fromCol] = rel.from.split('.');
          const [toTable, toCol] = rel.to.split('.');
          return {
            id: `edge-${i}`,
            source: fromTable,
            sourceHandle: `${fromTable}-${fromCol}-source`,
            target: toTable,
            targetHandle: `${toTable}-${toCol}-target`,
            type: 'smoothstep',
            animated: true,
            style: { stroke: 'var(--theme-accent)' },
            markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--theme-accent)' }
          };
        });
        setEdges(newEdges);
        showToast(`Loaded ${parsedTables.length} tables from schema.sql`);
      }
    }
    // Note: setEdges/setTables are stable, we only want to parse on files change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  // Sync tables to nodes
  useEffect(() => {
    const newNodes: Node[] = tables.map((table, index) => {
      // Priority: 1. Current position, 2. Loaded position, 3. Default grid
      const existingNode = nodes.find(n => n.id === table.name);
      const savedPosition = loadedPositions[table.name];
      const defaultPosition = { x: 50 + (index % 3) * 300, y: 50 + Math.floor(index / 3) * 350 };

      return {
        id: table.name,
        type: 'table',
        position: existingNode?.position || savedPosition || defaultPosition,
        data: {
          table,
          onUpdate: (updated: TableSchema) => {
            setTables(prev => prev.map(t => t.name === table.name ? updated : t));
            setHasUnsavedChanges(true);
          },
          onDelete: () => {
            setTables(prev => prev.filter(t => t.name !== table.name));
            setEdges(prev => prev.filter(e => e.source !== table.name && e.target !== table.name));
            setHasUnsavedChanges(true);
          }
        }
      };
    });
    setNodes(newNodes);
    // Note: nodes is used for position lookup only, setNodes is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, loadedPositions]);

  // Wrap onNodesChange to track position changes
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    // Check if any position changed
    const hasPositionChange = changes.some(c => c.type === 'position' && 'dragging' in c && c.dragging === false);
    if (hasPositionChange) {
      setHasUnsavedChanges(true);
    }
  }, [onNodesChange]);

  // Wrap onEdgesChange to track edge deletions
  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes);
    const hasEdgeChange = changes.some(c => c.type === 'remove');
    if (hasEdgeChange) {
      setHasUnsavedChanges(true);
    }
  }, [onEdgesChange]);

  const onConnect = useCallback((params: Connection) => {
    const newEdge: Edge = {
      id: `edge-${Date.now()}`,
      source: params.source || '',
      target: params.target || '',
      sourceHandle: params.sourceHandle,
      targetHandle: params.targetHandle,
      type: 'smoothstep',
      animated: true,
      style: { stroke: 'var(--theme-accent)' },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--theme-accent)' }
    };
    setEdges(eds => addEdge(newEdge, eds));
    setHasUnsavedChanges(true);
  }, [setEdges]);

  const addTable = () => {
    const existingNames = tables.map(t => t.name);
    let newName = 'new_table';
    let counter = 1;
    while (existingNames.includes(newName)) {
      newName = `new_table_${counter++}`;
    }

    const newTable: TableSchema = {
      name: newName,
      columns: [
        { name: 'id', type: 'SERIAL', isPrimaryKey: true },
        { name: 'created_at', type: 'TIMESTAMP' },
        { name: 'updated_at', type: 'TIMESTAMP' }
      ]
    };
    setTables([...tables, newTable]);
    setHasUnsavedChanges(true);
  };

  const generateWithAI = async (extend: boolean = false) => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);

    try {
      const providerManager = getProviderManager();

      let prompt = '';
      if (extend && tables.length > 0) {
        const existingSchema = tables.map(t => `${t.name}: ${t.columns.map(c => c.name).join(', ')}`).join('\n');
        prompt = `I have an existing database schema:
${existingSchema}

Now I want to: "${aiPrompt}"

Generate ADDITIONAL tables/modifications as JSON. Keep existing tables and add new ones or modify as needed.`;
      } else {
        prompt = `Generate a database schema as JSON for: "${aiPrompt}"`;
      }

      const fullPrompt = `${prompt}

Return ONLY valid JSON in this exact format:
{
  "tables": [
    {
      "name": "table_name",
      "columns": [
        { "name": "id", "type": "SERIAL", "isPrimaryKey": true },
        { "name": "column_name", "type": "VARCHAR(255)" }
      ]
    }
  ],
  "relationships": [
    { "from": "table1.column", "to": "table2.column" }
  ]
}

Use appropriate SQL types: INT, BIGINT, SERIAL, VARCHAR(255), TEXT, BOOLEAN, DATE, DATETIME, TIMESTAMP, DECIMAL(10,2), FLOAT, JSON, UUID`;

      // do not pass selectedModel - use provider's default model from settings
      const response = await providerManager.generate({
        prompt: fullPrompt,
        responseFormat: 'json',
        responseSchema: DATABASE_SCHEMA_SCHEMA,
        debugCategory: 'other',
      });

      const text = response.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const schema = JSON.parse(jsonMatch[0]);
        if (schema.tables) {
          if (extend) {
            // Merge with existing tables
            const existingNames = new Set(tables.map(t => t.name));
            const newTables = schema.tables.filter((t: TableSchema) => !existingNames.has(t.name));
            setTables([...tables, ...newTables]);
          } else {
            setTables(schema.tables);
          }

          if (schema.relationships) {
            const newEdges: Edge[] = schema.relationships.map((rel: { from: string; to: string }, i: number) => {
              const [fromTable, fromCol] = rel.from.split('.');
              const [toTable, toCol] = rel.to.split('.');
              return {
                id: `edge-${Date.now()}-${i}`,
                source: fromTable,
                sourceHandle: `${fromTable}-${fromCol}-source`,
                target: toTable,
                targetHandle: `${toTable}-${toCol}-target`,
                type: 'smoothstep',
                animated: true,
                style: { stroke: 'var(--theme-accent)' },
                markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--theme-accent)' }
              };
            });
            setEdges(prev => extend ? [...prev, ...newEdges] : newEdges);
          }

          setHasUnsavedChanges(true);
          showToast(`Generated ${schema.tables.length} tables`);
        }
      }
    } catch (error) {
      console.error('AI generation failed:', error);
      showToast('AI generation failed');
    } finally {
      setIsGenerating(false);
      setShowAiPanel(false);
      setAiPrompt('');
    }
  };

  const saveToFiles = () => {
    const sql = generateSQL(tables, edges);
    const relations = generateRelationsJson(nodes, edges);
    const newFiles: Record<string, string> = { ...files, 'db/schema.sql': sql, 'db/relations.json': relations };

    // Also update seed.sql if it exists
    if (files['db/seed.sql']) {
      const seedSql = generateFakeData(tables, rowCount);
      newFiles['db/seed.sql'] = seedSql;
    }

    setFiles(newFiles);
    setHasUnsavedChanges(false);
    showToast('Saved schema + relations');
  };

  const exportWithData = () => {
    const schema = generateSQL(tables, edges);
    const relations = generateRelationsJson(nodes, edges);
    const data = generateFakeData(tables, rowCount);
    setFiles({
      ...files,
      'db/schema.sql': schema,
      'db/relations.json': relations,
      'db/seed.sql': data
    });
    setHasUnsavedChanges(false);
    showToast(`Exported schema + relations + ${rowCount * tables.length} rows of seed data`);
  };

  const copySQL = async () => {
    const sql = generateSQL(tables, edges);
    copyText(sql);
    showToast('SQL copied to clipboard');
  };

  const refreshFromFile = () => {
    const schemaFile = files['db/schema.sql'];
    const relationsFile = files['db/relations.json'];

    if (schemaFile) {
      const { tables: parsedTables, relationships } = parseSQLToSchema(schemaFile);
      setTables(parsedTables);

      // Try to load from relations.json first
      if (relationsFile) {
        const relationsData = parseRelationsJson(relationsFile);
        if (relationsData) {
          setLoadedPositions(relationsData.positions);
          setEdges(relationsToEdges(relationsData));
          setHasUnsavedChanges(false);
          showToast(`Reloaded ${parsedTables.length} tables with ${relationsData.edges.length} relations`);
          return;
        }
      }

      // Fallback to SQL relationships
      const newEdges: Edge[] = relationships.map((rel, i) => {
        const [fromTable, fromCol] = rel.from.split('.');
        const [toTable, toCol] = rel.to.split('.');
        return {
          id: `edge-${i}`,
          source: fromTable,
          sourceHandle: `${fromTable}-${fromCol}-source`,
          target: toTable,
          targetHandle: `${toTable}-${toCol}-target`,
          type: 'smoothstep',
          animated: true,
          style: { stroke: 'var(--theme-accent)' },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--theme-accent)' }
        };
      });
      setEdges(newEdges);
      setHasUnsavedChanges(false);
      showToast('Reloaded from schema.sql');
    } else {
      showToast('No schema.sql file found');
    }
  };

  return (
    <div className="flex flex-col h-full w-full relative" style={{ backgroundColor: 'var(--theme-background)' }}>
      {/* Toast */}
      {toast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg text-sm animate-in fade-in slide-in-from-top-2" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2" style={{ backgroundColor: 'var(--theme-surface)', borderBottom: '1px solid var(--theme-border)' }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5" style={{ color: 'var(--color-success)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--theme-text-primary)' }}>DB Studio</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' }}>
            {tables.length} tables
          </span>
          {hasUnsavedChanges && (
            <span className="text-[10px] px-2 py-0.5 rounded animate-pulse" style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}>
              unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Settings dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-lg transition-colors"
              style={{ backgroundColor: 'var(--theme-glass-100)', color: 'var(--theme-text-muted)' }}
            >
              <Settings className="w-3.5 h-3.5" />
              <ChevronDown className="w-3 h-3" />
            </button>
            {showSettings && (
              <div className="absolute right-0 mt-1 w-48 rounded-lg shadow-xl z-50 p-3" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}>
                <label className="text-[10px] uppercase" style={{ color: 'var(--theme-text-dim)' }}>Seed Rows</label>
                <input
                  type="number"
                  value={rowCount}
                  onChange={(e) => setRowCount(Math.max(1, parseInt(e.target.value, 10) || 10))}
                  className="w-full mt-1 px-2 py-1 rounded text-sm outline-none"
                  style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
                  min="1"
                  max="1000"
                />
              </div>
            )}
          </div>

          <button
            onClick={() => setShowAiPanel(!showAiPanel)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
            style={{
              backgroundColor: showAiPanel ? 'var(--color-feature-subtle)' : 'var(--theme-glass-100)',
              color: showAiPanel ? 'var(--color-feature)' : 'var(--theme-text-muted)'
            }}
          >
            <Wand2 className="w-3.5 h-3.5" />
            AI
          </button>
          <button
            onClick={addTable}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--color-success)', color: 'white' }}
          >
            <Plus className="w-3.5 h-3.5" />
            Table
          </button>
          <button
            onClick={refreshFromFile}
            className="p-1.5 text-xs rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--theme-glass-100)', color: 'var(--theme-text-muted)' }}
            title="Reload from file"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={copySQL}
            className="p-1.5 text-xs rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--theme-glass-100)', color: 'var(--theme-text-muted)' }}
            title="Copy SQL"
          >
            {copied ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--color-success)' }} /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={saveToFiles}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
            style={{
              backgroundColor: hasUnsavedChanges ? 'var(--color-info)' : 'var(--theme-glass-100)',
              color: hasUnsavedChanges ? 'white' : 'var(--theme-text-muted)'
            }}
            title="Save to schema.sql"
          >
            <Save className="w-3.5 h-3.5" />
            Save
          </button>
          <button
            onClick={exportWithData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--color-warning)', color: 'white' }}
            title={`Export with ${rowCount} rows per table`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            + Seed
          </button>
        </div>
      </div>

      {/* AI Panel */}
      {showAiPanel && (
        <div className="px-4 py-3" style={{ backgroundColor: 'var(--color-feature-subtle)', borderBottom: '1px solid var(--color-feature-border)' }}>
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-feature)' }} />
            <input
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && generateWithAI(tables.length > 0)}
              placeholder={tables.length > 0
                ? "Extend schema... (e.g., 'add reviews table with ratings')"
                : "Describe your schema... (e.g., 'E-commerce with users, products, orders')"
              }
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
              style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
              disabled={isGenerating}
            />
            <button
              onClick={() => generateWithAI(false)}
              disabled={isGenerating || !aiPrompt.trim()}
              className="px-3 py-2 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-feature)', color: 'white' }}
              title="Generate new schema"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              New
            </button>
            {tables.length > 0 && (
              <button
                onClick={() => generateWithAI(true)}
                disabled={isGenerating || !aiPrompt.trim()}
                className="px-3 py-2 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-info)', color: 'white' }}
                title="Extend existing schema"
              >
                {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Extend
              </button>
            )}
          </div>
        </div>
      )}

      {/* React Flow Canvas */}
      <div className="flex-1">
        {tables.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center" style={{ color: 'var(--theme-text-dim)' }}>
            <Database className="w-16 h-16 mb-4 opacity-30" />
            <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--theme-text-muted)' }}>No tables yet</h3>
            <p className="text-sm mb-4 text-center max-w-md" style={{ color: 'var(--theme-text-dim)' }}>
              {files['db/schema.sql']
                ? 'Schema file exists but no tables could be parsed. Try refreshing or create new tables.'
                : 'Create a table manually or use AI to generate a complete schema.'
              }
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={addTable}
                className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--color-success)', color: 'white' }}
              >
                <Plus className="w-4 h-4" />
                Add Table
              </button>
              <button
                onClick={() => setShowAiPanel(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--color-feature)', color: 'white' }}
              >
                <Wand2 className="w-4 h-4" />
                AI Generate
              </button>
              {files['db/schema.sql'] && (
                <button
                  onClick={refreshFromFile}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
                  style={{ backgroundColor: 'var(--color-info)', color: 'white' }}
                >
                  <RefreshCw className="w-4 h-4" />
                  Reload File
                </button>
              )}
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            style={{ backgroundColor: 'var(--theme-surface-dark)' }}
          >
            <Background color="var(--theme-border)" gap={16} />
            <Controls className="[&]:rounded-lg" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }} />
            <MiniMap
              style={{ backgroundColor: 'var(--theme-surface)' }}
              nodeColor="var(--color-success)"
              maskColor="color-mix(in srgb, var(--theme-background) 50%, transparent)"
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
};
