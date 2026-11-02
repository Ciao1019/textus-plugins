# Vim

Los modos y las teclas de Vim en el editor.

- **Complementos › Activar o desactivar las teclas de Vim** las activa o desactiva.
- Modos normal, de inserción y visual, con movimientos, operadores, contadores, registros y **.** para repetir.
- Una línea es un párrafo, un título, un elemento de lista o una línea de un bloque de código: **j** y **k** pasan por todos, **}** y **{** van bloque a bloque. **zz**, **zt** y **zb** llevan la línea del cursor al centro, arriba o abajo de la ventana.
- **~** cambia mayúscula por minúscula bajo el cursor; en modo visual, **~**, **U** y **u** invierten, pasan a mayúsculas o pasan a minúsculas la selección.
- **s** y una letra, y luego una etiqueta, saltan a cualquier punto de la pantalla (flash); los lugares más cercanos reciben las primeras etiquetas. **d**, **c** o **y** antes de **s** borran, cambian o copian hasta allí.
- **:** abre la paleta de órdenes con las de Vim primero: **:w** guarda, **:q** cierra la pestaña, **:wq** hace las dos cosas, **:12** va a la línea 12, y allí se encuentran también las órdenes de Textus.
- En un Mac, el modo normal escribe con un teclado latino, para que un método de entrada (chino, japonés) no se quede con las teclas; el tuyo vuelve en el modo de inserción.
- **Asignaciones de teclas**, en los ajustes del complemento, admite líneas como las de un vimrc, por ejemplo `inoremap jj <Esc>` o `nnoremap <leader>w :w<CR>`. Allí también se puede desactivar el flash.
