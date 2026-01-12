---
description: Manage tasks in your Obsidian vault. List, create, complete, and organize tasks. Supports Obsidian Tasks plugin format.
---

# Obsidian Tasks Management

Manage tasks in the user's Obsidian vault using the Obsidian CC MCP server.

## Arguments

- `action` (required): 'list', 'add', 'complete', 'due-today', 'overdue'
- `task` (optional): Task description (for 'add' action)
- `due` (optional): Due date (YYYY-MM-DD or 'tomorrow', 'next monday')
- `priority` (optional): 'high', 'medium', 'low'
- `note` (optional): Note path to add task to
- `taskId` (optional): Task identifier for 'complete' action

## Actions

### list
Lists incomplete tasks. Call `list_tasks` with `status: 'incomplete'`.

### add
Create a new task. Call `add_task` with:
- `description`: Task text
- `dueDate`: Parsed date in YYYY-MM-DD
- `priority`: Priority level
- `notePath`: Target note

### complete
Mark task done. Call `complete_task` with `taskId`.

### due-today
List tasks due today. Call `list_tasks` with `dueToday: true`.

### overdue
List overdue tasks. Call `list_tasks` with `overdue: true`.

## Task Format

Tasks follow Obsidian Tasks format:
```
- [ ] Task description 📅 2025-01-15 ⏫
```

Priority emojis: ⏫ (high), 🔼 (medium), 🔽 (low)

## Date Parsing

Convert natural language to YYYY-MM-DD:
- "today" → current date
- "tomorrow" → current date + 1
- "next monday" → next Monday
- "in 3 days" → current date + 3

## Output Format

For lists:
```
## Tasks (<action>)
*Found <count> tasks*

- [ ] **Task 1** - Due: 2025-01-11 ⏫
  File: [[note-name]]
  [Open](obsidian://...)

- [ ] **Task 2** - Due: 2025-01-15
  File: [[other-note]]
```

For adding:
```
Task added to **<note-name>**:
- [ ] <description> 📅 <date> <priority>

[Open note](obsidian://...)
```

## Example

```
/obsidian-tasks action="add" task="Review pull request" due="tomorrow" priority="high" note="Work/Tasks.md"
/obsidian-tasks action="due-today"
/obsidian-tasks action="overdue"
```
