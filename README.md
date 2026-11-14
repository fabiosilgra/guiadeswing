# Guia de Swing — código do site

Site estático (sem servidor e sem banco de dados) que o GitHub publica de graça.
Você edita **uma planilha Excel**; o site é gerado automaticamente.
Feito a partir do modelo-base do Vou pra Missa.

## Onde fica cada coisa

| Arquivo | Para que serve |
|---|---|
| `dados/guia-de-swing.xlsx` | **A planilha.** Abas `Leia-me`, `Locais`, `Horarios`, `Valores`, `Destaques` e `Listas` |
| `ferramentas/cadastro.html` | **Formulário visual** para cadastrar casas |
| `dados/casas/` | Uma casa por arquivo `.json` (gerado pelo formulário) |
| `dados/regioes.json` | Estados, regiões e o menu de regiões |
| `dados/banners.json` | Anunciantes (imagem + link por posição) |
| `dados/config.json` | Nome, WhatsApp, e-mail, domínio e a chave **lancado** |
| `assets/` | Visual (`style.css`), comportamento (`app.js`), logo e ícones |

## Cadastrar uma casa pelo formulário (recomendado)

1. Abra `ferramentas/cadastro.html` no navegador (duplo clique; funciona sem internet).
2. Preencha os dados, os horários (marcando os dias), os valores (uma linha por dia e condição) e o texto da casa. O texto pode ser escrito no editor visual (botões H2, H3, lista, link) ou colado como HTML na aba "Código HTML". O painel de SEO avisa se faltam títulos, parágrafos, nome da casa etc.
3. Clique em **Gerar arquivo da casa**. Será baixado `<id>.json`.
4. No GitHub, abra a pasta `dados/casas` → *Add file → Upload files* → envie o arquivo → *Commit changes*. O site atualiza em 1 a 2 minutos.
5. Para corrigir uma casa: no formulário, **Abrir casa existente**, escolha o `.json`, altere e gere de novo (envie com o mesmo nome; ele substitui o antigo).

**Fotos e logo pelo formulário:** na seção 6, clique ou arraste as fotos (até 8; a primeira é a capa; arraste para reordenar) e escolha o logo na seção 1. O formulário reduz tudo sozinho (fotos ~1200 px e até ~230 KB; logo 400 px) e guarda dentro do `.json` da casa. Ao gerar o site, elas viram `assets/fotos/<id>/` e `assets/logos/<id>`. Não precisa enviar imagem nem preencher caminho. Só fachada e ambiente vazio, nunca pessoas ou imagens explícitas. Cada foto pesa ~150 a 230 KB, então o arquivo de uma casa com 5 fotos fica em torno de 1 MB. Banners e imagens de destaque continuam sendo enviados à pasta `assets/` do GitHub.

Regras do texto "sobre": o H1 da página é o nome da casa, então comece em **H2** e use **H3** dentro das seções. O site aceita só `h2, h3, h4, p, ul, ol, li, strong, em, a, br, blockquote`; o resto (scripts, estilos, div) é removido. Texto simples, sem HTML, continua funcionando. Se o id for o mesmo de uma linha da planilha, o arquivo da casa vale mais que a planilha. Arquivos que começam com `_` em `dados/casas` são ignorados (modelo: `_exemplo.json`).

## Cadastrar um lugar pela planilha (alternativa)

1. Abra `dados/guia-de-swing.xlsx`, aba **Locais**, e preencha a primeira linha vazia.
2. Colunas com título **vermelho** são obrigatórias; as **cinzas** são opcionais. Passe o mouse sobre o título para ver a dica.
3. Use as setinhas (listas) em `tipo`, `uf`, `regiao` e `publicar`.
4. Na aba **Horarios**, crie uma linha por horário, com o mesmo `id` do lugar em `id_local`:
   - `tipo`: `funcionamento` (alimenta o "Funciona hoje"), `festa` (nome da festa em `obs`) ou `atendimento`
   - `dias`: `sex-sab`, `dom`, `qua,sex`, `todos`
   - `hora`: `22:00-05:00` (pode virar a madrugada) ou só `22:00`
