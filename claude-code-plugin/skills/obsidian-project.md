---
description: Create a new project structure in your Obsidian vault with templates, task tracking, and documentation scaffolding.
---

# Obsidian Project Creator

Create complete project structures in the user's Obsidian vault using the Obsidian CC MCP server.

## Arguments

- `name` (required): Project name (folder and index note)
- `template` (optional): 'basic', 'software', 'research', 'writing'. Default: basic
- `description` (optional): Brief project description
- `tags` (optional): Comma-separated project tags
- `due_date` (optional): Project deadline

## Templates

### Basic
- Index note, Tasks, Notes, Resources sections

### Software
- Index, Architecture, Tasks/Sprints, Meetings, Code Snippets, Changelog

### Research
- Index, Literature Review, Methodology, Data, Analysis, Findings, References

### Writing
- Index/Outline, Draft sections, Research notes, Revision tracking

## Process

1. **Create project folder**: `Projects/<project_name>/`
2. **Create index note**: Use template structure
3. **Create supporting notes**: Based on template type
4. **Return links**: Obsidian URIs for all created files

## Index Note Structure

```markdown
# <Project Name>

#project <tags>

## Overview
<description>

## Status
- **Created**: <date>
- **Due**: <due_date>
- **Status**: Not Started

## Quick Links
- [[<Project Name> Tasks|Tasks]]
- [[<Project Name> Notes|Notes]]

## Tasks
- [ ] Set up project structure
- [ ] Define project goals
```

## Output Format

```
## Project Created: **<name>**

### Structure:
Projects/
  <name>/
    <name> Index.md
    <name> Tasks.md
    <name> Notes.md

### Links:
- [Open Index](obsidian://...)
- [Open Tasks](obsidian://...)
```

## Example

```
/obsidian-project name="Website Redesign" template="software" description="Redesign with new branding" tags="client,web" due_date="2025-03-01"
```

Creates complete software project structure with Architecture, Sprints, and Meetings notes.
