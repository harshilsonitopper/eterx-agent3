import * as fs from 'fs';
import * as path from 'path';
import { AgentSkill } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// AgentX Skill Loader — Unified Markdown Skill System
// ─────────────────────────────────────────────────────────────────────────────
//
// All agent skills are defined as .md files with YAML frontmatter in this
// directory. The loader reads each file, extracts the `name` and `description`
// from the frontmatter, and builds an AgentSkill object.
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │                     COMPLETE SKILL CATALOG                         │
// ├───────────────────────────┬──────────────────┬──────────────────────┤
// │ File                      │ Skill ID         │ Role                 │
// ├───────────────────────────┼──────────────────┼──────────────────────┤
// │ general.md                │ general          │ Core Orchestrator    │
// │ data_analyst.md           │ data_analyst     │ Data & BI Analysis   │
// │ devops.md                 │ devops           │ Infrastructure/CI/CD │
// │ security_auditor.md       │ security_auditor │ Security Auditing    │
// │ pdf_skill.md              │ pdf              │ PDF Generation       │
// │ docx_skill.md             │ docx             │ Word Documents       │
// │ pptx_skill.md             │ pptx             │ Presentations        │
// │ xlsx_skill.md             │ xlsx             │ Spreadsheets         │
// │ file_reading.md           │ file_reading     │ File Reading Router  │
// │ hover_effects.md          │ hover_effects    │ CSS Hover Effects    │
// │ motion_animations.md      │ motion_animations│ Motion & Animation   │
// │ glassmorphism_neumorphism.md │ glassmorphism_neumorphism │ Glass/Soft UI │
// │ dark_mode_theming.md      │ dark_mode_theming│ Dark Mode & Themes   │
// │ micro_interactions.md     │ micro_interactions│ Micro-Interactions  │
// │ typography_system.md      │ typography_system│ Typography System    │
// │ color_systems.md          │ color_systems    │ Color Systems        │
// │ 3d_effects.md             │ 3d_effects       │ 3D CSS Effects       │
// │ component_architecture.md │ component_architecture │ Component Design│
// │ responsive_layout.md      │ responsive_layout│ Responsive Layout    │
// │ algorithmic_art.md        │ algorithmic_art  │ Generative Art       │
// │ skill_creator.md          │ skill_creator    │ Skill File Creator   │
// │ doc_coauthoring.md        │ doc_coauthoring  │ Doc Co-Authoring     │
// │ mcp_builder.md            │ mcp_builder      │ MCP Server Builder   │
// │ web_artifacts_builder.md  │ web_artifacts_builder │ Web Artifacts    │
// │ theme_factory.md          │ theme_factory    │ Theme Factory        │
// └───────────────────────────┴──────────────────┴──────────────────────┘
//
// HOW IT WORKS:
// 1. Reads all .md files from this directory
// 2. Parses YAML frontmatter for `name` and `description`
// 3. Converts `name` (e.g. "hover-effects") to snake_case id (e.g. "hover_effects")
// 4. Creates display name from name (e.g. "Hover Effects")
// 5. Maps icons from SKILL_ICONS lookup
// 6. Returns array of AgentSkill objects
//
// TO ADD A NEW SKILL:
// 1. Create a new .md file in this directory
// 2. Add YAML frontmatter with `name:` and `description:`
// 3. Add the skill name to SKILL_ICONS below
// 4. The loader will auto-discover it — no code changes needed in index.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses YAML frontmatter from a markdown skill file.
 * Expects the format:
 * ```
 * ---
 * name: skill-name
 * description: Short description of what the skill does
 * ---
 * # Markdown body content...
 * ```
 *
 * Supports both single-line and multi-line (YAML `>` block scalar) descriptions.
 *
 * @returns Parsed { name, description, body } or null if frontmatter is missing/invalid
 */