5. Troque `publicar` para **SIM**, salve e envie o arquivo ao GitHub. O site atualiza em 1 a 2 minutos.

O gerador avisa, em português, se algo estiver errado (região inexistente, dia ilegível, id repetido, casa sem autorização). Veja os avisos na aba **Actions** do GitHub.

As linhas com `exemplo = SIM` são de teste, **com nomes fictícios**. Apague-as (ou troque `publicar` para NÃO) antes de lançar.

## Valores por dia e horário (aba Valores, opcional)

Para casas com preços diferentes por dia ou várias condições no mesmo dia (até 23h, após 23h, opcional...). Uma linha por **dia + condição**, com o `id_local` da casa:
- `dia`: `terça-feira`, `sex-sab`, `dom`, `todos` ou texto livre (ex.: `Véspera de feriado`). Linhas do mesmo dia ficam agrupadas; escreva igual e uma abaixo da outra.
- `condicao`: `Até 23h`, `Após 23h`, `Opcional - qualquer horário`...
- `casal`, `mulher_solteira`, `homem_solteiro`: texto livre (`R$ 80 consumíveis`, `VIP`, `Consulte a casa`). Coluna vazia em todas as linhas some do site.
- `outros` (`Nome: valor; Nome: valor`) e `obs` são opcionais.

O dia de hoje fica destacado. No celular a tabela vira cartões empilhados. Sem linhas nessa aba, vale a coluna `valores` simples da aba Locais.

## Texto, Google (SEO), fotos e selos

- **`sobre`**: 2 a 3 parágrafos sobre a casa (Alt+Enter pula linha na célula). É o que mais ajuda no Google.
- **`descricao_seo`** (opcional): frase de até 155 letras que aparece no resultado do Google. Se vazia, o site monta uma sozinho (tipo, bairro, cidade).
- **`palavras_chave`** (opcional): ajudam a busca interna do site. O Google ignora esse campo, então o texto de `sobre` é que conta.
- **Fotos**: só fachada e ambiente vazio. **Nunca pessoas, nunca imagem explícita.** Reduza para ~1200 px de largura e até ~300 KB, envie para `assets/fotos/<id>/` e liste os caminhos em `fotos`, separados por `;`. Peça autorização à casa e a quem fotografou.
- **`confirmado_em`**: data da última confirmação. Selo verde (recente), amarelo (mais de 120 dias) ou cinza ("a confirmar").
- **`autorizado`**: SIM quando a casa autorizou a divulgação. O gerador avisa se faltar.

## "Funciona hoje"

Os horários da semana ficam gravados no site e o navegador calcula na hora, no fuso de São Paulo:
- dentro do horário → **Aberto agora · até 05h** (considera casas que fecham de madrugada)
- abre ainda hoje → **Funciona hoje · abre às 22h**
- senão → **Amanhã · 22h** ou **Próxima: sex · 22h**

Só entram nesse cálculo os horários do tipo `funcionamento`. Feriados e datas especiais não são tratados.

## Aviso +18

Na primeira visita aparece uma tela pedindo confirmação de maioridade; a resposta fica salva só no aparelho. É um aviso, não uma verificação de idade. As páginas também levam a marcação de conteúdo adulto (`rating`/RTA), que ajuda filtros parentais.

## Destaques (carrossel)

Na página de cada estado há um carrossel de **até 10 destaques** (baladas, festas, eventos). Eles ficam na aba **Destaques** da planilha:
- `titulo` e `legenda`: nome e uma linha de apoio (ex.: "Sexta · 23h · Pinheiros"); `selo`: etiqueta no canto (Festa, Evento, Balada...)
- `imagem`: arte ou foto horizontal (800 × 400 px, até 300 KB, sem pessoas), enviada para `assets/destaques/`
- `id_local`: se o destaque é de uma casa cadastrada, o clique abre a página dela; senão, use `link`
- `uf`: o estado onde aparece. Nas páginas de região e de tipo aparecem só os destaques daquela região/tipo.

