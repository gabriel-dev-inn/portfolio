# Gabriel Amorim — Portfólio

Site pessoal com cena 3D interativa (Three.js) e animações de scroll (GSAP).
Suporte N1 · TOTVS Protheus · Sistemas Web · Graduando em Psicologia.

## Rodar localmente

```bash
python -m http.server 5500
```

Abra http://localhost:5500. Por usar ES modules, abrir o `index.html` direto pelo explorador de arquivos não funciona.

## Publicar no GitHub Pages

1. Crie um repositório chamado **`gabriel-dev-inn.github.io`** (assim o site fica na raiz do domínio).
2. Envie estes arquivos:
   ```bash
   git init
   git add .
   git commit -m "Primeiro deploy do portfólio"
   git branch -M main
   git remote add origin https://github.com/gabriel-dev-inn/gabriel-dev-inn.github.io.git
   git push -u origin main
   ```
3. No GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
4. Em 1 a 2 minutos o site estará em `https://gabriel-dev-inn.github.io`.

## O que personalizar

- **E-mail**: no `index.html`, seção Contato. Troque quando criar o Gmail dedicado.
- **Números** (`data-count`): vêm do ClickUp, período jan a set/2026. Atualize de tempos em tempos.
- **Terminal** (`main.js`, seção 4): o JSON do "perfil".

## Estrutura

```
index.html   conteúdo e seções
style.css    visual, responsivo e animações CSS
main.js      cena 3D, loader, scroll, cursor, tilt, terminal
```