function parseFrontmatter(content: string): { name: string; description: string; body: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;

  const frontmatter = match[1];
  const body = match[2];

  // Extract name (required)
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, '') : '';

  // Extract description — supports both inline and multi-line YAML block scalar (>)
  let description = '';
  const descBlockMatch = frontmatter.match(/^description:\s*>\s*\r?\n([\s\S]*?)(?=\r?\n\w|\r?\n---)/m);
  if (descBlockMatch) {
    description = descBlockMatch[1]
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .join(' ');
  } else {
    const descLineMatch = frontmatter.match(/^description:\s*["']?(.*?)["']?\s*$/m);
    description = descLineMatch ? descLineMatch[1].trim() : '';
  }

  if (!name) return null;
  return { name, description, body };
}

/**
 * Icon registry — maps each skill `name` (from frontmatter) to a Lucide icon identifier.
 * Used by the UI to render the correct icon next to each skill in selection menus.
 *
 * When adding a new skill, add its icon mapping here.
 * Fallback icon: 'BookOpen'
 */
const SKILL_ICONS: Record<string, string> = {
  // ── Core Agent Skills ──────────────────────────────────────────────
  'general':                   'Brain',         // Central orchestrator
  'data-analyst':              'BarChart3',      // Data analysis & BI
  'devops':                    'Server',         // Infrastructure & CI/CD
  'security-auditor':          'Shield',         // Security auditing

  // ── Document Generation Skills ─────────────────────────────────────
  'pdf':                       'FileText',       // PDF creation & processing
  'docx':                      'FileText',       // Word document creation
  'pptx':                      'MonitorPlay',    // PowerPoint presentations
  'xlsx':                      'FileSpreadsheet',// Excel spreadsheets
  'file-reading':              'FolderOpen',     // File reading router

  // ── UI/Design Skills ───────────────────────────────────────────────
  'hover-effects':             'MousePointer',   // CSS hover & cursor effects
  'motion-animations':         'Sparkles',       // Motion & animation systems
  'glassmorphism-neumorphism': 'Layers',         // Glassmorphism & neumorphism
  'dark-mode-theming':         'Moon',           // Dark mode & theming
  'micro-interactions':        'Zap',            // Micro-interactions & feedback
  'typography-system':         'Type',           // Typography & font systems
  'color-systems':             'Paintbrush',     // Color palettes & systems
  '3d-effects':                'Box',            // 3D CSS transforms & effects
  'component-architecture':    'LayoutGrid',     // Component design patterns
  'responsive-layout':         'Smartphone',     // Responsive layout systems

  // ── Utility / Builder Skills ───────────────────────────────────────
  'algorithmic-art':           'Palette',        // Generative & algorithmic art
  'skill-creator':             'Wrench',         // Creates new skill files
  'doc-coauthoring':           'Users',          // Document co-authoring workflow
  'mcp-builder':               'Server',         // MCP server scaffolding
  'web-artifacts-builder':     'Globe',          // Web artifact generation
  'theme-factory':             'Paintbrush',     // Theme creation factory
};

/**
 * Loads ALL .md skill files from the skills directory and converts them
 * into AgentSkill objects for the registry.
 *
 * Each .md file must have valid YAML frontmatter with at minimum a `name` field.
 * Files without valid frontmatter are skipped with a warning.
 *
 * The skill `id` is derived from the frontmatter `name` by replacing hyphens
 * with underscores (e.g. "hover-effects" → "hover_effects").
 *
 * The `systemPromptAddendum` is set to the full markdown body after the
 * frontmatter delimiter, giving the agent access to the complete skill
 * instructions during inference.
 *
 * @returns Array of AgentSkill objects, one per valid .md file
 */
export function loadMarkdownSkills(): AgentSkill[] {
  const projectRoot = process.cwd();
  const skillsDir = path.join(projectRoot, 'src', 'lib', 'agent', 'skills');
  const skills: AgentSkill[] = [];

  try {
    const files = fs.readdirSync(skillsDir)
      .filter(f => f.endsWith('.md'))
      .sort(); // Alphabetical for consistent load order


    for (const file of files) {
      try {
        const filePath = path.join(skillsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseFrontmatter(content);

        if (!parsed) {
          console.warn(`[SkillLoader] ⚠️  Skipped ${file} — no valid YAML frontmatter`);
          continue;
        }

        // Convert kebab-case name to snake_case id for registry lookup
        const id = parsed.name.replace(/-/g, '_');

        // Build human-readable display name from kebab-case
        // e.g. "hover-effects" → "Hover Effects"
        const displayName = parsed.name
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        const icon = SKILL_ICONS[parsed.name] || 'BookOpen';

        skills.push({
          id,
          name: displayName,
          icon,
          systemPromptAddendum: parsed.body,
        });

      } catch (err) {
        console.warn(`[SkillLoader] ⚠️  Failed to load ${file}:`, err);
      }
    }
  } catch (err) {
    console.error('[SkillLoader] ❌ Could not read skills directory:', err);
  }

  console.log(`[SkillLoader] ✅ ${skills.length} skills loaded`);
  return skills;
}