Sem imagem, o site usa a 1ª foto da casa, depois o logo dela, depois as iniciais do nome.

## Logo (foto de perfil) de cada casa

Na coluna `logo` da aba Locais, coloque o caminho da imagem que a casa enviar (quadrada, ~400 × 400 px, até 200 KB), por exemplo `assets/logos/gds-sp-001.png`. Ela aparece no cartão da lista e na página da casa. **Sem logo, o site mostra as iniciais do nome; o logo do Guia de Swing nunca aparece no lugar.**

## Banners

Tamanhos: **topo 1375 × 280**, **laterais (2, um abaixo do outro) 420 × 551**, **rodapé (3, lado a lado) 436 × 326**. Coloque a imagem em `assets/banners/` e preencha `img`, `link` e `alt` em `dados/banners.json`. Sem imagem, o site mostra "Anuncie aqui". Anúncios vendidos por você, sem AdSense.

**Topo fixo ou carrossel:** em `topo`, a lista `itens` aceita quantas imagens você quiser. Com **uma**, o banner é fixo. Com **duas ou mais**, vira carrossel com troca suave (fade); `intervalo` é o tempo em segundos entre as trocas. O carrossel pausa quando o mouse está em cima e não troca sozinho para quem usa "reduzir movimento".

## Publicar no GitHub (uma vez)

1. Crie o repositório `guiadeswing` (público) e envie **todos** os arquivos desta pasta, inclusive `.github`.
   Se o envio pelo navegador não levar a pasta `.github`, crie manualmente: *Add file → Create new file*, nome `.github/workflows/publicar.yml`, e cole o conteúdo do arquivo de mesmo nome.
2. Em **Settings → Pages**, em *Source*, escolha **GitHub Actions**.
3. Aba **Actions**: aguarde o fluxo "Publicar site" ficar verde. O endereço aparece em Settings → Pages.

## Endereço do site

**Por enquanto** o site fica no endereço grátis do GitHub: `https://fabiosilgra.github.io/guiadeswing/`. Em `dados/config.json` isso está assim:
`"siteUrl": "https://fabiosilgra.github.io/guiadeswing"`, `"basePath": "/guiadeswing"` e `"usarDominioProprio": false`.

### Quando for ligar o domínio www.guiadeswing.com.br (versão final)
1. Em `dados/config.json`, troque para: `"siteUrl": "https://www.guiadeswing.com.br"`, `"basePath": ""` e `"usarDominioProprio": true`.
2. Em Settings → Pages → *Custom domain*, informe `www.guiadeswing.com.br`.
3. No painel do seu domínio (registro.br ou onde ele estiver), crie um registro **CNAME** de `www` apontando para `fabiosilgra.github.io`.
4. Para `guiadeswing.com.br` (sem www) abrir também, crie quatro registros **A** apontando para `185.199.108.153`, `185.199.109.153`, `185.199.110.153` e `185.199.111.153`.
5. Marque *Enforce HTTPS* quando o GitHub liberar.

## Antes de lançar para o público

- [ ] Trocar WhatsApp e e-mail em `config.json` (e o Instagram, se houver)
- [ ] Substituir os dados de exemplo pelos reais (e tirar `exemplo = SIM`)
- [ ] Conferir `autorizado = SIM` e `confirmado_em` em todas as casas
- [ ] Mudar `"lancado": true` (libera o Google e remove a faixa "Versão de testes")
- [ ] Revisar os textos de Privacidade e Sobre
- [ ] Rever as regras de conteúdo do GitHub Pages para conteúdo adulto; manter o site sem imagens explícitas

## Conferir no computador

`node build.mjs --preview` gera `dist-preview/`; abra `dist-preview/index.html` no navegador. `node tests/horarios.test.mjs` roda os testes.
