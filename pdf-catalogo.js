/* ==========================================================================
   Catálogo Xalingo 2026 — Gerador de PDF completo
   --------------------------------------------------------------------------
   Monta, no próprio navegador, um único PDF com:
     capa  →  sumário (gerado, com links clicáveis)  →  as 7 categorias
   Os selos de preço são desenhados como TEXTO VETORIAL (pesquisável no PDF),
   respeitando a faixa de ICMS / EXP-IND selecionada na hora.

   Uso: <script src="pdf-catalogo.js" defer></script>
        <button onclick="XalingoPDF.abrir()">…</button>
   ========================================================================== */
(function () {
  'use strict';

  /* ── Configuração ─────────────────────────────────────────────────────── */

  // Ordem = ordem do sumário do catálogo
  var CATEGORIAS = [
    { num: '01', arquivo: 'blocos-de-montar.html', nome: 'Blocos de Montar', cor: [0.12, 0.16, 0.35] },
    { num: '02', arquivo: 'educativos.html',       nome: 'Educativos',       cor: [0.23, 0.14, 0.44] },
    { num: '03', arquivo: 'jogos.html',            nome: 'Jogos',            cor: [0.55, 0.10, 0.08] },
    { num: '04', arquivo: 'faz-de-conta.html',     nome: 'Faz de Conta',     cor: [0.16, 0.46, 0.45] },
    { num: '05', arquivo: 'rodados.html',          nome: 'Rodados',          cor: [0.23, 0.46, 0.13] },
    { num: '06', arquivo: 'esportes.html',         nome: 'Esportes',         cor: [0.54, 0.35, 0.05] },
    { num: '07', arquivo: 'playground.html',       nome: 'Playground',       cor: [0.54, 0.08, 0.20] }
  ];

  var CAPA = 'capa.jpg';

  // Lançamentos: lidos da lista PRODUCTS da lancamentos.html e desenhados no PDF
  // logo depois do sumário (6 produtos por página, com foto, REF, idade e entrega).
  var LANCAMENTOS = {
    arquivo: 'lancamentos.html',
    nome: 'Lan\u00e7amentos 2026',
    cor: [0.94, 0.63, 0.19],
    porPagina: 6
  };
  var CAT_LANC = {
    blocos:     { nome: 'Blocos',     cor: [0.161, 0.231, 0.498] },
    educativos: { nome: 'Educativos', cor: [0.302, 0.208, 0.604] },
    jogos:      { nome: 'Jogos',      cor: [0.937, 0.192, 0.157] },
    esportes:   { nome: 'Esportes',   cor: [0.973, 0.620, 0.110] },
    playground: { nome: 'Playground', cor: [0.537, 0.078, 0.204] }
  };
  var TAG_LANC = { lanc: [0.627, 0.118, 0.118], linha: [0.482, 0.122, 0.635], opo: [0.761, 0.255, 0.047] };

  // Página do catálogo: 210 × 280 mm (proporção 3:4 das imagens originais)
  var PW = 595.28, PH = 793.70;

  var QUALIDADES = {
    alta:  { rotulo: 'Alta',  larguraMax: 0,    jpeg: 1.00, nota: 'resolução original · ~160 MB' },
    media: { rotulo: 'Média', larguraMax: 1200, jpeg: 0.82, nota: 'ótima na tela e na impressão · ~45 MB' },
    leve:  { rotulo: 'Leve',  larguraMax: 900,  jpeg: 0.72, nota: 'para mandar por e-mail · ~20 MB' }
  };

  var ROTULO_ICMS = {
    p18:    { arquivo: 'ICMS18',  texto: 'ICMS 18%' },
    p12rs:  { arquivo: 'ICMS12RS', texto: 'ICMS 12% RS' },
    p12:    { arquivo: 'ICMS12',  texto: 'ICMS 12% SC/PR/SP' },
    p7:     { arquivo: 'ICMS7',   texto: 'ICMS 7%' },
    expind: { arquivo: 'EXP-IND', texto: 'Exportação Indireta' }
  };

  var CDNS = [
    'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
    'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
    'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js'
  ];

  var cancelado = false;

  /* ── Utilidades ───────────────────────────────────────────────────────── */

  // Helvetica embutida só aceita Latin-1; tira emoji e afins antes de desenhar
  function limpar(s) {
    return String(s == null ? '' : s).replace(/[^\x20-\xFF]/g, '').trim();
  }

  function preco(valor, icms) {
    if (valor > 0) return 'R$ ' + valor.toFixed(2).replace('.', ',');
    return icms === 'expind' ? 'Sob consulta' : 'Aguardar';
  }

  function icmsAtual() {
    var exp = localStorage.getItem('xalingo-expind') === '1';
    return exp ? 'expind' : (localStorage.getItem('xalingo-icms') || 'p18');
  }

  function carregarScript(urls, i) {
    i = i || 0;
    return new Promise(function (ok, falhou) {
      if (i >= urls.length) return falhou(new Error('cdn'));
      var s = document.createElement('script');
      s.src = urls[i];
      s.onload = ok;
      s.onerror = function () { carregarScript(urls, i + 1).then(ok, falhou); };
      document.head.appendChild(s);
    });
  }

  // Recorta um literal { … } ou [ … ] do texto-fonte, ignorando strings e comentários.
  // Ancora na DECLARAÇÃO da constante — o nome também aparece antes, em usos.
  function recortarLiteral(txt, nome, abre, fecha) {
    var m = new RegExp('(?:const|let|var)\\s+' + nome + '\\s*=').exec(txt);
    if (!m) return null;
    var i = m.index;
    var ini = txt.indexOf(abre, i);
    if (ini < 0) return null;
    var nivel = 0, aspas = null, escapado = false;
    for (var j = ini; j < txt.length; j++) {
      var c = txt[j];
      if (escapado) { escapado = false; continue; }
      if (aspas) {
        if (c === '\\') escapado = true;
        else if (c === aspas) aspas = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { aspas = c; continue; }
      if (c === '/' && txt[j + 1] === '/') { j = txt.indexOf('\n', j); if (j < 0) break; continue; }
      if (c === '/' && txt[j + 1] === '*') { j = txt.indexOf('*/', j) + 1; if (j < 1) break; continue; }
      if (c === abre) nivel++;
      else if (c === fecha) { nivel--; if (nivel === 0) return txt.slice(ini, j + 1); }
    }
    return null;
  }

  /* ── Leitura das 7 páginas ────────────────────────────────────────────── */

  async function lerCategoria(cat) {
    var resp = await fetch(cat.arquivo, { cache: 'force-cache' });
    if (!resp.ok) throw new Error(cat.arquivo + ' (HTTP ' + resp.status + ')');
    var html = await resp.text();
    var doc = new DOMParser().parseFromString(html, 'text/html');

    var imgs = Array.prototype.slice.call(doc.querySelectorAll('img.page-cover, img.page-img'));
    var paginas = imgs.map(function (im) {
      var src = im.getAttribute('src');
      return { url: new URL(src, location.href).href, chave: src.split('/').pop().replace(/\.[a-z]+$/i, '') };
    });

    var precos = {};
    var lit = recortarLiteral(html, 'PRICE_CONFIG', '{', '}');
    if (lit) { try { precos = new Function('return ' + lit)(); } catch (e) { precos = {}; } }

    var ocultas = {};
    var litOc = recortarLiteral(html, 'REFS_OCULTAS', '[', ']');
    if (litOc) {
      try {
        (new Function('return ' + litOc)() || []).forEach(function (r) { ocultas[r] = 1; });
      } catch (e) { /* segue sem ocultar */ }
    }

    // âncora de seção -> índice da imagem onde a seção começa
    var ancoras = {};
    Array.prototype.forEach.call(doc.querySelectorAll('.section-anchor[id]'), function (a) {
      var alvo = a.parentElement && a.parentElement.querySelector('img.page-img, img.page-cover');
      if (!alvo) return;
      var idx = imgs.indexOf(alvo);
      if (idx >= 0) ancoras[a.id] = idx;
    });

    // ref -> índice da página em que o selo aparece
    var selosPorPagina = paginas.map(function () { return []; });
    Object.keys(precos).forEach(function (ref) {
      if (ocultas[ref]) return;
      var d = precos[ref];
      if (!d || !d.img) return;
      var alvo = -1;
      for (var i = 0; i < paginas.length; i++) {
        if (paginas[i].chave === d.img) { alvo = i; break; }
        if (alvo < 0 && paginas[i].chave.indexOf(d.img) >= 0) alvo = i;
      }
      if (alvo >= 0) selosPorPagina[alvo].push({ ref: ref, d: d });
    });

    var secoes = secoesDe(doc, cat.arquivo)[cat.arquivo.toLowerCase()] || [];

    return { cat: cat, paginas: paginas, selos: selosPorPagina, ancoras: ancoras, secoes: secoes };
  }

  // Nomes das seções: links "arquivo.html#ancora" da sidebar (verticais) ou do sumário.
  // Link só com "#ancora" pertence ao próprio arquivo.
  function secoesDe(raiz, arquivoAtual) {
    var mapa = {};
    Array.prototype.forEach.call(raiz.querySelectorAll('.sb-sub[href], a.item[href]'), function (a) {
      var p = (a.getAttribute('href') || '').split('#');
      if (p.length < 2 || !p[1]) return;
      var arq = (p[0] || arquivoAtual || '').split('/').pop().toLowerCase();
      if (!arq) return;
      var c = a.cloneNode(true);
      Array.prototype.forEach.call(c.querySelectorAll('.sb-sub-page, .item-page, .item-arrow'), function (x) { x.remove(); });
      var lista = (mapa[arq] = mapa[arq] || []);
      if (lista.some(function (x) { return x.id === p[1]; })) return;
      lista.push({ id: p[1], nome: limpar(c.textContent) });
    });
    return mapa;
  }

  // da página aberta agora (já traduzida pelo idioma ativo)
  function lerSecoesDaSidebar() {
    return secoesDe(document, (location.pathname.split('/').pop() || 'index.html').toLowerCase());
  }

  /* ── Lançamentos ─────────────────────────────────────────────────────── */

  async function lerLancamentos() {
    var resp = await fetch(LANCAMENTOS.arquivo, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(LANCAMENTOS.arquivo + ' (HTTP ' + resp.status + ')');
    var html = await resp.text();
    var lit = recortarLiteral(html, 'PRODUCTS', '[', ']');
    if (!lit) return [];
    var prods = new Function('return ' + lit)() || [];
    var entrega = {};
    var litE = recortarLiteral(html, 'DELIVERY', '{', '}');
    if (litE) { try { entrega = new Function('return ' + litE)() || {}; } catch (e) { entrega = {}; } }
    prods.forEach(function (p) { if (!p.delivery && entrega[p.ref]) p.delivery = entrega[p.ref]; });

    var ordemCat = Object.keys(CAT_LANC);
    var onda2 = prods.filter(function (p) { return p.onda === 2; });
    var outros = prods.filter(function (p) { return p.onda !== 2; }).sort(function (a, b) {
      return ordemCat.indexOf(a.cat) - ordemCat.indexOf(b.cat);   // sort estável: mantém a ordem da página
    });
    return [
      { id: 'onda2', titulo: '2ª onda de lançamentos', itens: onda2 },
      { id: 'todos', titulo: 'Todos os lançamentos 2026', itens: outros }
    ].filter(function (g) { return g.itens.length; });
  }

  function paginasDoGrupo(g) { return Math.ceil(g.itens.length / LANCAMENTOS.porPagina); }

  // Fotos ficam no WordPress (oneweb), que não libera CORS: tenta o proxy de imagem
  // primeiro (já entrega JPEG com fundo branco), depois direto, depois o arquivo sem o recorte -1024x…
  function candidatosFoto(url) {
    var lista = [], semRecorte = url.replace(/-\d+x\d+(\.(?:png|jpe?g|webp))$/i, '$1');
    [url, semRecorte].forEach(function (u, i) {
      if (i && u === url) return;
      lista.push('https://images.weserv.nl/?url=' + encodeURIComponent(u.replace(/^https?:\/\//, '')) +
                 '&w=720&h=720&fit=inside&output=jpg&bg=white&q=85');
      lista.push(u);
      lista.push('https://corsproxy.io/?url=' + encodeURIComponent(u));
    });
    return lista;
  }

  async function fotoLancamento(url) {
    if (!url) return null;
    var alvos = candidatosFoto(url);
    for (var i = 0; i < alvos.length; i++) {
      try {
        var r = await fetch(alvos[i], { cache: 'force-cache', signal: AbortSignal.timeout(15000) });
        if (!r.ok) continue;
        var blob = await r.blob();
        if (!blob || blob.size < 200 || !/^image\//.test(blob.type || 'image/')) continue;
        var bmp = await createImageBitmap(blob);
        var esc = Math.min(1, 720 / Math.max(bmp.width, bmp.height));
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(bmp.width * esc));
        cv.height = Math.max(1, Math.round(bmp.height * esc));
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff';                       // PNG transparente não vira preto
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
        bmp.close && bmp.close();
        var saida = await new Promise(function (ok) { cv.toBlob(ok, 'image/jpeg', 0.85); });
        cv.width = cv.height = 0;
        return new Uint8Array(await saida.arrayBuffer());
      } catch (e) { /* tenta o próximo */ }
    }
    return null;
  }

  function quebrarLinhas(txt, fonte, tam, largura, maxLinhas) {
    var palavras = txt.split(/\s+/), linhas = [], atual = '';
    palavras.forEach(function (w) {
      var t = atual ? atual + ' ' + w : w;
      if (fonte.widthOfTextAtSize(t, tam) <= largura || !atual) atual = t;
      else { linhas.push(atual); atual = w; }
    });
    if (atual) linhas.push(atual);
    if (linhas.length > maxLinhas) {
      linhas = linhas.slice(0, maxLinhas);
      var u = linhas[maxLinhas - 1];
      while (u.length > 3 && fonte.widthOfTextAtSize(u + '…', tam) > largura) u = u.slice(0, -1);
      linhas[maxLinhas - 1] = u + '…';
    }
    return linhas;
  }

  // Desenha as páginas de lançamentos a partir do índice `inicio` (0 = primeira página do PDF)
  async function desenharLancamentos(pdf, PDFLib, fonte, fonteNeg, grupos, fotos, inicio) {
    var rgb = PDFLib.rgb;
    var navy = rgb(0.106, 0.227, 0.361), creme = rgb(0.961, 0.898, 0.839), ouro = rgb(0.941, 0.627, 0.188);
    var M = 30, VAO = 12, TOPO = PH - 78, BASE = 40, COLS = 2, LINS = 3;
    var cw = (PW - M * 2 - VAO * (COLS - 1)) / COLS;
    var ch = (TOPO - BASE - VAO * (LINS - 1)) / LINS;
    var idx = inicio, imgCache = {};

    function rgbArr(a) { return rgb(a[0], a[1], a[2]); }

    for (var g = 0; g < grupos.length; g++) {
      var grupo = grupos[g], nPag = paginasDoGrupo(grupo);
      for (var pg = 0; pg < nPag; pg++) {
        var page = pdf.insertPage(idx++);
        page.setSize(PW, PH);
        var links = [];
        page.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: creme });
        page.drawRectangle({ x: 0, y: PH - 58, width: PW, height: 58, color: navy });
        page.drawRectangle({ x: 0, y: PH - 61, width: PW, height: 3, color: ouro });
        page.drawText('LANÇAMENTOS 2026', { x: M, y: PH - 32, size: 17, font: fonteNeg, color: rgb(1, 1, 1) });
        var sub = limpar(grupo.titulo) + (nPag > 1 ? '  ·  ' + (pg + 1) + '/' + nPag : '');
        page.drawText(sub, { x: M, y: PH - 47, size: 8.5, font: fonteNeg, color: ouro });
        var marca = 'Xalingo Brinquedos';
        page.drawText(marca, { x: PW - M - fonte.widthOfTextAtSize(marca, 8), y: PH - 32, size: 8, font: fonte, color: rgb(1, 1, 1), opacity: 0.7 });

        var itens = grupo.itens.slice(pg * LANCAMENTOS.porPagina, (pg + 1) * LANCAMENTOS.porPagina);
        for (var i = 0; i < itens.length; i++) {
          var p = itens[i];
          var col = i % COLS, lin = Math.floor(i / COLS);
          var x = M + col * (cw + VAO), yTopo = TOPO - lin * (ch + VAO), y = yTopo - ch;

          page.drawRectangle({ x: x, y: y, width: cw, height: ch, color: rgb(1, 1, 1),
                               borderColor: rgb(0.85, 0.80, 0.74), borderWidth: 0.6 });

          // foto
          var areaH = ch - 78, areaW = cw - 20, ax = x + 10, ay = yTopo - 10 - areaH;
          var bytes = fotos[p.ref];
          if (bytes) {
            try {
              var img = imgCache[p.ref] || (imgCache[p.ref] = await pdf.embedJpg(bytes));
              var k = Math.min(areaW / img.width, areaH / img.height);
              var w = img.width * k, h = img.height * k;
              page.drawImage(img, { x: ax + (areaW - w) / 2, y: ay + (areaH - h) / 2, width: w, height: h });
            } catch (e) { bytes = null; }
          }
          if (!bytes) {
            page.drawRectangle({ x: ax, y: ay, width: areaW, height: areaH, color: rgb(0.95, 0.93, 0.90) });
            var semFoto = 'Foto em breve';
            page.drawText(semFoto, { x: ax + (areaW - fonte.widthOfTextAtSize(semFoto, 8)) / 2, y: ay + areaH / 2 - 3,
                                     size: 8, font: fonte, color: navy, opacity: 0.4 });
          }

          // selo: tag da 2ª onda ou categoria
          var catInfo = CAT_LANC[p.cat] || { nome: p.cat || '', cor: [0.4, 0.4, 0.4] };
          var selo = limpar(p.tag ? p.tag : catInfo.nome).toUpperCase();
          var corSelo = p.tag ? (TAG_LANC[p.tagc] || TAG_LANC.lanc) : catInfo.cor;
          var sw = fonteNeg.widthOfTextAtSize(selo, 6.2) + 10;
          page.drawRectangle({ x: x + 10, y: yTopo - 22, width: sw, height: 13, color: rgbArr(corSelo) });
          page.drawText(selo, { x: x + 15, y: yTopo - 18, size: 6.2, font: fonteNeg, color: rgb(1, 1, 1) });

          // textos
          var ty = ay - 13;
          page.drawText('REF ' + limpar(p.ref), { x: x + 10, y: ty, size: 7, font: fonteNeg, color: navy, opacity: 0.5 });
          ty -= 12;
          quebrarLinhas(limpar(p.nome), fonteNeg, 9.2, cw - 20, 2).forEach(function (l) {
            page.drawText(l, { x: x + 10, y: ty, size: 9.2, font: fonteNeg, color: navy });
            ty -= 11;
          });
          var info = [];
          if (p.idade) info.push(limpar(p.idade));
          if (p.delivery) info.push('Entrega: ' + limpar(p.delivery));
          if (info.length) {
            page.drawText(info.join('  ·  '), { x: x + 10, y: y + (p.aviso ? 20 : 9), size: 7.2, font: fonte, color: navy, opacity: 0.72 });
          }
          if (p.aviso) {
            page.drawText('! ' + limpar(p.aviso), { x: x + 10, y: y + 9, size: 7, font: fonteNeg, color: rgb(0.70, 0.40, 0) });
          }
          if (p.site) links.push({ url: p.site, rect: [x, y, x + cw, yTopo] });
        }

        page.drawText(limpar('Preços conforme a tabela vigente · clique no produto para ver a ficha completa'), {
          x: M, y: 20, size: 7, font: fonte, color: navy, opacity: 0.45
        });

        try {
          if (links.length) {
            var ctx = pdf.context;
            page.node.set(PDFLib.PDFName.of('Annots'), ctx.obj(links.map(function (l) {
              return ctx.register(ctx.obj({
                Type: 'Annot', Subtype: 'Link', Rect: l.rect, Border: [0, 0, 0],
                A: { Type: 'Action', S: 'URI', URI: PDFLib.PDFString.of(l.url) }
              }));
            })));
          }
        } catch (e) { /* sem links */ }
      }
    }
    return idx - inicio;
  }

  /* ── Recompressão opcional ────────────────────────────────────────────── */

  async function recomprimir(blob, larguraMax, q) {
    var bmp = await createImageBitmap(blob);
    var esc = Math.min(1, larguraMax / bmp.width);
    var cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * esc);
    cv.height = Math.round(bmp.height * esc);
    var ctx = cv.getContext('2d');
    ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    bmp.close && bmp.close();
    var saida = await new Promise(function (r) { cv.toBlob(r, 'image/jpeg', q); });
    cv.width = cv.height = 0;
    return new Uint8Array(await saida.arrayBuffer());
  }

  /* ── Desenho do selo de preço ─────────────────────────────────────────── */

  function desenharSelo(page, fonte, fonteNeg, rgb, item, icms) {
    var d = item.d;
    var texto = limpar(preco(d[icms], icms));
    var ref = limpar(item.ref);
    var importado = icms === 'expind' && (d.origem || 'IMP') === 'IMP';
    var aviso = importado ? 'IMPORTADO \u00b7 taxas dif.' : null;

    var fRef = 6.2, fVal = 10.4, fAviso = 5.4, padX = 5.6, padY = 3.2, vao = 1.4;

    var larg = Math.max(
      fonte.widthOfTextAtSize(ref, fRef),
      fonteNeg.widthOfTextAtSize(texto, fVal),
      aviso ? fonteNeg.widthOfTextAtSize(aviso, fAviso) : 0
    ) + padX * 2;
    var alt = padY * 2 + fRef + vao + fVal + (aviso ? vao + fAviso : 0);

    var x = Math.min(Math.max(d.x / 100 * PW, 3), PW - larg - 3);
    var y = Math.min(Math.max(PH - (d.y / 100 * PH) - alt, 3), PH - alt - 3);

    var fundo = icms === 'expind' ? rgb(0.055, 0.431, 0.353) : rgb(0.627, 0.118, 0.118);

    page.drawRectangle({ x: x, y: y, width: larg, height: alt, color: fundo, opacity: 0.88 });

    var cur = y + alt - padY - fRef * 0.82;
    page.drawText(ref, { x: x + padX, y: cur, size: fRef, font: fonte, color: rgb(1, 1, 1), opacity: 0.62 });
    cur -= fRef * 0.18 + vao + fVal * 0.82;
    page.drawText(texto, { x: x + padX, y: cur, size: fVal, font: fonteNeg, color: rgb(1, 1, 1) });
    if (aviso) {
      cur -= fVal * 0.18 + vao + fAviso * 0.82;
      page.drawText(aviso, { x: x + padX, y: cur, size: fAviso, font: fonteNeg, color: rgb(1, 0.874, 0.541) });
    }
  }

  /* ── Sumário gerado (vetorial, com links) ─────────────────────────────── */

  function montarSumario(pdf, PDFLib, fonte, fonteNeg, plano, secoes, icms) {
    var rgb = PDFLib.rgb;
    var page = pdf.insertPage(1);
    page.setSize(PW, PH);
    var navy = rgb(0.106, 0.227, 0.361);

    page.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: rgb(0.961, 0.898, 0.839) });
    page.drawRectangle({ x: 0, y: PH - 92, width: PW, height: 92, color: navy });
    page.drawText('CAT\u00c1LOGO 2026', { x: 44, y: PH - 50, size: 22, font: fonteNeg, color: rgb(1, 1, 1) });
    page.drawText('Xalingo Brinquedos \u00b7 78 anos', { x: 44, y: PH - 68, size: 9, font: fonte, color: rgb(1, 1, 1), opacity: 0.75 });
    var rot = limpar('Pre\u00e7os: ' + (ROTULO_ICMS[icms] || ROTULO_ICMS.p18).texto);
    page.drawText(rot, {
      x: PW - 44 - fonteNeg.widthOfTextAtSize(rot, 9),
      y: PH - 50, size: 9, font: fonteNeg, color: rgb(0.973, 0.769, 0)
    });

    var MARGEM = 44, VAO = 26, TOPO = PH - 126, BASE = 64;
    var H_CAT = 18, H_SUB = 12.5, VAO_CAT = 10;
    var links = [];

    function encurtar(txt, tamanho, largura) {
      if (fonte.widthOfTextAtSize(txt, tamanho) <= largura) return txt;
      var t = txt;
      while (t.length > 4 && fonte.widthOfTextAtSize(t + '\u2026', tamanho) > largura) t = t.slice(0, -1);
      return t + '\u2026';
    }

    // mede antes de desenhar: cabendo numa coluna, fica em uma só
    var itens = plano.map(function (bloco) {
      var subs = (secoes[bloco.cat.arquivo] || []).filter(function (s) { return bloco.ancoras[s.id] != null; });
      return { bloco: bloco, subs: subs, alt: H_CAT + subs.length * H_SUB + VAO_CAT };
    });
    var alturaTotal = itens.reduce(function (a, i) { return a + i.alt; }, 0);
    var disponivel = TOPO - BASE;
    var duasColunas = alturaTotal > disponivel;

    var colW = duasColunas ? (PW - MARGEM * 2 - VAO) / 2 : 330;
    var colX = [MARGEM, MARGEM + colW + VAO];
    var col = 0, y = TOPO;

    // com duas colunas, quebra no ponto que deixa as duas com altura parecida
    var corte = itens.length, acum = 0;
    if (duasColunas) {
      for (var ci = 0; ci < itens.length; ci++) {
        if (acum + itens[ci].alt / 2 > alturaTotal / 2) { corte = ci; break; }
        acum += itens[ci].alt;
      }
    }

    // cartão de referência ocupa a área livre quando o sumário cabe em uma coluna
    if (!duasColunas) {
      var px = MARGEM + colW + VAO, pw = PW - MARGEM - px;
      page.drawRectangle({ x: px, y: TOPO - 108, width: pw, height: 116, color: rgb(1, 1, 1), opacity: 0.55 });
      page.drawRectangle({ x: px, y: TOPO + 8, width: pw, height: 2.5, color: navy });
      var linhas = [
        ['Faixa aplicada', (ROTULO_ICMS[icms] || ROTULO_ICMS.p18).texto],
        ['P\u00e1ginas', String(pdf.getPageCount())],
        ['Pre\u00e7os', 'por unidade (R$)']
      ];
      var ly = TOPO - 14;
      linhas.forEach(function (l) {
        page.drawText(limpar(l[0]), { x: px + 12, y: ly, size: 6.8, font: fonte, color: navy, opacity: 0.5 });
        page.drawText(encurtar(limpar(l[1]), 9, pw - 24), { x: px + 12, y: ly - 12, size: 9, font: fonteNeg, color: navy });
        ly -= 32;
      });
    }

    itens.forEach(function (item, idx) {
      if (duasColunas && idx === corte) { col = 1; y = TOPO; }
      var bloco = item.bloco, subs = item.subs;
      var cat = bloco.cat;
      var cor = rgb(cat.cor[0], cat.cor[1], cat.cor[2]);
      if (y - H_CAT < BASE) return;

      var x0 = colX[col];
      page.drawRectangle({ x: x0, y: y - 3, width: 3, height: 16, color: cor });
      page.drawText(cat.num, { x: x0 + 9, y: y, size: 7.5, font: fonteNeg, color: cor, opacity: 0.55 });
      page.drawText(limpar(cat.nome), { x: x0 + 25, y: y, size: 11.5, font: fonteNeg, color: navy });
      var faixa = bloco.primeira + '\u2013' + (bloco.primeira + bloco.total - 1);
      page.drawText(faixa, {
        x: x0 + colW - fonte.widthOfTextAtSize(faixa, 8),
        y: y + 1, size: 8, font: fonte, color: navy, opacity: 0.5
      });
      links.push({ pagina: bloco.primeira, x: x0, y: y - 4, w: colW, h: 18 });
      y -= H_CAT;

      subs.forEach(function (s) {
        if (y - H_SUB < BASE) return;
        var xs = colX[col];
        var num = String(bloco.primeira + bloco.ancoras[s.id]);
        var wn = fonte.widthOfTextAtSize(num, 8.5);
        var nome = encurtar(s.nome, 8.5, colW - 38 - wn);
        page.drawCircle({ x: xs + 27, y: y + 3, size: 1.3, color: cor, opacity: 0.6 });
        page.drawText(nome, { x: xs + 34, y: y, size: 8.5, font: fonte, color: navy, opacity: 0.82 });
        for (var px = xs + 38 + fonte.widthOfTextAtSize(nome, 8.5); px < xs + colW - wn - 4; px += 4) {
          page.drawCircle({ x: px, y: y + 3, size: 0.32, color: navy, opacity: 0.26 });
        }
        page.drawText(num, { x: xs + colW - wn, y: y, size: 8.5, font: fonte, color: navy, opacity: 0.6 });
        links.push({ pagina: bloco.primeira + bloco.ancoras[s.id], x: xs + 24, y: y - 3, w: colW - 24, h: 12 });
        y -= H_SUB;
      });

      y -= VAO_CAT;
    });

    page.drawText(limpar('Gerado em ' + new Date().toLocaleDateString('pt-BR') +
      ' \u00b7 pre\u00e7os sujeitos a altera\u00e7\u00e3o sem aviso pr\u00e9vio'), {
      x: 44, y: 40, size: 7.5, font: fonte, color: navy, opacity: 0.45
    });

    // links clicáveis (falha silenciosa: o PDF continua válido sem eles)
    try {
      var ctx = pdf.context;
      var refs = links.map(function (l) {
        var alvo = pdf.getPage(l.pagina - 1);
        return ctx.register(ctx.obj({
          Type: 'Annot', Subtype: 'Link',
          Rect: [l.x, l.y, l.x + l.w, l.y + l.h],
          Border: [0, 0, 0],
          Dest: [alvo.ref, PDFLib.PDFName.of('XYZ'), null, PH, null]
        }));
      });
      page.node.set(PDFLib.PDFName.of('Annots'), ctx.obj(refs));
    } catch (e) { /* sem links */ }
  }

  /* ── Interface ────────────────────────────────────────────────────────── */

  function estilo() {
    if (document.getElementById('xpdf-css')) return;
    var s = document.createElement('style');
    s.id = 'xpdf-css';
    s.textContent = [
      '.xpdf-fundo{position:fixed;inset:0;z-index:9000;background:rgba(20,28,40,.55);backdrop-filter:blur(3px);',
      'display:flex;align-items:center;justify-content:center;padding:20px;font-family:Quicksand,sans-serif}',
      '.xpdf-cx{background:#f5e5d6;border-radius:18px;padding:24px;width:100%;max-width:380px;',
      'box-shadow:0 20px 60px rgba(0,0,0,.35)}',
      '.xpdf-tit{font-family:Fredoka,Quicksand,sans-serif;font-size:1.05rem;font-weight:700;color:#1B3A5C;margin-bottom:4px}',
      '.xpdf-sub{font-size:.76rem;color:#1B3A5C;opacity:.65;font-weight:600;line-height:1.45;margin-bottom:16px}',
      '.xpdf-op{display:block;width:100%;text-align:left;background:#fff;border:1.5px solid rgba(27,58,92,.16);',
      'border-radius:11px;padding:10px 13px;margin-bottom:8px;cursor:pointer;font-family:inherit;transition:.15s}',
      '.xpdf-op:hover{border-color:#1B3A5C;transform:translateY(-1px)}',
      '.xpdf-op b{display:block;font-size:.85rem;color:#1B3A5C;font-weight:700}',
      '.xpdf-op span{font-size:.68rem;color:#1B3A5C;opacity:.6;font-weight:600}',
      '.xpdf-fech{width:100%;background:none;border:none;padding:8px;margin-top:4px;cursor:pointer;',
      'font-family:inherit;font-size:.75rem;font-weight:700;color:#1B3A5C;opacity:.55}',
      '.xpdf-barra{height:7px;background:rgba(27,58,92,.13);border-radius:5px;overflow:hidden;margin:14px 0 9px}',
      '.xpdf-barra i{display:block;height:100%;width:0;background:#A01E1E;border-radius:5px;transition:width .25s}',
      '.xpdf-st{font-size:.72rem;font-weight:700;color:#1B3A5C;opacity:.75;min-height:32px;line-height:1.4}',
      '.xpdf-erro{font-size:.75rem;font-weight:600;color:#A01E1E;line-height:1.5}',
      '.xpdf-rot{font-size:.62rem;font-weight:800;color:#1B3A5C;opacity:.6;text-transform:uppercase;',
      'letter-spacing:.6px;margin:2px 0 7px}',
      '.xpdf-rot span{text-transform:none;letter-spacing:0;font-weight:600;opacity:.8;margin-left:4px}',
      '.xpdf-chips{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px}',
      '.xpdf-chip{font-family:inherit;font-size:.68rem;font-weight:700;padding:5px 10px;border-radius:20px;',
      'border:1.5px solid rgba(27,58,92,.18);background:#fff;color:#1B3A5C;cursor:pointer;transition:.15s}',
      '.xpdf-chip:hover{border-color:#1B3A5C}',
      '.xpdf-chip.on{background:#1B3A5C;border-color:#1B3A5C;color:#fff}',
      '.xpdf-chk{display:flex;align-items:center;gap:8px;font-size:.76rem;font-weight:600;color:#1B3A5C;',
      'background:#fff;border:1.5px solid rgba(27,58,92,.16);border-radius:11px;padding:9px 12px;margin-bottom:14px;cursor:pointer}',
      '.xpdf-chk input{width:15px;height:15px;accent-color:#1B3A5C;cursor:pointer}'
    ].join('');
    document.head.appendChild(s);
  }

  function fechar() {
    var f = document.getElementById('xpdf-fundo');
    if (f) f.remove();
  }

  function caixa(html) {
    estilo();
    fechar();
    var f = document.createElement('div');
    f.className = 'xpdf-fundo';
    f.id = 'xpdf-fundo';
    f.innerHTML = '<div class="xpdf-cx">' + html + '</div>';
    document.body.appendChild(f);
    return f;
  }

  function abrir() {
    var icms = icmsAtual();
    var chips = Object.keys(ROTULO_ICMS).map(function (k) {
      return '<button class="xpdf-chip' + (k === icms ? ' on' : '') + '" data-icms="' + k + '">' +
             ROTULO_ICMS[k].texto + '</button>';
    }).join('');
    var ops = Object.keys(QUALIDADES).map(function (k) {
      var q = QUALIDADES[k];
      return '<button class="xpdf-op" data-q="' + k + '"><b>' + q.rotulo + '</b><span>' + q.nota + '</span></button>';
    }).join('');
    var f = caixa(
      '<div class="xpdf-tit">Baixar o catálogo completo</div>' +
      '<div class="xpdf-sub">Capa, sumário e as 7 categorias num PDF só.</div>' +
      '<div class="xpdf-rot">Tabela de preços</div>' +
      '<div class="xpdf-chips">' + chips + '</div>' +
      '<label class="xpdf-chk"><input type="checkbox" id="xpdf-lanc" checked> Incluir <b>Lançamentos 2026</b> logo após o sumário</label>' +
      '<div class="xpdf-rot">Qualidade <span>quanto maior, mais demora e mais pesa</span></div>' +
      ops +
      '<button class="xpdf-fech">Cancelar</button>'
    );
    f.querySelector('.xpdf-fech').onclick = fechar;
    f.addEventListener('click', function (e) { if (e.target === f) fechar(); });
    Array.prototype.forEach.call(f.querySelectorAll('.xpdf-chip'), function (b) {
      b.onclick = function () {
        icms = b.getAttribute('data-icms');
        Array.prototype.forEach.call(f.querySelectorAll('.xpdf-chip'), function (o) { o.classList.toggle('on', o === b); });
      };
    });
    Array.prototype.forEach.call(f.querySelectorAll('.xpdf-op'), function (b) {
      b.onclick = function () {
        var chk = document.getElementById('xpdf-lanc');
        gerar(b.getAttribute('data-q'), icms, { lancamentos: !chk || chk.checked });
      };
    });
  }

  /* ── Geração ──────────────────────────────────────────────────────────── */

  async function gerar(nivel, icmsEscolhido, opcoes) {
    opcoes = opcoes || {};
    var comLanc = opcoes.lancamentos !== false;
    cancelado = false;
    var q = QUALIDADES[nivel] || QUALIDADES.media;
    var icms = ROTULO_ICMS[icmsEscolhido] ? icmsEscolhido : icmsAtual();

    var f = caixa(
      '<div class="xpdf-tit">Montando o PDF</div>' +
      '<div class="xpdf-sub">Pode deixar esta aba aberta em segundo plano.</div>' +
      '<div class="xpdf-barra"><i id="xpdf-i"></i></div>' +
      '<div class="xpdf-st" id="xpdf-st">Carregando…</div>' +
      '<button class="xpdf-fech">Cancelar</button>'
    );
    var barra = document.getElementById('xpdf-i');
    var st = document.getElementById('xpdf-st');
    f.querySelector('.xpdf-fech').onclick = function () { cancelado = true; fechar(); };

    function passo(pct, txt) {
      barra.style.width = Math.max(0, Math.min(100, pct)) + '%';
      st.textContent = txt;
    }

    function erro(msg) {
      caixa('<div class="xpdf-tit">Não deu para gerar</div><div class="xpdf-erro">' + msg + '</div>' +
            '<button class="xpdf-fech">Fechar</button>')
        .querySelector('.xpdf-fech').onclick = fechar;
    }

    try {
      if (!window.PDFLib) {
        passo(1, 'Carregando o gerador…');
        await carregarScript(CDNS);
      }
      var PDFLib = window.PDFLib;
      var rgb = PDFLib.rgb;

      // 1 · lê as 7 páginas e planeja a numeração
      passo(3, 'Lendo as categorias…');
      var blocos = [];
      for (var i = 0; i < CATEGORIAS.length; i++) {
        if (cancelado) return;
        blocos.push(await lerCategoria(CATEGORIAS[i]));
        passo(3 + (i + 1) / CATEGORIAS.length * 5, 'Lendo as categorias… ' + (i + 1) + '/7');
      }

      // lançamentos entram logo depois do sumário
      var gruposLanc = [], paginasLanc = 0, fotosLanc = {}, semFotoLanc = 0;
      if (comLanc) {
        passo(8, 'Lendo os lan\u00e7amentos\u2026');
        try { gruposLanc = await lerLancamentos(); } catch (e) { gruposLanc = []; }
        gruposLanc.forEach(function (g) { paginasLanc += paginasDoGrupo(g); });
        var todosLanc = [];
        gruposLanc.forEach(function (g) { g.itens.forEach(function (p) { todosLanc.push(p); }); });
        var filaFoto = todosLanc.filter(function (p) { return p.img; }), feitas = 0;
        async function trabalhador() {
          while (filaFoto.length) {
            if (cancelado) return;
            var p = filaFoto.shift();
            fotosLanc[p.ref] = await fotoLancamento(p.img);
            if (!fotosLanc[p.ref]) semFotoLanc++;
            feitas++;
            passo(8 + feitas / todosLanc.length * 10, 'Fotos dos lan\u00e7amentos\u2026 ' + feitas + '/' + todosLanc.length);
          }
        }
        await Promise.all([1, 2, 3, 4, 5, 6].map(trabalhador));
        if (cancelado) return;
      }

      var fila = [{ url: new URL(CAPA, location.href).href, selos: [] }];
      var plano = [];
      var numero = 3 + paginasLanc; // 1 = capa · 2 = sumário · depois os lançamentos
      if (paginasLanc) {
        var ancLanc = {}, acum = 0;
        gruposLanc.forEach(function (g) { ancLanc[g.id] = acum; acum += paginasDoGrupo(g); });
        plano.push({ cat: { num: '', arquivo: LANCAMENTOS.arquivo, nome: LANCAMENTOS.nome, cor: LANCAMENTOS.cor },
                     primeira: 3, total: paginasLanc, ancoras: ancLanc });
      }
      blocos.forEach(function (b) {
        plano.push({ cat: b.cat, primeira: numero, total: b.paginas.length, ancoras: b.ancoras });
        b.paginas.forEach(function (p, k) { fila.push({ url: p.url, selos: b.selos[k] }); });
        numero += b.paginas.length;
      });
      var totalPag = fila.length + 1 + paginasLanc;

      // 2 · monta o documento
      var pdf = await PDFLib.PDFDocument.create();
      pdf.setTitle('Catálogo Xalingo 2026 — ' + (ROTULO_ICMS[icms] || ROTULO_ICMS.p18).texto);
      pdf.setAuthor('Xalingo S.A. Indústria e Comércio');
      pdf.setCreationDate(new Date());
      var fonte = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
      var fonteNeg = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);

      // baixa com janela deslizante de 4 para não ficar serial
      var JANELA = 4;
      var buffers = new Array(fila.length);
      function baixar(k) {
        if (k >= fila.length || buffers[k]) return;
        buffers[k] = fetch(fila[k].url, { cache: 'force-cache' }).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.blob();
        });
      }
      for (var j = 0; j < JANELA; j++) baixar(j);

      var falhas = 0;
      for (var k = 0; k < fila.length; k++) {
        if (cancelado) return;
        baixar(k + JANELA);
        passo(19 + (k / fila.length) * 73,
          'Página ' + (k + 1) + ' de ' + fila.length + (falhas ? ' · ' + falhas + ' com problema' : ''));
        try {
          var blob = await buffers[k];
          var bytes = q.larguraMax
            ? await recomprimir(blob, q.larguraMax, q.jpeg)
            : new Uint8Array(await blob.arrayBuffer());
          var img = await pdf.embedJpg(bytes);
          var page = pdf.addPage();
          page.setSize(PW, PH);
          page.drawImage(img, { x: 0, y: 0, width: PW, height: PH });
          fila[k].selos.forEach(function (s) { desenharSelo(page, fonte, fonteNeg, rgb, s, icms); });
        } catch (e) {
          falhas++;
          pdf.addPage().setSize(PW, PH);
        }
        buffers[k] = null;
        if (k % 8 === 0) await new Promise(function (r) { setTimeout(r, 0); }); // deixa a aba respirar
      }

      // 3 · sumário entra na posição 2, com os destinos já existindo
      if (cancelado) return;
      passo(93, 'Montando o sumário…');
      // seções: as da página aberta (traduzidas); o que faltar vem da própria página da categoria
      if (paginasLanc) {
        passo(93, 'Desenhando os lan\u00e7amentos\u2026');
        await desenharLancamentos(pdf, PDFLib, fonte, fonteNeg, gruposLanc, fotosLanc, 1);
      }
      var secoes = lerSecoesDaSidebar();
      secoes[LANCAMENTOS.arquivo] = gruposLanc.map(function (g) {
        return { id: g.id, nome: g.id === 'onda2' ? '2\u00aa Onda' : 'Todos os lan\u00e7amentos' };
      });
      blocos.forEach(function (b) {
        var k = b.cat.arquivo.toLowerCase();
        if (!(secoes[k] && secoes[k].length)) secoes[k] = b.secoes;
      });
      montarSumario(pdf, PDFLib, fonte, fonteNeg, plano, secoes, icms);

      // 4 · salva
      passo(96, 'Fechando o arquivo… (esta parte demora um pouco)');
      await new Promise(function (r) { setTimeout(r, 60); });
      var saida = await pdf.save({ useObjectStreams: false });

      var url = URL.createObjectURL(new Blob([saida], { type: 'application/pdf' }));
      var a = document.createElement('a');
      a.href = url;
      a.download = 'Catalogo-Xalingo-2026-' + (ROTULO_ICMS[icms] || ROTULO_ICMS.p18).arquivo + '.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);

      passo(100, 'Pronto — ' + totalPag + ' páginas, ' + (saida.length / 1048576).toFixed(0) + ' MB.' +
        (falhas ? ' ' + falhas + ' página(s) não carregaram e ficaram em branco.' : '') +
        (semFotoLanc ? ' ' + semFotoLanc + ' lançamento(s) sem foto.' : ''));
      setTimeout(fechar, 4000);

    } catch (e) {
      if (cancelado) return;
      var msg = (location.protocol === 'file:')
        ? 'Abrindo o arquivo direto do disco o navegador bloqueia a leitura das outras páginas. Rode pelo site publicado (ou por um servidor local) e tente de novo.'
        : 'Falhou em: ' + (e && e.message ? e.message : e) + '.<br><br>Se foi falta de memória, tente a qualidade Leve.';
      erro(msg);
    }
  }

  window.XalingoPDF = { abrir: abrir, gerar: gerar };
})();
