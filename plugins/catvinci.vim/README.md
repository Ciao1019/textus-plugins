# Vim Keys

Vim's modes and keys in the editor.

- **Plugins › Turn Vim Keys On or Off** switches them.
- Normal, insert and visual modes, with motions, operators, counts, registers and **.** to repeat.
- A line is a paragraph, a heading, a list item or a code block's line: **j** and **k** go through all of them, **}** and **{** block by block. **zz**, **zt** and **zb** bring the caret's line to the middle, top or bottom of the window.
- **~** flips the case under the caret; in visual mode **~**, **U** and **u** flip, upper-case or lower-case the selection.
- **s** and a letter, then a label, jumps anywhere on screen (flash); the nearest places get the first labels. **d**, **c** or **y** before **s** deletes, changes or copies up to there.
- **:** opens the command palette with Vim's commands first: **:w** saves, **:q** closes the tab, **:wq** does both, **:12** goes to line 12, and any of Textus's commands can be found there too.
- On a Mac, normal mode types with a Roman keyboard, so an input method such as Pinyin doesn't catch the keys; your own comes back in insert mode.
- **Key mappings** in the plugin's settings takes lines as in a vimrc, such as `inoremap jj <Esc>` or `nnoremap <leader>w :w<CR>`. Flash can be turned off there too.
