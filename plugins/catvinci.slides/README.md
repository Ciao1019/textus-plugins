# Marp

Present a document as slides, written the [Marp](https://marp.app) way.

- A new slide starts at each `---`.
- **Plugins › Present as Slides** shows the deck in a tab beside the document, following your writing. ← → and Space move between slides, **Full Screen** (or F) presents.
- **Plugins › Export Slides as HTML** (or **Save HTML** in the deck) saves `name.slides.html` beside the document: one file that presents itself in any browser.
- Marp's directives choose the theme and layout, for example at the top:

```markdown
---
theme: gaia
paginate: true
---
```

Built on [Marp Core](https://github.com/marp-team/marp-core) (MIT), which brings its themes (default, gaia, uncover), math and code highlighting - and makes this plugin about 4 MB.
