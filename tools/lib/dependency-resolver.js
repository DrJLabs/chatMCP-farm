const fs = require('node:fs').promises;
const path = require('node:path');
const yaml = require('js-yaml');
const { extractYamlFromAgent } = require('./yaml-utils');

const RESOURCE_EXTENSIONS = ['.md', '.yaml', '.yml'];

class DependencyResolver {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.bmadCore = path.join(rootDir, 'bmad-core');
    this.common = path.join(rootDir, 'common');
    this.cache = new Map();
  }

  async resolveAgentDependencies(agentId) {
    const agentPath = path.join(this.bmadCore, 'agents', `${agentId}.md`);
    const agentContent = await fs.readFile(agentPath, 'utf8');

    // Extract YAML from markdown content with command cleaning
    const yamlContent = extractYamlFromAgent(agentContent, true);
    if (!yamlContent) {
      throw new Error(`No YAML configuration found in agent ${agentId}`);
    }

    const agentConfig = yaml.load(yamlContent);

    const dependencies = {
      agent: {
        id: agentId,
        path: agentPath,
        content: agentContent,
        config: agentConfig,
      },
      resources: [],
    };

    // Personas are now embedded in agent configs, no need to resolve separately

    // Resolve other dependencies
    const depTypes = ['tasks', 'templates', 'checklists', 'data', 'utils'];
    for (const depType of depTypes) {
      const deps = agentConfig.dependencies?.[depType] || [];
      for (const depId of deps) {
        const resource = await this.loadResource(depType, depId);
        if (resource) dependencies.resources.push(resource);
      }
    }

    return dependencies;
  }

  async resolveTeamDependencies(teamId) {
    const teamPath = path.join(this.bmadCore, 'agent-teams', `${teamId}.yaml`);
    const teamContent = await fs.readFile(teamPath, 'utf8');
    const teamConfig = yaml.load(teamContent);

    const dependencies = {
      team: {
        id: teamId,
        path: teamPath,
        content: teamContent,
        config: teamConfig,
      },
      agents: [],
      resources: new Map(), // Use Map to deduplicate resources
    };

    // Always add bmad-orchestrator agent first if it's a team
    const bmadAgent = await this.resolveAgentDependencies('bmad-orchestrator');
    dependencies.agents.push(bmadAgent.agent);
    for (const res of bmadAgent.resources) {
      dependencies.resources.set(res.path, res);
    }

    // Resolve all agents in the team
    let agentsToResolve = teamConfig.agents || [];

    // Handle wildcard "*" - include all agents except bmad-master
    if (agentsToResolve.includes('*')) {
      const allAgents = await this.listAgents();
      // Remove wildcard and add all agents except those already in the list and bmad-master
      agentsToResolve = agentsToResolve.filter((a) => a !== '*');
      for (const agent of allAgents) {
        if (!agentsToResolve.includes(agent) && agent !== 'bmad-master') {
          agentsToResolve.push(agent);
        }
      }
    }

    for (const agentId of agentsToResolve) {
      if (agentId === 'bmad-orchestrator' || agentId === 'bmad-master') continue; // Already added or excluded
      const agentDeps = await this.resolveAgentDependencies(agentId);
      dependencies.agents.push(agentDeps.agent);

      // Add resources with deduplication
      for (const res of agentDeps.resources) {
        dependencies.resources.set(res.path, res);
      }
    }

    // Resolve workflows
    for (const workflowId of teamConfig.workflows || []) {
      const resource = await this.loadResource('workflows', workflowId);
      if (resource) dependencies.resources.set(resource.path, resource);
    }

    // Convert Map back to array
    dependencies.resources = [...dependencies.resources.values()];

    return dependencies;
  }

  async loadResource(type, id) {
    const cacheKey = `${type}#${id}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const trimmedId = String(id || '').trim();
      if (!trimmedId) {
        console.warn(`Resource not found: ${type}/${id}`);
        return null;
      }

      const tryRead = async (baseDir) => {
        const base = path.join(baseDir, type);
        const candidates = [];
        const seen = new Set();

        const pushCandidate = (candidate) => {
          if (candidate && !seen.has(candidate)) {
            seen.add(candidate);
            candidates.push(candidate);
          }
        };

        pushCandidate(trimmedId);

        const lowerId = trimmedId.toLowerCase();
        const hasKnownExtension = RESOURCE_EXTENSIONS.some((ext) => lowerId.endsWith(ext));
        const normalized = trimmedId.replace(/\.(md|ya?ml)$/i, '');
        const extensionBase = hasKnownExtension ? normalized : trimmedId;
        const sanitizedBase = extensionBase.replace(/\.(md|ya?ml)$/i, '');
        if (sanitizedBase) {
          for (const ext of RESOURCE_EXTENSIONS) {
            pushCandidate(`${sanitizedBase}${ext}`);
          }
        }

        for (const candidate of candidates) {
          const resolved = path.resolve(base, candidate);
          const relative = path.relative(base, resolved);
          if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
            console.warn(`Blocked resource outside ${type} root: ${id}`);
            continue;
          }
          try {
            const content = await fs.readFile(resolved, 'utf8');
            return { path: resolved, content };
          } catch {
            // try next candidate
          }
        }

        return null;
      };

      let resourceEntry = await tryRead(this.bmadCore);
      if (!resourceEntry) {
        resourceEntry = await tryRead(this.common);
      }

      if (!resourceEntry) {
        console.warn(`Resource not found: ${type}/${id}`);
        return null;
      }

      const resource = {
        type,
        id,
        path: resourceEntry.path,
        content: resourceEntry.content,
      };

      this.cache.set(cacheKey, resource);
      return resource;
    } catch (error) {
      console.error(`Error loading resource ${type}/${id}:`, error.message);
      return null;
    }
  }

  async listAgents() {
    try {
      const files = await fs.readdir(path.join(this.bmadCore, 'agents'));
      return files.filter((f) => f.endsWith('.md')).map((f) => f.replace('.md', ''));
    } catch {
      return [];
    }
  }

  async listTeams() {
    try {
      const files = await fs.readdir(path.join(this.bmadCore, 'agent-teams'));
      return files.filter((f) => f.endsWith('.yaml')).map((f) => f.replace('.yaml', ''));
    } catch {
      return [];
    }
  }
}

module.exports = DependencyResolver;
