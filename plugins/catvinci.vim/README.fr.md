# Vim

Les modes et les touches de Vim dans l’éditeur.

- **Extensions › Activer ou désactiver les touches Vim** les active ou les désactive.
- Modes normal, insertion et visuel, avec déplacements, opérateurs, compteurs, registres et **.** pour répéter.
- Une ligne est un paragraphe, un titre, un élément de liste ou une ligne d’un bloc de code : **j** et **k** les parcourent tous, **}** et **{** vont de bloc en bloc. **zz**, **zt** et **zb** amènent la ligne du curseur au milieu, en haut ou en bas de la fenêtre.
- **~** inverse la casse sous le curseur ; en mode visuel, **~**, **U** et **u** inversent la casse de la sélection, la mettent en majuscules ou en minuscules.
- **s** et une lettre, puis une étiquette, saute n’importe où à l’écran (flash) ; les endroits les plus proches reçoivent les premières étiquettes. **d**, **c** ou **y** avant **s** supprime, modifie ou copie jusque-là.
- **:** ouvre la palette de commandes, celles de Vim en premier : **:w** enregistre, **:q** ferme l’onglet, **:wq** fait les deux, **:12** va à la ligne 12, et les commandes de Textus s’y trouvent aussi.
- Sur un Mac, le mode normal tape avec un clavier latin, pour qu’une méthode de saisie (chinois, japonais) ne prenne pas les touches ; la vôtre revient en mode insertion.
- **Correspondances de touches**, dans les réglages de l’extension, prend des lignes comme dans un vimrc, par exemple `inoremap jj <Esc>` ou `nnoremap <leader>w :w<CR>`. Le flash peut aussi y être désactivé.
