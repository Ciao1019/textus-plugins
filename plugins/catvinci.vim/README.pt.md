# Vim

Os modos e as teclas do Vim no editor.

- **Plugins › Ligar ou desligar as teclas do Vim** alterna entre elas.
- Modos normal, de inserção e visual, com movimentos, operadores, contagens, registradores e **.** para repetir.
- Uma linha é um parágrafo, um título, um item de lista ou uma linha de um bloco de código: **j** e **k** passam por todos, **}** e **{** vão de bloco em bloco. **zz**, **zt** e **zb** levam a linha do cursor para o meio, o topo ou a base da janela.
- **~** troca maiúscula e minúscula sob o cursor; no modo visual, **~**, **U** e **u** invertem, passam para maiúsculas ou para minúsculas a seleção.
- **s** e uma letra, depois um rótulo, pulam para qualquer ponto da tela (flash); os lugares mais próximos recebem os primeiros rótulos. **d**, **c** ou **y** antes de **s** apagam, alteram ou copiam até lá.
- **:** abre a paleta de comandos com os do Vim primeiro: **:w** salva, **:q** fecha a aba, **:wq** faz os dois, **:12** vai para a linha 12, e os comandos do Textus também estão lá.
- No Mac, o modo normal digita com um teclado latino, para que um método de entrada (chinês, japonês) não pegue as teclas; o seu volta no modo de inserção.
- **Mapeamentos de teclas**, nos ajustes do plugin, aceita linhas como num vimrc, por exemplo `inoremap jj <Esc>` ou `nnoremap <leader>w :w<CR>`. Ali também se desliga o flash.
