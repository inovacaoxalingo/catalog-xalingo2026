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

  // Lançamentos: só a 2ª onda, lida da página dela (mesmo domínio github.io), com preços,
  // fotos, medidas e avisos. Entram logo depois do sumário, 2 produtos por página.
  // Se a página não responder, usa os itens onda:2 da lancamentos.html deste catálogo.
  var LANCAMENTOS = {
    fonte: 'https://inovacaoxalingo.github.io/lancamentos/index.html',
    local: 'lancamentos.html',
    arquivo: 'lancamentos.html',          // chave das seções no sumário
    nome: 'Lançamentos · 2ª onda',
    cor: [0.94, 0.63, 0.19],
    porPagina: 2,
    fotos: 3                               // 1 grande + 2 menores
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
    return String(s == null ? '' : s).replace(/[‐‑−]/g, '-')
      .replace(/[^\x20-\xFF–—‘’“”•…€]/g, '').replace(/\s{2,}/g, ' ').trim();
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

  /* ── Lançamentos · 2ª onda ───────────────────────────────────────────── */

  function avaliarLiteral(html, nome, abre, fecha) {
    var lit = recortarLiteral(html, nome, abre, fecha);
    if (!lit) return null;
    try { return new Function('return ' + lit)(); } catch (e) { return null; }
  }

  async function lerTexto(url) {
    var r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(url + ' (HTTP ' + r.status + ')');
    return r.text();
  }

  // devolve [{ id, titulo, itens:[produto] }] — um grupo por seção do site da 2ª onda
  async function lerLancamentos() {
    // dados complementares do catálogo (idade, prazo de entrega)
    var extra = {};
    try {
      var htmlLocal = await lerTexto(LANCAMENTOS.local);
      var prodsLocal = avaliarLiteral(htmlLocal, 'PRODUCTS', '[', ']') || [];
      var entrega = avaliarLiteral(htmlLocal, 'DELIVERY', '{', '}') || {};
      var descs = avaliarLiteral(htmlLocal, 'DESCS', '{', '}') || {};
      var medidas = avaliarLiteral(htmlLocal, 'MEDIDAS', '{', '}') || {};
      prodsLocal.forEach(function (p) {
        extra[p.ref] = { p: p, idade: p.idade || '', entrega: entrega[p.ref] || '',
                         desc: (descs[p.ref] || '').split('\n\n')[0], log: medidas[p.ref] || null };
      });
    } catch (e) { /* segue sem os extras */ }

    try {
      var html = await lerTexto(LANCAMENTOS.fonte);
      var prods = avaliarLiteral(html, 'PRODUTOS', '[', ']');
      if (!prods || !prods.length) throw new Error('sem PRODUTOS');
      var precos = avaliarLiteral(html, 'PRECOS', '{', '}') || {};
      var logist = avaliarLiteral(html, 'LOGISTICA', '{', '}') || {};
      var secoes = avaliarLiteral(html, 'SECOES', '[', ']') || [{ id: '*', titulo: '2ª onda de lançamentos' }];
      var mB = /const\s+B\s*=\s*["']([^"']+)["']/.exec(html);
      var base = mB ? mB[1] : 'https://produtosxalingo.oneweb.com.br/wp-content/uploads/';

      var itens = prods.map(function (p) {
        var x = extra[p.ref] || {};
        return {
          ref: p.ref, proj: p.proj || '', nome: p.nome, cat: p.cat,
          tag: p.tag || 'LANÇAMENTO', tagc: p.tagc || 'lanc', ean: p.ean || '',
          desc: p.desc || x.desc || '',
          aviso: p.aviso ? (typeof p.aviso === 'string' ? { titulo: p.aviso, texto: '' } : p.aviso) : null,
          fotos: (p.imgs || []).slice(0, LANCAMENTOS.fotos).map(function (f) { return /^https?:/.test(f) ? f : base + f; }),
          preco: precos[p.ref] || null,
          log: logist[p.ref] || x.log || null,
          idade: x.idade || '',
          entrega: x.entrega || (p.estoque !== false ? 'Pronta entrega' : ''),
          estoque: p.estoque !== false
        };
      });
      var grupos = secoes.map(function (sc) {
        return { id: 'onda2-' + sc.id, titulo: sc.titulo,
                 itens: itens.filter(function (p) { return sc.id === '*' || p.cat === sc.id; }) };
      });
      var soltos = itens.filter(function (p) { return !grupos.some(function (g) { return g.itens.indexOf(p) >= 0; }); });
      if (soltos.length) grupos.push({ id: 'onda2-outros', titulo: 'Outros', itens: soltos });
      return grupos.filter(function (g) { return g.itens.length; });
    } catch (e) {
      // reserva: itens da 2ª onda que estão na lancamentos.html deste catálogo
      var lista = Object.keys(extra).map(function (r) { return extra[r]; })
        .filter(function (x) { return x.p.onda === 2; })
        .map(function (x) {
          var p = x.p;
          return { ref: p.ref, proj: '', nome: p.nome, tag: p.tag || 'Lançamento', tagc: p.tagc || 'lanc',
                   ean: p.ean || '', desc: x.desc, aviso: p.aviso ? { titulo: p.aviso, texto: '' } : null,
                   fotos: p.img ? [p.img] : [], preco: null, log: x.log, idade: x.idade,
                   entrega: x.entrega, estoque: x.entrega === 'Pronta entrega' };
        });
      return lista.length ? [{ id: 'onda2', titulo: '2ª onda de lançamentos', itens: lista }] : [];
    }
  }

  function paginasDoGrupo(g) { return Math.ceil(g.itens.length / LANCAMENTOS.porPagina); }

  // Fotos ficam no WordPress (oneweb), que não libera CORS: tenta o proxy de imagem
  // primeiro (já entrega JPEG com fundo branco), depois direto. Original antes do recorte -1024x….
  function candidatosFoto(url, lado) {
    var original = url.replace(/-\d+x\d+(\.(?:png|jpe?g|webp))$/i, '$1');
    var lista = [];
    (original === url ? [url] : [original, url]).forEach(function (u) {
      lista.push('https://images.weserv.nl/?url=' + encodeURIComponent(u.replace(/^https?:\/\//, '')) +
                 '&w=' + lado + '&h=' + lado + '&fit=inside&output=jpg&bg=white&q=85');
      lista.push(u);
      lista.push('https://corsproxy.io/?url=' + encodeURIComponent(u));
    });
    return lista;
  }

  async function fotoLancamento(url, lado) {
    if (!url) return null;
    var alvos = candidatosFoto(url, lado);
    for (var i = 0; i < alvos.length; i++) {
      try {
        var r = await fetch(alvos[i], { cache: 'force-cache', signal: AbortSignal.timeout(15000) });
        if (!r.ok) continue;
        var blob = await r.blob();
        if (!blob || blob.size < 200 || !/^image\//.test(blob.type || 'image/')) continue;
        var bmp = await createImageBitmap(blob);
        var esc = Math.min(1, lado / Math.max(bmp.width, bmp.height));
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(bmp.width * esc));
        cv.height = Math.max(1, Math.round(bmp.height * esc));
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff';                       // PNG transparente não vira preto
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
        bmp.close && bmp.close();
        var saida = await new Promise(function (ok) { cv.toBlob(ok, 'image/jpeg', 0.86); });
        cv.width = cv.height = 0;
        return new Uint8Array(await saida.arrayBuffer());
      } catch (e) { /* tenta o próximo */ }
    }
    return null;
  }

  function quebrarLinhas(txt, fonte, tam, largura, maxLinhas) {
    var linhas = [];
    String(txt || '').split('\n').forEach(function (par) {
      var atual = '';
      par.split(/\s+/).filter(Boolean).forEach(function (w) {
        var t = atual ? atual + ' ' + w : w;
        if (fonte.widthOfTextAtSize(t, tam) <= largura || !atual) atual = t;
        else { linhas.push(atual); atual = w; }
      });
      if (atual) linhas.push(atual);
    });
    if (maxLinhas != null && linhas.length > maxLinhas) {
      linhas = linhas.slice(0, Math.max(0, maxLinhas));
      if (linhas.length) {
        var u = linhas[linhas.length - 1];
        while (u.length > 3 && fonte.widthOfTextAtSize(u + '…', tam) > largura) u = u.slice(0, -1);
        linhas[linhas.length - 1] = u + '…';
      }
    }
    return linhas;
  }

  function mm(a) { return a && a.length ? a.join(' × ') + ' mm' : ''; }

  // Desenha as páginas de lançamentos a partir do índice `inicio` (0 = primeira página do PDF)
  async function desenharLancamentos(pdf, PDFLib, fonte, fonteNeg, grupos, fotos, inicio, icms) {
    var rgb = PDFLib.rgb;
    var navy = rgb(0.106, 0.227, 0.361), creme = rgb(0.961, 0.898, 0.839), ouro = rgb(0.941, 0.627, 0.188);
    var branco = rgb(1, 1, 1), cinzaFoto = rgb(0.965, 0.957, 0.945), linha = rgb(0.86, 0.82, 0.76);
    var M = 28, VAO = 14, TOPO = PH - 80, BASE = 34;
    var bw = PW - M * 2, bh = (TOPO - BASE - VAO) / 2;
    var rotIcms = (ROTULO_ICMS[icms] || ROTULO_ICMS.p18).texto;
    var cache = {}, idx = inicio;

    function cor(a) { return rgb(a[0], a[1], a[2]); }
    async function imagem(ref, k) {
      var chave = ref + ':' + k;
      if (chave in cache) return cache[chave];
      var b = fotos[ref] && fotos[ref][k];
      try { cache[chave] = b ? await pdf.embedJpg(b) : null; } catch (e) { cache[chave] = null; }
      return cache[chave];
    }
    function encaixar(page, img, x, y, w, h) {
      page.drawRectangle({ x: x, y: y, width: w, height: h, color: branco, borderColor: linha, borderWidth: 0.5 });
      if (!img) return false;
      var k = Math.min((w - 8) / img.width, (h - 8) / img.height);
      var iw = img.width * k, ih = img.height * k;
      page.drawImage(img, { x: x + (w - iw) / 2, y: y + (h - ih) / 2, width: iw, height: ih });
      return true;
    }
    function texto(page, t, x, y, tam, f, c, op) {
      page.drawText(limpar(t), { x: x, y: y, size: tam, font: f, color: c || navy, opacity: op == null ? 1 : op });
    }

    for (var g = 0; g < grupos.length; g++) {
      var grupo = grupos[g], nPag = paginasDoGrupo(grupo);
      for (var pg = 0; pg < nPag; pg++) {
        var page = pdf.insertPage(idx++);
        page.setSize(PW, PH);

        // cabeçalho
        page.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: creme });
        page.drawRectangle({ x: 0, y: PH - 60, width: PW, height: 60, color: navy });
        page.drawRectangle({ x: 0, y: PH - 63, width: PW, height: 3, color: ouro });
        texto(page, 'LANÇAMENTOS 2026 · 2ª ONDA', M, PH - 33, 16, fonteNeg, branco);
        texto(page, grupo.titulo + (nPag > 1 ? '  ·  ' + (pg + 1) + '/' + nPag : ''), M, PH - 49, 9, fonteNeg, ouro);
        var rot = limpar('Preços: ' + rotIcms + ' · sem IPI');
        texto(page, rot, PW - M - fonteNeg.widthOfTextAtSize(rot, 8), PH - 33, 8, fonteNeg, rgb(0.973, 0.769, 0));
        var marca = 'Xalingo Brinquedos';
        texto(page, marca, PW - M - fonte.widthOfTextAtSize(marca, 7.5), PH - 49, 7.5, fonte, branco, 0.7);

        var itens = grupo.itens.slice(pg * LANCAMENTOS.porPagina, (pg + 1) * LANCAMENTOS.porPagina);
        for (var i = 0; i < itens.length; i++) {
          var p = itens[i];
          var x = M, yTopo = TOPO - i * (bh + VAO), y = yTopo - bh;
          var corTag = cor(TAG_LANC[p.tagc] || TAG_LANC.lanc);

          page.drawRectangle({ x: x, y: y, width: bw, height: bh, color: branco, borderColor: linha, borderWidth: 0.6 });
          page.drawRectangle({ x: x, y: y, width: 4, height: bh, color: corTag });

          // ── coluna das fotos ──
          var P = 12, fx = x + P + 4, fw = 226;
          var thumbs = Math.max(0, Math.min(2, (p.fotos || []).length - 1));
          var th = thumbs ? 76 : 0, gap = thumbs ? 8 : 0;
          var fh = bh - P * 2 - th - gap;
          var principal = await imagem(p.ref, 0);
          if (!encaixar(page, principal, fx, yTopo - P - fh, fw, fh)) {
            var sf = 'Foto em breve';
            texto(page, sf, fx + (fw - fonte.widthOfTextAtSize(sf, 9)) / 2, yTopo - P - fh / 2 - 3, 9, fonte, navy, 0.4);
          }
          for (var t = 0; t < thumbs; t++) {
            var tw = (fw - 8) / 2;
            encaixar(page, await imagem(p.ref, t + 1), fx + t * (tw + 8), y + P, tw, th);
          }

          // ── coluna de dados ──
          var cx = fx + fw + 18, cw = x + bw - P - cx, cy = yTopo - P;

          // selos
          var selos = [{ txt: limpar(p.tag).toUpperCase(), c: corTag }];
          if (p.estoque) selos.push({ txt: 'PRONTA ENTREGA', c: rgb(0.16, 0.48, 0.25) });
          var sx = cx;
          selos.forEach(function (sl) {
            var w = fonteNeg.widthOfTextAtSize(sl.txt, 6.6) + 12;
            page.drawRectangle({ x: sx, y: cy - 14, width: w, height: 14, color: sl.c });
            texto(page, sl.txt, sx + 6, cy - 9.8, 6.6, fonteNeg, branco);
            sx += w + 5;
          });
          cy -= 28;

          texto(page, 'REF. ' + p.ref + (p.proj ? '   ·   PROJETO ' + p.proj : ''), cx, cy, 7.6, fonteNeg, navy, 0.55);
          cy -= 16;
          quebrarLinhas(limpar(p.nome), fonteNeg, 13.5, cw, 2).forEach(function (l) {
            texto(page, l, cx, cy, 13.5, fonteNeg, navy); cy -= 16;
          });
          cy -= 3;

          // rodapé do bloco: preço + ficha técnica (desenhados de baixo para cima)
          var fichas = [
            ['EAN', p.ean], ['Idade', p.idade], ['Embalagem', mm(p.log && p.log.emb)],
            ['Caixa master', mm(p.log && p.log.cx)], ['Qtd / caixa', p.log && p.log.qtd ? p.log.qtd + ' un.' : ''],
            ['Entrega', p.entrega]
          ].filter(function (f) { return f[1]; });
          var colW = (cw - 10) / 2, linhaH = 22, nLin = Math.ceil(fichas.length / 2);
          var fichaTopo = y + P + nLin * linhaH;
          fichas.forEach(function (f, k) {
            var fxk = cx + (k % 2) * (colW + 10), fyk = fichaTopo - Math.floor(k / 2) * linhaH;
            page.drawRectangle({ x: fxk, y: fyk - linhaH + 2, width: colW, height: 0.5, color: linha });
            texto(page, f[0].toUpperCase(), fxk, fyk - 8, 6, fonteNeg, navy, 0.5);
            texto(page, quebrarLinhas(limpar(f[1]), fonteNeg, 8.4, colW, 1)[0] || '', fxk, fyk - 17, 8.4, fonteNeg, navy);
          });

          var valor = p.preco && typeof p.preco[icms] === 'number' && p.preco[icms] > 0 ? p.preco[icms] : null;
          var pTopo = fichaTopo + 8 + 38;
          page.drawRectangle({ x: cx, y: pTopo - 38, width: cw, height: 38, color: navy });
          texto(page, 'PREÇO UNITÁRIO · ' + rotIcms.toUpperCase() + ' · SEM IPI', cx + 10, pTopo - 13, 6.2, fonteNeg, branco, 0.7);
          var vtxt = valor ? 'R$ ' + valor.toFixed(2).replace('.', ',') : 'Sob consulta';
          texto(page, vtxt, cx + 10, pTopo - 31, valor ? 16 : 12, fonteNeg, valor ? rgb(1, 0.85, 0.45) : branco);
          if (p.log && p.log.qtd && valor) {
            var cxTxt = 'Caixa com ' + p.log.qtd + ' un.: R$ ' + (valor * p.log.qtd).toFixed(2).replace('.', ',');
            texto(page, cxTxt, cx + cw - 10 - fonte.widthOfTextAtSize(limpar(cxTxt), 7.4), pTopo - 29, 7.4, fonte, branco, 0.8);
          }

          // aviso (acima do preço) e descrição no espaço que sobrar
          var limite = pTopo + 8;
          var avisoLinhas = [], avH = 0;
          if (p.aviso) {
            avisoLinhas = quebrarLinhas(limpar(p.aviso.texto), fonte, 7.4, cw - 18, 3);
            avH = 14 + avisoLinhas.length * 9.5 + 6;
          }
          var descMax = Math.floor((cy - limite - (avH ? avH + 8 : 0)) / 11);
          quebrarLinhas(limpar(p.desc), fonte, 8.8, cw, Math.max(0, descMax)).forEach(function (l) {
            texto(page, l, cx, cy - 2, 8.8, fonte, navy, 0.85); cy -= 11;
          });
          if (p.aviso) {
            var aTopo = limite + avH;
            page.drawRectangle({ x: cx, y: limite, width: cw, height: avH, color: rgb(1, 0.953, 0.847),
                                 borderColor: rgb(0.973, 0.62, 0.11), borderWidth: 0.8 });
            texto(page, '! ' + p.aviso.titulo, cx + 9, aTopo - 12, 7.6, fonteNeg, rgb(0.54, 0.35, 0.05));
            avisoLinhas.forEach(function (l, k) {
              texto(page, l, cx + 9, aTopo - 23 - k * 9.5, 7.4, fonte, rgb(0.42, 0.29, 0.06));
            });
          }
        }

        texto(page, 'Preços sujeitos a alteração sem aviso prévio · medidas C × L × A', M, 18, 7, fonte, navy, 0.45);
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
      '<label class="xpdf-chk"><input type="checkbox" id="xpdf-lanc" checked> Incluir os <b>lançamentos da 2ª onda</b> logo após o sumário</label>' +
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
        var filaFoto = [], feitas = 0;
        todosLanc.forEach(function (p) {
          fotosLanc[p.ref] = [];
          (p.fotos || []).forEach(function (u, k) { filaFoto.push({ p: p, k: k, u: u }); });
        });
        var totalFotos = filaFoto.length || 1;
        async function trabalhador() {
          while (filaFoto.length) {
            if (cancelado) return;
            var t = filaFoto.shift();
            t.p && (fotosLanc[t.p.ref][t.k] = await fotoLancamento(t.u, t.k ? 480 : 1000));
            if (!t.k && !fotosLanc[t.p.ref][0]) semFotoLanc++;
            feitas++;
            passo(8 + feitas / totalFotos * 10, 'Fotos dos lançamentos… ' + feitas + '/' + totalFotos);
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
        await desenharLancamentos(pdf, PDFLib, fonte, fonteNeg, gruposLanc, fotosLanc, 1, icms);
      }
      var secoes = lerSecoesDaSidebar();
      secoes[LANCAMENTOS.arquivo] = gruposLanc.map(function (g) { return { id: g.id, nome: limpar(g.titulo) }; });
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
