# Database

The documents of a folder as a table, a board, a calendar or a gallery - Notion's databases, kept as plain Markdown files. Each document is a row; the properties in its front matter are the columns:

```markdown
---
start: 2026-01-05
end: 2026-01-11
focus: [Research]
rate: 4
---

# Week 2
```

Put a `database` block in any document - type `/database` or choose **New Database…** - and it shows the folder beside the document:

````markdown
```database
from: 2026 Calendar
view: table
sort: start
```
````

- **Table**: click a cell to change it; the document's front matter changes with it. Click a page's name to rename it (its file and the links to it follow); ↗ beside it opens it. **+ New** under the table makes a page from the title you type.
- **Property types**, as in Notion: text, number, select, multi-select, date, checkbox and URL. A select or multi-select opens its options to search or add to, each in its own colour. A column of a few short words said again and again (a status) is a select by itself.
- **A column's menu**: click its name to sort by it, filter by it, change its type, rename it (in every page), hide it or delete it. The **+** at the end adds a property, or shows a hidden one again.
- **Filter** and **Sort** above the view open their rules - as many as you like; the rules in force show under them, a click away.
- **Board**: lists by a select property (as Notion's by status), else a multi-select, or `group: owner`; drag a card to another list to change it, or add one at the foot of a list.
- **Calendar**: each page on its date (`date: start`), across to its `end` if it has one. Double-click a day for a new page on it.
- **Gallery**: a card per page, with its `cover` picture or `icon`.

All of it is kept in the block, in lines you can read and change: `columns: start, focus` (which, in what order), `sort: -rate` (`-` for descending), `filter: focus has Research` (`=`, `!=`, `has`, `!has`, `>`, `<`, `empty`, `!empty`, one per line), `group:`, `date:`, `end:`, `types: status=select` (a property's kind).

**From Notion**: export the database as Markdown & CSV, unzip it into the open folder, right-click its `.csv` in the sidebar and choose **Import from Notion…**. Its pages come in as documents with their properties as front matter, with a page showing them.

**With Textus AI**: ask for one - "make a 2026 weekly calendar with a focus and a rating" - and it makes the folder, its pages and the block.
